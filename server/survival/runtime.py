"""Read-only Survival LLM retrieval, adapted to a private vLLM server."""
import contextlib
import importlib
import ipaddress
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
from urllib import parse, request

from .security import MODEL, MAX_REPLY, SurvivalError, encoded_json, strict_json, network_opener, model_messages


REFERENCE_REQUEST = re.compile(
    r"\b(?:librar(?:y|ies)|references?|cit(?:e|ed|ations?)|manuals?|handbooks?|research|fact.check)\b"
    r"|\blook(?:\s+(?:it|this|that))?\s+up\b"
    r"|\b(?:supporting|credible|reliable|authoritative|published|external|verified)\s+sources?\b"
    r"|\bsources?\s+for\b"
    r"|\b(?:provide|include|show|give|find|list)\s+(?:me\s+)?(?:the\s+)?sources?\b"
    r"(?!\s+of\s+(?:water|power|fuel|food|energy)\b)", re.I)
INTERNAL_REFERENCE = re.compile(r"\b(?:search_library|read_article|show_article)\b|\[\s*id\s+\d+\s*\]", re.I)
READ_CLAIM = re.compile(
    r"\b(?:I|we)\s+(?:(?:have|already|just)\s+)*(?:read|opened|consulted|looked\s+up)\b"
    r"(?!\s+(?:(?:your|our|the)\s+(?:(?:current|recorded|saved|existing)\s+)*"
    r"(?:inventor(?:y|ies)|plans?|app|context|notes|records)|this\s+conversation)\b)"
    r"|\b(?:the|our)\s+(?:library|handbook|manual)\s+(?:says|states|recommends)\b", re.I)


class ReferenceState:
    """Evidence comes from executed library events, never the model's prose."""
    def __init__(self, question):
        self.required = bool(REFERENCE_REQUEST.search(question))
        self.searched = False
        self.has_results = False
        self.read_ids = {}

    def observe(self, event):
        if event.get("type") == "search":
            self.searched = True
            self.has_results = self.has_results or bool(event.get("results"))
        elif event.get("type") == "read" and type(event.get("id")) is int and event["id"] > 0:
            self.read_ids[event["id"]] = {"id": event["id"]}
        # show_article only opens the desktop reader. It does not give the
        # model article text and is deliberately not offered in the hosted UI.

    def tool_choice(self, names):
        if self.required and not self.searched and "search_library" in names:
            return {"type": "function", "function": {"name": "search_library"}}
        if self.has_results and not self.read_ids and "read_article" in names:
            return {"type": "function", "function": {"name": "read_article"}}
        return "auto"


def openai_messages(messages):
    """Translate the bundled core's Ollama tool turns without losing call IDs."""
    output, pending = [], []
    for index, message in enumerate(messages):
        role = message.get("role")
        if role not in ("system", "user", "assistant", "tool"):
            raise SurvivalError(503, "invalid_model_request", "The reference conversation could not be prepared.")
        entry = {"role": role, "content": message.get("content", "")}
        if role == "assistant" and message.get("tool_calls"):
            calls = []
            if len(message["tool_calls"]) > 8:
                raise SurvivalError(503, "invalid_model_request", "The model requested too many references.")
            for position, call in enumerate(message["tool_calls"]):
                function = call.get("function", {})
                call_id = call.get("id") or f"ref_{index}_{position}"
                arguments = function.get("arguments", {})
                if not isinstance(arguments, str):
                    arguments = encoded_json(arguments).decode("utf-8")
                calls.append({"id": call_id, "type": "function", "function": {
                    "name": function.get("name", ""), "arguments": arguments}})
                pending.append((function.get("name"), call_id))
            entry["tool_calls"] = calls
        elif role == "tool":
            name = message.get("tool_name")
            match = next((i for i, (candidate, _) in enumerate(pending) if candidate == name), None)
            if match is None:
                raise SurvivalError(503, "invalid_model_request", "A reference response was missing its request.")
            _, entry["tool_call_id"] = pending.pop(match)
        output.append(entry)
    return output


