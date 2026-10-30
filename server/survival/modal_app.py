"""Deploy with: modal deploy -m server.survival.modal_app

No model, library or GPU starts when this file is imported locally. Provisioning
is a separate, explicit remote call. The sole public endpoint is the CPU gateway.
"""
import asyncio
import contextlib
import os
from pathlib import Path
import subprocess
import sys
import time

import modal

from .assets import MODEL_REVISION, PINNED_UPSTREAM_COMMIT
from .security import MODEL, SurvivalError, encoded_json, network_opener, strict_json, validate_payload
from .startup import (StartupDiagnostics, SENSITIVE_MARKERS, compiler_cache_environment,
                      sensitive_values, terminate_process)


APP_NAME = "prepvault-survival"
VOLUME_NAME = "prepvault-survival-assets"
SOURCE_DIR = Path(__file__).parent
VLLM_IMAGE = "vllm/vllm-openai:v0.32.0"

app = modal.App(APP_NAME)
assets_volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True, version=2)
replay = modal.Dict.from_name("prepvault-survival-nonces", create_if_missing=True)
jobs = modal.Dict.from_name("prepvault-survival-jobs", create_if_missing=True)

base_image = (modal.Image.debian_slim(python_version="3.12")
              .env({"PYTHONPATH": "/opt/prepvault", "PYTHONDONTWRITEBYTECODE": "1"})
              .add_local_dir(SOURCE_DIR, "/opt/prepvault/server/survival", copy=True,
                             ignore=["**/__pycache__/**", "**/*.pyc"]))
provision_image = base_image.pip_install("huggingface_hub==0.36.0")
gpu_image = (modal.Image.from_registry(VLLM_IMAGE, add_python="3.12")
             .entrypoint([])
             .apt_install("git")
             .run_commands(
                 "git clone --filter=blob:none https://github.com/anonnerdfrenzy/survival-llm.git /opt/survival-llm",
                 "git -C /opt/survival-llm checkout --detach " + PINNED_UPSTREAM_COMMIT)
             .env({"PYTHONPATH": "/opt/prepvault", "PYTHONDONTWRITEBYTECODE": "1",
                   "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
                   "DO_NOT_TRACK": "1", "VLLM_NO_USAGE_STATS": "1"})
             .add_local_dir(SOURCE_DIR, "/opt/prepvault/server/survival", copy=True,
                            ignore=["**/__pycache__/**", "**/*.pyc"]))


def model_command():
    """NVIDIA's v0.32 H200 recipe, with a bounded single-user context/batch."""
    return ["vllm", "serve", "/data/model", "--served-model-name", MODEL,
            "--host", "127.0.0.1", "--port", "8000", "--tensor-parallel-size", "1",
            "--max-model-len", "114688", "--max-num-seqs", "1", "--trust-remote-code",
            "--gpu-memory-utilization", "0.89", "--max-num-batched-tokens", "8192",
            "--block-size", "64", "--prefix-match-unit", "64",
            "--mamba-backend", "flashinfer", "--mamba-ssm-cache-dtype", "float16",
            "--enable-mamba-cache-stochastic-rounding", "--mamba-cache-philox-rounds", "5",
            "--enable-mamba-shared-prefix-checkpoint", "--mamba-cache-mode", "align",
            "--speculative-config.method", "mtp", "--speculative-config.num_speculative_tokens", "3",
            "--enable-auto-tool-choice", "--tool-call-parser", "qwen3_coder",
            "--reasoning-parser", "nemotron_v3", "--no-enable-log-requests", "--disable-log-stats"]


@app.function(image=provision_image, volumes={"/data": assets_volume}, cpu=4, memory=8192,
              timeout=4 * 60 * 60, max_containers=1, min_containers=0, retries=0)
def provision():
    """Explicit cloud-only initial download; no GPU allocated for this job."""
    from .assets import ensure_library, ensure_model, asset_status
    ensure_library("/data/library")
    assets_volume.commit()
    ensure_model("/data/model")
    assets_volume.commit()
    return asset_status("/data")


@app.cls(image=gpu_image, gpu="H200", volumes={"/data": assets_volume}, cpu=8, memory=131072,
         min_containers=0, max_containers=1, buffer_containers=0, scaledown_window=60,
         timeout=300, startup_timeout=600, retries=0, enable_memory_snapshot=False)
