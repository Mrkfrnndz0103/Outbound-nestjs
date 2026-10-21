<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('notifications')) {
            throw new RuntimeException('The notifications table is owned by supabase/migrations. Apply those migrations before running this one.');
        }

        if (Schema::hasColumn('notifications', 'outbox_id')) {
            return;
        }

        Schema::table('notifications', function (Blueprint $table): void {
            $table->uuid('outbox_id')->nullable()->unique();
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('notifications') && Schema::hasColumn('notifications', 'outbox_id')) {
            Schema::table('notifications', function (Blueprint $table): void {
                $table->dropUnique(['outbox_id']);
                $table->dropColumn('outbox_id');
            });
        }
    }
};
