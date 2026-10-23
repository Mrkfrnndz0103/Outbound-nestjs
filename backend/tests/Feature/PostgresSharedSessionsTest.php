<?php

namespace Tests\Feature;

use Illuminate\Session\DatabaseSessionHandler;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PDO;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('postgres')]
final class PostgresSharedSessionsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('POSTGRES_TESTS') !== '1' || ! in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('Requires an isolated PostgreSQL fixture.');
        }
        config()->set('database.default', 'pgsql');
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost', '::1', 'postgres']);
        DB::purge('pgsql');
        DB::reconnect('pgsql');
        (require database_path('migrations/2026_10_23_000001_create_shared_sessions_table.php'))->up();
    }

    public function test_session_survives_new_connection_and_existing_table_is_hardened(): void
    {
        $id = Str::random(40);
        $data = serialize(['seatalk_profile_id' => '00000000-0000-0000-0000-000000000001', '_token' => 'dummy-csrf']);
        try {
            $writer = new DatabaseSessionHandler(DB::connection('pgsql'), 'sessions', 120);
            $this->assertTrue($writer->write($id, $data));
            DB::purge('pgsql');
            $reader = new DatabaseSessionHandler(DB::connection('pgsql'), 'sessions', 120);
            $this->assertSame($data, $reader->read($id));

            // A rerun also hardens existing tables without deleting sessions.
            (require database_path('migrations/2026_10_23_000001_create_shared_sessions_table.php'))->up();
            $this->assertSame($data, $reader->read($id));
            $this->assertTrue(DB::selectOne("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sessions'::regclass")->relrowsecurity);
            foreach (['anon', 'authenticated'] as $role) {
                foreach (['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as $privilege) {
                    $this->assertFalse(DB::selectOne("SELECT has_table_privilege(?, 'public.sessions', ?) AS allowed", [$role, $privilege])->allowed);
                }
            }
        } finally {
            DB::table('sessions')->where('id', $id)->delete();
        }
    }
}
