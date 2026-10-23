#!/usr/bin/env bash
set -euo pipefail

: "${STAGING_BASE_URL:?STAGING_BASE_URL is required for release acceptance}"

# Travis should store the browser state as an encrypted base64 variable. A
# protected pre-provisioned file path remains supported for other CI runners.
state_file=''
if [[ -n "${STAGING_AUTH_STATE_B64:-}" ]]; then
  state_file="$(mktemp)"
  chmod 600 "$state_file"
  printf '%s' "$STAGING_AUTH_STATE_B64" | base64 --decode > "$state_file"
  export STAGING_AUTH_STATE="$state_file"
  trap 'rm -f "$state_file"' EXIT
fi
: "${STAGING_AUTH_STATE:?Set STAGING_AUTH_STATE_B64 to a protected state file, or provision STAGING_AUTH_STATE as a protected file path}"

test -f "$STAGING_AUTH_STATE"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$STAGING_AUTH_STATE"
PRODUCTION_PLAYWRIGHT_BASE_URL="$STAGING_BASE_URL" \
PRODUCTION_PLAYWRIGHT_AUTH_STATE="$STAGING_AUTH_STATE" \
npm run test:production-realtime

echo 'Required authenticated release acceptance completed.'
