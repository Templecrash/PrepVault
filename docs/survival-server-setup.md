# Private Survival LLM server connection

The floating Survival LLM conversation uses the dedicated Modal server. Its model and reference library run remotely. The existing OpenAI service remains available to separate recommendation features; it is never a fallback for this conversation.

## Vercel configuration

Set `SURVIVAL_SERVER_URL` to the deployed Modal gateway's exact HTTPS origin. The current deployment is `https://templecrash--prepvault-survival-gateway.us-east.modal.run`. Both `app.modal.run` and `app.region.modal.run` hostname formats are accepted, with an optional trailing slash. Each hostname label must use ASCII letters, digits or interior hyphens and fit within 63 characters. Additional subdomain levels, paths, credentials, query strings, ports and external domains are rejected. This is a server-only variable; never prefix it with `VITE_`.

The connection reuses the existing owner authentication settings:

- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_COOKIE_SECRET` (at least 32 characters)
- `TRACKING_OWNER_EMAIL`
- `TRACKING_OWNER_ID`, when configured

Keep those credentials in Vercel. Neither the Modal deployment nor the browser needs the Neon cookie secret, database credentials or an OpenAI API key. No new signing secret is required. Rotating the existing cookie secret invalidates outstanding server capabilities as well as affecting the existing sign-in system.

Changing `SURVIVAL_SERVER_URL` requires deploying the Vercel environment update. Until it is configured, the owner-only status endpoint reports `configured: false` and no model request is sent. Configuring the URL does not provision the model or library. See [asset setup](../server/survival/assets.md) for the separate remote asset workflow.

## Request flow

1. The browser calls `/api/advisor` using its normal same-origin owner session. It never receives Modal credentials or server capability tickets.
2. Vercel validates the owner, sanitizes the app context and signs a two-minute capability for the exact request payload, action and owner. The signing input uses the domain prefix `prepvault-survival-hosted:v1\0` with the existing Neon cookie secret.
3. Vercel sends `{ticket, payload}` to the configured Modal gateway. `payload` is the exact JSON string whose UTF-8 SHA-256 appears in the ticket. Requests carry the fixed origin `https://prepvault-xi.vercel.app`.
4. Modal calls `POST https://prepvault-xi.vercel.app/api/survival-auth` with `{ticket}`. This endpoint verifies existing tickets and returns their claims; it cannot create a ticket. Modal then validates the payload binding and atomically consumes the nonce in its persistent Dict before any GPU request.
5. The CPU gateway starts a private GPU job only for an authorized chat request. Status checks and unsuccessful authorization do not start a GPU. Job metadata associates the random public job ID with the owner; polling and cancellation require fresh owner-bound tickets.
6. Vercel verifies the owner's session again before returning status, a job ID or an answer. If a new job was created but this final check fails, Vercel attempts to cancel it within three seconds. Failure to cancel never exposes the answer; the remote job timeout remains the final bound.

The verification origin and ticket audience are fixed in both deployments. Changing the product's public origin requires updating both sides together. An `Origin` header is not an identity credential: authorization depends on the signed ticket and owner checks.

## Browser API

| Request | Response |
| --- | --- |
| `GET /api/advisor` | `200 {configured, engine, transport, model, libraryArticles, error}` |
| `POST {messages, context}` | `202 {status: "pending", jobId}` |
| `POST {jobId}` | `202 {status: "pending", jobId}` or `200 {reply, model, sources}` |
| `POST {jobId, action: "cancel"}` | `200 {status: "cancelled", jobId}` |

All calls require the verified owner session. Responses use private, no-store caching. Each proxy request has a 25-second deadline; the Vercel functions have a 30-second limit. Long inference runs as an asynchronous Modal job rather than holding a Vercel function open. The browser polls every five seconds and applies its overall wait/cancellation policy.

Additional Vercel per-process guards permit six chat starts and sixty status/poll/cancel requests per owner per minute, with bounded simultaneous requests. The public ticket verifier permits 240 requests per process per minute. These guards are not distributed account spending limits. Modal's deployment limits and account budget controls remain necessary for bounding infrastructure usage.

## Validation before release

Run the backend tests without allocating remote compute:

```sh
node --test tests/hosted-survival.test.js tests/advisor-api.test.js
```

After deployment and asset provisioning, check the signed-out rejection, owner-only readiness status, one real assessment with citations, cancellation, and sign-out during a pending job. Confirm that status requests and invalid tickets do not invoke the GPU worker. Do not claim the model is ready until the remote model and library checks pass and an owner-authenticated answer has completed.

The app keeps conversation history in browser memory while the panel is open. Hosted infrastructure still processes job inputs and outputs; this implementation does not promise that platform-level retention is disabled. Do not put prompts, context, tickets or replies into custom application logs.
