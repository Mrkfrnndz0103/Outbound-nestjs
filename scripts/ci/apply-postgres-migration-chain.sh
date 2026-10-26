#!/usr/bin/env bash
# Builds the production-shaped schema from the ordered Supabase migration manifest.
# Expects psql on PATH and the PG* variables for the target database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MANIFEST="$ROOT/docs/deployment/supabase-migration-manifest.txt"
node "$ROOT/scripts/ci/validate-migration-manifest.mjs" "$ROOT"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/ci/local-auth-stubs.sql"

ordered_migrations() {
  tr -d '\r' < "$MANIFEST" | grep -v '^#' | grep -v '^$'
}

while IFS= read -r file; do
  psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/$file"
  echo "applied: $file"
done < <(ordered_migrations)

echo "migration chain applied"
