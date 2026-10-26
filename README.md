# PrepVault 2.0

**Ready for real life.** A household preparedness workspace for supplies, properties, people and practical planning.

The 2.0 redesign adds a consistent forest-green identity, a responsive workspace, clear onboarding, an inventory-first overview and searchable supplies. The original specialist tools remain available within seven main sections.

| Destination | Included tools |
| --- | --- |
| Overview | Recorded category coverage, expandable rationing calculator, food/water duration summary, essential supplies, priority alerts, household setup, detailed readiness analysis, weather and activity |
| Supplies | All 30 categories, subtype fields, search, category/status filters, sorting, pagination, barcode scanning, quantity controls, notes, expiry calendar, category calculations and a dedicated Dependencies section |
| Property | Saved map images and markers, travel routes, access codes with reveal controls, manuals, security, cameras and connected-home controls |
| Your people | Searchable contact directory, personal and care notes, location tracker and rationing |
| Property → Communications | Live radio, saved custom streams, frequency reference, codes, equipment, local notes, community chat, comms plans and rally points |
| Grow & sustain | Production estimates, seeds, calendar, soil tests, compost, rotation, livestock, garden beds and growing guide |
| Scenario lab | Original scenarios, household/climate controls, duration estimates and scenario guidance |
| Resource planning | Stock estimates, conversions, trade-offs and opportunities |

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

## Data and backups

- The working plan lives in browser storage. Keep the tab open to use the loaded local tools without a connection; reloading, maps, weather and internet services may need the network. There is no service worker guaranteeing offline startup.
- **Settings & backups** can save a separate local snapshot or download an encrypted complete backup. Encrypting a backup does not encrypt the active browser storage. Property tools open directly; individual access codes remain hidden until revealed.
- Backups preserve the main household collections and local feature settings. Account credentials and sync baselines are excluded. V3 inventory backups remain readable; V4 adds complete state and settings.
- Encrypted backups retain the original AES-256-GCM format and PBKDF2-SHA256 derivation with 310,000 iterations. There is no passphrase recovery.
- Existing duplicate sample IDs are repaired without dropping records. Zero stock and empty inventories remain empty across saves and restores.
- Saved map images, their markers and travel routes are stored separately for each property on this device and included in complete backups. Importing an older backup without maps/routes clears the saved map workspace rather than leaving stale markers over a different image.
- Supabase sync covers inventory, legacy map pins, properties and selected household settings. Saved image maps, their markers, routes and other planning data remain local and require a complete backup for transfer. The UI reports this as **Core data synced**.

## Connected services

The existing Vercel `api/` handlers and integrations are retained. Plain Vite development does not emulate those serverless endpoints. Use the existing Vercel project or a properly configured local Vercel environment to exercise them.

For a fresh Supabase install, review and run `supabase-schema.sql`, then configure the public client settings from `.env.example`. Keep service-role and provider credentials on the server; never use a `VITE_` prefix for secrets.

For an existing database, review `supabase/migrations/README.md` and apply the included membership-policy migration in staging first. It fixes a recursive membership SELECT policy while retaining the same membership visibility. The redesign does **not** automatically migrate the remote database.

Community chat uses the selected joined community. Device-only notes are stored locally; local images are explicitly identified. Live radio plays verified HTTPS MP3/AAC sources directly: a Buffalo NOAA weather relay supplied by weatherUSA, WNYC news, KEXP and Toronto’s JAZZ.FM91. The player starts from a click, reports actual media playback/buffering/failure, supports volume and custom saved streams, and releases the connection when paused or unmounted. The frequency list is a reference for physical radios, separate from internet audio. Hardware access, remote authentication, community chat and provider APIs require their existing configured services.

## Verification

- `npm test`: regression tests for radio playback, saved map/route validation, migration, merge/conflict behavior, deletion, offline/reconnect handling, account cancellation, encrypted round trips, corrupted backups and the membership-policy source contract.
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
