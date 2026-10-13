<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('workflow_outbox')) {
            return;
        }

        Schema::create('workflow_outbox', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('idempotency_key', 255)->unique();
            $table->string('aggregate_type', 80)->nullable();
            $table->string('aggregate_id', 255)->nullable();
            $table->string('event_type', 120);
            $table->jsonb('payload');
            $table->enum('status', ['PENDING', 'PROCESSING', 'COMPLETED', 'DEAD_LETTER'])->default('PENDING');
            $table->unsignedInteger('attempts')->default(0);
            $table->unsignedInteger('max_attempts')->default(5);
            $table->timestamp('available_at')->useCurrent();
            $table->timestamp('processing_started_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('dead_lettered_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'available_at'], 'workflow_outbox_pending_idx');
            $table->index(['aggregate_type', 'aggregate_id', 'status'], 'workflow_outbox_aggregate_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_outbox');
    }
};
