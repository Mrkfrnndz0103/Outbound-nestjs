<?php

namespace App\Features\Users;

use App\Integrations\SupabaseAdminClient;
use App\Integrations\SupabaseAdminException;
use App\Support\AuthenticatedProfileCache;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Throwable;

final class UserController
{
    private ?SupabaseAdminClient $supabaseAdmin;

    public function __construct(?SupabaseAdminClient $supabaseAdmin = null)
    {
        $this->supabaseAdmin = $supabaseAdmin;
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize($request);

        return response()->json(['data' => DB::table('profiles')->select('id', 'name', 'role', 'email', 'ops_id', 'is_active', 'created_at')->orderBy('name')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $request->attributes->get('actor');
        abort_unless(in_array($actor->role, ['fte_ops', 'fte_mm'], true), 403, 'Only FTE users can create Backroom accounts.');

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'ops_id' => ['required', 'string', 'max:40', 'regex:/^ops[0-9]+$/i'],
            'role' => ['sometimes', Rule::in(['ops_pic', 'doc_officer'])],
        ]);
        $opsId = strtolower(trim($data['ops_id']));
        $role = $data['role'] ?? 'ops_pic';
        abort_if(DB::table('profiles')->whereRaw('lower(ops_id) = ?', [$opsId])->exists(), 422, 'That Ops ID is already registered.');
        $email = $opsId.'@backroom.soc5.internal';

        $initialPassword = Str::password(20);
        try {
            $authUserId = $this->supabaseAdmin()->createUser($email, $initialPassword, ['ops_id' => $opsId, 'account_type' => 'backroom']);
        } catch (Throwable $exception) {
            Log::warning('Unable to create Supabase Backroom user.', [
                'ops_id' => $opsId,
                'error' => $exception->getMessage(),
            ]);
            abort(422, 'Unable to create authentication account.');
        }

        try {
            $profile = DB::transaction(function () use ($authUserId, $data, $opsId, $role, $actor) {
                $profile = DB::table('profiles')->insertGetId([
                    'id' => $authUserId, 'name' => $data['name'], 'role' => $role,
                    'ops_id' => $opsId, 'email' => null, 'is_active' => true,
                    'must_change_password' => true, 'password_reset_at' => now(), 'created_at' => now(), 'updated_at' => now(),
                ], 'id');

                $this->userEvent($profile, $actor->id, 'USER_CREATED', ['name' => $data['name'], 'ops_id' => $opsId]);

                return $profile;
            });
        } catch (Throwable $exception) {
            try {
                $this->supabaseAdmin()->deleteUser($authUserId);
            } catch (Throwable $compensationException) {
                Log::critical('Supabase user compensation failed after profile creation rollback.', [
                    'user_id' => $authUserId,
                    'ops_id' => $opsId,
                    'error' => $compensationException->getMessage(),
                ]);
            }
            throw $exception;
        }

        return response()->json([
            'id' => $profile,
            'name' => $data['name'],
            'ops_id' => $opsId,
            'role' => $role,
            'must_change_password' => true,
            'initial_password' => $initialPassword,
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorize($request);
        abort_if($request->attributes->get('actor')->id === $id, 409, 'You cannot change your own role.');
        $data = $request->validate(['name' => 'required|string|min:2|max:120', 'role' => ['required', Rule::in(['ops_pic', 'fte_ops', 'fte_mm', 'doc_officer'])]]);
        DB::transaction(function () use ($id, $data, $request): void {
            $updated = DB::table('profiles')->where('id', $id)->update($data + ['updated_at' => now()]);
            abort_unless($updated, 404, 'User not found.');
            $this->userEvent($id, $request->attributes->get('actor')->id, 'USER_UPDATED', $data);
        });
        AuthenticatedProfileCache::forget($id);

        return response()->json(DB::table('profiles')->where('id', $id)->firstOrFail());
    }

    public function disable(Request $request, string $id): JsonResponse
    {
        $this->authorize($request);
        abort_if($request->attributes->get('actor')->id === $id, 409, 'You cannot disable your own account.');
        DB::transaction(function () use ($id, $request): void {
            $updated = DB::table('profiles')->where('id', $id)->update(['is_active' => false, 'updated_at' => now()]);
            abort_unless($updated, 404, 'User not found.');
            $this->userEvent($id, $request->attributes->get('actor')->id, 'USER_DISABLED');
        });
        AuthenticatedProfileCache::forget($id);

        return response()->json(['ok' => true]);
    }

    public function resetPassword(Request $request, string $id): JsonResponse
    {
        $this->authorize($request);
        $newPassword = Str::password(20);
        try {
            [$profile, $resetAt, $auditRetryId] = DB::transaction(function () use ($id, $request): array {
                $profile = DB::table('profiles')
                    ->where('id', $id)
                    ->whereIn('role', ['ops_pic', 'doc_officer'])
                    ->whereNotNull('ops_id')
                    ->where('ops_id', '<>', '')
                    ->where('is_active', true)
                    ->lockForUpdate()
                    ->first(['id', 'ops_id', 'must_change_password', 'password_changed_at', 'password_reset_at']);
                abort_unless($profile, 404, 'Active Backroom user not found.');

                $resetAt = now();
                DB::table('profiles')->where('id', $profile->id)->update([
                    'must_change_password' => true,
                    'password_changed_at' => null,
                    'password_reset_at' => $resetAt,
                    'updated_at' => $resetAt,
                ]);

                $auditRetryId = DB::table('user_event_retries')->insertGetId([
                    'user_id' => $profile->id,
                    'actor_id' => $request->attributes->get('actor')->id,
                    'event_type' => 'PASSWORD_RESET',
                    'metadata' => json_encode(['ops_id' => $profile->ops_id]),
                    'available_at' => $resetAt->copy()->addMinutes(5),
                    'status' => 'staged',
                    'created_at' => $resetAt,
                    'updated_at' => $resetAt,
                ]);

                return [$profile, $resetAt, $auditRetryId];
            });
        } catch (QueryException $exception) {
            Log::critical('Unable to stage Backroom password reset audit atomically.', ['user_id' => $id, 'sql_state' => $exception->errorInfo[0] ?? null]);
            abort(503, 'Unable to prepare the Backroom password reset audit.');
        }
        AuthenticatedProfileCache::forget($profile->id);

        $restoreResetState = function () use ($profile, $resetAt): void {
            $restored = DB::table('profiles')
                ->where('id', $profile->id)
                ->where('password_reset_at', $resetAt)
                ->update([
                    'must_change_password' => $profile->must_change_password,
                    'password_changed_at' => $profile->password_changed_at,
                    'password_reset_at' => $profile->password_reset_at,
                    'updated_at' => now(),
                ]);
            if (! $restored) {
                Log::warning('Backroom password reset compensation skipped because a newer reset exists.', ['user_id' => $profile->id]);
            }
            AuthenticatedProfileCache::forget($profile->id);
        };

        try {
            $this->supabaseAdmin()->updatePassword($profile->id, $newPassword);
        } catch (Throwable $exception) {
            if ($exception instanceof SupabaseAdminException && $exception->status === 0) {
                DB::table('user_event_retries')->where('id', $auditRetryId)->update([
                    'status' => 'remote_unknown',
                    'available_at' => now(),
                    'last_error' => 'Supabase password update outcome is unknown; reconcile before retrying.',
                    'updated_at' => now(),
                ]);
                Log::critical('Supabase password reset outcome is unknown; manual reconciliation is required.', ['user_id' => $profile->id]);

                return response()->json(['ok' => false, 'audit_recorded' => false], 503);
            }

            try {
                DB::table('user_event_retries')->where('id', $auditRetryId)->update([
                    'status' => 'cancelled',
                    'last_error' => $exception->getMessage(),
                    'updated_at' => now(),
                ]);
            } catch (Throwable $cleanupException) {
                Log::critical('Unable to cancel failed Backroom password reset audit.', [
                    'user_id' => $profile->id,
                    'error' => $cleanupException->getMessage(),
                ]);
                $restoreResetState();
                throw $cleanupException;
            }
            $restoreResetState();
            Log::warning('Supabase rejected the Backroom password reset.', ['user_id' => $profile->id, 'status' => $exception instanceof SupabaseAdminException ? $exception->status : null]);
            abort(502, 'Unable to reset the Backroom password.');
        }

        try {
            DB::table('user_event_retries')->where('id', $auditRetryId)->update([
                'status' => 'confirmed',
                'available_at' => now(),
                'updated_at' => now(),
            ]);
            DB::transaction(function () use ($profile, $request, $auditRetryId): void {
                $this->userEvent($profile->id, $request->attributes->get('actor')->id, 'PASSWORD_RESET', ['ops_id' => $profile->ops_id]);
                DB::table('user_event_retries')->where('id', $auditRetryId)->delete();
            });
        } catch (Throwable $exception) {
            Log::critical('Backroom password reset audit failed after Supabase update.', ['user_id' => $profile->id, 'error' => $exception->getMessage()]);

            return response()->json(['ok' => true, 'initial_password' => $newPassword, 'audit_recorded' => false]);
        }

        return response()->json(['ok' => true, 'initial_password' => $newPassword]);
    }

    private function authorize(Request $request): void
    {
        abort_unless(in_array($request->attributes->get('actor')->role, ['fte_ops', 'fte_mm'], true), 403, 'Only FTE users can manage users.');
    }

    private function supabaseAdmin(): SupabaseAdminClient
    {
        return $this->supabaseAdmin ??= new SupabaseAdminClient;
    }

    private function userEvent(string $userId, string $actorId, string $type, array $metadata = []): void
    {
        DB::table('user_events')->insert(['user_id' => $userId, 'actor_id' => $actorId, 'event_type' => $type, 'metadata' => json_encode($metadata)]);
    }
}
