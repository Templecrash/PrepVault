# PrepVault 2.0

**Ready for real life.** A household preparedness workspace for supplies, properties, people and practical planning.

The 2.0 redesign adds a consistent forest-green identity, a responsive workspace, clear onboarding, an inventory-first overview and searchable supplies. The original specialist tools remain available alongside an Emergency library with offline access.

| Destination | Included tools |
| --- | --- |
| Overview | Recorded category coverage, essential supply days, priority alerts, detailed readiness analysis, optional weather/news and activity |
| Calendar | Month view of recorded expiry/service dates, growing and livestock activity, manual tasks, review/completion markers and an optional selected-day forecast |
| Location | Selected planning town, Open-Meteo forecasts, Canadian/US official weather warnings, planning prompts and links to official radar |
| Survival LLM | Floating owner-only AI conversations, supply assessments, plan reviews and scenario brainstorming using a fresh bounded snapshot across app sections |
| Food / Water | Dedicated inventories before Supplies; search, quantity/edit controls, barcode entry and shared Rationing coverage |
| Supplies | Other 28 categories, subtype fields, search, category/status filters, sorting, pagination, barcode scanning, quantity controls, notes, expiry calendar, category calculations; global search covers all 30 |
| Dependencies | Searchable dependency checks with priority/backup filters, sorting and expandable guidance, directly below Supplies in the sidebar |
| Property | Saved map images and markers, travel-route details, recorded defensive positions and role assignments; Google Nest is explicitly unavailable |
| Surveillance | Owner-only REVEAL photo and EyezOn alarm status connections; no device or alarm commands |
| Communications | Regional internet-radio directory, saved custom streams, frequency reference, codes, equipment, local notes, community chat, comms plans, rally points and external EchoLink access |
| Your people | Searchable contact directory, personal and care notes, dependant selection and consent-based live location tracker |
| Rationing | Dedicated food/water planning using only marked dependants and the selected property’s stock |
| Bug Out | Persisted grab list with quantities, locations, assignments, notes, order and collected-item checks |
| Codes / Manuals | Neutral reference pages; code values stay hidden until revealed |
| Skills | 16 illustrated, searchable, attributed starter checklists with Bug in/out and experience filters, official online guides and related original PDF handbooks |
| Farm guides | Searchable crop, fruit, herb, nut, livestock and farm-method references with regional source labels, original starter checklists, labelled task pictures and self-contained illustrated offline HTML downloads |
| Offline maps | Owner-authorized online route calculation with ordered stops, saved geometry/directions, daily travel estimates, JSON/GPX export and printing |
| Community board | Public anonymous conversations and replies; country/state/province filters, browser-owned post removal, reports and owner moderation; direct public page at `/community` |
| Grow & sustain | Production estimates, seeds, calendar, soil tests, compost, rotation, livestock, garden beds and growing guide |
| Scenario lab | Original scenarios, household/climate controls, duration estimates and scenario guidance |
| Resource planning | Stock estimates, conversions, trade-offs and opportunities |
| Emergency | Searchable original handbooks, in-site PDF reader with audited illustration-page shortcuts, publisher/edition/license details, individual PDF downloads, a portable ZIP pack, verified offline copies, save-all with progress, per-guide removal and offline reopening |

## Download and run on your computer

In **Settings & backups**, download an encrypted plan backup and the separate **Local app** ZIP. The public app ZIP contains the application and original handbook PDFs; it contains no personal plan, account sessions, API keys or server credentials. Extract the full ZIP, then run **Start PrepVault.command** (macOS), **Start PrepVault.bat** (Windows), or **Start PrepVault.sh** (Linux). Install Python 3.8+ or Node.js 18+ before going offline. You can also run `python3 serve.py` or `node serve.mjs` from the extracted folder.

