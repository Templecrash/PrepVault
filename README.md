# PrepVault 2.0

**Ready for real life.** A household preparedness workspace for supplies, properties, people and practical planning.

The 2.0 redesign adds a consistent forest-green identity, a responsive workspace, clear onboarding, an inventory-first overview and searchable supplies. The original specialist tools remain available alongside an Emergency library with offline access.

| Destination | Included tools |
| --- | --- |
| Overview | Recorded category coverage, expandable rationing calculator, essential supply days, food/water duration summary, priority alerts, household setup, detailed readiness analysis, weather and activity |
| Private adviser | Owner-only AI conversations, supply assessments, plan reviews and scenario brainstorming using a fresh snapshot across app sections |
| Supplies | All 30 categories, subtype fields, search, category/status filters, sorting, pagination, barcode scanning, quantity controls, notes, expiry calendar, category calculations |
| Dependencies | Searchable dependency checks with priority/backup filters, sorting and expandable guidance, directly below Supplies in the sidebar |
| Property | Saved map images and markers, travel routes, access codes with reveal controls, manuals, security, cameras and connected-home controls |
| Communications | Live radio, saved custom streams, frequency reference, codes, equipment, local notes, community chat, comms plans and rally points |
| Your people | Searchable contact directory, personal and care notes, location tracker and rationing |
| Grow & sustain | Production estimates, seeds, calendar, soil tests, compost, rotation, livestock, garden beds and growing guide |
| Scenario lab | Original scenarios, household/climate controls, duration estimates and scenario guidance |
| Resource planning | Stock estimates, conversions, trade-offs and opportunities |
| Emergency | Searchable original handbooks, in-site PDF reader, publisher/edition/license details, individual PDF downloads, a portable ZIP pack, verified offline copies, save-all with progress, per-guide removal and offline reopening |

## Run locally

Use Node 22.12+ (or another Node version supported by Vite 7).

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

The app opens without backend credentials. Choose **Explore the workspace** for sample data, or **Build my plan** to start a household. Inventory changes save automatically in the current browser. Sample data is identified in the interface.

Rationing is available on Overview and Your people. Both views share the current session’s people and calorie target, use the selected property’s inventory, and calculate stored water directly from recorded gallons. The default roster follows household size until customized; **Use household size** restores it.

Overview’s essential cards show full days of coverage. Water and food use the same people and calorie settings as Rationing. Medical shows the shortest recorded prescription supply, without multiplying days by quantity; first-aid kits do not imply a duration. Power uses the longest generator or power-bank **Backup runtime (hours)** at the planned load, divided by 24. Runtime describes the complete entry with current fuel or charge, not each unit. Missing prescription/runtime details show an unknown estimate with a prompt to fill them in. Separate backups are not added together, and solar wattage alone is not converted into stored days.

## Data and backups

- The working plan lives in browser storage. **Save offline** in Emergency explicitly saves the app shell and selected handbooks for reopening this same site without a connection. Browser cleanup or clearing site data can remove them. Online maps, weather, radio streams, cloud sync and other internet services still need a connection.
- **Settings & backups** can save a separate local snapshot or download an encrypted complete backup. Encrypting a backup does not encrypt the active browser storage. Property tools open directly; individual access codes remain hidden until revealed.
- Backups preserve the main household collections and local feature settings. Account credentials and sync baselines are excluded. V3 inventory backups remain readable; V4 adds complete state and settings.
- Encrypted backups retain the original AES-256-GCM format and PBKDF2-SHA256 derivation with 310,000 iterations. There is no passphrase recovery.
- Existing duplicate sample IDs are repaired without dropping records. Zero stock and empty inventories remain empty across saves and restores.
- Saved map images, their markers and travel routes are stored separately for each property on this device and included in complete backups. Importing an older backup without maps/routes clears the saved map workspace rather than leaving stale markers over a different image.
- Supabase sync covers inventory, legacy map pins, properties and selected household settings. Saved image maps, their markers, routes and other planning data remain local and require a complete backup for transfer. The UI reports this as **Core data synced**.

## Connected services

Plain Vite development does not emulate the Vercel `api/` handlers. Use the existing Vercel project or a properly configured local Vercel environment to exercise them.

Private live tracking uses the existing Neon database with an isolated schema and a restricted runtime role. Owner access uses Neon Managed Better Auth email codes, first-party secure cookies, an explicit verified-email allowlist, and fresh server-side session checks. See `neon/README.md` for setup, grants and retention. Recipient invitations are one-use links; recipients must allow location sharing and can stop at any time. Sharing requires an open browser page and internet access. The phone number addresses the SMS invitation; it does not locate a phone by itself.

