<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PDO;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('postgres')]
final class PostgresSchemaHardeningTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('POSTGRES_TESTS') !== '1' || ! in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('PostgreSQL integration tests are enabled only in the PostgreSQL CI job.');
        }

        config()->set('database.default', 'pgsql');
        $host = strtolower((string) config('database.connections.pgsql.host'));
        if (! in_array($host, ['127.0.0.1', 'localhost', '::1', 'postgres'], true)) {
            $this->markTestSkipped('PostgreSQL integration tests require a local or CI test database host.');
        }

        DB::purge('pgsql');
        DB::reconnect('pgsql');
        Schema::dropIfExists('user_events');
        Schema::dropIfExists('user_imports');
        Schema::dropIfExists('profiles');
        Schema::dropIfExists('notifications');
        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('ops_id')->nullable();
        });
        Schema::create('user_imports', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('ops_id')->nullable();
        });
        Schema::create('user_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id');
            $table->uuid('actor_id')->nullable();
            $table->string('event_type');
        });
        Schema::create('notifications', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id')->nullable();
            $table->string('target_role')->nullable();
            $table->text('message')->nullable();
        });
    }

    protected function tearDown(): void
    {
        $host = strtolower((string) config('database.connections.pgsql.host'));
        if (getenv('POSTGRES_TESTS') === '1'
            && in_array('pgsql', PDO::getAvailableDrivers(), true)
            && in_array($host, ['127.0.0.1', 'localhost', '::1', 'postgres'], true)) {
            Schema::dropIfExists('user_events');
            Schema::dropIfExists('user_imports');
            Schema::dropIfExists('profiles');
            Schema::dropIfExists('notifications');
        }

        parent::tearDown();
    }

    public function test_identity_migration_normalizes_existing_ops_ids(): void
    {
        $migration = dirname(base_path()).'/supabase/migrations/019_identity_and_audit_hardening.sql';
        DB::table('profiles')->insert(['id' => '00000000-0000-0000-0000-000000000001', 'ops_id' => 'OPS123']);
        DB::table('user_imports')->insert(['id' => '00000000-0000-0000-0000-000000000002', 'ops_id' => ' OPS456 ']);
        DB::unprepared((string) file_get_contents($migration));

        $this->assertSame('ops123', DB::table('profiles')->where('id', '00000000-0000-0000-0000-000000000001')->value('ops_id'));
        $this->assertSame('ops456', DB::table('user_imports')->where('id', '00000000-0000-0000-0000-000000000002')->value('ops_id'));
    }

    public function test_access_request_notification_migration_adds_updated_at(): void
    {
        $migration = dirname(base_path()).'/supabase/migrations/20261009000003_add_notification_updated_at.sql';
        DB::unprepared((string) file_get_contents($migration));

        $this->assertTrue(Schema::hasColumn('notifications', 'updated_at'));
        $column = DB::selectOne("select is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'updated_at'");
        $this->assertSame('NO', $column->is_nullable);
        $this->assertStringContainsString('now()', strtolower((string) $column->column_default));
    }

    public function test_identity_migration_allows_supported_audit_event(): void
    {
        $migration = dirname(base_path()).'/supabase/migrations/019_identity_and_audit_hardening.sql';
        DB::unprepared((string) file_get_contents($migration));

        DB::table('user_events')->insert([
            'user_id' => '00000000-0000-0000-0000-000000000001',
            'event_type' => 'PASSWORD_RESET',
        ]);
        $this->assertDatabaseHas('user_events', ['event_type' => 'PASSWORD_RESET']);
    }

    public function test_identity_migration_rejects_unsupported_audit_event(): void
    {
        $migration = dirname(base_path()).'/supabase/migrations/019_identity_and_audit_hardening.sql';
        DB::unprepared((string) file_get_contents($migration));

        $this->expectException(QueryException::class);
        DB::table('user_events')->insert([
            'user_id' => '00000000-0000-0000-0000-000000000001',
            'event_type' => 'INVALID_EVENT',
        ]);
    }

    public function test_identity_migration_rejects_duplicate_normalized_user_imports(): void
    {
        $migration = dirname(base_path()).'/supabase/migrations/019_identity_and_audit_hardening.sql';
        DB::unprepared((string) file_get_contents($migration));

        DB::table('user_imports')->insert(['id' => '10000000-0000-0000-0000-000000000001', 'ops_id' => 'OPS123']);

        $this->expectException(QueryException::class);
        DB::table('user_imports')->insert(['id' => '10000000-0000-0000-0000-000000000003', 'ops_id' => 'ops123']);
    }

    public function test_identity_migration_fails_when_preexisting_duplicates_are_present(): void
    {
        Schema::dropIfExists('user_events');
        Schema::dropIfExists('user_imports');
        Schema::dropIfExists('profiles');

        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('ops_id')->nullable();
        });
        Schema::create('user_imports', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('ops_id')->nullable();
        });
        Schema::create('user_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id');
            $table->uuid('actor_id')->nullable();
            $table->string('event_type');
        });

        DB::table('user_imports')->insert([
            ['id' => '20000000-0000-0000-0000-000000000001', 'ops_id' => 'OPS123'],
            ['id' => '20000000-0000-0000-0000-000000000002', 'ops_id' => ' ops123  '],
        ]);

        $this->expectException(QueryException::class);
        DB::unprepared((string) file_get_contents(dirname(base_path()).'/supabase/migrations/019_identity_and_audit_hardening.sql'));
    }
}
