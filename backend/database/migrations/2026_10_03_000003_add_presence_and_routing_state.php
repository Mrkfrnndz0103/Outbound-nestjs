<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('profiles')) {
            throw new RuntimeException('The profiles table is owned by supabase/migrations. Apply those migrations before running this one.');
        }

        if (! Schema::hasColumn('profiles', 'last_seen_at')) {
            Schema::table('profiles', function (Blueprint $table): void {
                $table->timestampTz('last_seen_at')->nullable();
                $table->index(['role', 'is_active', 'last_seen_at'], 'profiles_presence_eligibility_idx');
            });
        }

        if (! Schema::hasTable('approval_routing_cursors')) {
            Schema::create('approval_routing_cursors', function (Blueprint $table): void {
                $table->string('scope', 64)->primary();
                $table->uuid('cursor_profile_id')->nullable();
                $table->timestampsTz();
                $table->foreign('cursor_profile_id')->references('id')->on('profiles')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_routing_cursors');
        if (Schema::hasTable('profiles') && Schema::hasColumn('profiles', 'last_seen_at')) {
            Schema::table('profiles', function (Blueprint $table): void {
                $table->dropIndex('profiles_presence_eligibility_idx');
                $table->dropColumn('last_seen_at');
            });
        }
    }
};
