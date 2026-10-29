"""Startup checks use tiny Python subprocesses, never a model or a GPU."""
import ast
import contextlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

from server.survival import assets, security, startup


class StartupDiagnosticsTests(unittest.TestCase):
    def test_both_pipes_are_drained_and_retained_memory_is_bounded(self):
        process = subprocess.Popen([sys.executable, "-c",
            "import sys; sys.stdout.write('x'*200000); sys.stdout.flush(); "
            "sys.stderr.write('y'*200000+'\\nRuntimeError: unsupported kernel')"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        diagnostics = startup.StartupDiagnostics()
        diagnostics.start(process)
        self.assertEqual(process.wait(timeout=5), 0)
        diagnostics.wait()
        self.assertTrue(all(len(buffer) <= startup.STREAM_TAIL_BYTES
                            for buffer in diagnostics._buffers.values()))
        tail = diagnostics.failure_tail()
        self.assertIn("RuntimeError: unsupported kernel", tail)
        self.assertLessEqual(len(tail.encode("utf-8")), startup.OUTPUT_TAIL_BYTES)
        self.assertEqual(diagnostics.failure_tail(), "")
        self.assertTrue(all(not buffer for buffer in diagnostics._buffers.values()))

    def test_after_readiness_private_output_is_dropped_but_pipes_still_drain(self):
        process = subprocess.Popen([sys.executable, "-c",
            "import sys; sys.stdin.readline(); sys.stdout.write('private prompt '*30000); "
            "sys.stdout.flush(); sys.stderr.write('private answer '*30000)"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        diagnostics = startup.StartupDiagnostics(("test-secret",))
        diagnostics._append("stdout", b"Public startup status")
        diagnostics.start(process)
        diagnostics.discard()
        process.stdin.write(b"ready\n")
        process.stdin.close()
        self.assertEqual(process.wait(timeout=5), 0)
        diagnostics.wait()
        self.assertEqual(diagnostics.failure_tail(), "")
        self.assertTrue(all(not buffer for buffer in diagnostics._buffers.values()))
        self.assertEqual(diagnostics._secrets, ())

    def test_failure_tail_redacts_credentials_and_escapes(self):
        secret = "private-environment-value"
        diagnostics = startup.StartupDiagnostics((secret,))
        diagnostics._append("stderr", (
            "\x1b[31mRuntimeError: CUDA kernel mismatch\x1b[0m\n" + secret + "\n" +
            "Authorization: Bearer hidden-token\napi_key='hidden-key'\n" +
            "https://user:password@example.com/model?token=hidden-query#hidden-fragment\n" +
            "hf_123456789012345678901234\n").encode())
        tail = diagnostics.failure_tail()
        self.assertIn("RuntimeError: CUDA kernel mismatch", tail)
        self.assertIn("https://example.com/model", tail)
        for hidden in (secret, "hidden-token", "hidden-key", "hidden-query", "hidden-fragment",
                       "user:password", "hf_123456789012345678901234", "\x1b"):
            self.assertNotIn(hidden, tail)

    def test_truncated_partial_secret_is_not_exposed_at_ring_boundary(self):
        secret = "secret-that-must-not-leak-12345"
        following = b"\nCUDA failed\n"
        with patch.object(startup, "STREAM_TAIL_BYTES", 64):
            diagnostics = startup.StartupDiagnostics((secret,))
            diagnostics._append("stderr", secret.encode() + following + b"x" * (64 - 8 - len(following)))
            self.assertTrue(bytes(diagnostics._buffers["stderr"]).startswith(secret[-8:].encode()))
            tail = diagnostics.failure_tail()
        self.assertIn("CUDA failed", tail)
        self.assertNotIn(secret[-8:], tail)

    def test_multiline_secret_parts_are_redacted_individually(self):
        text = startup.scrub_startup_text("private-line-two\nCUDA failed", ("private-line-one\nprivate-line-two",))
        self.assertNotIn("private-line-two", text)
        self.assertIn("CUDA failed", text)


class CompilerCacheTests(unittest.TestCase):
    def test_private_caches_reuse_only_matching_model_runtime_and_arguments(self):
        with tempfile.TemporaryDirectory() as directory:
            first = startup.compiler_cache_environment(directory, "revision-1", "vllm:v1", ["vllm", "serve"])
            same = startup.compiler_cache_environment(directory, "revision-1", "vllm:v1", ["vllm", "serve"])
            self.assertEqual(first, same)
            for value in first.values():
                path = Path(value)
                self.assertTrue(path.is_relative_to(Path(directory) / "compile-cache"))
                self.assertEqual(path.stat().st_mode & 0o777, 0o700)
            for revision, image, command, gpu in [
                ("revision-2", "vllm:v1", ["vllm", "serve"], "H200"),
                ("revision-1", "vllm:v2", ["vllm", "serve"], "H200"),
                ("revision-1", "vllm:v1", ["vllm", "serve", "--other"], "H200"),
                ("revision-1", "vllm:v1", ["vllm", "serve"], "B200")]:
                changed = startup.compiler_cache_environment(directory, revision, image, command, gpu)
                self.assertNotEqual(first["VLLM_CACHE_ROOT"], changed["VLLM_CACHE_ROOT"])
            self.assertNotIn("HF_HOME", first)
            self.assertNotIn("VLLM_MEDIA_CACHE", first)

    def test_symlinked_cache_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as elsewhere:
            (Path(directory) / "compile-cache").symlink_to(elsewhere)
            with self.assertRaises(RuntimeError):
                startup.compiler_cache_environment(directory, "revision", "image", ["command"])


class WorkerStartupTests(unittest.TestCase):
    def worker(self, process, response=None):
        """Load the actual worker methods without Modal decorators or resources."""
        path = Path(__file__).resolve().parents[1] / "server/survival/modal_app.py"
        tree = ast.parse(path.read_text())
        worker = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "SurvivalWorker")
        worker.decorator_list = []
        for method in worker.body:
            if isinstance(method, ast.FunctionDef):
                method.decorator_list = []
        popen = Mock(return_value=process)
        opener = Mock()
        opener.open.return_value = response
        namespace = {"__name__": "server.survival.modal_app", "__package__": "server.survival",
            "os": os, "sys": sys, "time": time, "contextlib": contextlib,
            "subprocess": Mock(Popen=popen, PIPE=subprocess.PIPE), "MODEL": security.MODEL,
            "MODEL_REVISION": "test-revision", "VLLM_IMAGE": "test-image", "model_command": lambda: ["vllm"],
            "StartupDiagnostics": startup.StartupDiagnostics, "SENSITIVE_MARKERS": startup.SENSITIVE_MARKERS,
            "sensitive_values": startup.sensitive_values, "terminate_process": startup.terminate_process,
            "compiler_cache_environment": Mock(return_value={}), "assets_volume": Mock(),
            "network_opener": lambda: opener, "strict_json": security.strict_json}
        exec(compile(ast.Module(body=[worker], type_ignores=[]), str(path), "exec"), namespace)
        return namespace["SurvivalWorker"](), namespace

    def test_readiness_clears_logs_before_committing_or_accepting_inference(self):
        process = Mock(stdout=io.BytesIO(b"startup output"), stderr=io.BytesIO())
        process.poll.return_value = None
        response = io.BytesIO(security.encoded_json({"data": [{"id": security.MODEL}]}))
        response.status = 200
        worker, namespace = self.worker(process, response)
        def commit():
            self.assertFalse(worker.diagnostics._retaining)
            self.assertTrue(all(not buffer for buffer in worker.diagnostics._buffers.values()))
        namespace["assets_volume"].commit.side_effect = commit
        output = io.StringIO()
        with patch.object(assets, "asset_status", return_value={"ready": True}), contextlib.redirect_stderr(output):
            worker.start()
        self.assertEqual(output.getvalue(), "")
        namespace["assets_volume"].commit.assert_called_once()

    def test_failed_startup_reports_scrubbed_tail_without_secret_environment(self):
        process = Mock(stdout=io.BytesIO(), stderr=io.BytesIO(b"RuntimeError: CUDA failed test-private-secret"))
        process.poll.return_value = 1
        worker, namespace = self.worker(process)
        output = io.StringIO()
        with patch.object(assets, "asset_status", return_value={"ready": True}), \
             patch.dict(os.environ, {"TEST_API_KEY": "test-private-secret"}), contextlib.redirect_stderr(output):
            with self.assertRaisesRegex(RuntimeError, "Check server startup diagnostics"):
                worker.start()
        self.assertIn("CUDA failed", output.getvalue())
        self.assertNotIn("test-private-secret", output.getvalue())
        self.assertNotIn("TEST_API_KEY", namespace["subprocess"].Popen.call_args.kwargs["env"])
        self.assertFalse(worker.diagnostics._retaining)


if __name__ == "__main__":
    unittest.main()
