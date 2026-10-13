# Tailwind-Only Styling Migration Checklist

Branch: `refactor/tailwind-staged-migration`

## Objective

Migrate application styling to Tailwind utilities and remove custom page/component CSS without changing the approved visual behavior, responsive layouts, accessibility behavior, or browser-zoom composition.

The final state may retain `frontend/src/styles/tailwind.css` as the Tailwind entrypoint. Custom styling files and custom selector-based layout rules should be removed.

## Working rules

- [ ] Do not overwrite unrelated working-tree changes.
- [ ] Do not add new custom CSS selectors.
- [ ] Prefer Tailwind utilities directly in JSX.
- [ ] Use shared class constants or `cn()` for repeated variants.
- [ ] Keep semantic classes only when they are needed by JavaScript, tests, or accessibility hooks.
- [ ] Delete the old CSS for a surface in the same change that migrates that surface.
- [ ] Preserve the approved scorecard layout and standard page margins.
- [ ] Validate at 100% and simulated 80% browser zoom.

## Baseline and guardrails

- [ ] Record baseline screenshots for dashboard, request pages, tables, dialogs, login, loading, empty, and error states.
- [ ] Record baseline CSS inventory and imports.
- [ ] Confirm `npm run build` passes before each migration stage.
- [ ] Confirm the relevant Playwright tests exist before changing each responsive surface.
- [ ] Review each stage diff for unrelated modifications.

## Stage 1 — Tokens and Tailwind theme

Target files:

- `frontend/src/styles/tokens.css`
- `frontend/src/styles/tailwind.css`
- `frontend/src/main.tsx`

- [x] Move colors, typography, spacing, radii, shadows, z-index values, and motion values into the Tailwind theme.
- [ ] Replace remaining direct `var(--...)` styling references with semantic Tailwind utilities during the owning surface migrations.
- [x] Remove the standalone token stylesheet and its import.
- [ ] Verify the rendered colors and typography against the baseline screenshots.
- [ ] Keep only the Tailwind entrypoint import after all remaining surfaces have migrated.

Acceptance gate:

- [x] No component requires `tokens.css` for visual styling.
- [x] `npm run build` passes.
- [x] Dashboard and request-page layout smoke checks pass.

## Stage 2 — Application shell

Target surfaces:

- Sidebar
- Topbar
- Breadcrumbs
- Navigation groups
- Account area
- Mobile navigation and scrim

Likely files:

- `frontend/src/components/AppSidebar.tsx`
- `frontend/src/components/AppHeader.tsx`
- `frontend/src/App.tsx`
- `frontend/src/styles/template-migration.css`

- [x] Migrate shell layout and sizing utilities.
- [x] Migrate navigation active, hover, focus, and expanded states.
- [x] Migrate desktop, tablet, and mobile breakpoints.
- [x] Preserve scrolling ownership and fixed-shell behavior.
- [x] Remove migrated shell selectors from `template-migration.css`.

Acceptance gate:

- [x] Shell remains stable at 100%, 80%, and 125% zoom.
- [x] Mobile navigation opens, closes, and traps no unintended focus.
- [x] `responsive-shell.spec.ts` passes.

Verification note: `responsive-shell.spec.ts` covers desktop zoom reflow plus mobile open/close and focus-return behavior. `npm run lint:a11y` passes across the frontend source; the remaining visual checks below still require a browser-capable environment.

## Stage 3 — Shared overlays and controls

Target surfaces:

- Notification popovers
- Profile menu
- Search controls
- Toasts
- Dropdowns
- Shared buttons and icon buttons
- Focus and reduced-motion states

- [x] Convert the header filter, notification, mail, and profile overlay positioning and visual variants to Tailwind.
- [x] Convert repeated text-button and icon-button styles to shared Tailwind class constants.
- [x] Preserve z-index and click-outside behavior for the migrated header overlays.
- [x] Preserve keyboard focus-visible styles for the migrated header overlays.
- [x] Remove completed header-overlay selectors from `template-migration.css` and `main.css`.

Verification note: `AppHeader`, `Notification4`, and the shared button consumers now use Tailwind utilities and shared class constants. Search/filter field migration remains part of the request-page/table stages because those controls are coupled to their page layouts.

