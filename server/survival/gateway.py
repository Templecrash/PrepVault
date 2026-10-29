"""CPU-only, request-bound authorization before any private GPU invocation."""
import asyncio
import contextlib
import time
from urllib import error, request
from uuid import uuid4

from .security import (ORIGIN, MODEL, MAX_ENVELOPE, SurvivalError, invalid_ticket,
                       strict_json, encoded_json, network_opener, validate_payload, validate_claims)

JOB_LIFETIME = 15 * 60


async def poll_private_call(call, *, pending_errors, terminal_errors):
    """A polling timeout means pending; an execution timeout is a final error."""
    try:
        return await call.get.aio(timeout=0)
    except terminal_errors:
        return {"error": "The survival model exceeded its execution deadline.", "code": "timeout"}
    except pending_errors:
        return None
    except Exception:
        return {"error": "The survival model could not complete this assessment.", "code": "model_unavailable"}


def verify_ticket(ticket, opener=None):
    req = request.Request(ORIGIN + "/api/survival-auth", data=encoded_json({"ticket": ticket}),
                          headers={"Origin": ORIGIN, "Content-Type": "application/json"}, method="POST")
    try:
        with (opener or network_opener()).open(req, timeout=10) as response:
            raw = response.read(32769)
            if response.status != 200 or len(raw) > 32768:
                raise invalid_ticket()
            value = strict_json(raw)
            if not isinstance(value, dict) or value.get("valid") is not True:
                raise invalid_ticket()
            return value.get("claims")
    except error.HTTPError as exc:
        if exc.code in (400, 401, 403):
            raise invalid_ticket() from None
        raise SurvivalError(503, "authorization_unavailable", "Owner sign-in could not be verified. Try again.") from None
    except SurvivalError:
        raise
    except (OSError, ValueError, RecursionError):
        raise SurvivalError(503, "authorization_unavailable", "Owner sign-in could not be verified. Try again.") from None


class HostedGateway:
    """Dependencies are async callables so tests never allocate remote compute."""
    def __init__(self, *, verify, consume_nonce, read_assets, save_job, read_job, spawn, poll, cancel, now=time.time):
        self.verify, self.consume_nonce, self.read_assets = verify, consume_nonce, read_assets
        self.save_job, self.read_job = save_job, read_job
        self.spawn, self.poll, self.cancel, self.now = spawn, poll, cancel, now

    async def handle(self, purpose, envelope):
        import re
        if (not isinstance(envelope, dict) or set(envelope) != {"ticket", "payload"} or
                not isinstance(envelope.get("ticket"), str) or len(envelope["ticket"]) > 2048 or
                not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}", envelope["ticket"])):
            raise invalid_ticket()
        payload = validate_payload(envelope["payload"], purpose)
        claims = await self.verify(envelope["ticket"])
        now = int(self.now())
        validate_claims(claims, {"origin": ORIGIN}, purpose, envelope["payload"], now)
        if not await self.consume_nonce(claims["nonce"], claims["exp"]):
            raise invalid_ticket()
        if purpose == "status":
            assets = await self.read_assets()
            result = {"configured": bool(assets.get("ready")), "model": MODEL, "engine": "Survival LLM",
                      "library": {"ready": bool(assets.get("library", {}).get("ready")),
                                  "articles": int(assets.get("library", {}).get("articles", 0))}}
            if not result["configured"]:
                result["error"] = "The server model and reference library are still being prepared."
            return 200, result
        if purpose == "chat":
            assets = await self.read_assets()
            if not assets.get("ready"):
                raise SurvivalError(503, "not_ready", "The server model and reference library are still being prepared.")
            job_id = str(uuid4())
            # Store metadata before spawn. On any later failure, cancel the
            # private call so a failed HTTP request cannot leave paid work.
            job = {"owner": claims["sub"], "created": now, "expires": now + JOB_LIFETIME,
                   "state": "pending", "callId": None}
            await self.save_job(job_id, job)
            call_id = None
            spawn_task = asyncio.create_task(self.spawn(payload))
            try:
                # If the requester disconnects during the RPC, first obtain the
                # accepted call ID, then cancel it. Cancelling the RPC alone
                # would not guarantee the remote GPU job was cancelled.
                call_id = await asyncio.shield(spawn_task)
                await self.save_job(job_id, {**job, "callId": call_id})
            except BaseException:
                if call_id is None:
                    with contextlib.suppress(Exception):
                        call_id = await asyncio.shield(spawn_task)
                if call_id:
                    with contextlib.suppress(Exception):
                        await self.cancel(call_id)
                        await self.save_job(job_id, {**job, "state": "cancelled", "callId": call_id})
                raise
            return 202, {"jobId": job_id}
        job_id = payload["jobId"]
        job = await self.read_job(job_id)
        if not isinstance(job, dict) or job.get("owner") != claims["sub"]:
            raise SurvivalError(404, "job_not_found", "This assessment is unavailable. Start a new question.")
        if now >= job.get("expires", 0):
            if job.get("state") == "pending" and job.get("callId"):
                await self.cancel(job["callId"])
                await self.save_job(job_id, {**job, "state": "cancelled"})
            raise SurvivalError(410, "job_expired", "This assessment expired. Start a new question.")
        if purpose == "cancel":
            if job.get("state") == "pending" and job.get("callId"):
                await self.cancel(job["callId"])
            await self.save_job(job_id, {**job, "state": "cancelled"})
            return 200, {"status": "cancelled"}
        if job.get("state") == "cancelled":
            return 200, {"status": "error", "error": "This assessment was cancelled.", "code": "cancelled"}
        if not job.get("callId"):
            return 200, {"status": "pending"}
        result = await self.poll(job["callId"])
        if result is None:
            return 200, {"status": "pending"}
        if not isinstance(result, dict) or result.get("error"):
            await self.save_job(job_id, {**job, "state": "finished"})
            known_errors = {
                "context_too_large": "This conversation and app context exceed the model's token budget. Start a new chat or narrow the assessment.",
                "timeout": "The survival model took too long. Try a shorter question.",
                "incomplete_answer": "The survival model did not finish an answer. Try a more focused question.",
            }
            code = result.get("code") if isinstance(result, dict) else None
            return 200, {"status": "error", "error": known_errors.get(code, "The survival model could not finish this assessment. Try again."),
                         "code": code if code in known_errors else "model_unavailable"}
        if (not isinstance(result.get("reply"), str) or not result["reply"].strip() or len(result["reply"]) > 32000 or
                result.get("model") != MODEL or not isinstance(result.get("sources"), list) or len(result["sources"]) > 8):
            raise SurvivalError(503, "invalid_response", "The survival model returned an incomplete answer. Try again.")
        await self.save_job(job_id, {**job, "state": "finished"})
        return 200, {"status": "done", "reply": result["reply"], "model": MODEL, "sources": result["sources"]}

    async def abort_created_job(self, job_id):
        """Internal delivery-failure cleanup; never exposed without authorization."""
        job = await self.read_job(job_id)
        if job and job.get("state") == "pending" and job.get("callId"):
            await self.cancel(job["callId"])
            await self.save_job(job_id, {**job, "state": "cancelled"})


