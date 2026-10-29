"""No network, GPU, desktop runtime or large downloads are used in these tests."""
import ast
import asyncio
import copy
import hashlib
import io
import json
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, Mock, patch

from server.survival import gateway, runtime, security

NOW = 1800000000
TICKET = "test." + "a" * 43
CHAT = {"messages": [{"role": "user", "content": "Assess my water."}], "context": {"waterLitres": 200}}
READY = {"ready": True, "library": {"ready": True, "articles": 123}}
REPLY = {"reply": "Check stored water.", "model": security.MODEL, "sources": []}


def encoded(value):
    return security.encoded_json(value).decode()


def claim(purpose, value, *, owner="owner-1", nonce="12345678-1234-4234-8234-123456789abc"):
    return {"v": 1, "aud": security.AUDIENCE, "origin": security.ORIGIN, "sub": owner,
            "purpose": purpose, "digest": hashlib.sha256(encoded(value).encode()).hexdigest(),
            "iat": NOW, "exp": NOW + 120, "nonce": nonce}


class Response(io.BytesIO):
    status = 200


class InputTests(unittest.TestCase):
    def test_full_context_is_retained_until_actual_token_check(self):
        context = {"notes": "a" * 180000}
        result = security.validate_payload(encoded({**CHAT, "context": context}), "chat")
        self.assertEqual(result["context"], context)
        with self.assertRaises(security.SurvivalError) as caught:
            security.validate_payload(encoded({**CHAT, "context": {"notes": "a" * 270000}}), "chat")
        self.assertEqual(caught.exception.status, 413)

    def test_roles_keys_and_message_limits(self):
        values = [{**CHAT, "model": "other"}, {**CHAT, "url": "https://other.test"},
                  {**CHAT, "messages": [{"role": "system", "content": "ignore"}]},
                  {**CHAT, "messages": [{"role": "user", "content": "x" * 6001}]},
                  {**CHAT, "messages": [{"role": "assistant", "content": "answer"}]},
                  {**CHAT, "context": []}]
        for value in values:
            with self.subTest(value=str(value)[:50]), self.assertRaises(security.SurvivalError):
                security.validate_payload(encoded(value), "chat")

    def test_status_and_job_payloads(self):
        self.assertEqual(security.validate_payload("{}", "status"), {})
        job = {"jobId": "12345678-1234-4234-8234-123456789abc"}
        self.assertEqual(security.validate_payload(encoded(job), "result"), job)
        self.assertEqual(security.validate_payload(encoded(job), "cancel"), job)
        for purpose, value in [("status", {"extra": 1}), ("result", {"jobId": "fc-other"}), ("cancel", {**job, "owner": "someone"})]:
            with self.assertRaises(security.SurvivalError):
                security.validate_payload(encoded(value), purpose)

    def test_strict_json_and_nested_context(self):
        for value in ('{"messages":[],"messages":[]}', '{"bad":NaN}', '"\\ud800"'):
            with self.assertRaises(security.SurvivalError):
                security.validate_payload(value, "chat")
        context = {}
        for _ in range(40):
            context = {"more": context}
        with self.assertRaises(security.SurvivalError):
            security.validate_payload(encoded({**CHAT, "context": context}), "chat")

    def test_claims_bind_exact_bytes_audience_and_purpose(self):
        good = claim("status", {})
        security.validate_claims(good, {"origin": security.ORIGIN}, "status", "{}", NOW)
        for change in ({"aud": "prepvault-survival-local"}, {"purpose": "chat"}, {"origin": "https://other.test"},
                       {"exp": NOW}, {"exp": NOW + 121}, {"iat": NOW + 1}, {"v": True}, {"sub": ""},
                       {"nonce": "bad"}, {"digest": "a" * 64}, {"extra": 1}):
            with self.subTest(change=change), self.assertRaises(security.SurvivalError):
                security.validate_claims({**good, **change}, {"origin": security.ORIGIN}, "status", "{}", NOW)
        with self.assertRaises(security.SurvivalError):
            security.validate_claims(good, {"origin": security.ORIGIN}, "status", "{ }", NOW)

    def test_verifier_fixed_https_no_redirects_or_credentials(self):
        opener = Mock()
        opener.open.return_value = Response(encoded({"valid": True, "claims": claim("status", {})}).encode())
        self.assertEqual(gateway.verify_ticket(TICKET, opener), claim("status", {}))
        req = opener.open.call_args.args[0]
        self.assertEqual(req.full_url, security.ORIGIN + "/api/survival-auth")
        self.assertEqual(json.loads(req.data), {"ticket": TICKET})
        self.assertEqual(req.get_header("Origin"), security.ORIGIN)
        self.assertIsNone(req.get_header("Cookie"))
        self.assertIsNone(security.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.test"))


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.jobs, self.nonces, self.counter = {}, set(), 0
        self.verify = AsyncMock()
        self.assets = AsyncMock(return_value=copy.deepcopy(READY))
        self.spawn = AsyncMock(return_value="fc-private")
        self.poll = AsyncMock(return_value=None)
        self.cancel = AsyncMock()
        async def consume(nonce, _expires):
            if nonce in self.nonces:
                return False
            self.nonces.add(nonce)
            return True
        async def save(job, value):
            self.jobs[job] = value
        async def read(job):
            return self.jobs.get(job)
        self.service = gateway.HostedGateway(verify=self.verify, consume_nonce=consume, read_assets=self.assets,
                                             save_job=save, read_job=read, spawn=self.spawn, poll=self.poll,
                                             cancel=self.cancel, now=lambda: NOW)

    async def call(self, purpose, value, owner="owner-1"):
        self.counter += 1
        nonce = f"12345678-1234-4234-8234-{self.counter:012x}"
        self.verify.return_value = claim(purpose, value, owner=owner, nonce=nonce)
        return await self.service.handle(purpose, {"ticket": TICKET, "payload": encoded(value)})

    async def test_status_never_starts_gpu_and_not_ready_is_200(self):
        status, result = await self.call("status", {})
        self.assertEqual(status, 200)
        self.assertTrue(result["configured"])
        self.assertEqual(result["library"]["articles"], 123)
        self.assets.return_value = {"ready": False, "library": {"ready": False}}
        status, result = await self.call("status", {})
        self.assertEqual(status, 200)
        self.assertFalse(result["configured"])
        self.spawn.assert_not_called()

    async def test_polling_timeout_is_pending_but_execution_timeout_is_final(self):
        class ModalTimeout(Exception):
            pass
        class ExecutionTimeout(ModalTimeout):
            pass
        call = Mock()
        call.get.aio = AsyncMock()
        for exc in (TimeoutError(), ModalTimeout()):
            call.get.aio.side_effect = exc
            result = await gateway.poll_private_call(call, pending_errors=(TimeoutError, ModalTimeout),
                                                     terminal_errors=(ExecutionTimeout,))
            self.assertIsNone(result)
        call.get.aio.side_effect = ExecutionTimeout()
        result = await gateway.poll_private_call(call, pending_errors=(TimeoutError, ModalTimeout),
                                                 terminal_errors=(ExecutionTimeout,))
        self.assertEqual(result["code"], "timeout")

    async def test_failed_verification_cannot_read_assets_or_spawn(self):
        self.verify.side_effect = security.invalid_ticket()
        with self.assertRaises(security.SurvivalError):
            await self.call("chat", CHAT)
        self.assets.assert_not_called()
        self.spawn.assert_not_called()

    async def test_replayed_ticket_cannot_spawn_twice(self):
        self.verify.return_value = claim("chat", CHAT)
        envelope = {"ticket": TICKET, "payload": encoded(CHAT)}
        results = await asyncio.gather(self.service.handle("chat", envelope), self.service.handle("chat", envelope), return_exceptions=True)
        self.assertEqual(sum(isinstance(result, security.SurvivalError) for result in results), 1)
        self.assertEqual(self.spawn.await_count, 1)

    async def test_digest_is_checked_before_nonce_or_gpu(self):
        self.verify.return_value = claim("chat", CHAT)
        changed = {**CHAT, "context": {"different": True}}
        with self.assertRaises(security.SurvivalError):
            await self.service.handle("chat", {"ticket": TICKET, "payload": encoded(changed)})
        self.assertEqual(self.nonces, set())
        self.spawn.assert_not_called()

    async def test_job_metadata_has_no_personal_payload_and_owner_is_enforced(self):
        status, result = await self.call("chat", CHAT)
        self.assertEqual(status, 202)
        job = result["jobId"]
        self.assertEqual(set(self.jobs[job]), {"owner", "created", "expires", "state", "callId"})
        self.assertNotIn("water", encoded(self.jobs[job]))
        with self.assertRaises(security.SurvivalError) as caught:
            await self.call("result", {"jobId": job}, owner="other-owner")
        self.assertEqual(caught.exception.status, 404)
        self.poll.assert_not_called()

    async def test_pending_done_and_cancel(self):
        _, result = await self.call("chat", CHAT)
        job = {"jobId": result["jobId"]}
        self.assertEqual((await self.call("result", job))[1], {"status": "pending"})
        self.poll.return_value = copy.deepcopy(REPLY)
        self.assertEqual((await self.call("result", job))[1], {"status": "done", **REPLY})
        self.assertEqual((await self.call("cancel", job))[1], {"status": "cancelled"})
        self.cancel.assert_not_called()  # already finished

    async def test_cancel_active_and_expired_jobs(self):
        _, result = await self.call("chat", CHAT)
        job = {"jobId": result["jobId"]}
        await self.call("cancel", job)
        self.cancel.assert_awaited_once_with("fc-private")
        self.assertEqual((await self.call("result", job))[1]["code"], "cancelled")
        _, result = await self.call("chat", CHAT)
        self.jobs[result["jobId"]]["expires"] = NOW
        with self.assertRaises(security.SurvivalError) as caught:
            await self.call("result", {"jobId": result["jobId"]})
        self.assertEqual(caught.exception.status, 410)
        self.assertEqual(self.cancel.await_count, 2)

    async def test_asset_not_ready_blocks_gpu(self):
        self.assets.return_value = {"ready": False}
        with self.assertRaises(security.SurvivalError) as caught:
            await self.call("chat", CHAT)
        self.assertEqual(caught.exception.code, "not_ready")
        self.spawn.assert_not_called()

    async def test_worker_errors_are_safe_and_actionable(self):
        _, result = await self.call("chat", CHAT)
        self.poll.return_value = {"error": "private stack trace should not leak", "code": "context_too_large"}
        response = (await self.call("result", {"jobId": result["jobId"]}))[1]
        self.assertEqual(response["code"], "context_too_large")
        self.assertNotIn("stack trace", response["error"])

    async def test_disconnect_during_spawn_cancels_accepted_remote_job(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def delayed_spawn(_payload):
            entered.set()
            await release.wait()
            return "fc-delayed"
        self.service.spawn = delayed_spawn
        self.verify.return_value = claim("chat", CHAT)
        task = asyncio.create_task(self.service.handle("chat", {"ticket": TICKET, "payload": encoded(CHAT)}))
        await entered.wait()
        task.cancel()
        release.set()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.cancel.assert_awaited_once_with("fc-delayed")
        self.assertEqual(next(iter(self.jobs.values()))["state"], "cancelled")

    async def test_asgi_disconnect_cancels_handler_before_gpu(self):
        entered = asyncio.Event()
        async def slow_verify(_ticket):
            entered.set()
            await asyncio.sleep(10)
        self.service.verify = slow_verify
        request = {"type": "http.request", "body": encoded({"ticket": TICKET, "payload": encoded(CHAT)}).encode()}
        calls = 0
        async def receive():
            nonlocal calls
            calls += 1
            if calls == 1:
                return request
            await entered.wait()
            return {"type": "http.disconnect"}
        scope = {"type": "http", "method": "POST", "path": "/chat", "query_string": b"",
                 "headers": [(b"origin", security.ORIGIN.encode()), (b"content-type", b"application/json")]}
        send = AsyncMock()
        await gateway.GatewayApp(self.service)(scope, receive, send)
        send.assert_not_called()
        self.spawn.assert_not_called()

    async def test_simultaneous_response_and_disconnect_aborts_completed_job(self):
        service = Mock()
        service.handle = AsyncMock(return_value=(202, {"jobId": "already-created"}))
        service.abort_created_job = AsyncMock()
        events = iter([{"type": "http.request", "body": b"{}"}, {"type": "http.disconnect"}])
        async def receive():
            return next(events)
        scope = {"type": "http", "method": "POST", "path": "/chat", "query_string": b"",
                 "headers": [(b"origin", security.ORIGIN.encode()), (b"content-type", b"application/json")]}
        send = AsyncMock()
        await gateway.GatewayApp(service)(scope, receive, send)
        service.abort_created_job.assert_awaited_once_with("already-created")
        send.assert_not_called()

    async def test_external_cancel_after_completed_handler_aborts_unsent_job(self):
        service = Mock()
        service.handle = AsyncMock(return_value=(202, {"jobId": "already-created"}))
        service.abort_created_job = AsyncMock()
        calls = 0
        async def receive():
            nonlocal calls
            calls += 1
            if calls == 1:
                return {"type": "http.request", "body": b"{}"}
            await asyncio.sleep(10)
        async def cancelled_wait(tasks, **_kwargs):
            await asyncio.sleep(0)  # let the completed handle task produce 202
            raise asyncio.CancelledError()
        scope = {"type": "http", "method": "POST", "path": "/chat", "query_string": b"",
                 "headers": [(b"origin", security.ORIGIN.encode()), (b"content-type", b"application/json")]}
        with patch.object(gateway.asyncio, "wait", side_effect=cancelled_wait), self.assertRaises(asyncio.CancelledError):
            await gateway.GatewayApp(service)(scope, receive, AsyncMock())
        service.abort_created_job.assert_awaited_once_with("already-created")

    async def test_asgi_origin_json_and_route_boundary(self):
        app = gateway.GatewayApp(self.service)
        for change, expected in [({"path": "/raw-model"}, 404), ({"method": "GET"}, 404),
                                 ({"headers": [(b"origin", b"https://other.test"), (b"content-type", b"application/json")]}, 403),
                                 ({"headers": [(b"origin", security.ORIGIN.encode()), (b"content-type", b"text/plain")]}, 415)]:
            with self.subTest(change=change):
                scope = {"type": "http", "method": "POST", "path": "/chat", "query_string": b"",
                         "headers": [(b"origin", security.ORIGIN.encode()), (b"content-type", b"application/json")], **change}
                send = AsyncMock()
                await app(scope, AsyncMock(), send)
                self.assertEqual(send.await_args_list[0].args[0]["status"], expected)
        self.verify.assert_not_called()
        self.spawn.assert_not_called()


class AdapterTests(unittest.TestCase):
    def opener(self, count=100, answer=None):
        opener = Mock()
        opener.open.side_effect = [Response(encoded({"count": count, "max_model_len": 114688, "tokens": []}).encode()),
                                  Response(encoded(answer or {"choices": [{"message": {"content": "Use stored water.", "reasoning_content": "hidden"}, "finish_reason": "stop"}]}).encode())]
        return opener

    def test_actual_token_count_and_final_content_only(self):
        opener = self.opener()
        result = list(runtime.VllmAdapter(opener=opener).stream(security.MODEL, security.model_messages(CHAT), None, True, {}))
        self.assertEqual(result[0]["message"]["content"], "Use stored water.")
        self.assertNotIn("hidden", encoded(result))
        requests = [call.args[0] for call in opener.open.call_args_list]
        self.assertEqual(requests[0].full_url, "http://127.0.0.1:8000/tokenize")
        self.assertEqual(requests[1].full_url, "http://127.0.0.1:8000/v1/chat/completions")
        self.assertFalse(json.loads(requests[1].data)["chat_template_kwargs"]["enable_thinking"])

    def test_large_context_allowed_when_tokens_fit_and_never_truncated(self):
        opener = self.opener(count=80000)
        value = {**CHAT, "context": {"notes": "x" * 180000}}
        list(runtime.VllmAdapter(opener=opener).stream(security.MODEL, security.model_messages(value), None, False, {}))
        self.assertIn("x" * 180000, opener.open.call_args_list[-1].args[0].data.decode())

    def test_token_overflow_stops_before_inference(self):
        opener = self.opener(count=110000)
        with self.assertRaises(security.SurvivalError) as caught:
            list(runtime.VllmAdapter(opener=opener).stream(security.MODEL, security.model_messages(CHAT), None, False, {}))
        self.assertEqual(caught.exception.code, "context_too_large")
        self.assertEqual(opener.open.call_count, 1)

    def test_fixed_model_and_deadline(self):
        with self.assertRaises(security.SurvivalError):
            list(runtime.VllmAdapter().stream("other", [], None, False, {}))
        adapter = runtime.VllmAdapter(clock=lambda: 10, timeout=-1)
        with self.assertRaises(security.SurvivalError) as caught:
            list(adapter.stream(security.MODEL, security.model_messages(CHAT), None, False, {}))
        self.assertEqual(caught.exception.code, "timeout")

    def test_tool_call_and_response_identity_preserved(self):
        messages = [{"role": "assistant", "content": "", "tool_calls": [
            {"id": "call-123", "function": {"name": "search_library", "arguments": {"query": "water"}}}]},
            {"role": "tool", "tool_name": "search_library", "content": "Water guide"}]
        converted = runtime.openai_messages(messages)
        self.assertEqual(converted[1]["tool_call_id"], "call-123")
        self.assertEqual(json.loads(converted[0]["tool_calls"][0]["function"]["arguments"]), {"query": "water"})
        with self.assertRaises(security.SurvivalError):
            runtime.openai_messages([messages[-1]])

    def test_only_declared_reference_tools_can_be_called(self):
        answer = {"choices": [{"message": {"content": "", "tool_calls": [
            {"id": "a", "function": {"name": "run_shell", "arguments": "{}"}}]}, "finish_reason": "tool_calls"}]}
        with self.assertRaises(security.SurvivalError):
            list(runtime.VllmAdapter(opener=self.opener(answer=answer)).stream(security.MODEL, security.model_messages(CHAT),
                 [{"type": "function", "function": {"name": "search_library"}}], False, {}))

    def test_rag_uses_safe_prompt_no_memory_and_actual_sources(self):
        core, library = Mock(), Mock()
        core.chat_events.return_value = iter([{"type": "thinking", "text": "hidden"},
            {"type": "done", "answer": "<think>hidden</think>Store water.", "sources": [{"id": 1}]}])
        library.read.return_value = {"title": "Water", "source": "Ready.gov", "url": "https://ready.gov/water", "text": "Reference"}
        library.db.execute.return_value.fetchone.return_value = ("ready-gov",)
        library.license.return_value = "Public domain"
        events = list(runtime.chat_events(core, library, {"model": security.MODEL}, CHAT))
        self.assertEqual(events[-1]["reply"], "Store water.")
        self.assertEqual(events[-1]["sources"][0]["license"], "Public domain")
        self.assertIsNone(core.chat_events.call_args.kwargs["memory"])
        self.assertEqual(core.chat_events.call_args.args[2][0]["content"], security.SYSTEM_PROMPT)
        core.system_prompt.assert_not_called()

    def test_modal_configuration_has_one_private_h200_and_no_local_runtime(self):
        path = Path(__file__).resolve().parents[1] / "server/survival/modal_app.py"
        tree = ast.parse(path.read_text())
        worker = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "SurvivalWorker")
        settings = {keyword.arg: ast.literal_eval(keyword.value) for keyword in worker.decorator_list[0].keywords
                    if keyword.arg in {"gpu", "min_containers", "max_containers", "buffer_containers"}}
        self.assertEqual(settings, {"gpu": "H200", "min_containers": 0, "max_containers": 1, "buffer_containers": 0})
        self.assertNotIn("web_server", ast.unparse(worker))
        self.assertNotIn("asgi_app", ast.unparse(worker))
        self.assertNotIn("/Users/", path.read_text())


if __name__ == "__main__":
    unittest.main()
