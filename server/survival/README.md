# Private hosted Survival LLM

This service runs on Modal, not on the owner's computer. PrepVault's existing
owner sign-in protects every request. The server runs NVIDIA's full
`NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4` checkpoint with vLLM and uses the
Survival LLM application's read-only reference retrieval code.

## Components

- `modal_app.py`: CPU web gateway, private H200 worker and explicit CPU asset
  provisioning job. The GPU has `min_containers=0`, `max_containers=1`, one input
  at a time and a 60-second idle scale-down window. Status checks do not wake it.
- `gateway.py` / `security.py`: exact request-digest authorization, durable
  one-use nonces, owner-bound jobs, size limits and bounded JSON responses.
- `runtime.py`: the bundled retrieval loop with an audited replacement prompt,
  a fixed local vLLM connection, actual token-budget checks, no persistent memory
  and citations to articles actually opened. Raw reasoning is never returned.
- `assets.py` / `assets.lock.json`: pinned, verified model and library assets on
  the `prepvault-survival-assets` Modal Volume v2. See `assets.md` for provenance
  and content licensing.

The only public Modal endpoint is the CPU gateway. Its `/status`, `/chat`,
`/result` and `/cancel` routes all require a signed, request-bound capability.
The worker and raw vLLM port are not exposed as web endpoints. vLLM listens on
`127.0.0.1:8000` inside its private GPU container.

## Deployment

Run commands from the PrepVault repository using an authenticated Modal account.
They deploy code or allocate cloud resources; they never run the model locally.

```sh
modal deploy -m server.survival.modal_app
modal run --detach -m server.survival.provision::prepare
```

Provisioning downloads the pinned model and complete library directly into the
cloud volume. It allocates CPU/storage, not a GPU. It is resumable and preserves
unexpected existing data. Allow storage for the roughly 75 GB model checkpoint,
21 GB installed library, download staging and container/cache overhead.
The separate provisioning App imports no GPU application code, so it can run
while the vLLM image is still building. Run only one provisioning command at a
time; the original `modal_app::provision` function shares the same volume.

After deployment, set `SURVIVAL_SERVER_URL` in Vercel to the HTTPS base URL of
the deployed `gateway` function. Deploy the PrepVault API containing
`/api/survival-auth` and `/api/advisor`. The hosted verifier uses the existing
Neon authentication secret; that secret is never copied to Modal. No OpenAI key,
desktop token or local signing secret is needed by this service.
See [the application backend setup](../../docs/survival-server-setup.md) for the
Vercel configuration and end-to-end verification steps.

Do not point `SURVIVAL_SERVER_URL` at a development deployment owned by someone
else. The runtime's verification URL and accepted origin are fixed to
`https://prepvault-xi.vercel.app`; changing the product domain requires a reviewed
change to both sides of the authorization contract.

## Request contract

Each POST is `application/json` with `Origin: https://prepvault-xi.vercel.app`:

```json
{"ticket":"SIGNED_CAPABILITY","payload":"EXACT_JSON_STRING"}
```

The gateway POSTs only the capability to `/api/survival-auth`, checks returned
claims independently, and atomically consumes its nonce in a Modal Dict before
reading status or invoking a worker. Claims expire after 120 seconds; accepting
a valid job before expiration permits that job to finish afterward.

| Route | Ticket purpose | Decoded payload | Response |
| --- | --- | --- | --- |
| `/status` | `status` | `{}` | `200 {configured, model, engine, library:{ready,articles}, error?}` |
| `/chat` | `chat` | `{messages,context}` | `202 {jobId}` |
| `/result` | `result` | `{jobId}` | `200 {status:"pending"}` or `{status:"done",reply,model,sources}` or `{status:"error",error,code}` |
| `/cancel` | `cancel` | `{jobId}` | `200 {status:"cancelled"}` |

Polling and cancellation need fresh capabilities and the same owner as the
original job. Public job IDs are opaque UUIDs; internal Modal function-call IDs
are not returned. Jobs expire after 15 minutes. Cancellation terminates the
private worker container to stop native inference too.

The 256 KB payload limit bounds parsing work. The complete accepted app context
is retained. Before each model call, `/tokenize` counts the actual rendered
prompt, including tools, against the 114,688-token context, reserving 8,192
tokens for output and a further reference turn. An oversized context produces
an explicit error rather than silent truncation.

## Privacy and validation

PrepVault adds no prompt or response logging and does not save conversations in
the model's desktop memory. Job metadata contains only the owner ID, private
call ID, timestamps and state. Model and library assets contain public reference
material, not app inventories or personal files. Modal's platform can retain
Function inputs and outputs for up to seven days; this is hosted processing,
not an offline or zero-retention service.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_survival_hosted.py' -v
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_survival_assets.py' -v
```

These tests use mocked inference, small temporary fixtures and no large
downloads. Deployment still requires an end-to-end owner sign-in test, a real
reference-backed answer, cancellation, unauthorized/replayed request rejection
and confirmation that the H200 scales down after idle time.

Sources: [NVIDIA model and H200 recipe](https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4),
[vLLM tokenizer protocol](https://github.com/vllm-project/vllm/blob/v0.32.0/vllm/entrypoints/serve/tokenize/protocol.py),
[Modal request limits](https://modal.com/docs/guide/webhook-timeouts),
[Modal data retention](https://modal.com/docs/guide/security),
[Survival LLM upstream](https://github.com/anonnerdfrenzy/survival-llm).