class GatewayApp:
    """Small ASGI boundary: no docs, uploads, public model proxy or request logs."""
    def __init__(self, gateway):
        self.gateway = gateway

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            while True:
                event = await receive()
                if event["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif event["type"] == "lifespan.shutdown":
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        if scope["type"] != "http":
            return
        try:
            path = scope.get("path", "")
            if scope.get("method") != "POST" or path not in ("/status", "/chat", "/result", "/cancel") or scope.get("query_string"):
                raise SurvivalError(404, "not_found", "Unknown server endpoint.")
            headers = scope.get("headers", [])
            origins = [value for key, value in headers if key.lower() == b"origin"]
            types = [value for key, value in headers if key.lower() == b"content-type"]
            if origins != [ORIGIN.encode()]:
                raise SurvivalError(403, "invalid_origin", "This origin cannot use the survival server.")
            if len(types) != 1 or types[0].split(b";", 1)[0].strip().lower() != b"application/json":
                raise SurvivalError(415, "invalid_content_type", "Send application/json.")
            parts, size = [], 0
            while True:
                event = await asyncio.wait_for(receive(), timeout=10)
                if event["type"] == "http.disconnect":
                    return
                if event["type"] != "http.request":
                    raise SurvivalError(400, "invalid_request", "The request was incomplete.")
                size += len(event.get("body", b""))
                if size > MAX_ENVELOPE:
                    raise SurvivalError(413, "request_too_large", "The assessment request is too large.")
                parts.append(event.get("body", b""))
                if not event.get("more_body"):
                    break
            try:
                envelope = strict_json(b"".join(parts))
            except (ValueError, RecursionError):
                raise SurvivalError(400, "invalid_request", "Send a valid JSON request.") from None
            async def wait_disconnect():
                while (await receive())["type"] != "http.disconnect":
                    pass

            handling = asyncio.create_task(self.gateway.handle(path[1:], envelope))
            disconnected = asyncio.create_task(wait_disconnect())

            async def abandon_handling():
                if not handling.done():
                    handling.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    completed_status, completed_value = await handling
                    if completed_status == 202 and completed_value.get("jobId"):
                        await self.gateway.abort_created_job(completed_value["jobId"])

            try:
                done, _ = await asyncio.wait({handling, disconnected}, return_when=asyncio.FIRST_COMPLETED)
                if disconnected in done:
                    # Both tasks can finish in one loop turn. A completed 202
                    # still owns a GPU job even though cancelling is a no-op.
                    await abandon_handling()
                    return
                status, value = await handling
            except BaseException:
                await abandon_handling()
                raise
            finally:
                if not handling.done():
                    await abandon_handling()
                disconnected.cancel()
                # This watcher owns no resources. Avoid another suspension
                # between collecting a 202 and its guarded response delivery.
        except SurvivalError as exc:
            status, value = exc.status, {"error": exc.message, "code": exc.code}
        except Exception:
            status, value = 503, {"error": "The survival server is unavailable. Try again.", "code": "server_unavailable"}
        body = encoded_json(value)
        try:
            await send({"type": "http.response.start", "status": status,
                        "headers": [(b"content-type", b"application/json; charset=utf-8"),
                                    (b"cache-control", b"no-store"), (b"x-content-type-options", b"nosniff"),
                                    (b"content-length", str(len(body)).encode())]})
            await send({"type": "http.response.body", "body": body})
        except (OSError, asyncio.CancelledError):
            if status == 202 and value.get("jobId"):
                await self.gateway.abort_created_job(value["jobId"])
            raise
