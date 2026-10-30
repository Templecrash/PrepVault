# Private Survival LLM assets

This package provisions reference data and model files inside a remote Modal CPU function. Importing it, running its unit tests, and calling `asset_status()` do not download files or load a GPU. `ensure_library()` and `ensure_model()` refuse to run outside a remote Modal container.

The pinned inputs are recorded in `assets.lock.json`:

| Asset | Pin | Download |
| --- | --- | --- |
| [Survival LLM source](https://github.com/anonnerdfrenzy/survival-llm/tree/84f01fdb70199c8f777ecc7eba6e3cb6446a5a67) | v0.3.4, commit `84f01fdb70199c8f777ecc7eba6e3cb6446a5a67` | Source only, bundled into the server image |
| [Full reference library](https://anonnerdfrenzy.github.io/survival-llm/library-packs.json) | `full`, `2026-10-28`, five individually hashed parts | 8,656,720,766 bytes; approximately 21 GB installed |
| [NVIDIA Nemotron 3.5 Super VL NVFP4](https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4/tree/da5b2650a835292c678994a1fa3fb653250fb508) | revision `da5b2650a835292c678994a1fa3fb653250fb508` | 75,063,309,376 bytes, all 113 repository files |

The deployment uses NVIDIA's native NVFP4 weights with vLLM, including the pinned tokenizer, configuration, processor and model source files. The macOS Ollama package is not used by this server. See the model card's H200 serving recipe for the supported vLLM configuration. Provisioning only downloads and verifies the model source files; runtime code execution is separate.

## Storage and integrity

The persistent Modal Volume is mounted at `/data`:

- `/data/library`: `index.sqlite`, text shards, original `SOURCES.md`, `pack.json`, and a verification receipt.
- `/data/model`: complete pinned Hugging Face snapshot and a verification receipt.
- `/data/.library-download-2026-10-28`: resumable reference download parts, removed after successful installation.
- `/data/.library-install-<id>`: verified extracted library retained if final installation fails; the next attempt reuses it without extraction.
- `/data/.model-download-<revision>`: resumable model staging directory, renamed after verification.

The library downloader checks every part's exact size and SHA256. It reads the split ZIP directly, rejects traversal, symlinks, special files, conflicting names, encrypted entries and oversized archives, and verifies the SQLite source/article counts. It preserves the source attribution file. The model downloader verifies all LFS files against their pinned SHA256 and all ordinary repository files against their Git blob SHA1 and exact size. This includes the model code, not only its weights.

Installation acquires an atomic directory lock (`.library-install.lock` or `.model-install.lock`) and checks that the destination is absent. It uses the operating system's non-replacing rename when supported. Modal Volume v2 rejects that flag with `EINVAL`, so the installer falls back to standard directory rename while holding the same lock and checking the destination again. A CPU-only probe verified both the lock and fallback rename on this Volume. Every writer must use this lock; a held or stale lock requires investigation and is never automatically removed by another process.

An existing directory with missing or different verification metadata is preserved and reported as unverified. Unexpected installation errors report their errno and keep verified staging for retry. An interrupted download can also be retried. Run at most one provisioning function against this private Volume at a time, and commit the Volume on both success and failure so resumable data survives. Never provision into a Volume while inference is reading or writing a replacement asset version.

Readiness checks read receipts, file metadata and SQLite source counts; they do not download or rehash 75 GB per request. Index mtime/size and model file stamps must still match. New library receipts also record the index SHA256 after fsync and a stable full-file read, preventing a deferred final-write mtime from making a fresh installation appear invalid. The Volume must remain private and writable only by the owner's deployment. Tamper-resistant storage is not implied by these checks.

For an explicitly investigated library-only timestamp mismatch, `repair_library_stamp('/data/library')` is a remote CPU maintenance operation, never part of a status request. Under the installation lock it requires the pinned receipt, exact index size, unchanged recorded article/source counts, SQLite `quick_check`, and a stable full index hash. The integrity check uses an ephemeral copy to avoid slow random reads on the remote Volume; the original is then hashed again and must exactly match the checked copy. Temporary data stays inside the cloud container and is removed after validation. When the receipt contains an index digest, that digest must match; a real content change is rejected even if the SQLite file is valid and has the same size. The initial legacy receipt can be upgraded only through this explicit authorized repair. It atomically replaces only the receipt; it does not modify library data. Commit and reload the Volume afterward and verify `asset_status()` again.

## Python interface

After account and cost approval, run the separate CPU-only provisioner:

```sh
modal run --detach -m server.survival.provision::prepare
```

This entrypoint does not import or allocate the GPU service. Its Volume is `prepvault-survival-assets`, version 2.

```python
from server.survival.assets import asset_status, ensure_library, ensure_model

# Inside the remote CPU provisioning function, after explicit deployment approval:
library = ensure_library('/data/library')
model = ensure_model('/data/model')
volume.commit()

# CPU status endpoint, no downloads or model loading:
status = asset_status('/data')
assert status['ready']  # true only when both pinned assets are installed
```

Each ensure function accepts `progress=callback`, which receives status dictionaries. Neither function reads an access token: the pinned public model is downloaded with `token=False`. Hugging Face Hub must be installed in the CPU provisioning image. Do not place Modal account tokens or application signing keys in the image or asset Volume.

## Attribution and scope

Retain Survival LLM's [MIT licence](https://github.com/anonnerdfrenzy/survival-llm/blob/84f01fdb70199c8f777ecc7eba6e3cb6446a5a67/LICENSE) with its source in the server image. The reference library has separate per-source terms; preserve its `SOURCES.md`, article source addresses, author credits, and the licence shown with each cited article. [Upstream's source list](https://github.com/anonnerdfrenzy/survival-llm/blob/84f01fdb70199c8f777ecc7eba6e3cb6446a5a67/SOURCES.md) identifies noncommercial materials including wikiHow, iFixit, IFRC and WHO publications. This full pack is for the owner's private, personal assistant. Do not expose it through public, shared or paid customer access without a separate content/licensing review and an appropriate library build. NVIDIA's model has its own OpenMDW-1.1 terms, linked from the retained model README.

Reference material is a dated snapshot, not a live emergency or medical service. Responses should retain citations and the application must not present model output as verified guidance.

## Tests

```sh
python3 -m unittest discover -s tests -p 'test_survival_assets.py' -v
```

Tests use small generated ZIP, SQLite and model fixtures. They do not invoke Modal functions, download assets, execute upstream model code, or consume GPU resources.
