<?php

namespace Tests\Feature;

use App\Features\Users\UserController;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PDO;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class BackroomPasswordResetTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        if (! in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated password reset tests.');
        }
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('role');
            $table->boolean('is_active')->default(true);
            $table->string('ops_id')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->timestamp('password_reset_at')->nullable();
            $table->timestamp('password_changed_at')->nullable();
            $table->timestamps();
        });
        Schema::create('user_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id');
            $table->uuid('actor_id')->nullable();
            $table->string('event_type');
            $table->text('metadata');
            $table->timestamp('created_at')->useCurrent();
        });
        Schema::create('user_event_retries', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id');
            $table->uuid('actor_id')->nullable();
            $table->string('event_type');
            $table->text('metadata');
            $table->string('status')->default('confirmed');
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('available_at');
            $table->text('last_error')->nullable();
            $table->timestamps();
        });
        config()->set('services.supabase', [
            'url' => 'https://test-project.supabase.co',
            'anon_key' => 'test-anon-key',
            'service_key' => 'test-service-key',
            'http_proxy' => '',
            'ca_bundle' => '',
        ]);
    }

    private function insertProfile(array $overrides = []): string
    {
        $id = (string) Str::uuid();
        DB::table('profiles')->insert(array_merge([
            'id' => $id,
            'name' => 'Backroom User',
            'role' => 'ops_pic',
            'is_active' => true,
            'ops_id' => 'ops123',
            'must_change_password' => false,
            'password_reset_at' => null,
            'password_changed_at' => now()->subDay(),
            'created_at' => now()->subDays(10),
            'updated_at' => now()->subDay(),
        ], $overrides));

        return $id;
    }

    private function request(string $actorId): Request
    {
        $request = Request::create('/api/users/'.$actorId.'/reset-password', 'POST');
        $request->attributes->set('actor', (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops']);

        return $request;
    }

    #[DataProvider('deniedDocResetTargets')]
    public function test_doc_reset_denies_inactive_or_non_backroom_targets(array $overrides): void
    {
        $id = $this->insertProfile(['role' => 'doc_officer'] + $overrides);
        Http::fake();
        try {
            (new UserController)->resetPassword($this->request($id), $id);
            $this->fail('An unavailable Backroom target must be rejected.');
        } catch (HttpException $exception) {
            $this->assertSame(404, $exception->getStatusCode());
        }
        Http::assertNothingSent();
    }

    public static function deniedDocResetTargets(): iterable
    {
        yield 'inactive' => [['is_active' => false]];
        yield 'SeaTalk identity' => [['ops_id' => null]];
    }

    public function test_doc_reset_denies_unauthorized_actor(): void
    {
        $id = $this->insertProfile(['role' => 'doc_officer']);
        $request = $this->request($id);
        $request->attributes->get('actor')->role = 'doc_officer';
        Http::fake();
        try {
            (new UserController)->resetPassword($request, $id);
            $this->fail('DOC cannot reset accounts.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }
        Http::assertNothingSent();
    }

    public function test_active_doc_reset_uses_audited_forced_password_change(): void
    {
        $id = $this->insertProfile(['role' => 'doc_officer']);
        Http::fake(['https://test-project.supabase.co/auth/v1/admin/users/*' => Http::response(['id' => $id], 200)]);
        $response = (new UserController)->resetPassword($this->request($id), $id);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertNotEmpty($response->getData(true)['initial_password']);
        $this->assertDatabaseHas('profiles', ['id' => $id, 'must_change_password' => true, 'password_changed_at' => null]);
        $this->assertDatabaseHas('user_events', ['user_id' => $id, 'event_type' => 'PASSWORD_RESET']);
    }

    public function test_reset_sets_first_login_state_and_returns_temporary_password(): void
    {
        $id = $this->insertProfile();
        Http::fake([
            'https://test-project.supabase.co/auth/v1/admin/users/*' => Http::response(['id' => $id], 200),
        ]);

        $response = (new UserController)->resetPassword($this->request($id), $id);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertNotEmpty($response->getData(true)['initial_password']);
        $profile = DB::table('profiles')->where('id', $id)->first();
        $this->assertTrue((bool) $profile->must_change_password);
        $this->assertNull($profile->password_changed_at);
        $this->assertNotNull($profile->password_reset_at);
    }

    public function test_supabase_failure_restores_previous_profile_state(): void
    {
        $resetAt = now()->subDays(2);
        $changedAt = now()->subDay();
        $id = $this->insertProfile([
            'password_reset_at' => $resetAt,
            'password_changed_at' => $changedAt,
        ]);
        Http::fake([
            'https://test-project.supabase.co/auth/v1/admin/users/*' => Http::response(['error' => 'unavailable'], 503),
        ]);

        try {
            (new UserController)->resetPassword($this->request($id), $id);
            $this->fail('The reset should fail when Supabase rejects the update.');
        } catch (HttpException $exception) {
            $this->assertSame(502, $exception->getStatusCode());
        } finally {
            $profile = DB::table('profiles')->where('id', $id)->first();
            $this->assertFalse((bool) $profile->must_change_password);
            $this->assertSame($changedAt->toDateTimeString(), $profile->password_changed_at);
            $this->assertSame($resetAt->toDateTimeString(), $profile->password_reset_at);
        }
    }

    public function test_audit_failure_preserves_reset_state_and_returns_password(): void
    {
        $id = $this->insertProfile();
        Schema::drop('user_events');
        Http::fake([
            'https://test-project.supabase.co/auth/v1/admin/users/*' => Http::response(['id' => $id], 200),
        ]);

        $response = (new UserController)->resetPassword($this->request($id), $id);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertFalse($response->getData(true)['audit_recorded']);
        $this->assertNotEmpty($response->getData(true)['initial_password']);
        $this->assertTrue((bool) DB::table('profiles')->where('id', $id)->value('must_change_password'));
        $this->assertDatabaseHas('user_event_retries', ['user_id' => $id, 'event_type' => 'PASSWORD_RESET']);
    }

    public function test_audit_staging_failure_rolls_back_profile_state_and_skips_remote_update(): void
    {
        $id = $this->insertProfile();
        Schema::drop('user_event_retries');
        Http::fake();

        try {
            (new UserController)->resetPassword($this->request($id), $id);
            $this->fail('Preparation failure should return 503.');
        } catch (HttpException $exception) {
            $this->assertSame(503, $exception->getStatusCode());
        }

        $this->assertFalse((bool) DB::table('profiles')->where('id', $id)->value('must_change_password'));
        Http::assertNothingSent();
    }

    public function test_ambiguous_remote_timeout_is_left_for_reconciliation_without_returning_password(): void
    {
        $id = $this->insertProfile();
        Http::fake(fn () => throw new ConnectionException('timeout'));

        $response = (new UserController)->resetPassword($this->request($id), $id);

        $this->assertSame(503, $response->getStatusCode());
        $this->assertFalse($response->getData(true)['ok']);
        $this->assertArrayNotHasKey('initial_password', $response->getData(true));
        $this->assertTrue((bool) DB::table('profiles')->where('id', $id)->value('must_change_password'));
        $this->assertDatabaseHas('user_event_retries', ['user_id' => $id, 'status' => 'remote_unknown']);
    }

    public function test_stale_remote_failure_compensation_cannot_restore_a_newer_reset(): void
    {
        $id = $this->insertProfile();
        Http::fake(function () use ($id) {
            DB::table('profiles')->where('id', $id)->update([
                'password_reset_at' => now()->addSecond(),
                'must_change_password' => true,
            ]);

            return Http::response(['error' => 'rejected'], 503);
        });

        try {
            (new UserController)->resetPassword($this->request($id), $id);
            $this->fail('The reset should fail when Supabase rejects the update.');
        } catch (HttpException $exception) {
            $this->assertSame(502, $exception->getStatusCode());
        }

        $this->assertTrue((bool) DB::table('profiles')->where('id', $id)->value('must_change_password'));
    }

    public function test_retry_worker_processes_confirmed_only_and_preserves_staged_and_cancelled_records(): void
    {
        $id = $this->insertProfile();
        $now = now();
        foreach (['confirmed', 'staged', 'cancelled'] as $status) {
            DB::table('user_event_retries')->insert([
                'user_id' => $id,
                'actor_id' => null,
                'event_type' => 'PASSWORD_RESET',
                'metadata' => json_encode(['ops_id' => 'ops123']),
                'available_at' => $now,
                'status' => $status,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $this->artisan('audit:retry-user-events')->assertExitCode(0);

        $this->assertDatabaseMissing('user_event_retries', ['status' => 'confirmed']);
        $this->assertDatabaseHas('user_event_retries', ['status' => 'staged']);
        $this->assertDatabaseHas('user_event_retries', ['status' => 'cancelled']);
        $this->assertDatabaseHas('user_events', ['user_id' => $id, 'event_type' => 'PASSWORD_RESET']);
    }
}
