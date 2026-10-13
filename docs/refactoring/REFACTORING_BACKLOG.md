# Refactoring Backlog

## CSS Migration Override Consolidation

- **Category:** CSS maintainability
- **Priority:** Medium
- **Sprint discovered:** CSS duplication audit (2026-10-04)
- **Recommendation:** Review the remaining repeated selector contexts in `frontend/src/styles/template-migration.css`. Consolidate only overrides whose computed styles can be preserved, and validate affected desktop, tablet, mobile, and reduced-motion states before moving declarations across sections.
- **Status:** Open

## Encoded QR Codes for Printed Driver Labels

- **Category:** Operational correctness
- **Priority:** High
- **Sprint discovered:** Frontend recovery fixes (2026-10-12)
- **Recommendation:** Replace the seeded QR-like pattern in `PrintableTruckLabel.tsx` with real QR encoding of the agreed driver payload. Verify decoding from printed output and isolate print styling from the application shell.
- **Status:** Implemented (2026-10-12); physical printer/scanner validation pending.
- **Verification:** Twelve browser label tests pass, including independent QR decoding, missing/blank driver IDs, print isolation, single-page A4 PDFs, larger text within each template box, and long-text fitting after resizing. Full frontend suite: 70 tests pass. Production build and targeted lint pass.

## Truck Label Typography and Alignment

- **Category:** UI readability
- **Priority:** High
- **Sprint discovered:** Truck-label refinement (2026-10-12)
- **Recommendation:** Enlarge operational values, align them beneath the template headings, fit long values without clipping, and give each triload destination its own box.
- **Status:** Implemented (2026-10-12). Single/coload/triload previews visually checked; automated sizing, overflow, resize, QR, and PDF checks pass.

## Accessible Login and Request Overlays

- **Category:** Accessibility
- **Priority:** High
- **Sprint discovered:** Frontend recovery fixes (2026-10-12)
- **Recommendation:** Consolidate login, nested dialogs, and the request drawer onto accessible dialog/sheet primitives with background inertness, initial focus, focus containment, and focus restoration. Preserve authentication and request permissions.
- **Status:** Implemented (2026-10-12) for login, nested password help, and request details.
- **Verification:** Keyboard containment, Escape/outside dismissal rules, and focus restoration from card and row-menu entry paths pass. Existing login/OTP recovery and three label-print checks pass; 19 distinct browser cases and 70 unit tests verified. Production build and targeted lint pass.

## Shared Modal Focus Handling

- **Category:** Accessibility
- **Priority:** Medium
- **Sprint discovered:** Overlay accessibility fixes (2026-10-12)
- **Recommendation:** Migrate the remaining hand-written shared `Modal` focus management to the existing dialog primitives in a separate change. Preserve the truck-label portal/print structure and test request form and print dialogs before replacing it.
- **Status:** Open

## Frontend Theme and Responsive Sizing Consolidation

- **Category:** UI consistency and readability
- **Priority:** High
- **Sprint discovered:** Frontend recovery fixes (2026-10-12)
- **Recommendation:** Resolve authentication/shell token collisions, remove CSS zoom-based sizing, and unify operational surfaces under semantic theme tokens. Verify text contrast, small-screen scrolling, and 200% browser zoom.
- **Status:** Implemented (2026-10-12). Authentication colors are namespaced, login/workspace use natural sizing, and root semantic tokens drive the shell and portals. Operational dashboard panels, tables, cards, drawers, form controls, charts, status text, and skeletons use shared light/dark surface and foreground colors. Removed duplicate dashboard neutral theme declarations. Login and truck-label palettes remain dedicated to their respective surfaces.
- **Verification:** Nine operational-theme browser cases cover dark surfaces and text contrast, chart labels, switching back to light mode, outbound/docking/midmile/user-directory views, action contrast and usable toolbar wrapping at 1280/850/390px, and white/black truck-label print isolation in dark mode. All 47 targeted browser checks pass, including operational themes, outbound request workflows, accessibility, page search, readable login, responsive navigation, QR decoding, and label PDFs. All 70 unit tests, production build, targeted source lint, and independent review pass.
- **Related fix:** Browser validation exposed the Refresh control overlapping Add new in the shared request toolbar at narrow desktop widths. The toolbar now wraps within its available width in both themes.

## Functional Page Search and Accurate Top-Bar Status

