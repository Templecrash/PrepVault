# PrepVault interface style guide

PrepVault uses the Manuals and Dependencies workspaces as its visual reference. The interface should make records easy to scan and actions easy to find, including during an emergency.

## Foundations

The shared tokens live in `src/design-system.css`. Use `--pv-ink`, `--pv-muted`, `--pv-surface`, `--pv-canvas`, `--pv-border`, and `--pv-accent` instead of introducing another page palette. White surfaces sit on a warm neutral canvas. Forest green identifies primary actions and the current navigation item. Red and amber describe real errors or due dates in small labeled indicators; they do not decorate category cards. Never communicate status by color alone.

Use DM Sans throughout, with a system fallback. Page titles are 27–34px, weight 550; section titles are 17–21px; body and table text are 13px or larger; secondary labels are 11–12px. Uppercase is limited to short section labels. Use normal sentence case for controls, headings, and status text.

Use the 4/8/12/16/24/32px spacing scale. Surface corners are 10px and control corners are 7px. Reserve shadows for dialogs and floating controls. Avoid colored card fills, gradient headers, decorative progress percentages, and emoji in navigation or form controls.

## Page structure

Each destination starts with one clear title, a brief explanation, and its primary action. Place useful facts in a compact summary strip. Put search and filters immediately above the records they control. Prefer aligned rows and tables for comparable records; expand a row or open a focused dialog for details. Do not duplicate the same inventory into page-specific collections.

Reuse `pv-inventory-heading`, `pv-inventory-workspace`, `pv-inventory-toolbar`, `pv-inventory-table`, `pv-specialist-panel`, and the shared button classes. Pages with unusual content, such as maps and radios, retain their specialist controls while following the same typography, borders, and spacing.

## Forms and interactions

Use visible labels, 42px minimum primary controls, clear selected states, and specific action names. Optional details say “Not recorded”; missing measurements are never shown as zero. Use `InventoryItemDialog` for common inventory creation and editing. Dialogs include a visible close control, focus containment, Escape handling, and a consistent Cancel/Save footer. Preserve existing record IDs and unedited fields.

Vehicle records share the normal inventory and backup paths. Fuel and spare parts remain single inventory records linked to a vehicle when known. Service dates, odometer units, engine hours, and next due thresholds must be explicit. EMP protection is a recorded claim or installation detail, never an automatic guarantee that a vehicle will survive an EMP.

## Responsive and accessible behavior

At mobile sizes, summaries and forms stack, tables become readable record rows or scroll within their own container, and the page itself must not scroll horizontally. Inputs use 16px text on mobile. Maintain visible keyboard focus, accessible names for icon buttons, and sufficient contrast. Respect reduced motion. Navigation state and status must be understandable without hover overlays.

## Review before release

Review every navigation destination and its empty state, representative populated state, primary dialog, and mobile layout. Check that warnings retain their meaning, shared controls look consistent, and no saved record is changed by a visual update. Verify inventory changes survive reload, property filters, backup round trips, Calendar, and Survival LLM context.