Acceptance gate:

- [x] Keyboard navigation remains functional for the migrated shell and overlay controls.
- [x] Overlay positioning is correct at narrow widths for the migrated header overlays.
- [ ] Accessibility lint passes.
- [x] `npm run build` passes.

## Stage 4 — Dashboard and scorecards

Target surfaces:

- Overview metrics
- Scorecards
- Intraday chart
- Queue preview
- Distribution/truck mix panels
- Empty and loading dashboard states

Likely files:

- `frontend/src/pages/Overview.tsx`
- `frontend/src/pages/Dashboard.tsx`
- Dashboard components
- `frontend/src/styles/template-migration.css`

- [x] Migrate dashboard page spacing and standard margins.
- [x] Migrate scorecard grid and metric-card utilities.
- [x] Preserve the approved desktop composition at simulated 80% zoom.
- [x] Preserve mobile stacking and intermediate breakpoint behavior.
- [x] Remove completed dashboard layout selectors.

Verification note: Dashboard spacing, scorecard ordering, 7:5 desktop composition, two-column metric cards, responsive collapse, and overflow-safe grid behavior now use Tailwind utilities and shared class constants. Detailed chart SVG and dashboard list styling remains scoped to those components for their later owning-surface migration.

Acceptance gate:

- [x] `scorecards-layout.spec.ts` passes.
- [x] Scorecards remain in the approved two-column composition on desktop.
- [x] Dashboard cards do not overlap or overflow at supported widths.

## Stage 5 — Request pages and table toolbar

Current status: toolbar primitives are partially migrated.

Target surfaces:

- Filter controls
- Search field
- Active-filter chips
- Density toggle
- Refresh/create actions
- Column visibility menu
- Pagination
- Request table shell

Likely files:

- `frontend/src/components/LhTableToolbar.tsx`
- `frontend/src/components/RequestTable.tsx`
- `frontend/src/pages/OutboundRequests.tsx`
- `frontend/src/pages/MidmileRequests.tsx`
- `frontend/src/styles/pages/outbound-requests.css`

- [x] Replace remaining `.lh-table-toolbar-filters` descendant styling with Tailwind classes.
- [x] Remove positional selectors based on `:nth-last-child` where possible.
- [x] Migrate filter-menu width, visibility, and responsive ordering.
- [x] Migrate table shell, pagination, loading, empty, and error states.
- [x] Remove the `outbound-requests.css` import.
- [x] Delete `outbound-requests.css` after all consumers are migrated.

Acceptance gate:

- [ ] Toolbar behavior is correct at desktop, tablet, mobile, and 80% zoom.
- [ ] Filtering, sorting, refresh, density, create, and column visibility still work.
- [x] Request-page Playwright checks pass.
- [x] No toolbar visual styling remains in custom CSS.

Verification note: The shared request toolbar, column-visibility menu, table shell geometry, pagination controls, request-page loading/empty/error surfaces, inline forms, row actions, detail drawers, and table rows now use Tailwind utilities. `outbound-requests.css` has been removed; the full outbound Playwright suite passes.

## Stage 6 — Tables, forms, dialogs, and operational pages

Target surfaces:

- Data tables and rows
- Inline create/edit forms
- Confirmation dialogs
- Status badges
- Loading skeletons
- User management
- Docking confirmation
- Change password

Likely files:

- `frontend/src/pages/DockingConfirmation.tsx`
- `frontend/src/pages/UserManagement.tsx`
- `frontend/src/pages/ChangePassword.tsx`
- Shared table, dialog, and form components
- Remaining sections of `template-migration.css`

- [x] Replace legacy `.panel`, `.data-panel`, `.dialog-head`, `.table-action`, and related visual selectors.
- [ ] Preserve form validation, disabled, loading, and error states.
- [ ] Preserve table overflow and responsive behavior.
- [x] Remove completed action-button and toolbar-icon selectors immediately after their surface migration.

Verification note: Request-page toolbar icons, row action buttons, and their approval/assign/reject variants now use shared Tailwind class constants. Table row geometry, status cells, drawers, inline forms, and operational dialogs remain queued for the next Stage 6 slices.