- **Category:** Navigation and UI correctness
- **Priority:** High
- **Sprint discovered:** Frontend usability continuation (2026-10-12)
- **Recommendation:** Replace the inert patient/staff search with an accessible page navigator using the user's permitted navigation. Remove the fabricated sync timestamp until it can be backed by actual data-refresh state.
- **Status:** Implemented (2026-10-12). Page search supports desktop/mobile, Ctrl/Cmd+K, filtering, Enter/Tab navigation, Escape dismissal, and opener focus restoration. The sign-in dialog blocks the background shortcut. The static sync claim is removed.
- **Verification:** Four new page-search browser checks and nine existing readability/responsive cases pass. All 70 frontend unit tests, production build, targeted source lint, and diff whitespace checks pass. Independent source review found no material product regression; mobile search preview visually checked.
- **Remaining work:** If a global refresh indicator is added later, derive it from actual query/realtime state and show loading, failure, and last-success states truthfully. Keep that separate from page navigation; searching request data requires an explicit search contract.

## Preserve Request Rows During Background Refresh

- **Category:** UI feedback and data continuity
- **Priority:** High
- **Sprint discovered:** Operational theme validation (2026-10-12)
- **Recommendation:** In `OutboundRequests.tsx` and `MidmileRequests.tsx`, distinguish initial loading from background fetching. Keep the last successful rows visible during refresh, show a small refresh indicator, and retain cached data with a retry message on refresh failure. Preserve action permissions and stale-action protections.
- **Status:** Implemented (2026-10-12). Tables and cards retain cached query results during background refresh/failure. Shared accessible feedback distinguishes initial failures, cached refresh failures, and previous-filter results; Retry uses the existing refetch callback. Successful empty responses receive an empty state in both views. Query settings, APIs, permission checks, and mutation logic are preserved.
- **Verification:** Ten browser recovery cases cover both request pages, table/card retention, delayed refresh, failed refresh/retry, filter placeholders, cached empty results, and initial failure followed by a successful empty response. All 32 targeted browser checks pass, including recovery, request workflows/permissions, operational themes, and keyboard overlays. All 70 unit tests, production build, targeted source lint, diff whitespace checks, and independent source review pass.

## Request Actor Attribution

- **Category:** Data presentation / API metadata
- **Priority:** Medium
- **Sprint discovered:** Request-table audit and accessibility improvements (2026-10-12)
- **Resolution:** List and detail responses derive `mm_fte_id` / `mm_fte_name` from the latest `TRUCK_ASSIGNED` event and `doc_officer_id` / `doc_officer_name` from the latest `DRIVER_ASSIGNED` event. Timestamp ties use descending event ID. Final docking remains attributed to Ops PIC through `TRUCK_DOCKED`. Outbound, midmile, and shared docking table fields use the recorded name or ID and show “Not recorded” when attribution is missing. Creator metadata, row permissions, and lifecycle rules are preserved; no migration is required.
- **Status:** Implemented (2026-10-13). Live historical event completeness is unverified.
- **Verification:** Backend regression checks cover list/detail attribution, creator separation, final docking actor separation, missing events/profiles/actor IDs, and timestamp ties. Isolated backend suite: 128 passed, 13 PostgreSQL-only checks skipped. All 77 frontend tests pass, including recorded names/IDs and missing metadata. Four browser cases verify actor names and preserved controls for Ops PIC, FTE Ops, FTE MM, and DOC Officer. Production build, frontend lint, and targeted PHP style checks pass.

## Request Table Detail Consolidation

- **Category:** Frontend maintainability
- **Priority:** Low
- **Sprint discovered:** Request-table audit and accessibility improvements (2026-10-12)
- **Recommendation:** Consolidate the duplicated outbound and midmile detail field definitions in a future refactoring sprint. Preserve role-specific actions and the common table presentation added in this sprint.
- **Status:** Open

## Linehaul SeaTalk Approval Cycle Delivery

- **Category:** Integration / workflow consistency
- **Priority:** High
- **Sprint discovered:** Linehaul backend workflow phase (2026-10-13)
- **Recommendation:** In the approved provider integration phase, reuse ApprovalRouter to create fresh assignments for initial submissions and corrected/resubmitted requests. Synchronizing an item with closed assignments does not recreate an actionable provider assignment. Confirm provider callback identity/version semantics before allowing delayed callbacks to act on a newer correction cycle. Validate with a staging SeaTalk test app.
- **Status:** Open

## Historical MM Rejection Recovery

- **Category:** Data integrity / historical workflow
- **Priority:** High
- **Sprint discovered:** Linehaul backend workflow phase (2026-10-13)
- **Recommendation:** Assess historical CANCELLED requests against decision events and approval metadata before proposing recovery of MM rejections. Do not infer rejection from status alone or rewrite production records as part of the additive REJECTED schema migration.
- **Status:** Open
