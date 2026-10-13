<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::unprepared("ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'REJECTED'");
        }

        Schema::table('requests', function (Blueprint $table): void {
            if (! Schema::hasColumn('requests', 'rejection_return_role')) {
                $table->string('rejection_return_role', 24)->nullable();
            }
            if (! Schema::hasColumn('requests', 'cancellation_remarks')) {
                $table->text('cancellation_remarks')->nullable();
            }
        });

        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::unprepared(<<<'SQL'
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'requests_rejection_return_role_check'
                      AND conrelid = 'public.requests'::regclass
                  ) THEN
                    ALTER TABLE public.requests ADD CONSTRAINT requests_rejection_return_role_check
                      CHECK (rejection_return_role IS NULL OR rejection_return_role IN ('ops_pic', 'fte_ops'));
                  END IF;
                END;
                $$;
                SQL);
        }
    }

    public function down(): void
    {
        throw new LogicException('Rejection routing is forward-only; removing it would lose workflow ownership and cancellation remarks.');
    }
};