class VllmAdapter:
    """One-request adapter; neither endpoint nor model can come from the client."""
    def __init__(self, timeout=240, opener=None, clock=time.monotonic, references=None):
        self.opener, self.clock = opener or network_opener(), clock
        self.deadline = clock() + timeout
        self.references = references

    def post(self, path, body, limit=512 * 1024):
        if path not in ("/tokenize", "/v1/chat/completions"):
            raise ValueError("Unexpected inference path")
        remaining = self.deadline - self.clock()
        if remaining <= 0:
            raise SurvivalError(504, "timeout", "The survival model took too long. Try a shorter question.")
        req = request.Request("http://127.0.0.1:8000" + path, data=encoded_json(body),
                              headers={"Content-Type": "application/json"}, method="POST")
        with self.opener.open(req, timeout=remaining) as response:
            raw = response.read(limit + 1)
            if response.status != 200 or len(raw) > limit:
                raise ValueError("Invalid response")
            return strict_json(raw)

    def stream(self, model, messages, tools, _think, _options):
        if model != MODEL:
            raise SurvivalError(503, "invalid_model_request", "The configured survival model is required.")
        converted = openai_messages(messages)
        tools = [item for item in tools or []
                 if item.get("function", {}).get("name") in {"search_library", "read_article"}]
        body = {"model": MODEL, "messages": converted, "stream": False, "max_tokens": 4096,
                "temperature": 1.0, "top_p": 0.95, "chat_template_kwargs": {"enable_thinking": False}}
        if tools:
            names = {item["function"]["name"] for item in tools}
            choice = self.references.tool_choice(names) if self.references else "auto"
            body.update(tools=tools, tool_choice=choice, parallel_tool_calls=False)
        try:
            # Count the *actual* rendered prompt with the serving tokenizer,
            # including tool definitions and template. Never truncate context.
            token_request = {"model": MODEL, "messages": converted, "add_generation_prompt": True,
                             "chat_template_kwargs": {"enable_thinking": False}}
            if tools:
                token_request["tools"] = tools
            tokens = self.post("/tokenize", token_request, limit=4 * 1024 * 1024)
            if type(tokens.get("count")) is not int or tokens["count"] < 1 or type(tokens.get("max_model_len")) is not int:
                raise ValueError("Invalid token count")
            # Reserve 4,096 output tokens plus 4,096 for the next reference turn.
            if tokens["count"] + 8192 > min(tokens["max_model_len"], 114688):
                raise SurvivalError(413, "context_too_large", "This conversation and app context exceed the model's token budget. Start a new chat or narrow the assessment.")
            data = self.post("/v1/chat/completions", body)
            choice = data["choices"][0]
            message = choice["message"]
            content = message.get("content") or ""
            calls = message.get("tool_calls") or []
            if not isinstance(content, str) or len(content) > MAX_REPLY or not isinstance(calls, list) or len(calls) > 8:
                raise ValueError("Invalid answer")
            safe_calls = []
            allowed = {item.get("function", {}).get("name") for item in tools or []}
            for call in calls:
                function = call["function"]
                arguments = function["arguments"]
                if isinstance(arguments, str):
                    arguments = strict_json(arguments)
                if function["name"] not in allowed or not isinstance(arguments, dict):
                    raise ValueError("Unexpected tool")
                safe_calls.append({"id": str(call.get("id", ""))[:128], "type": "function", "function": {
                    "name": function["name"], "arguments": arguments}})
            # Do not copy reasoning/reasoning_content, even if a model ignores
            # enable_thinking=False. The core only receives usable content.
            yield {"message": {"role": "assistant", "content": content, "tool_calls": safe_calls},
                   "done": True, "done_reason": "length" if choice.get("finish_reason") == "length" else "stop"}
        except SurvivalError:
            raise
        except TimeoutError:
            raise SurvivalError(504, "timeout", "The survival model took too long. Try a shorter question.") from None
        except (OSError, ValueError, KeyError, IndexError, TypeError):
            raise SurvivalError(503, "model_unavailable", "The survival model could not finish this answer. Try again.") from None


def load_library(source_root="/opt/survival-llm", library_root="/data/library"):
    """Import only the pinned public library; never load the desktop app/memory."""
    root = Path(library_root).resolve()
    sys.path.insert(0, source_root)
    os.environ["SURVIVAL_LLM_LIBRARY"] = str(root)
    module = importlib.import_module("library.search")
    module.LIB, module.DB_PATH, module.TEXT_DIR = str(root), str(root / "index.sqlite"), str(root / "text")
    library = module.Library(str(root / "index.sqlite"))
    text_root = (root / "text").resolve()

    def read_reference(file_id, offset, length):
        row = library.db.execute("SELECT path FROM files WHERE id=?", (file_id,)).fetchone()
        if not row or type(offset) is not int or type(length) is not int or offset < 0 or not 0 <= length <= 2 * 1024 * 1024:
            raise ValueError("Invalid reference range")
        path = (text_root / row[0]).resolve()
        if not path.is_relative_to(text_root):
            raise ValueError("Invalid reference path")
        with path.open("rb") as stream:
            stream.seek(offset)
            return stream.read(length)

    library._read_bytes = read_reference
    return library


