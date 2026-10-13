# Linehaul SeaTalk approval-cycle delivery — phase 5

## Scope

Wire local SeaTalk approval routing into first request delivery and OPS PIC correction after rejection. Keep local `requests.status` and `approval_status` authoritative; provider calls remain outside the committed request transaction.

## Changes

- New requests with SeaTalk Approval Center enabled now create an FTE OPS assignment and provision the item after the request transaction commits.
- OPS PIC correction of a rejected request now creates a fresh assignment sequence and synchronizes the existing stable provider item after commit.
- Provider `pending_list` uses active/pending local assignments when they exist, so delivered approvals target the assigned FTE OPS employee rather than every configured profile.
- The callback’s existing active-assignment check now has the assignment record it requires for first and corrected approval cycles.

## Verification

- New integration regression test first failed because request creation left `seatalk_approval_assignments` empty; it now passes through both initial assignment and correction/resubmission.
- Full backend suite: **170 tests passed**, 654 assertions, 17 PostgreSQL-only tests skipped; two existing PHPUnit metadata deprecations remain.
- Targeted Pint check passed for the two changed production files and new test. PHP syntax checks passed for all three files.
- Tests use a disposable SQLite database and mock only the external SeaTalk gateway. No SeaTalk requests or staging/production changes were made.

## Remaining gaps

- The provider’s create/update/callback contract and real delivery still require confirmation against an isolated SeaTalk test tenant. The adapter continues to fail closed when the update path is missing.
- Staging was not accessible from this environment: the private SSH key was unavailable, and HTTPS probes were behind Cloudflare Access.
- When no active/present FTE OPS candidate exists, routing intentionally creates no provider assignment. Automatic retry when an approver later becomes present is not covered in this phase.