Open `http://127.0.0.1:4173/`, keep the launcher running, and restore your encrypted plan through Settings & backups. Use the same browser, hostname and port each time; each origin has separate storage. The server binds to loopback, has no backend API and does not collect request logs. The local edition blocks external connections and replaces online service entry points with clear explanations. Links deliberately opened in a separate tab can still use the internet. Local and hosted plans do not sync automatically.

Inventory, household records, rationing, planning calculations, Codes, saved map images/pins, growing records, Bug Out, calendar tasks, Skills and Farm guides checklists, manual radio notes, encryption/restore and bundled handbooks work locally. Routes explicitly saved in **Offline maps** retain their geometry, turn-by-turn directions and daily travel settings. The local app can reopen these routes and adjust daily estimates; it cannot calculate a new road route, reroute around an obstacle, search places or load street-map tiles. Downloading the app does not save your personal plan: keep a separate encrypted backup and its passphrase. Working browser data remains unencrypted, and clearing site data can erase it. `SHA256SUMS` records the package files for integrity checking.

## Development

Use Node 22.12+ (or another Node version supported by Vite 7).

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

The app opens without backend credentials. Choose **Explore the workspace** for sample data, or **Build my plan** to start a household. Inventory changes save automatically in the current browser. Sample data is identified in the interface.

Rationing has its own sidebar destination. Food and water planning count only people explicitly marked **Dependant** on Your People, including the owner only if selected. Rationing and Overview share that roster, the saved calorie target and the selected property’s inventory. Stored water is calculated directly from recorded gallons; filtration and water-source equipment do not add stored days.

Overview’s essential cards show full days of coverage. Water and food use the same people and calorie settings as Rationing. Medical shows the shortest recorded prescription supply, without multiplying days by quantity; first-aid kits do not imply a duration. Power uses the longest generator or power-bank **Backup runtime (hours)** at the planned load, divided by 24. Runtime describes the complete entry with current fuel or charge, not each unit. Missing prescription/runtime details show an unknown estimate with a prompt to fill them in. Separate backups are not added together, and solar wattage alone is not converted into stored days.

## Data and backups

- The working plan lives in browser storage. **Save offline** in Emergency explicitly saves the app shell and selected handbooks for reopening this same site without a connection. Browser cleanup or clearing site data can remove them. Online maps, weather, radio streams, cloud sync and other internet services still need a connection.
- **Settings & backups** can save a separate local snapshot or download an encrypted complete backup. Encrypting a backup does not encrypt the active browser storage. Property tools open directly; individual access codes remain hidden until revealed.
- Backups preserve the main household collections and local feature settings, including calendar tasks/review markers, the selected planning location and saved offline route plans. These settings are isolated with each account's device workspace; signing out opens a separate guest workspace. Account credentials, sync baselines, transient Survival LLM conversations, live tracking positions, provider feeds, public community posts and browser-cached handbook files are excluded. V3 inventory backups remain readable; V4 adds plan state and settings. The original PDF files are included separately in the local app package.
- Encrypted backups retain the original AES-256-GCM format and PBKDF2-SHA256 derivation with 310,000 iterations, random 16-byte salt and 12-byte IV. New backups require a passphrase of at least 12 characters; older backups with shorter passphrases remain readable. There is no passphrase recovery. Files use `prepvault-backup-YYYY-MM-DD.enc.json`.
- Existing duplicate sample IDs are repaired without dropping records. Zero stock and empty inventories remain empty across saves and restores.
- Saved map images, their markers and travel routes are stored separately for each property on this device and included in complete backups. Importing an older backup without maps/routes clears the saved map workspace rather than leaving stale markers over a different image.
- Supabase sync covers inventory, legacy map pins, properties and selected household settings. Saved image maps, their markers, routes and other planning data remain local and require a complete backup for transfer. The UI reports this as **Core data synced**.

## Calendar, Skills and offline route planning

