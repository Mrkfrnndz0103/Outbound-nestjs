# User imports Google Sheets sync

## NestJS runtime

The active NestJS backend now owns this worker. Set the variables below, grant the service account Viewer access to the spreadsheet, and start the normal Nest process. It performs an initial sync on boot and repeats every 15 minutes by default; set `GOOGLE_USER_IMPORTS_SYNC_INTERVAL_MS` to change the interval.

```dotenv
GOOGLE_USER_IMPORTS_SYNC_ENABLED=true
GOOGLE_USER_IMPORTS_SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_USER_IMPORTS_SHEET_NAME=user
GOOGLE_USER_IMPORTS_MAX_ROWS=5000
GOOGLE_USER_IMPORTS_SYNC_INTERVAL_MS=900000
GOOGLE_SHEETS_CREDENTIALS_PATH=/run/secrets/google-sheets-credentials.json
# or GOOGLE_SHEETS_CREDENTIALS_JSON={...}
```

The worker is idempotent, validates the complete snapshot before opening a database transaction, upserts active rows, and deactivates missing rows without deleting their auth links. It logs counts only, never user data. `OUTBOX_WORKER_ENABLED` remains the separate durable workflow worker; both workers run inside Nest when configured.

The Laravel scheduler reads the `user` tab and upserts its staged account identities into `public.user_imports` every 15 minutes. It does not write back to Google Sheets.

## Configuration

Set these values in the backend runtime environment:

```dotenv
GOOGLE_USER_IMPORTS_SYNC_ENABLED=true
GOOGLE_USER_IMPORTS_SPREADSHEET_ID=1Tawt4iSUrSFcRAgCTVg_b-rWRIRByQx_nP-qpS2Yjdc
GOOGLE_USER_IMPORTS_SHEET_NAME=user
GOOGLE_USER_IMPORTS_MAX_ROWS=5000
```

Provide the Google service account credentials through the existing `GOOGLE_SHEETS_CREDENTIALS_PATH` or `GOOGLE_SHEETS_CREDENTIALS_JSON` setting, and grant that account Viewer access to the spreadsheet. Keep credentials outside source control.

## Import behavior

- `ops_pic` rows use `Ops_id` as their identity and leave `email` null. Other supported roles use a valid email and leave `ops_id` null. This avoids importing repeated placeholder values into the database's unique identity columns.
- `source_id` is a stable key derived from role plus that role's identity. Source rows are upserted; rows previously managed by this sync that disappear from a complete, non-empty sheet snapshot are marked inactive. They are not deleted and their `auth_user_id` link is retained.
- `seatalk_employee_code` is synced when the source tab contains that column. Duplicate role identities or employee codes, invalid rows, an empty tab, or a row-limit overflow fail the sync before database changes.
- Password hashes and profile/authentication state (`must_change_password`, `password_changed_at`, and `auth_provider`) are not copied to `user_imports`.

## Start the schedule

The `scheduler` service in `docker-compose.yml` runs `php artisan schedule:work`; rebuild and start it with the backend after deploying this change:

```powershell
docker compose up -d --build api scheduler
```

Run an initial sync or a manual refresh with:

```powershell
docker compose exec api php artisan users:sync-imports-google-sheet
```

The command is safe to rerun. It reports the number of source rows synchronized and does not print user data.
