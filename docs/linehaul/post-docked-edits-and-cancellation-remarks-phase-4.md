# Linehaul UI follow-up — post-DOCKED edits and cancellation remarks

## Scope

This phase exposes the existing backend-authorized post-DOCKED edit path to the owning OPS PIC and surfaces stored cancellation remarks in request detail views. It does not change the workflow API, database schema, or transition rules.

## Changes

- OPS PIC request actions now include Edit for their own `DOCKED` requests. The shared UI predicate requires the `ops_pic` role, matching `created_by`, and `DOCKED` status; the normal request update path preserves status.
- Cancellation remarks are typed on `TruckRequest` and shown when present in the outbound details drawer, outbound expanded row, and FTE MM expanded row.
- Added focused selector/component tests and browser coverage for owner-only editing, unchanged `DOCKED` status, and cancellation remarks.

## Verification

- Focused Vitest: 5 tests passed.
- Frontend production build: passed, including source artifact checks, API versioning check, and TypeScript compile.
- Playwright Chromium `e2e/outbound-requests.spec.ts`: 14 tests passed. The owner edit test confirms the update succeeds and does not submit a status field, preserving the backend-owned workflow status.
- Staging runtime behavior remains unverified; the SSH private key was not available in this environment.

## Remaining boundary

Backend ownership/permission enforcement and audit behavior are prerequisites already covered in the backend workflow phase. This phase adds the corresponding UI entry point and display. No production data, external provider, or staging host was modified.
