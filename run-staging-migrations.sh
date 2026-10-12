#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/soc-5-outbound"
HOST="aws-0-ap-southeast-1.pooler.supabase.com"
USER="postgres.otciptffvynzhwzwowzd"
MANIFEST="docs/deployment/supabase-migration-manifest.txt"
read -rsp "Staging database password: " PGPASSWORD
echo
export PGPASSWORD
export PGSSLMODE=require
trap 'unset PGPASSWORD' EXIT
mapfile -t MIGRATIONS < <(grep -vE '^[[:space:]]*(#|$)' "$MANIFEST")
if [[ ${#MIGRATIONS[@]} -ne 33 ]]; then
  echo "Unexpected migration count. Stopping."
  exit 1
fi
echo "Executing remaining 30 migrations..."
for file in "${MIGRATIONS[@]:3}"; do
  echo "Applying: $file"
  psql -X -v ON_ERROR_STOP=1 \
    -h "$HOST" \
    -p 5432 \
    -U "$USER" \
    -d postgres \
    -f "supabase/migrations/$file"
  echo "SUCCESS: $file"
done
echo "All remaining migrations completed."
