<?php

return [

    'admin_emails' => array_values(array_filter(array_map('trim', explode(',', env('ADMIN_EMAILS', ''))))),
    'supabase' => [
        'url' => env('SUPABASE_URL'),
        'anon_key' => env('SUPABASE_PUBLISHABLE_KEY') ?: env('SUPABASE_ANON_KEY'),
        'service_key' => env('SUPABASE_SERVICE_ROLE_KEY'),
        // Do not inherit ambient HTTP(S)_PROXY values accidentally. Set this
        // explicitly only when the deployment requires an outbound proxy.
        'http_proxy' => env('SUPABASE_HTTP_PROXY', ''),
        // Keep TLS verification enabled; provide the CA bundle path when PHP
        // is not connected to the host operating system certificate store.
        'ca_bundle' => env('SUPABASE_CA_BUNDLE'),
        'connect_timeout' => (int) env('SUPABASE_CONNECT_TIMEOUT', 5),
        'timeout' => (int) env('SUPABASE_TIMEOUT', 10),
        // Cache a validated access token for this many seconds to avoid a
        // Supabase round-trip on every request. Set to 0 to disable caching.
        'token_cache_ttl' => (int) env('SUPABASE_TOKEN_CACHE_TTL', 30),
        // Keep authorization data fresh while avoiding a remote profile lookup
        // on every API request. Profile writes explicitly invalidate this entry.
        'profile_cache_ttl' => (int) env('SUPABASE_PROFILE_CACHE_TTL', 5),
    ],
    'seatalk' => [
        'app_id' => env('SEATALK_APP_ID'),
        'app_secret' => env('SEATALK_APP_SECRET'),
        'redirect_uri' => env('SEATALK_REDIRECT_URI'),
        'sdk_url' => env('SEATALK_SDK_URL'),
        'token_url' => env('SEATALK_TOKEN_URL'),
        'user_url' => env('SEATALK_USER_URL'),
        'connect_timeout' => (int) env('SEATALK_CONNECT_TIMEOUT', 5),
        'timeout' => (int) env('SEATALK_TIMEOUT', 10),
        'approval' => [
            // Provider traffic remains disabled unless the rollout flag and
            // every required server-side setting is present.
            'requested_enabled' => (bool) env('SEATALK_APPROVAL_ENABLED', false),
            'enabled' => (bool) env('SEATALK_APPROVAL_ENABLED', false)
                && filled(env('SEATALK_APP_ID'))
                && filled(env('SEATALK_APP_SECRET'))
                && filled(env('SEATALK_CALLBACK_SIGNING_SECRET'))
                && filled(env('SEATALK_APPROVAL_TOKEN_SECRET'))
                && filled(env('SEATALK_APPROVE_CALLBACK_URL'))
                && filled(env('SEATALK_REJECT_CALLBACK_URL')),
            'app_id' => env('SEATALK_APP_ID'),
            'app_secret' => env('SEATALK_APP_SECRET'),
            'callback_signing_secret' => env('SEATALK_CALLBACK_SIGNING_SECRET'),
            'token_secret' => env('SEATALK_APPROVAL_TOKEN_SECRET'),
            'base_url' => env('SEATALK_APPROVAL_BASE_URL', 'https://openapi.seatalk.io'),
            'create_path' => env('SEATALK_APPROVAL_CREATE_PATH'),
            'update_path' => env('SEATALK_APPROVAL_UPDATE_PATH'),
            'detail_path' => env('SEATALK_APPROVAL_DETAIL_PATH'),
            'app_path' => env('SEATALK_APPROVAL_APP_PATH'),
            'approve_callback_url' => env('SEATALK_APPROVE_CALLBACK_URL'),
            'reject_callback_url' => env('SEATALK_REJECT_CALLBACK_URL'),
            'assignment_seconds' => (int) env('SEATALK_APPROVAL_ASSIGNMENT_SECONDS', 180),
            'presence_active_seconds' => (int) env('SEATALK_PRESENCE_ACTIVE_SECONDS', 60),
            'connect_timeout' => (int) env('SEATALK_HTTP_CONNECT_TIMEOUT', 5),
            'timeout' => (int) env('SEATALK_HTTP_TIMEOUT', 10),
        ],
    ],
    'google_sheets' => [
        'spreadsheet_id' => env('GOOGLE_SHEETS_SPREADSHEET_ID', '1Po3LyyOAJ8Q-EbX_807RSxrA_grwmsdlsPPP4FFFBig'),
        'sheet_name' => env('GOOGLE_SHEETS_SHEET_NAME', 'SOC5_Truck_Request_[fallback]'),
        'credentials_json' => env('GOOGLE_SHEETS_CREDENTIALS_JSON'),
        'credentials_path' => env('GOOGLE_SHEETS_CREDENTIALS_PATH'),
        'sync_enabled' => (bool) env('GOOGLE_SHEETS_SYNC_ENABLED', false),
        'max_rows' => (int) env('GOOGLE_SHEETS_MAX_ROWS', 50000),
        'lookback_days' => (int) env('GOOGLE_SHEETS_LOOKBACK_DAYS', 0),
        'retry_attempts' => (int) env('GOOGLE_SHEETS_RETRY_ATTEMPTS', 3),
        'retry_backoff_ms' => (int) env('GOOGLE_SHEETS_RETRY_BACKOFF_MS', 1000),
    ],
    'user_imports_sheet' => [
        'spreadsheet_id' => env('GOOGLE_USER_IMPORTS_SPREADSHEET_ID'),
        'sheet_name' => env('GOOGLE_USER_IMPORTS_SHEET_NAME', 'user'),
        'sync_enabled' => (bool) env('GOOGLE_USER_IMPORTS_SYNC_ENABLED', false),
        'max_rows' => (int) env('GOOGLE_USER_IMPORTS_MAX_ROWS', 5000),
    ],
];