def assess(payload, source_root="/opt/survival-llm", library_root="/data/library"):
    # A fresh adapter and SQLite connection per conversation. The only global
    # core changes select the fixed local engine; no question/history persists.
    sys.path.insert(0, source_root)
    core = importlib.import_module("core")
    library = load_library(source_root, library_root)
    references = ReferenceState(payload["messages"][-1]["content"])
    adapter = VllmAdapter(references=references)
    core._stream = adapter.stream
    core.capabilities = lambda _model: {"tools"}
    core.MAX_TOOL_ROUNDS = 4

    def no_other_http(*_args, **_kwargs):
        raise SurvivalError(503, "invalid_model_request", "Only the configured survival model is available.")

    core._post = no_other_http
    try:
        for event in chat_events(core, library, {"model": MODEL}, payload, references=references):
            if event["type"] == "done":
                return {key: event[key] for key in ("reply", "model", "sources")}
        raise SurvivalError(503, "incomplete_answer", "The survival model did not return an answer.")
    finally:
        library.db.close()

def public_source_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        return ""
    try:
        url = parse.urlsplit(value)
        host = url.hostname or ""
        if url.scheme not in ("http", "https") or not host or url.username or url.password or any(c.isspace() for c in value):
            return ""
        if host == "localhost" or host.endswith((".local", ".localhost", ".internal")):
            return ""
        try:
            if not ipaddress.ip_address(host).is_global:
                return ""
        except ValueError:
            pass
        return value
    except ValueError:
        return ""


def final_reply(value):
    if not isinstance(value, str):
        return ""
    # Never expose models' tagged scratchwork, even if a provider places it in
    # the final content field instead of the separate thinking field.
    for tag in ("think", "thinking", "analysis", "reasoning"):
        value = re.sub(r"<" + tag + r"\b[^>]*>.*?</" + tag + r"\s*>", "", value, flags=re.I | re.S)
        value = re.sub(r"^.*?</" + tag + r"\s*>", "", value, flags=re.I | re.S)
        value = re.sub(r"<" + tag + r"\b[^>]*>.*$", "", value, flags=re.I | re.S)
    return value.strip()


def retrieved_sources(library, items):
    sources, seen, articles = [], set(), set()
    for item in items if isinstance(items, list) else []:
        if len(sources) == 8:
            break
        pid = item.get("id") if isinstance(item, dict) else None
        if type(pid) is not int or pid < 0 or pid in seen:
            continue
        seen.add(pid)
        try:
            article = library.read(pid, max_chars=700)
            if not article:
                continue
            identity = (article.get("title"), article.get("source"), article.get("url"))
            if identity in articles:
                continue
            articles.add(identity)
            row = library.db.execute("SELECT s.key FROM passages p JOIN docs d ON d.id=p.doc_id JOIN sources s ON s.id=d.source_id WHERE p.id=?", (pid,)).fetchone()
            license_text = library.license(row[0]) if row else ""
            sources.append({"title": str(article.get("title", ""))[:300],
                            "source": str(article.get("source", ""))[:200],
                            "url": public_source_url(article.get("url")),
                            "license": str(license_text or "")[:500],
                            "excerpt": str(article.get("text", ""))[:600]})
        except (OSError, ValueError, sqlite3.Error):
            continue
    return sources


def chat_events(core, library, config, payload, references=None):
    # Do not call core.system_prompt: the attached app's permissive prompt does
    # not meet PrepVault's accuracy, safety or untrusted-data requirements.
    messages = model_messages(payload)
    references = references or ReferenceState(payload["messages"][-1]["content"])
    for event in core.chat_events(config["model"], library, messages, reasoning="off",
                                  caps=core.capabilities(config["model"]), length="normal", memory=None):
        references.observe(event)
        kind = event.get("type")
        if kind in ("search", "read", "show", "retry"):
            yield {"type": "progress", "message": "Checking the reference library."}
        elif kind == "done":
            reply = final_reply(event.get("answer"))
            if not reply or len(reply) > MAX_REPLY or event.get("unfinished") or event.get("cut_off"):
                raise SurvivalError(503, "incomplete_answer", "The server model did not finish an answer. Try a more focused question.")
            # Only read events are emitted after an actual successful tool
            # read. A model-named source, search hit or desktop 'show' event is
            # not proof that the model was given the reference text.
            sources = retrieved_sources(library, list(references.read_ids.values()))
            if references.required and not sources:
                raise SurvivalError(503, "reference_unavailable", "The model could not open a supporting library reference. Try a more specific topic; no reference-backed answer was returned.")
            if (INTERNAL_REFERENCE.search(reply) or event.get("unopened") or
                    (not sources and READ_CLAIM.search(reply))):
                raise SurvivalError(503, "reference_unverified", "The model returned an unsupported reference claim. Please retry; that answer was not shown.")
            yield {"type": "done", "reply": reply, "model": config["model"],
                   "sources": sources}
            return
        # token, thinking and all other internal events deliberately stay local.
    raise SurvivalError(503, "incomplete_answer", "The server model did not return an answer. Try again.")
