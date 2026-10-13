<?php

namespace App\Features\Outbox;

use RuntimeException;

final class RetryableWorkflowOutboxException extends RuntimeException {}