**Calendar** combines valid dates already recorded in supplies and growing records with user-created dated tasks. It derives the next oil service from a recorded interval, the next compost turn from the configured schedule, and estimated birth/hatch dates from the existing farming references. Planting/harvest month reminders remain month-level suggestions until the user chooses a date. Completing a manual task or reviewing a derived entry does not silently change stock, expiration dates, service history or farm records. It does not schedule operating-system notifications, email reminders or background jobs. Weather for the selected day is available only within the provider's forecast horizon and requires the online site.

**Skills** provides 16 short, original checklists based on named official sources, with beginner, practice-first and training-required labels. Related books open in the existing PDF reader. Clinical manuals are not promoted as beginner skills. Checklists ship with the app; links marked **Online guide** are external resources and are not cached by the handbook download. The handbooks keep their original source and license metadata. This is a curated reference collection, not comprehensive instruction for every crisis.

**Farm guides** sits under Reference Library and is also linked from Farm. It covers vegetables, fruit, herbs, staples, nuts, livestock and supporting methods. Search includes aliases, practices, source publishers and regions. Filters select topic, collection and climate focus; a climate label does not establish local suitability or planting dates. Each entry contains an original starter checklist, an expandable original task diagram and named links to full publisher guides. **Download all guides**, **Download these guides** and individual downloads create self-contained HTML with an index, checklists, embedded task pictures and source links; they open without internet or sign-in and can be printed to PDF. Publisher websites/manuals are not copied into these downloads. The same original checklists ship in the local app and saved application shell.

**Offline maps** calculates driving, highway-avoiding or walking routes online using OpenStreetMap data through FOSSGIS/Valhalla. Up to six stops are visited in their displayed order; the app does not optimize their order. Up to four user-selected circles can be requested as avoidance areas. These circles are not verified municipal boundaries, and the app does not automatically avoid every town or choose the route with the fewest people. Route estimates have no live traffic, current disaster conditions or closure feed. Highway avoidance can fail to produce a route or leave a provider-reported highway segment; review the returned result and warnings.

**Save for offline** stores that calculated route's geometry, directions and travel settings in the current account's browser workspace. The drawing is a route overview without a street basemap. New route calculation still requires the hosted service, owner sign-in and a connection. Daily stops are interpolated distance estimates based on pace, travel hours and rest time; they are not verified campsites or permission to stop. Routes can be exported as JSON or GPX and printed; complete PrepVault backups provide the restore path. Save the app itself through Emergency or download the Local app before losing connectivity.

Barcode camera, photo and manual-entry behavior is documented in [Barcode inventory entry](docs/barcode-scanning.md). Provider endpoints, data flow, free-service assumptions and remaining limitations are recorded in the [service ledger](docs/service-ledger.md).

## Connected services

Plain Vite development does not emulate the Vercel `api/` handlers. Use the existing Vercel project or a properly configured local Vercel environment to exercise them.

### Anonymous community board