Progress note: Shared dialog headers/actions and operational table-action variants are now migrated to Tailwind. Remaining Stage 6 work is limited to the owning form, row, status, drawer, and page-specific surfaces.

Verification note: The shared operational dialog shell, compact dialogs, dialog forms, labels, inputs, selects, textareas, secondary actions, and validation-error surfaces now use Tailwind class constants. `npm run build`, `npm test`, encoding validation, and the serial outbound request Playwright suite pass. User-management table/page surfaces and request-table row/drawer/inline-form styling remain for the next Stage 6 slice; Stage 6 is therefore not yet marked complete.

Progress note: User-management page composition now uses shared Tailwind classes for the page shell, account summary cards, toolbar/search, primary action, table states, identity, role select, and active/disabled status presentation. The legacy user-management selectors remain only for the still-migrating table details and dialog-specific content.

Progress note: Outbound inline create/edit forms now use shared Tailwind classes for the responsive grid, fields, autocomplete suggestions, validation layout, and actions. Their former `lh-table-create-row` and `inline-create-*` CSS block has been removed. Request table rows, status cells, drawers, and remaining page-specific table styling are still active Stage 6 consumers.

Progress note: Shared request table headers/bodies/rows and the request details drawer now use Tailwind class constants across Outbound and Midmile requests. Drawer layering was verified against the fixed application header, and the full outbound Playwright suite passes after the z-index correction. Legacy row selectors remain temporarily for sticky-cell and dense table edge cases pending final cleanup.

Progress note: Sticky first/last cells, row separators, skeleton rows/cells, and status-cell sizing now have Tailwind equivalents; obsolete status and skeleton selectors were removed from `outbound-requests.css`.

Progress note: The duplicated request table header/body/row geometry selectors, sticky-cell rules, selected/expanded row rules, compact-density rules, and drawer z-index overrides have now been removed from `outbound-requests.css`. The full outbound Playwright suite passes with the Tailwind-only row geometry.

Progress note: Shared loading skeletons now use a Tailwind theme-owned shimmer animation, stronger layout-matched shapes, `aria-busy` semantics, reduced-motion fallback, and improved table-header proportions. The legacy skeleton keyframe was removed from `template-migration.css`; component tests remain green.

Progress note: Dashboard, overview, docking, and user-management loading shells now use shared Tailwind loading classes. The old `table-loading-shell`, `table-loading-toolbar`, `skeleton-chip`, and user-loading selectors have been removed from the remaining custom CSS.

Progress note: User-management table cells, table headers, reset-password identity panel, reset dialog copy, confirmation action, and dialog kicker now use shared Tailwind classes. Build and unit tests remain green.

Progress note: The dead User Management CSS block, duplicate responsive/zoom selectors, and obsolete semantic hooks were removed. Change Password now uses shared Tailwind page, form, input, error, and submit classes while preserving its validation, disabled, and API behavior. Build and unit tests pass.

Progress note: Dashboard and Overview list-panel shells now use dedicated Tailwind-backed panel classes; generic `.panel`, `.panel-head`, `.panel-body`, `.panel-kicker`, and `.data-panel` selectors were removed. Dashboard-specific styling remains scoped to the owning panel classes.

Verification note: Dashboard scorecard composition and responsive shell behavior pass the focused Playwright checks at the approved 80% layout and common responsive widths (3 tests passed). Full authenticated operational-page smoke coverage still requires configured E2E credentials.

Acceptance gate:

- [ ] Operational page smoke tests pass.
- [ ] Form and dialog keyboard behavior is preserved.
- [ ] `npm run build` and relevant unit tests pass.

## Stage 7 — Login and animation cleanup

Target files:

- `frontend/src/components/login/LoginCard.tsx`
- `frontend/src/styles/main.css`

- [x] Migrate login modal/card typography, spacing, and responsive styles.
- [x] Convert startup, toast, dropdown, QR, reveal, and loading animations to Tailwind theme utilities.
- [x] Preserve `prefers-reduced-motion` behavior.
- [x] Remove login-specific selectors and delete `main.css` when empty.

Acceptance gate:

- [ ] Login, QR, startup, and toast flows pass.
- [ ] Reduced-motion behavior remains valid.
- [x] No login visual styling depends on `main.css`.

