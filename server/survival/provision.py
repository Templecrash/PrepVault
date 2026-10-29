"""Independent CPU-only asset preparation; never imports the GPU application.

Run: modal run --detach -m server.survival.provision::prepare
"""
import json
from pathlib import Path

import modal


SOURCE_DIR = Path(__file__).parent
app = modal.App("prepvault-survival-provision")
assets_volume = modal.Volume.from_name("prepvault-survival-assets", create_if_missing=True, version=2)

# Explicitly copy only this entrypoint and the asset loader/lock. The vLLM image
# and runtime cannot become dependencies of this provisioning App.
image = (modal.Image.debian_slim(python_version="3.12")
         .pip_install("huggingface_hub==0.36.0")
         .env({"PYTHONPATH": "/opt/prepvault", "PYTHONDONTWRITEBYTECODE": "1",
               "HF_HUB_DISABLE_PROGRESS_BARS": "1", "HF_HUB_DISABLE_TELEMETRY": "1",
               "DO_NOT_TRACK": "1"}))
for filename in ("__init__.py", "assets.py", "assets.lock.json", "provision.py"):
    image = image.add_local_file(SOURCE_DIR / filename,
                                 "/opt/prepvault/server/survival/" + filename, copy=True)


def progress_reporter():
    """Only public asset phase/part counts; suppress repeated byte updates."""
    seen = set()

    def report(event):
        phase = event.get("phase", "preparing")
        per_file = event.get("completed") if phase == "model-verifying" else event.get("part")
        key = (phase, per_file)
        if key in seen:
            return
        seen.add(key)
        allowed = ("phase", "part", "completed", "total", "bytes", "articles", "sources", "revision")
        print(json.dumps({field: event[field] for field in allowed if field in event}), flush=True)

    return report


@app.function(image=image, volumes={"/data": assets_volume}, cpu=4, memory=8192,
              timeout=4 * 60 * 60, min_containers=0, max_containers=1, retries=0,
              include_source=False)
def prepare():
    """Download and verify both assets remotely on the shared persistent volume."""
    from .assets import ensure_library, ensure_model, asset_status
    report = progress_reporter()
    try:
        ensure_library("/data/library", progress=report)
    finally:
        # Preserve resumable partial downloads as well as completed assets.
        assets_volume.commit()
    try:
        ensure_model("/data/model", progress=report)
    finally:
        assets_volume.commit()
    status = asset_status("/data")
    report({"phase": "assets-ready" if status["ready"] else "assets-incomplete",
            "articles": status["library"].get("articles", 0)})
    return status
