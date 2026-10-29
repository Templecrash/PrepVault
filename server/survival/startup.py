"""Bounded startup diagnostics and public-model compiler caches only."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time
from urllib.parse import urlsplit, urlunsplit


STREAM_TAIL_BYTES = 8192
OUTPUT_TAIL_BYTES = 8192
SENSITIVE_MARKERS = ("SECRET", "TOKEN", "PASSWORD", "API_KEY")


def sensitive_values(environment):
    return tuple(value for key, value in environment.items()
                 if any(marker in key.upper() for marker in SENSITIVE_MARKERS)
                 and isinstance(value, str) and len(value) >= 4)


def scrub_startup_text(value, secrets=()):
    """Do not expose environment credentials, URL credentials or auth headers."""
    value = re.sub(r"\x1b\][^\x07]*(?:\x07|\x1b\\)", "", value)
    value = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", value)
    value = "".join(c for c in value if c in "\n\t" or (ord(c) >= 32 and ord(c) != 127))
    secret_parts = {part for secret in secrets for part in (secret, *secret.splitlines()) if len(part) >= 4}
    for secret in sorted(secret_parts, key=len, reverse=True):
        value = value.replace(secret, "[redacted]")

    def safe_url(match):
        try:
            url = urlsplit(match.group())
            host = url.hostname or ""
            if ":" in host:
                host = "[" + host + "]"
            if url.port:
                host += ":" + str(url.port)
            return urlunsplit((url.scheme, host, url.path, "", ""))
        except ValueError:
            return "[redacted URL]"

    value = re.sub(r"https?://[^\s\"'<>]+", safe_url, value)
    value = re.sub(r"(?i)\bbearer\s+\S+", "Bearer [redacted]", value)
    value = re.sub(r"\b(?:sk-[A-Za-z0-9_-]{16,}|hf_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)",
                   "[redacted]", value)
    sensitive_assignment = re.compile(
        r"(?i)(?:authorization|api[_-]?key|access[_-]?token|password|secret|cookie)[\"']?\s*[:=]")
    return "\n".join("[redacted sensitive startup line]" if sensitive_assignment.search(line) else line
                     for line in value.splitlines())


class StartupDiagnostics:
    """Drain both pipes continuously; retain bytes only before readiness.

    No background thread prints anything. Once discarded or collected after a
    failure, retention cannot be re-enabled and all future bytes are dropped.
    """
    def __init__(self, secrets=()):
        self._secrets = tuple(secrets)
        self._buffers = {"stdout": bytearray(), "stderr": bytearray()}
        self._truncated = {"stdout": False, "stderr": False}
        self._lock = threading.Lock()
        self._retaining = True
        self._threads = []

    def start(self, process):
        for name in self._buffers:
            pipe = getattr(process, name)
            if pipe is not None:
                thread = threading.Thread(target=self._drain, args=(name, pipe), daemon=True,
                                          name="survival-startup-" + name)
                self._threads.append(thread)
                thread.start()

    def _drain(self, name, pipe):
        try:
            read = getattr(pipe, "read1", pipe.read)
            while chunk := read(4096):
                self._append(name, chunk)
        except (OSError, ValueError):
            pass
        finally:
            pipe.close()

    def _append(self, name, chunk):
        with self._lock:
            if self._retaining:
                buffer = self._buffers[name]
                buffer.extend(chunk)
                if len(buffer) > STREAM_TAIL_BYTES:
                    self._truncated[name] = True
                    del buffer[:-STREAM_TAIL_BYTES]

    def discard(self):
        with self._lock:
            self._retaining = False
            for buffer in self._buffers.values():
                buffer.clear()
            self._secrets = ()

    def failure_tail(self):
        with self._lock:
            if not self._retaining:
                return ""
            self._retaining = False
            parts = []
            for name, buffer in self._buffers.items():
                value = bytes(buffer)
                if self._truncated[name]:
                    # A ring boundary can cut through a credential, defeating
                    # full-value redaction. Omit the incomplete leading line.
                    boundary = value.find(b"\n")
                    value = value[boundary + 1:] if boundary >= 0 else b""
                if value:
                    parts.append("[" + name + "]\n" + value.decode("utf-8", errors="replace"))
            for buffer in self._buffers.values():
                buffer.clear()
            secrets, self._secrets = self._secrets, ()
        safe = scrub_startup_text("\n".join(parts), secrets).encode("utf-8")
        return safe[-OUTPUT_TAIL_BYTES:].decode("utf-8", errors="ignore")

    def wait(self, timeout=1):
        deadline = time.monotonic() + timeout
        for thread in self._threads:
            thread.join(max(0, deadline - time.monotonic()))


def terminate_process(process):
    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def compiler_cache_environment(volume_root, model_revision, image, command, gpu="H200"):
    """Use only private generated-code caches, separated by model and runtime."""
    identity = json.dumps({"model": model_revision, "image": image, "command": command, "gpu": gpu},
                          sort_keys=True, separators=(",", ":")).encode()
    scope = hashlib.sha256(identity).hexdigest()[:32]
    parent = Path(volume_root) / "compile-cache"
    root = parent / scope
    names = {"VLLM_CACHE_ROOT": "vllm", "TRITON_CACHE_DIR": "triton",
             "TORCHINDUCTOR_CACHE_DIR": "torchinductor", "FLASHINFER_WORKSPACE_BASE": "flashinfer",
             "VLLM_FLASHINFER_AUTOTUNE_CACHE_DIR": "flashinfer-autotune"}
    for path in (parent, root, *(root / name for name in names.values())):
        if path.is_symlink():
            raise RuntimeError("The compiler cache must be a private regular directory.")
        path.mkdir(mode=0o700, exist_ok=True)
        if not path.is_dir():
            raise RuntimeError("The compiler cache must be a private regular directory.")
        os.chmod(path, 0o700)
    return {key: str(root / name) for key, name in names.items()}
