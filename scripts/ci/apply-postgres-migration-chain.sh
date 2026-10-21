#!/usr/bin/env bash
# Builds the production-shaped schema in CI, in three phases:
#   A. Supabase core migrations up to and including 20261013060000_workflow_outbox.sql
#   B. The full Laravel migration chain (it alters tables Supabase created)
#   C. The remaining Supabase migrations (the reconcile migration needs Laravel's tables)
#
# Expects psql on PATH and the PG* variables for the target database, plus the
# backend DB_* variables for artisan (same values as the Travis job).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MANIFEST="$ROOT/docs/deployment/supabase-migration-manifest.txt"
SPLIT="20261013060000_workflow_outbox.sql"

psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/ci/local-auth-stubs.sql"

ordered_migrations() {
  tr -d '\r' < "$MANIFEST" | grep -v '^#' | grep -v '^$'
}

phase_a=1
phase_c=()
while IFS= read -r file; do
  if [ "$phase_a" -eq 1 ]; then
    psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/$file"
    echo "phase A: $file"
    [ "$file" = "$SPLIT" ] && phase_a=0
  else
    phase_c+=("$file")
  fi
done < <(ordered_migrations)

(cd "$ROOT/backend" && php artisan migrate:install && php artisan migrate --force)
echo "phase B: laravel migrations applied"

for file in "${phase_c[@]}"; do
  psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/$file"
  echo "phase C: $file"
done

echo "migration chain applied"
