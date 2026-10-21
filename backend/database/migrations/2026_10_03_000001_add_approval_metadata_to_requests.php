<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('requests')) {
            throw new RuntimeException('The requests table is owned by supabase/migrations. Apply those migrations before running this one.');
        }

        $columns = array_filter([
            ! Schema::hasColumn('requests', 'approval_status') ? 'approval_status' : null,
            ! Schema::hasColumn('requests', 'approved_by') ? 'approved_by' : null,
            ! Schema::hasColumn('requests', 'approved_at') ? 'approved_at' : null,
            ! Schema::hasColumn('requests', 'approval_source') ? 'approval_source' : null,
            ! Schema::hasColumn('requests', 'rejected_by') ? 'rejected_by' : null,
            ! Schema::hasColumn('requests', 'rejected_at') ? 'rejected_at' : null,
            ! Schema::hasColumn('requests', 'approval_version') ? 'approval_version' : null,
            ! Schema::hasColumn('requests', 'approval_correlation_id') ? 'approval_correlation_id' : null,
        ]);

        if ($columns !== []) {
            Schema::table('requests', function (Blueprint $table) use ($columns): void {
                if (in_array('approval_status', $columns, true)) {
                    // Backfill from the legacy workflow before making this
                    // canonical field non-null/defaulted.
                    $table->string('approval_status', 24)->nullable();
                }
                if (in_array('approved_by', $columns, true)) {
                    $table->uuid('approved_by')->nullable();
                }
                if (in_array('approved_at', $columns, true)) {
                    $table->timestampTz('approved_at')->nullable();
                }
                if (in_array('approval_source', $columns, true)) {
                    $table->string('approval_source', 24)->nullable();
                }
                if (in_array('rejected_by', $columns, true)) {
                    $table->uuid('rejected_by')->nullable();
                }
                if (in_array('rejected_at', $columns, true)) {
                    $table->timestampTz('rejected_at')->nullable();
                }
                if (in_array('approval_version', $columns, true)) {
                    $table->unsignedBigInteger('approval_version')->nullable();
                }
                if (in_array('approval_correlation_id', $columns, true)) {
                    $table->uuid('approval_correlation_id')->nullable();
                }
            });
        }

        if (Schema::hasColumn('requests', 'approval_status')) {
            DB::table('requests')->whereNull('approval_status')->whereIn('status', [
                'APPROVED', 'REQUESTED', 'ASSIGNED', 'DOCKING', 'DOCKED', 'FOR_DOCKING', 'CONFIRMED',
            ])->update(['approval_status' => 'APPROVED']);
            DB::table('requests')->whereNull('approval_status')->where('status', 'REJECTED_BY_MM')
                ->update(['approval_status' => 'REJECTED']);
            DB::table('requests')->whereNull('approval_status')->where('status', 'CANCELLED')
                ->update(['approval_status' => 'CANCELLED']);
            DB::table('requests')->whereNull('approval_status')
                ->update(['approval_status' => 'PENDING']);

            DB::statement("ALTER TABLE requests ALTER COLUMN approval_status SET DEFAULT 'PENDING'");
            DB::statement('ALTER TABLE requests ALTER COLUMN approval_status SET NOT NULL');
        }

        if (Schema::hasColumn('requests', 'approval_version')) {
            DB::table('requests')->whereNull('approval_version')->update(['approval_version' => 0]);
            DB::statement('ALTER TABLE requests ALTER COLUMN approval_version SET DEFAULT 0');
            DB::statement('ALTER TABLE requests ALTER COLUMN approval_version SET NOT NULL');
        }

        if (Schema::hasTable('profiles')) {
            $this->addForeignKeyIfMissing('requests', 'approved_by', 'requests_approved_by_foreign');
            $this->addForeignKeyIfMissing('requests', 'rejected_by', 'requests_rejected_by_foreign');
        }

        if (! $this->constraintExists('requests', 'requests_approval_status_check')) {
            DB::statement("ALTER TABLE requests
                ADD CONSTRAINT requests_approval_status_check
                CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'))");
        }
        if (! $this->constraintExists('requests', 'requests_approval_source_check')) {
            DB::statement("ALTER TABLE requests
                ADD CONSTRAINT requests_approval_source_check
                CHECK (approval_source IS NULL OR approval_source IN ('WEB', 'SEATALK'))");
        }
        if (! $this->indexExists('requests', 'requests_approval_pending_idx')) {
            DB::statement("CREATE INDEX requests_approval_pending_idx
                ON requests (created_at DESC, id)
                WHERE approval_status = 'PENDING'");
        }
        if (! $this->indexExists('requests', 'requests_approval_correlation_idx')) {
            DB::statement('CREATE INDEX requests_approval_correlation_idx ON requests (approval_correlation_id)');
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('requests')) {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS requests_approval_pending_idx');
        DB::statement('DROP INDEX IF EXISTS requests_approval_correlation_idx');
        DB::statement('ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_approval_status_check');
        DB::statement('ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_approval_source_check');

        $this->dropForeignKeyIfPresent('requests', 'requests_approved_by_foreign');
        $this->dropForeignKeyIfPresent('requests', 'requests_rejected_by_foreign');

        $columns = array_values(array_filter([
            Schema::hasColumn('requests', 'approval_status') ? 'approval_status' : null,
            Schema::hasColumn('requests', 'approved_by') ? 'approved_by' : null,
            Schema::hasColumn('requests', 'approved_at') ? 'approved_at' : null,
            Schema::hasColumn('requests', 'approval_source') ? 'approval_source' : null,
            Schema::hasColumn('requests', 'rejected_by') ? 'rejected_by' : null,
            Schema::hasColumn('requests', 'rejected_at') ? 'rejected_at' : null,
            Schema::hasColumn('requests', 'approval_version') ? 'approval_version' : null,
            Schema::hasColumn('requests', 'approval_correlation_id') ? 'approval_correlation_id' : null,
        ]));

        if ($columns !== []) {
            Schema::table('requests', function (Blueprint $table) use ($columns): void {
                $table->dropColumn($columns);
            });
        }
    }

    private function addForeignKeyIfMissing(string $table, string $column, string $name): void
    {
        if (! Schema::hasColumn($table, $column) || $this->foreignKeyExists($table, $name, $column)) {
            return;
        }

        Schema::table($table, function (Blueprint $blueprint) use ($column, $name): void {
            $blueprint->foreign($column, $name)->references('id')->on('profiles')->nullOnDelete();
        });
    }

    private function dropForeignKeyIfPresent(string $table, string $name): void
    {
        if (! $this->foreignKeyExists($table, $name, null)) {
            return;
        }

        Schema::table($table, function (Blueprint $blueprint) use ($name): void {
            $blueprint->dropForeign($name);
        });
    }

    private function foreignKeyExists(string $table, string $name, ?string $column): bool
    {
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            return collect(Schema::getConnection()->select("PRAGMA foreign_key_list({$table})"))
                ->contains(fn (object $foreignKey): bool => $column === null
                    ? in_array($foreignKey->from ?? null, ['approved_by', 'rejected_by'], true)
                    : ($foreignKey->from ?? null) === $column);
        }

        return DB::table('information_schema.table_constraints')
            ->where('table_schema', Schema::getConnection()->getConfig('schema', 'public'))
            ->where('table_name', $table)
            ->where('constraint_name', $name)
            ->exists();
    }

    private function constraintExists(string $table, string $name): bool
    {
        return DB::table('information_schema.table_constraints')
            ->where('table_schema', Schema::getConnection()->getConfig('schema', 'public'))
            ->where('table_name', $table)
            ->where('constraint_name', $name)
            ->exists();
    }

    private function indexExists(string $table, string $name): bool
    {
        return DB::table('pg_indexes')
            ->where('schemaname', Schema::getConnection()->getConfig('schema', 'public'))
            ->where('tablename', $table)
            ->where('indexname', $name)
            ->exists();
    }
};
