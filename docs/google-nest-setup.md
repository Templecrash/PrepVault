# Google Nest camera connection

PrepVault connects to supported Google Nest cameras through Google's official Smart Device Management (SDM) API. The Security page requires the existing verified workspace-owner sign-in. Google account linking grants access to the homes and devices the owner selects; it does not replace PrepVault sign-in.

This integration is optional and stays disconnected when server configuration is missing. It has not been verified against a real camera until project credentials are supplied and the owner completes Google's consent flow.

## Prerequisites

1. A consumer Google account with supported Nest devices already set up. Legacy Nest accounts must migrate to Google; Google Workspace accounts cannot register for Device Access.
2. Register in the [Device Access Console](https://console.nest.google.com/device-access). Google charges a one-time, nonrefundable US$5 registration fee.
3. Create a Google Cloud project, enable the Smart Device Management API, and create an OAuth client of type **Web application**. Configure the consent screen and its `https://www.googleapis.com/auth/sdm.service` scope.
4. Register the exact production callback URL below as an authorized redirect URI. Create a Device Access project linked to that OAuth client ID. The Device Access project ID is distinct from the Google Cloud project ID.
5. Configure the server-only environment values and redeploy. Do not prefix them with `VITE_`, put them in source control, or enter the client secret in a browser form.

```dotenv
GOOGLE_NEST_CLIENT_ID=<OAuth web client ID>
GOOGLE_NEST_CLIENT_SECRET=<OAuth web client secret>
GOOGLE_NEST_PROJECT_ID=<Device Access project ID>
GOOGLE_NEST_REDIRECT_URI=https://prepvault-xi.vercel.app/api/nest?action=callback
SURVEILLANCE_COOKIE_KEY=<existing 64-hex-character server encryption key>
```

Use the existing `SURVEILLANCE_COOKIE_KEY`; replacing it invalidates other surveillance connections. The callback requires HTTPS and the precise `/api/nest?action=callback` path/query. Linking must begin on the same published origin, not a development preview.

Google OAuth apps in Testing may issue refresh tokens that expire after seven days. Add the owner as a test user while testing; configure the appropriate production status for a lasting private connection. Google's SDM documentation says personal-use integrations do not require OAuth API verification. A public commercial offering has additional review requirements. The Device Access personal sandbox permits 25 users across five structures, with three projects per developer account.

Sources: [Google setup](https://developers.google.com/nest/device-access/get-started), [authorization](https://developers.google.com/nest/device-access/authorize), [authorization troubleshooting](https://developers.google.com/nest/device-access/reference/errors/authorization), [limits](https://developers.google.com/nest/device-access/project/limits).

## Security and request flow

- `POST /api/nest` with `{ "action": "start" }` verifies the current Neon owner session and same-origin request, then returns the Google Partner Connections Manager authorization URL. A random state nonce and owner ID are encrypted in a ten-minute, HttpOnly, Secure, SameSite=Lax, host-only cookie scoped to `/api/nest`.
- Google's callback verifies that cookie and state and exchanges the single-use authorization code on the server. It stores only an encrypted refresh token and the bound owner ID in a five-minute pending cookie. It redirects to `/app?security=nest-connected` or a generic error; no code, token or Google error is copied to the redirect URL.
- The app calls `{ "action": "finalize" }` from the same origin. This again requires the current verified owner, verifies the pending owner ID, refreshes access and lists devices. The first device-list call also completes Google's SDM authorization. Only then is a 30-day encrypted, HttpOnly, Secure, SameSite=Strict connection cookie created.
- This separate finalize step is intentional: the existing strict Neon session cookie is not sent on Google's cross-site return. The callback never weakens the app's sign-in or origin checks.
- Every device, stream, stop and disconnect request requires fresh owner authentication. Results are discarded if the owner changes or signs out during provider calls. Google tokens stay server-side; the browser receives camera metadata and short-lived WebRTC signaling only.
- Google requires the broad `sdm.service` scope. PrepVault's API exposes only camera discovery, receive-only live streams and disconnect. It does not expose thermostat, lock or other device-setting commands.
- No Google passwords are collected. No Nest credentials or images are added to plan backups or localStorage. The connection belongs to this browser and expires after 30 days; reconnect as necessary.

`GET /api/nest?action=devices` returns `{ configured, connected, devices, checkedAt }`. A disconnected, unconfigured response includes missing **environment variable names**, only after successful owner authentication. Each device includes `id`, `name`, `room`, `status` (`online`, `offline`, `unknown`), `protocols`, `supportsLiveView` and `supportsEventImages`.

`POST /api/nest` accepts the following JSON actions:

| Action | Additional body fields | Result |
| --- | --- | --- |
| `start` | None | `authorizationUrl` |
| `finalize` | None | `connected: true` |
| `stream` | `deviceId`, `offerSdp` | `answerSdp`, `mediaSessionId`, `expiresAt` |
| `stop` | `deviceId`, `mediaSessionId` | `stopped: true` |
| `disconnect` | None | `connected: false`, `revoked` |

Disconnect clears all Nest cookies and attempts Google's token revocation. If `revoked` is false, the local connection is removed but the owner should remove the grant in their Google account or Partner Connections Manager as well. Google's revocation applies to the authorization grant for that Cloud project, so a dedicated OAuth project avoids affecting an unrelated integration sharing that project.

## Camera capabilities and limits

Use the returned device traits, not assumptions from the model name. Some legacy cameras support RTSP while newer or migrated cameras use WebRTC. PrepVault supports browser WebRTC. RTSP-only cameras remain listed, but their RTSP URLs and credentials are never returned to the browser. Google's Home APIs for Android/iOS are a separate product; a third-party camera merely appearing in Google Home is not automatically available through Nest SDM.

Create the browser SDP offer with receive-only audio, receive-only video, then a data channel. Google requires the media sections in audio/video/application order and OPUS audio. Apply the returned answer promptly (within 30 seconds). Sessions are short-lived; use the returned expiry and explicitly start a new stream when needed. Close the connection and send `stop` when leaving a live view. This implementation does not expose microphone transmission or extend sessions automatically.

A live feed and a latest still image are different capabilities. Newer Nest cameras may have WebRTC but no `CameraEventImage` trait. Supported older cameras expose **event-triggered** snapshots, not a universal on-demand snapshot API. Those images expire 30 seconds after the event and require Pub/Sub event handling to fetch promptly. This implementation reports the trait only; it does not claim to have implemented image ingestion, history or a background monitoring service.

If event images are added later, use a self-hosted Google Cloud Pub/Sub topic and authenticated push handler with verified Google JWT signature, issuer, audience, expiry and configured service-account email. New Device Access projects require self-hosted topics; existing Google-hosted topics end November 30, 2026. Browser-cookie credentials alone do not support unattended event ingestion, so that feature needs a separately designed encrypted server-side connection store, explicit retention and deletion, and user authorization. Do not assume images may be retained indefinitely.

Sources: [supported devices](https://developers.google.com/nest/device-access/supported-devices), [live stream trait](https://developers.google.com/nest/device-access/traits/device/camera-live-stream), [wired camera WebRTC guide](https://developers.google.com/nest/device-access/api/camera-wired), [event-image trait](https://developers.google.com/nest/device-access/traits/device/camera-event-image), [events/PubSub](https://developers.google.com/nest/device-access/api/events), [authenticated push](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions), [Google Home APIs](https://developers.home.google.com/apis), [Google OAuth server flow](https://developers.google.com/identity/protocols/oauth2/web-server).

## Verification

Run `node --test tests/nest-*.test.js`. Tests cover origin and owner authentication, encryption and purpose binding, expired/duplicate/tampered state, callback and pending-owner checks, fixed provider hosts, token/response validation, device/protocol allowlisting, receive-only SDP, bounded payloads, disconnect and suppression of credentials/provider errors.

After production setup, sign in as the owner, connect through Google, grant a supported camera, and confirm the callback finalizes on the same browser. Verify the actual device list, a WebRTC camera's video, stop-on-close and disconnect. Also verify that a signed-out/private browser cannot list cameras or create streams. Tests with mocked provider responses do not establish that a particular camera is reachable or supported.