class SurvivalWorker:
    @modal.enter()
    def start(self):
        from .assets import asset_status
        if not asset_status("/data")["ready"]:
            raise RuntimeError("The verified survival model and library have not been provisioned.")
        self.process = None
        self.diagnostics = StartupDiagnostics(sensitive_values(os.environ))
        # Only non-secret runtime settings reach the inference subprocess.
        env = {key: value for key, value in os.environ.items()
               if not any(marker in key.upper() for marker in SENSITIVE_MARKERS)}
        env.update({"HOME": "/tmp/survival-home", "HF_HOME": "/tmp/survival-hf", "HF_HUB_OFFLINE": "1",
                    "TRANSFORMERS_OFFLINE": "1", "DO_NOT_TRACK": "1", "VLLM_NO_USAGE_STATS": "1"})
        command = model_command()
        env.update(compiler_cache_environment("/data", MODEL_REVISION, VLLM_IMAGE, command))
        try:
            self.process = subprocess.Popen(command, env=env, stdout=subprocess.PIPE,
                                            stderr=subprocess.PIPE, start_new_session=True)
            self.diagnostics.start(self.process)
            opener = network_opener()
            deadline = time.monotonic() + 570
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    raise RuntimeError("The private survival model could not start.")
                try:
                    with opener.open("http://127.0.0.1:8000/v1/models", timeout=2) as response:
                        data = strict_json(response.read(32768))
                        if response.status == 200 and any(item.get("id") == MODEL for item in data.get("data", [])):
                            # No inference is accepted until this hook returns.
                            # Continue draining pipes, but permanently drop all
                            # output and clear startup text before that happens.
                            self.diagnostics.discard()
                            with contextlib.suppress(Exception):
                                assets_volume.commit()
                            return
                except (OSError, ValueError, TypeError):
                    pass
                time.sleep(1)
            raise TimeoutError("The private survival model exceeded its startup deadline.")
        except Exception as exc:
            with contextlib.suppress(Exception):
                terminate_process(self.process)
            self.diagnostics.wait()
            tail = self.diagnostics.failure_tail()
            print("Survival LLM startup failed (" + type(exc).__name__ + ")." +
                  ("\n" + tail if tail else ""), file=sys.stderr, flush=True)
            raise RuntimeError("The private survival model could not start. Check server startup diagnostics.") from None

    @modal.method()
    def assess(self, payload):
        from .runtime import assess
        try:
            payload = validate_payload(encoded_json(payload).decode("utf-8"), "chat")
            # No prompt, response, reference text or exception traceback is logged.
            with open(os.devnull, "w") as sink, contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
                return assess(payload)
        except SurvivalError as exc:
            return {"error": exc.message, "code": exc.code}
        except Exception:
            return {"error": "The survival model could not complete this assessment.", "code": "model_unavailable"}

    @modal.exit()
    def stop(self):
        diagnostics = getattr(self, "diagnostics", None)
        if diagnostics:
            diagnostics.discard()
        terminate_process(getattr(self, "process", None))
        if diagnostics:
            diagnostics.wait()
        with contextlib.suppress(Exception):
            assets_volume.commit()


@app.function(image=base_image, volumes={"/data": assets_volume}, cpu=0.5, memory=1024,
              min_containers=0, max_containers=1, scaledown_window=60, timeout=45)
@modal.asgi_app()
def gateway():
    from .assets import asset_status
    from .gateway import GatewayApp, HostedGateway, verify_ticket, poll_private_call

    async def verify(ticket):
        return await asyncio.to_thread(verify_ticket, ticket)

    async def consume_nonce(nonce, expires):
        # Atomic and durable across gateway restarts. Modal expires inactive
        # dictionary entries after seven days; tickets expire in two minutes.
        return await replay.put.aio(nonce, expires, skip_if_exists=True)

    async def read_assets():
        await assets_volume.reload.aio()
        return await asyncio.to_thread(asset_status, "/data")

    async def save_job(job_id, value):
        await jobs.put.aio(job_id, value)

    async def read_job(job_id):
        return await jobs.get.aio(job_id)

    async def spawn(payload):
        call = await SurvivalWorker().assess.spawn.aio(payload)
        return call.object_id

    async def poll(call_id):
        call = modal.FunctionCall.from_id(call_id)
        return await poll_private_call(call,
            pending_errors=(TimeoutError, modal.exception.TimeoutError),
            terminal_errors=(modal.exception.FunctionTimeoutError, modal.exception.OutputExpiredError))

    async def cancel(call_id):
        call = modal.FunctionCall.from_id(call_id)
        # The worker has one input at a time; terminating its container also
        # ends model generation if it is currently blocked in a native call.
        await call.cancel.aio(terminate_containers=True)

    return GatewayApp(HostedGateway(verify=verify, consume_nonce=consume_nonce, read_assets=read_assets,
                                    save_job=save_job, read_job=read_job, spawn=spawn, poll=poll, cancel=cancel))
