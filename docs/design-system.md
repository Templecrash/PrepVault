# PrepVault interface style guide

PrepVault uses a graphite and black interface with a restrained orange accent. The Manuals and Dependencies workspaces remain the reference for clear records and simple actions. The interface should feel calm and dependable, including during an emergency.

## Foundations

The shared light tokens live in `src/design-system.css`; dark values live in `src/dark-mode.css`. Use these tokens instead of introducing page palettes. `src/stealth.css` adds the final workspace surfaces and controls.

| Role | Token | Default dark | Light fallback |
| --- | --- | --- | --- |
| Canvas | `--pv-canvas` | `#0a0b0d` | `#f5f5f6` |
| Surface | `--pv-surface` | `#18191c` | `#ffffff` |
| Subtle surface | `--pv-subtle` | `#212328` | `#eeeef0` |
| Border | `--pv-border` | `#33363d` | `#d8d9dd` |
| Primary text | `--pv-ink` | `#f1f1f0` | `#24262a` |
| Secondary text | `--pv-muted` | `#a1a3a6` | `#65686f` |
| Brand/action | `--pv-accent` | `#f48947` | `#ad4618` |
| Action hover | `--pv-accent-hover` | `#ffa465` | `#92390f` |
| Text on action | `--pv-on-accent` | `#171310` | `#ffffff` |
| Focus | `--pv-focus` | `#ff9a58` | `#b64d1c` |
| Text link | `--pv-link` | `#ffae75` | `#a54114` |

Orange identifies primary actions, the brand mark, active navigation edges and focus. Selected navigation remains charcoal with an orange edge/icon; it is not a large orange block. Keep green, amber and red for actual success, warning and danger states, using `--pv-success`, `--pv-warning` and `--pv-danger`. Do not recolor meaningful status marks orange or decorate categories with status colors. Never communicate status by color alone.

Use DM Sans for reading and controls, with a system fallback. Page titles are 27–34px, weight 650; section titles are 17–21px; body and table text are 13px or larger; secondary labels are 11–12px. The `--pv-mono` stack is reserved for compact navigation group labels, breadcrumbs, dates and insight labels. Uppercase is limited to those short utility labels. Use normal sentence case for actions, page headings and status text.

Use the 4/8/12/16/24/32px spacing scale. Surface corners are 10px and control corners are 7px. Subtle graphite gradients can separate the canvas, sidebar and raised panels; a restrained orange gradient can identify a primary button. Keep these within the shared surface treatment in `stealth.css`. Avoid vivid gradient headers, large colored fills, heavy glow, decorative progress percentages and emoji in navigation or form controls. Use stronger shadows only for dialogs and floating controls.

## Light and dark themes

The theme is applied to `document.documentElement.dataset.theme` as `light` or `dark`. `src/theme.js` persists an explicit choice in `prepvault-theme`; without one, use dark mode, independently of the device preference. Preserve an existing saved light choice. Apply the preference during initial page boot to avoid a light flash. The top-bar theme control is available throughout the workspace. Keep the setting separate from account and inventory data.

Load styles in this order: `src/design-system.css`, `src/dark-mode.css`, then `src/stealth.css`. The light fallback uses neutral gray and white, with no green cast. Use `--pv-link` for text links and `--pv-on-accent` for text and icons on filled orange controls. Do not assume white text works on bright orange: dark mode requires the dark on-accent value. This also applies to date badges, setup steps, scanner save actions and location actions. Preserve distinct success, warning and danger colors in both themes.

The compatibility stylesheet includes scoped paint overrides for existing components with hardcoded colors. These activate for either explicit theme and use its tokens, changing paint without changing layout or interaction. The public landing page has its own scoped dark presentation; avoid shared overrides that wash out its surfaces or sample dashboard. New components should use the shared semantic tokens directly, reducing the need for this compatibility layer. Retained analytics have a bounded inline-style bridge; `!important` is limited to existing forced rules and those inline values. Match complete CSS property boundaries when working with inline styles.

Never invert photos, barcode video, map tiles, geographical annotations, source PDF pages, or instructional diagrams. Darken their surrounding controls and panels while preserving the content. Readiness segment colors remain consistent between themes, with a darker track. Printed routes and references use light surfaces. Embedded third-party services may retain their own theme.

Review both themes on every destination, including selected states, empty states, forms, expanded records, sign-in, settings, and mobile layouts. Verify focus visibility and a minimum 4.5:1 contrast for normal text, including primary-button labels and active badges. Check saved theme persistence after reload, dark first-visit behavior, and unchanged source imagery. Parse the complete stylesheet before browser QA; a malformed compatibility rule can prevent later component rules from applying.

## Page structure

