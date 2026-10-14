<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('seatalk_approval_assignments')) {
            Schema::table('seatalk_approval_assignments', function (Blueprint $table): void {
                if (! Schema::hasColumn('seatalk_approval_assignments', 'routing_cycle')) {
                    $table->unsignedInteger('routing_cycle')->default(1)->after('sequence');
                }
                if (! Schema::hasColumn('seatalk_approval_assignments', 'approval_token_used_at')) {
                    $table->timestampTz('approval_token_used_at')->nullable()->after('approval_token_hash');
                }
            });
            Schema::table('seatalk_approval_assignments', function (Blueprint $table): void {
                $table->index(['request_id', 'routing_cycle', 'status'], 'seatalk_assignments_cycle_status_idx');
            });
        }

        if (Schema::hasTable('seatalk_callback_events')) {
            Schema::table('seatalk_callback_events', function (Blueprint $table): void {
                if (! Schema::hasColumn('seatalk_callback_events', 'payload_hash')) {
                    $table->string('payload_hash', 64)->nullable()->after('action');
                }
                if (! Schema::hasColumn('seatalk_callback_events', 'assignment_id')) {
                    $table->uuid('assignment_id')->nullable()->after('request_id');
                }
                if (! Schema::hasColumn('seatalk_callback_events', 'failure_reason')) {
                    $table->text('failure_reason')->nullable()->after('status');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('seatalk_callback_events')) {
            Schema::table('seatalk_callback_events', function (Blueprint $table): void {
                foreach (['payload_hash', 'assignment_id', 'failure_reason'] as $column) {
                    if (Schema::hasColumn('seatalk_callback_events', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }

        if (Schema::hasTable('seatalk_approval_assignments')) {
            Schema::table('seatalk_approval_assignments', function (Blueprint $table): void {
                $table->dropIndex('seatalk_assignments_cycle_status_idx');
                foreach (['routing_cycle', 'approval_token_used_at'] as $column) {
                    if (Schema::hasColumn('seatalk_approval_assignments', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }
};
