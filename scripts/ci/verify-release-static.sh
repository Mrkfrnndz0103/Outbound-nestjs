#!/usr/bin/env bash
set -euo pipefail

npm run check:conflicts
git diff --check
npm --prefix frontend run check:encoding
npm --prefix frontend run check:robots
npm --prefix frontend audit --package-lock-only --audit-level=high
npm audit --package-lock-only --audit-level=high
grep -Fq 'location = /auth/seatalk/callback' frontend/nginx.conf
! grep -Fq 'location ^~ /auth/seatalk/callback' frontend/nginx.conf
grep -Fq 'wss://*.supabase.co' frontend/nginx.conf
grep -Fq 'wss://*.supabase.in' frontend/nginx.conf

node scripts/ci/validate-migration-manifest.mjs
node --test scripts/tests/migration-deployment.test.mjs

echo 'Release static gates passed.'