The Community board is a separate sidebar page and a shareable public page at `/community`. Visitors can read, post and reply without an account. Country and region are chosen by the poster, never taken from the private property settings or GPS. State/province choices come from a pinned [country-region-data](https://github.com/country-regions/country-region-data) snapshot; its MIT license is included in `shared/`. Text is rendered as text, without uploads, rich HTML or link previews.

The board uses its own Neon schema and restricted runtime login; it does not publish inventory, locations, adviser conversations, codes or other workspace data. Set server-only `BOARD_DATABASE_URL` and a random `BOARD_COOKIE_SECRET` of at least 32 characters, with distinct production and preview values. See `neon/BOARD.md` for migration, grants, rate limits and privacy details. Reads require an internet connection; public messages are not saved by the offline handbook cache. Owner moderation uses the same verified Neon sign-in as tracking and the private adviser. Anonymous posting does not require that sign-in.

Private live tracking uses the existing Neon database with an isolated schema and a restricted runtime role. Owner access uses Neon Managed Better Auth email codes, first-party secure cookies, an explicit verified-email allowlist, and fresh server-side session checks. See `neon/README.md` for setup, grants and retention. Recipient invitations are one-use links; recipients must allow location sharing and can stop at any time. Sharing requires an open browser page and internet access. The phone number addresses the SMS invitation; it does not locate a phone by itself.

### Service boundaries

| Capability | What is implemented | Connection / limitation |
| --- | --- | --- |
| Encrypted backup | Local Web Crypto AES-256-GCM encryption with random salt and IV; wrong-password and tamper rejection | Protects exported/saved backup only; working browser data remains unencrypted |
| Owner services | Verified Neon sessions checked by the server for tracking, Survival LLM and surveillance | Requires the live deployment and internet; general account sign-in does not grant owner access |
| Live tracking | One-use invitations, opt-in browser GPS, expiry/revoke/stop and private owner map | SMS is opened in the sender’s messaging app for review; no automatic SMS dispatch or phone-number geolocation |
| Survival LLM | OpenAI Responses request with bounded/redacted app context, `store: false`, no action tools | Hosted service, owner sign-in and configured provider key; not an offline model or zero-retention claim |
| Radio | Browser playback from selected HTTPS stream with real media states | Internet and broadcaster availability; saved notes are manual, not AI transcripts |
| Regional radio directory | Country/region discovery through Radio Browser, with optional planning-location defaults | Community-supplied metadata; compatible internet streams only, no RF tuner, scanner decryption or in-app transmission |
| Location / calendar weather | Keyless Open-Meteo/GeoNames search and forecast; ECCC or NWS point alerts | Automatic official warnings cover Canada and the US only; no complete emergency-notice feed or live radar inside the app |
| Offline maps | FOSSGIS/Valhalla online calculation; local saved route geometry, directions and daily estimates | Owner sign-in for calculation; no new offline routing, downloaded road network, live traffic or verified campsites |
| Barcode lookup | On-device retail-code decoding, inventory reuse, optional Open Food Facts product lookup | Photos stay on device; the public lookup sends the code, may have incomplete food data, and requires internet |
| Calendar / Skills | Local dated tasks and reference checklists linked to existing records and guides | No scheduled background reminders; external skill guides still require internet |
| REVEAL / EyezOn | Read-only provider adapters and encrypted session cookies, with owner and origin checks | Requires owner connection in PrepVault; live account compatibility is not established by fixture tests |
| Weather / news | OpenWeatherMap and GNews API reads with finite timeouts, input validation and explicit errors | Optional provider keys; not configured or failed reads must not become sample weather/news |
| Google Nest | Legacy flow disabled with HTTP 410 | No password acceptance, OAuth exchange, synthetic device statuses or lock controls; use Google Home |
| Local edition | Downloaded static app and bundled reference files served on loopback | No hosted API credentials or server; online service entry points explain the limit and open the live site |

The public feed handlers are independent of Supabase. Missing keys return `503 not_configured`; provider failures return `502 provider_unavailable` without exposing upstream details. The former Nest OAuth callback trusted client-supplied state and was not a working account-bound connection, so all three legacy routes are fail-closed.

### Surveillance

Surveillance is a separate navigation destination after Property. It reuses the verified Neon owner session for every camera metadata and image request. Responses are `no-store`, same-origin only, and the owner session is rechecked before delivery. The old guessed REVEAL/EyezOn APIs now return a migration response instead of accepting passwords or showing synthetic security states.

REVEAL uses the Cognito sign-in and read-only camera/photo routes observed in [the official REVEAL portal](https://account.revealcellcam.com/). This is an observed first-party web contract, not a documented third-party OAuth grant, and may require maintenance when REVEAL changes it. The app only calls camera/photo reads; it exposes no camera settings, deletion or on-demand capture commands. MFA/challenge flows currently report that the connector cannot complete that step. Live compatibility must be verified with the owner's account.

Set `SURVEILLANCE_COOKIE_KEY` to a random 32-byte hex key as a server-only Vercel Secret, with a different key for production and preview. The password is used for the sign-in request and is never persisted. Only the provider session and account identifier are saved in separate AES-256-GCM encrypted, owner-bound, host-only, HttpOnly, Secure, SameSite=Strict cookies scoped to this API: REVEAL refresh tokens for at most 30 days and EyezOn portal sessions for at most 12 hours. Providers can expire or revoke sessions sooner. The separate owner sign-in remains mandatory. Access tokens stay briefly in server memory. Connections belong to the current browser; disconnect removes the cookie. Clearing site data or changing the encryption key requires reconnecting. Do not log request bodies or cookies.

The gallery loads the latest 100 photos and indicates when older photos are available in REVEAL. Camera capture times retain the camera's local time; upload timestamps are identified separately. Each image is resolved through authenticated provider metadata, then fetched from allowlisted HTTPS AWS media hosts without forwarding credentials. Content signatures, redirects, response sizes (4 MiB per image), and request timeouts are checked. Tokens, signed media URLs, images, and connection details are excluded from app backups and adviser context. Unknown telemetry remains unknown. Refresh runs every 60 seconds while the tab is visible.

EyezOn uses the first-party portal login and a read-only parser for the main system-status page. This is an observed portal contract, not a documented third-party API. It reads system and partition states, connection labels and provider update text; it does not infer zone states. Sign-in requires a structurally valid status page, not merely HTTP success. The adapter sends only the allowlisted PHP session cookie to fixed EyezOn paths; command links, scripts and arbitrary redirects are never followed. Unknown, unrecognized and disconnected states never become disarmed or secure. Validate real account compatibility after connecting; portal markup changes fail explicitly. No alarm PIN, arming, disarming or bypass control is collected or exposed.

### Private adviser

The adviser reuses the same verified Neon owner session. Every request is authorized on the server, including the connection-status endpoint; the session is rechecked before returning an answer. Other accounts and location-sharing invitees have no adviser access. Same-origin checks protect requests, and responses are never cached.

Set `OPENAI_API_KEY` as a server-only secret in the existing Vercel project. `OPENAI_MODEL` defaults to `gpt-5.6-terra`. No key enters the Vite bundle. The fixed OpenAI Responses endpoint receives `store: false`, a bounded conversation and an explicit app snapshot. It has no tools or permission to change records, send messages, or purchase supplies. The app does not log prompts or answers. A per-process concurrency/rate guard limits accidental repeated requests; it is not a distributed spending cap. Configure the provider’s available budget controls and monitor usage; a budget alert is not necessarily a hard spending cap. Maintain the key before its selected expiration.

Context includes recorded supplies across all properties, household/care needs, rationing, calculated coverage and dependencies, property/map-marker descriptions, routes, communications plans and saved notes, growing/livestock records, scenarios, actions and reference metadata. The current property and sample-data state are identified. The same calculation functions used by the app provide estimates. Bounds and omissions are described in context rather than silently implying that missing data is complete.

Passwords, access-code values, invitation tokens, private chats, precise live positions and raw map/file content are excluded on both client and server. A handbook title is not its full text; live weather/news/radio audio and unsaved specialist-view controls are not supplied. Chat history stays in memory, clears when closing Survival LLM, reloading or signing out, and is not added to backups or browser storage. Existing app records remain stored on the current device, so a different device must have those records restored/synced before the adviser can assess them.

OpenAI processes the included context and questions. `store: false` disables stored response objects but does not claim zero provider retention; see [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data). Replies are planning suggestions and may contain mistakes; clinical references do not replace qualified medical care.

Legacy Supabase cloud sync remains optional and separate from tracking. For that integration, review `supabase-schema.sql` and configure its public client settings from `.env.example`. Keep database-owner, runtime, service-role and provider credentials on the server; never use a `VITE_` prefix for secrets.

For an existing database, review `supabase/migrations/README.md` and apply the included membership-policy migration in staging first. It fixes a recursive membership SELECT policy while retaining the same membership visibility. The redesign does **not** automatically migrate the remote database.

Community chat uses the selected joined legacy Supabase community. The device PIN only hides the screen; it does not encrypt local notes and can be bypassed by someone with browser-storage access. Shared community messages are not end-to-end encrypted. Device-only notes are stored locally; local images are explicitly identified. Live radio plays public HTTPS MP3/AAC sources directly, including the regional Radio Browser directory and saved streams. Directory region labels are community supplied and do not represent every local radio frequency. Public police/fire/EMS directory links open externally; PrepVault cannot tune RF signals, decrypt protected channels or transmit to emergency services.

The player starts from a click, reports actual media playback/buffering/failure, supports volume and custom saved streams, and releases the connection when paused or unmounted. The frequency list is a reference for physical radios, separate from internet audio. Activity notes are manual. Automatic audio recording, background channel monitoring and AI transcription are not implemented. **Talk over radio** opens the separate EchoLink Web service, which requires its own validated amateur callsign, sign-in, available node and microphone permission. PrepVault has no connected radio gateway and no built-in RF transmit or push-to-talk capability. Hardware access, remote authentication, community chat and provider APIs require their existing configured services.

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

Offline route downloads are self-contained HTML files with no scripts or external resources. They contain the saved route drawing, directions and daily stops and open directly without account sign-in. Street basemaps and new route calculations remain online features. The hosted app still verifies account sessions; use the local edition plus an encrypted plan backup for the full workspace offline.


## Illustrated references

All 100 Farm guides and 16 Skills have an assigned task picture, using 67 original labelled SVG diagrams across the reference library (47 Farm diagrams and 20 Skills/equipment diagrams). Each has text descriptions, captions, an enlarged view and picture downloads. Their SVG content is bundled with the application, so pictures work in the saved app and local edition without fetching an image service. Farm HTML downloads embed every selected guide’s picture directly as a data URI. The public SVG source files in `public/guide-illustrations/` match the bundled copies.

All nine original PDF handbooks (659 pages) were visually audited; the Emergency library and PDF reader provide 17 verified, one-based PDF-page shortcuts to useful pictures and diagrams. Professional manuals retain their training labels. Original PDFs and their hashes remain unchanged. Text-led guides have separate PrepVault task-picture companions where useful. See `docs/handbook-visual-audit.md` for the page-by-page audit method and limitations.

The household and vehicle entries in Manuals are filename references, not attached manufacturer PDFs. They display general orientation pictures with that limitation stated explicitly. The exact equipment model, edition and original document must be confirmed before using manufacturer-specific service procedures.


## Coordinated Emergency mode

The sidebar Emergency mode button activates a saved plan and opens a focused workspace. While active, Overview becomes the emergency workspace, every page carries the current mode and property, and mobile shortcuts prioritize the plan, rationing, Bug Out and people. Ending the mode requires an inline confirmation and restores the normal overview.

The plan uses only contacts marked as food/water dependants and the chosen property's recorded supplies. It retains the current calorie target and creates three daily meal targets, a daily stored-water allocation and two household check-ins. Situation, property, duration (1–90 days), targets and times can be adjusted. Schedule completion stays in sync across Emergency mode, Rationing and Calendar and persists through reload, account isolation and encrypted backup/restore. Survival LLM receives bounded emergency settings, coverage and today's completion state.

Emergency food estimates exclude expired/invalid-dated entries, livestock and hunting equipment; unknown nutrition is flagged. Stored-water entries with past/invalid expiry dates are excluded too. Portions are planning suggestions, not a balanced menu or an assurance that food is safe. Check labels, preparation needs, allergies and temperature history. Water is a supply budget covering drinking, preparation and hygiene, never a drinking limit.

These are device-local plans and checklists. Checking tasks does not deduct inventory, send messages, trigger alarms, or run background notifications. Update inventory after use. The downloaded local app and a separate restored backup support this workflow offline; live connected services retain their normal connection requirements.
