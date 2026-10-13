<?php

return [
    'max_attempts' => (int) env('WORKFLOW_OUTBOX_MAX_ATTEMPTS', 5),
    'base_backoff_seconds' => (int) env('WORKFLOW_OUTBOX_BASE_BACKOFF_SECONDS', 5),
    'max_backoff_seconds' => (int) env('WORKFLOW_OUTBOX_MAX_BACKOFF_SECONDS', 300),
    'processing_timeout_seconds' => (int) env('WORKFLOW_OUTBOX_PROCESSING_TIMEOUT_SECONDS', 300),
];