Each destination starts with one clear title, a brief explanation, and its primary action. Lead with one short status summary and the next useful action. Keep records within the first screen where possible. Secondary explanations and charts are available on demand. Put search and filters immediately above the records they control. Prefer aligned rows and tables for comparable records; expand a row or open a focused dialog for details. Do not duplicate the same inventory into page-specific collections.

Reuse `pv-inventory-heading`, `pv-inventory-workspace`, `pv-inventory-toolbar`, `pv-inventory-table`, `pv-specialist-panel`, and the shared button classes. Pages with unusual content, such as maps and radios, retain their specialist controls while following the same typography, borders, and spacing.

## Forms and interactions

Use visible labels, 42px minimum primary controls, clear selected states, and specific action names. Optional details say “Not recorded”; missing measurements are never shown as zero. Use `InventoryItemDialog` for common inventory creation and editing. Dialogs include a visible close control, focus containment, Escape handling, and a consistent Cancel/Save footer. Preserve existing record IDs and unedited fields.

Vehicle records share the normal inventory and backup paths. Fuel and spare parts remain single inventory records linked to a vehicle when known. Service dates, odometer units, engine hours, and next due thresholds must be explicit. EMP protection is a recorded claim or installation detail, never an automatic guarantee that a vehicle will survive an EMP.

## Responsive and accessible behavior

At mobile sizes, summaries and forms stack, tables become readable record rows or scroll within their own container, and the page itself must not scroll horizontally. Inputs use 16px text on mobile. Maintain visible keyboard focus, accessible names for icon buttons, and sufficient contrast. Respect reduced motion. Navigation state and status must be understandable without hover overlays.

## Review before release

Review every navigation destination and its empty state, representative populated state, primary dialog, and mobile layout. Check that warnings retain their meaning, shared controls look consistent, and no saved record is changed by a visual update. Verify inventory changes survive reload, property filters, backup round trips, Calendar, and Survival LLM context.


## Readiness charts

Use `StatusPanel`, `StatusRing`, `StatusBar` and `StatusBreakdown` from `src/StatusCharts.jsx` for compact visual summaries. Replace existing text-only stat strips rather than duplicating them. StatusPanel starts collapsed: supply a concise summary prop with the most useful fact and any material gaps. Its “View insights” disclosure contains detailed charts and assumptions. Do not display a bank of charts above every table. The Overview is the exception: three compact readiness visuals provide its primary orientation. Do not add ratings to the sidebar or reintroduce the removed Overview essentials tiles.

Use small green, amber and red chart marks for an explicitly stated condition. Unknown or missing measurements use a gray or hatched track. Pair every color with a text label, value and basis. Stock, record completeness, checklist completion and estimated duration are distinct measures; never describe one as an overall safety score. Possible equipment matches are not verified backups.

Use actual property-filtered records. Count entries or like-for-like units; do not combine litres, batteries and food packages into one quantity. Show the denominator and reference for every progress bar. Planning windows must be named and may be adjusted without changing stored inventory. A missing household size, quantity, date or runtime must not imply zero need or confirmed readiness.

Charts offer direct drill-down through labelled buttons where a matching filter or editor exists. Legends remain readable with keyboard navigation and without color. Empty states show what information is needed, not an invented percentage. SVGs and CSS bars add no charting-library payload and derive their values from the same records as the tables.


## Calm interaction hierarchy

The default screen is for doing, not studying. Show a plain page title, one primary action, a short status line and the records or checklist. Avoid marketing eyebrows, repeated instructions, footer slogans and multiple cards that say the same thing. Recommendations lead with one next step; additional reasoning stays in a labelled disclosure. Never hide urgent warnings or current alarm states merely to shorten the page.

The marketing homepage has one primary action: **Build my plan**. Repeat it at the close; keep **Explore the demo** visually secondary and existing-plan access in the header. Lead with a short outcome-focused headline, one supporting sentence and a clearly labelled example. Follow with three practical benefits and a compact FAQ. Avoid feature catalogues, duplicated workflow sections, invented testimonials, unsupported pricing claims or guarantees of safety. Keep the example readable on mobile rather than shrinking an entire dashboard into it.

Keep Overview, Location, Calendar and Maps visible in navigation. Inventory, People & property, Plan ahead and Reference library expand to show their individual destinations. Opening a destination from a chart also reveals its navigation group. Emergency mode, Settings & backups and Profile remain separate. Navigation groups are organizational controls, not readiness ratings.

Overview shows compact readiness, actionable reminders, camera/alarm status and a brief weather summary. Do not duplicate inventory category lists, team panels or quick-action banks there. Empty inventories show one clear starting point instead of a grid of red or empty charts. The full weather page retains detailed forecasts, official warnings and sources.