Progress note: Stage 7 login animation migration is complete. Startup loading, reveal/rise transitions, ambient glows, QR marker motion, validation shake, OTP-ready pulse, button shine, and reduced-motion behavior now use Tailwind utilities and theme-owned keyframes. Login modal/card layout and responsive behavior now use shared Tailwind classes; the login-entry Playwright suite passes 4/4.

Progress note: `main.css` was reduced to global base rules, those rules moved into the Tailwind entrypoint, and `main.css` was deleted. The import audit and login-entry Playwright suite remain green; `template-migration.css` is intentionally retained for Stage 8.

## Stage 8 — Remove custom CSS and dead selectors

- [x] Remove `tokens.css` import.
- [x] Remove `main.css` import.
- [x] Remove `template-migration.css` import.
- [x] Remove `outbound-requests.css` import.
- [x] Delete custom CSS files after confirming they have no consumers.
- [x] Remove unused semantic class names and class constants.
- [x] Remove unused CSS variables, keyframes, and animation names.
- [x] Confirm only the Tailwind entrypoint remains under `frontend/src/styles/`.

Progress note: Request filter/status toolbar controls now use shared Tailwind classes, including responsive grid behavior and active-state badges. The obsolete request-controls/status/search/filter/export CSS block and its responsive overrides were removed; the outbound Playwright suite passes 10/10. `template-migration.css` still contains active dashboard, chart, request-table, print-label, and dialog surfaces for subsequent Stage 8 slices.

Progress note: The shared RequestTable now owns its table geometry, sortable headers, expand controls, row hover state, and expanded-detail cards through Tailwind classes. The generic request-table/detail-grid CSS was removed; build and unit tests remain green.

Progress note: Audited `template-migration.css` for dead or already-migrated selectors. Removed unused balance, chart-tab/summary, line-callout/panel, request-page metadata, live-indicator, page-action, request-toolbar, and generic request-table/detail-grid rules. The remaining selectors are referenced by active dashboard/chart, print-label, dialog, or scroll surfaces; no empty media blocks or unreferenced class tokens remain. Combined scorecard, responsive-shell, and outbound-request Playwright coverage passes 13/13.

Progress note: Dashboard/intraday presentation migrated to shared Tailwind classes, including the intraday card, responsive controls, KPIs, live status, SVG chart primitives, donut legend, queue rows, and dashboard loading composition. The dashboard-specific CSS was removed from `template-migration.css`; build, unit tests, and scorecard/responsive-shell Playwright coverage pass.

Progress note: Printable truck labels now use shared Tailwind classes for the dialog, toolbar, preview surface, QR grid, image, and percentage-positioned label fields. Dialog animation keyframes moved to `tailwind.css`; print-label and print-layout rules were removed from `template-migration.css`. Build passes.

Progress note: Request table scroll wrappers, workspace layout safeguards, and request-detail dialog styling are now shared Tailwind classes. The final global base rules and sidebar animation moved into `tailwind.css`; `template-migration.css` was deleted. Only `tailwind.css` remains under `frontend/src/styles/`.

Acceptance gate:

- [x] `rg -n "\.css|styles/" frontend/src` shows only the Tailwind entrypoint import.
- [x] No custom selector-based styling remains outside Tailwind source configuration.
- [x] No dead CSS classes remain in JSX.

## Final verification

- [x] `npm run build`
- [x] `npm run lint`
- [x] `npm run lint:a11y`
- [x] `npm run test`
- [x] `npm run test:e2e`
- [x] `npm run check:encoding`
- [ ] Desktop visual check at 100% zoom
- [x] Desktop visual check at simulated 80% zoom
- [ ] Tablet visual check
- [ ] Mobile visual check
- [x] Login, dashboard, request pages, dialogs, loading, empty, and error states verified
- [ ] Final diff contains only migration work and approved pre-existing changes

Verification note: Final build, standard lint, encoding check, unit tests (49/49), accessibility lint, and Chromium E2E coverage (17/17) pass. Standard lint retains non-blocking warnings for three a11y-only suppressions and an unrelated empty untracked page file.

## Completion definition

The migration is complete only when all custom styling files have been removed, all visual styling is expressed through Tailwind utilities/theme configuration, and the full verification suite passes on `refactor/tailwind-staged-migration`.
