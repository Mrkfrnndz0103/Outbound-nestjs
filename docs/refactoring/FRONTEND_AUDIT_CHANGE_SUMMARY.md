# Frontend Audit and Refactoring Change Summary

Date: 2026-10-08

## Scope completed

- Decomposed the outbound request page by extracting the request detail drawer and rejection dialog into `frontend/src/components/request/OutboundRequestOverlays.tsx`.
- Extracted shared request display and formatting concerns into `frontend/src/components/request/requestPresentation.ts`.
- Added `frontend/src/components/request/RequestExpandButton.tsx` and replaced clickable request-row containers with explicit native expand buttons in the outbound and midmile request tables.
- Decomposed the overview intraday chart area into `frontend/src/components/dashboard/IntradayCharts.tsx`.
- Reworked intraday chart point interaction to use native buttons layered through SVG `foreignObject`, preserving keyboard and assistive-technology access without role-based lint suppressions.
- Removed the three frontend accessibility lint suppressions by using semantic controls rather than interactive `div`/`g` elements.
- Hardened the SeaTalk SDK URL boundary and aligned the nginx CSP with the exact approved CDN and API origins.
- Updated browser tests for the semantic interaction contract and stabilized the desktop login-shell timing assertion.

## Security audit outcome

- `npm audit --omit=dev --audit-level=high --json`: zero vulnerabilities reported.
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, cookie-token storage, token logging, or source-map exposure patterns were found in the frontend source.
- SeaTalk SDK URLs now require HTTPS, the exact approved CDN origin, no credentials, and no non-default port.
- Remaining follow-up: review whether the unused/demo notification avatar component should retain its third-party image host, and consider moving the session hint from `sessionStorage` to a narrower in-memory or server-mediated flow if the product no longer needs reload persistence.

## Performance audit outcome

- Production build succeeds. The largest gzip outputs remain the shared API chunk (57.52 kB), entry chunk (84.00 kB), and outbound-request chunk (48.69 kB).
- Request queries use a 30-second stale window and do not run uncontrolled polling; overview intraday data is intentionally refreshed on a 10-second window.
- Follow-up recommendation: profile the shared API/entry chunks before introducing more route-level splitting, because the current build already splits major pages and the remaining cost is concentrated in shared dependencies.

Performance follow-up completed:

- Notification UI now loads only when the notification popover is opened.
- Outbound create/edit forms now load only when a form is opened, reducing the request-table route chunk from 48.69 kB gzip to 7.02 kB gzip; the deferred form chunk is 42.17 kB gzip.
- Vite now keeps the shared API module in a stable cacheable chunk instead of allowing it to be regrouped into the application entry chunk.
- The resulting build reports a 93.08 kB gzip entry chunk, a 57.52 kB gzip API chunk, a 7.02 kB gzip outbound-table chunk, a 42.17 kB gzip deferred-form chunk, and a 2.94 kB gzip deferred-notification chunk.

## Verification evidence

- Unit tests: 60 passed across 17 files.
- Chromium E2E: 22 passed.
- `npm run lint`: passed with no warnings or errors.
- `npm run lint:a11y`: passed with no warnings or errors.
- `npm run build`: passed.
- `npm run format:check`: passed.
- `npm run check:encoding`: passed.
- `npm run check:robots`: passed.
- `git diff HEAD --check`: passed; only normal Git line-ending notices were emitted.

## Integration notes

- No commit or push was performed.
- Existing staged changes were preserved; review the combined staged and unstaged diff before committing.
- The local E2E web server still logs expected connection-refused messages for `/api/v1/auth/seatalk/config` because the backend is not running in the frontend-only test environment; the tests pass using their configured route stubs.

## Accessibility and viewport validation follow-up

- Static accessibility lint now passes for all 132 frontend files.
- Removed misleading group semantics and click handling from the unused non-interactive input-group wrappers.
- Marked decorative Medesk icons and the adjacent logo as hidden from assistive technology; removed invalid `aria-hidden` from the keyboard hint.
- Browser-based DOM and viewport capture remains unavailable because Playwright browser launch hung in this environment; no fresh viewport measurements or screenshot claims are made.
- Verification: 95 frontend tests passed across 29 files, standard lint passed, production build passed, and `git diff --check` passed with only normal line-ending notices.
- Backend regression verification: 182 tests passed with 723 assertions; 21 PostgreSQL-dependent tests remain skipped because the isolated PostgreSQL test database is unavailable locally.
- CI follow-up: added `npm run lint:a11y` to the Travis frontend job; the existing pipeline already runs the PostgreSQL test job and Docker Compose config/build validation.
- Removed the unused `role="dialog"` prop from the shared modal API and its request-dialog call sites; TypeScript, accessibility lint, focused dialog tests, build, and diff checks pass.
- Release static gates passed via their PowerShell equivalents: conflict-marker scan, diff check, encoding, robots, frontend/root npm audits, Composer validation/audit, nginx callback/CSP assertions, and Supabase migration-manifest parity.
- Local PostgreSQL verification completed after aligning the Laravel outbox migration with Supabase `jsonb`: 20 PostgreSQL tests passed with 59 assertions; one support-table RLS test remains skipped because the standalone database lacks Supabase's pre-existing `notifications` table. Pint passed; the non-PostgreSQL suite remains green from the preceding full run.