### Surveillance

Surveillance is a separate navigation destination after Property. It reuses the verified Neon owner session for every camera metadata and image request. Responses are `no-store`, same-origin only, and the owner session is rechecked before delivery. The old guessed REVEAL/EyezOn APIs now return a migration response instead of accepting passwords or showing synthetic security states.

REVEAL uses the Cognito sign-in and read-only camera/photo routes observed in [the official REVEAL portal](https://account.revealcellcam.com/). This is an observed first-party web contract, not a documented third-party OAuth grant, and may require maintenance when REVEAL changes it. The app only calls camera/photo reads; it exposes no camera settings, deletion or on-demand capture commands. MFA/challenge flows currently report that the connector cannot complete that step. Live compatibility must be verified with the owner's account.

Set `SURVEILLANCE_COOKIE_KEY` to a random 32-byte hex key as a server-only Vercel Secret, with a different key for production and preview. The password is used for the sign-in request and is never persisted. Only the provider session and account identifier are saved in separate AES-256-GCM encrypted, owner-bound, host-only, HttpOnly, Secure, SameSite=Strict cookies scoped to this API: REVEAL refresh tokens for at most 30 days and EyezOn portal sessions for at most 12 hours. Providers can expire or revoke sessions sooner. The separate owner sign-in remains mandatory. Access tokens stay briefly in server memory. Connections belong to the current browser; disconnect removes the cookie. Clearing site data or changing the encryption key requires reconnecting. Do not log request bodies or cookies.

The gallery loads the latest 100 photos and indicates when older photos are available in REVEAL. Camera capture times retain the camera's local time; upload timestamps are identified separately. Each image is resolved through authenticated provider metadata, then fetched from allowlisted HTTPS AWS media hosts without forwarding credentials. Content signatures, redirects, response sizes (4 MiB per image), and request timeouts are checked. Tokens, signed media URLs, images, and connection details are excluded from app backups and adviser context. Unknown telemetry remains unknown. Refresh runs every 60 seconds while the tab is visible.

EyezOn uses the first-party portal login and a read-only parser for the main system-status page. This is an observed portal contract, not a documented third-party API. It reads system and partition states, connection labels and provider update text; it does not infer zone states. Sign-in requires a structurally valid status page, not merely HTTP success. The adapter sends only the allowlisted PHP session cookie to fixed EyezOn paths; command links, scripts and arbitrary redirects are never followed. Unknown, unrecognized and disconnected states never become disarmed or secure. Validate real account compatibility after connecting; portal markup changes fail explicitly. No alarm PIN, arming, disarming or bypass control is collected or exposed.

### Private adviser

The adviser reuses the same verified Neon owner session. Every request is authorized on the server, including the connection-status endpoint; the session is rechecked before returning an answer. Other accounts and location-sharing invitees have no adviser access. Same-origin checks protect requests, and responses are never cached.

Set `OPENAI_API_KEY` as a server-only secret in the existing Vercel project. `OPENAI_MODEL` defaults to `gpt-5.6-terra`. No key enters the Vite bundle. The fixed OpenAI Responses endpoint receives `store: false`, a bounded conversation and an explicit app snapshot. It has no tools or permission to change records, send messages, or purchase supplies. The app does not log prompts or answers. A per-process concurrency/rate guard limits accidental repeated requests; it is not a distributed spending cap. Set the provider's project budget and maintain the key before its selected expiration.

Context includes recorded supplies across all properties, household/care needs, rationing, calculated coverage and dependencies, property/map-marker descriptions, routes, communications plans and saved notes, growing/livestock records, scenarios, actions and reference metadata. The current property and sample-data state are identified. The same calculation functions used by the app provide estimates. Bounds and omissions are described in context rather than silently implying that missing data is complete.

Passwords, access-code values, invitation tokens, private chats, precise live positions and raw map/file content are excluded on both client and server. A handbook title is not its full text; live weather/news/radio audio and unsaved specialist-view controls are not supplied. Chat history stays in memory, clears when leaving the adviser or signing out, and is not added to backups or browser storage. Existing app records remain stored on the current device, so a different device must have those records restored/synced before the adviser can assess them.

OpenAI processes the included context and questions. `store: false` disables stored response objects but does not claim zero provider retention; see [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data). Replies are planning suggestions and may contain mistakes; clinical references do not replace qualified medical care.

Legacy Supabase cloud sync remains optional and separate from tracking. For that integration, review `supabase-schema.sql` and configure its public client settings from `.env.example`. Keep database-owner, runtime, service-role and provider credentials on the server; never use a `VITE_` prefix for secrets.

For an existing database, review `supabase/migrations/README.md` and apply the included membership-policy migration in staging first. It fixes a recursive membership SELECT policy while retaining the same membership visibility. The redesign does **not** automatically migrate the remote database.

Community chat uses the selected joined community. Device-only notes are stored locally; local images are explicitly identified. Live radio plays verified HTTPS MP3/AAC sources directly: a Buffalo NOAA weather relay supplied by weatherUSA, WNYC news, KEXP and Toronto’s JAZZ.FM91. The player starts from a click, reports actual media playback/buffering/failure, supports volume and custom saved streams, and releases the connection when paused or unmounted. The frequency list is a reference for physical radios, separate from internet audio. Hardware access, remote authentication, community chat and provider APIs require their existing configured services.

## Emergency handbooks and offline library

Nine unmodified PDFs cover WHO/ICRC emergency medicine, Stanford perioperative crises, FEMA CERT and household preparedness, EPA drinking water, FDA food safety, and CDC wound care, generator safety and disaster cleanup. Clinical and surgical references are identified for trained professionals; edition and source notes remain visible. These are reference publications, not a live clinical guideline service. In particular, the 2018 WHO workbook predates its publisher's 2025 postpartum haemorrhage update.

The catalog at `public/handbooks/sources.json` records original publisher/download URLs, attribution, rights evidence, edition, verification date, size and SHA-256. WHO and Stanford materials have **noncommercial licenses**; the collection is provided for personal, noncommercial use. Review each license before commercial distribution. No publisher endorses PrepVault. PDFs are preserved without edits.

- **Read guide** renders the original PDF in the site with PDF.js, including page selection, zoom and extractable page text. The reader and its worker are saved with the app shell for offline use. Original-PDF links and direct downloads remain available.
- **Save all offline** prepares the production app shell and verifies each complete PDF before adding it to this browser's cache. Actual cache contents determine saved status. Interrupted or failed downloads can be retried; completed copies remain.
- **Saved offline only** in Emergency filters the collection to saved guides. These copies are local to this browser and origin, and are separate from account sync and household backups. A different preview hostname has a different offline library.
- **Download all PDFs (ZIP)** gives an independent archive with a local HTML index and source/rights metadata. Extract it before opening `OPEN-ME.html`. Regenerate after catalog changes with `python3 scripts/build-handbook-pack.py`.
- The build generates `handbook-sw.js` with exact-build HTML and static assets. The worker handles PDF byte ranges and never caches API requests, authentication responses, third-party services or private data. Offline saving is available in the HTTPS deployment and localhost production preview; development mode deliberately does not register a worker.

## Verification

- `npm test`: regression tests for handbook integrity and offline startup/PDF ranges/cache failures, radio playback, saved map/route validation, migration, merge/conflict behavior, deletion, offline/reconnect handling, account cancellation, encrypted round trips, corrupted backups and the membership-policy source contract.
- Targeted ESLint passes for the new components and data modules.
- Production build passes. Vite still reports a large application chunk inherited from the monolithic specialist interface; React/vendor and Leaflet are separate chunks.
- Browser checks cover desktop and 390px mobile layouts, navigation, filters, editing and reload persistence, scenario controls, and dialogs.
- An independent render audit exercised 181 combinations, including every supply category/form, specialist tab, sample/empty inventory and setup screen. Network effects were not part of this render audit.
- Full-repository lint still reports legacy hook, unused-variable and empty-catch findings in the original application. Connected provider behavior and SQL execution require staging credentials and are not represented as live-verified.

## Structure

- `src/WorkspaceShell.jsx`, `Welcome.jsx`, `Overview.jsx`, `InventoryView.jsx`: redesigned product surfaces.
- `src/brand.jsx`, `workspace.css`, `overview.css`, `inventory.css`: shared identity and responsive styling.
- `src/PrepVault.jsx`: retained specialist tools and main integration.
- `src/storage.js`, `crypto-backup.js`, `sync-engine.js`: validated snapshots, encrypted backups and cloud merge behavior.
- `api/`: existing weather, news and connected-home server functions.
- `tests/`: repeatable data and schema regression checks.

## License

MIT
