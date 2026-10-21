<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('requests')) {
            throw new RuntimeException('The requests table is owned by supabase/migrations. Apply those migrations before running this one.');
        }

        Schema::table('requests', function (Blueprint $table): void {
            if (! Schema::hasColumn('requests', 'driver_assigned_at')) {
                $table->timestampTz('driver_assigned_at')->nullable();
            }
            if (! Schema::hasColumn('requests', 'linehaul_trip_at')) {
                $table->timestampTz('linehaul_trip_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('requests', function (Blueprint $table): void {
            $table->dropColumn(['driver_assigned_at', 'linehaul_trip_at']);
        });
    }
};
