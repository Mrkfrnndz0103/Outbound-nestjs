<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('sessions')) {
            Schema::create('sessions', function (Blueprint $table): void {
                $table->string('id')->primary();
                // Supabase identities are UUIDs. Sessions may be anonymous.
                $table->uuid('user_id')->nullable()->index();
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->longText('payload');
                $table->integer('last_activity')->index();
            });
        }
        foreach (['id', 'user_id', 'ip_address', 'user_agent', 'payload', 'last_activity'] as $column) {
            if (! Schema::hasColumn('sessions', $column)) {
                throw new RuntimeException("Existing sessions table requires owner-reviewed reconciliation: missing {$column}");
            }
        }

        if (DB::getDriverName() === 'pgsql') {
            if (Schema::getColumnType('sessions', 'user_id') !== 'uuid') {
                throw new RuntimeException('Existing sessions.user_id must support Supabase UUID identities; reconcile with database owner');
            }
            DB::statement('ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY');
            DB::statement('REVOKE ALL PRIVILEGES ON TABLE public.sessions FROM PUBLIC');
            foreach (['anon', 'authenticated'] as $role) {
                if (DB::table('pg_roles')->where('rolname', $role)->exists()) {
                    DB::statement("REVOKE ALL PRIVILEGES ON TABLE public.sessions FROM \"{$role}\"");
                }
            }
        }
    }

    public function down(): void
    {
        // Forward-only: preserve sessions and browser-access hardening on rollback.
    }
};
