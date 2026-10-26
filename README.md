# PrepVault 2.0

**Ready for real life.** A household preparedness workspace for supplies, properties, people and practical planning.

The 2.0 redesign adds a consistent forest-green identity, a responsive workspace, clear onboarding, an inventory-first overview and searchable supplies. The original specialist tools remain available within eight destinations.

| Destination | Included tools |
| --- | --- |
| Overview | Recorded category coverage, essential supplies, priority alerts, household setup, detailed readiness analysis, weather and activity |
| Supplies | All 30 categories, subtype fields, search, category/status filters, sorting, pagination, barcode scanning, quantity controls, notes, expiry calendar and category calculations |
| Property | PIN gate, maps and pins, access codes, manuals/routes, security, cameras and connected-home controls |
| Your people | Contacts, medical/skill information, location tracker, skills and rationing |
| Communications | Frequency reference, sample scanner, internet feeds, codes, equipment, local notes, community chat, comms plans and rally points |
| Grow & sustain | Production estimates, seeds, calendar, soil tests, compost, rotation, livestock, garden beds and growing guide |
| Scenario lab | Original scenarios, household/climate controls, duration estimates and scenario guidance |
| Resource planning | Stock estimates, conversions, trade-offs, system dependencies and opportunities |

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

## Data and backups

- The working plan lives in browser storage. Keep the tab open to use the loaded local tools without a connection; reloading, maps, weather and internet services may need the network. There is no service worker guaranteeing offline startup.
- **Settings & backups** can save a separate local snapshot or download an encrypted complete backup. Encrypting a backup does not encrypt the active browser storage. A property PIN is a UI gate, not encryption.
- Backups preserve the main household collections and local feature settings. Account credentials and sync baselines are excluded. V3 inventory backups remain readable; V4 adds complete state and settings.
- Encrypted backups retain the original AES-256-GCM format and PBKDF2-SHA256 derivation with 310,000 iterations. There is no passphrase recovery.
- Existing duplicate sample IDs are repaired without dropping records. Zero stock and empty inventories remain empty across saves and restores.
- Supabase sync covers inventory, map pins, properties and selected household settings. Other data remains local and requires a complete backup for transfer. The UI reports this as **Core data synced**.

## Connected services

The existing Vercel `api/` handlers and integrations are retained. Plain Vite development does not emulate those serverless endpoints. Use the existing Vercel project or a properly configured local Vercel environment to exercise them.

For a fresh Supabase install, review and run `supabase-schema.sql`, then configure the public client settings from `.env.example`. Keep service-role and provider credentials on the server; never use a `VITE_` prefix for secrets.

For an existing database, review `supabase/migrations/README.md` and apply the included membership-policy migration in staging first. It fixes a recursive membership SELECT policy while retaining the same membership visibility. The redesign does **not** automatically migrate the remote database.

Community chat uses the selected joined community. Device-only notes are stored locally; local images are explicitly identified. The scanner display is a reference simulation; internet audio is an independent feed. Hardware access, remote authentication, community chat and provider APIs require their existing configured services.

## Verification

- `npm test`: 33 regression tests for migration, merge/conflict behavior, deletion, offline/reconnect handling, account cancellation, encrypted round trips, corrupted backups and the membership-policy source contract.
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
