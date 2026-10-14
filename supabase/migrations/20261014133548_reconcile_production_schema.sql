-- Reconcile production schema drift without rewriting historical migrations.

create table if not exists public.user_imports (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  name text not null,
  role public.user_role not null,
  email text unique,
  ops_id text unique,
  is_active boolean not null default true,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  check (email is not null or ops_id is not null)
);

alter table public.user_imports enable row level security;
revoke all privileges on table public.user_imports from public, anon, authenticated;

create table if not exists public.user_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null check (event_type in ('USER_CREATED','USER_UPDATED','USER_DISABLED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_events_user_created_idx
  on public.user_events(user_id, created_at desc);

alter table public.user_events enable row level security;
drop policy if exists "fte read user events" on public.user_events;
drop policy if exists "active fte read user events" on public.user_events;
create policy "active fte read user events"
  on public.user_events for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
    and public.current_role() in ('fte_ops','fte_mm')
  );

drop policy if exists "read own profile" on public.profiles;
drop policy if exists "read own active profile" on public.profiles;
create policy "read own active profile" on public.profiles for select using (
  is_active and (id = auth.uid() or public.current_role() in ('fte_ops','fte_mm'))
);

drop policy if exists "authenticated read clusters" on public.clusters;
drop policy if exists "active users read clusters" on public.clusters;
create policy "active users read clusters" on public.clusters for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
);

drop policy if exists "role-scoped request reads" on public.requests;
drop policy if exists "active role-scoped request reads" on public.requests;
create policy "active role-scoped request reads" on public.requests for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
  and (created_by = auth.uid() or public.current_role() in ('fte_ops','fte_mm','doc_officer'))
);

drop policy if exists "role-scoped event reads" on public.request_events;
drop policy if exists "active role-scoped event reads" on public.request_events;
create policy "active role-scoped event reads" on public.request_events for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
  and exists (
    select 1 from public.requests r
    where r.id = request_id
      and (r.created_by = auth.uid() or public.current_role() in ('fte_ops','fte_mm','doc_officer'))
  )
);

drop policy if exists "own notifications" on public.notifications;
drop policy if exists "active own notifications" on public.notifications;
create policy "active own notifications" on public.notifications for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
  and (user_id = auth.uid() or target_role = public.current_role())
);

drop policy if exists intraday_dispatch_authenticated_read on public.intraday_dispatch;
drop policy if exists intraday_dispatch_active_authenticated_read on public.intraday_dispatch;
create policy intraday_dispatch_active_authenticated_read
  on public.intraday_dispatch for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
    and public.current_role() in ('fte_ops', 'fte_mm')
  );

drop policy if exists "own notification receipts" on public.notification_reads;
drop policy if exists "own active notification receipts" on public.notification_reads;
create policy "own active notification receipts"
  on public.notification_reads for select using (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
  );

revoke all privileges on function public.provision_staged_fte() from public, anon, authenticated;

create index if not exists approval_routing_cursors_cursor_profile_id_idx
  on public.approval_routing_cursors(cursor_profile_id);
create index if not exists notifications_request_id_idx
  on public.notifications(request_id);
create index if not exists request_events_actor_id_idx
  on public.request_events(actor_id);
create index if not exists requests_approved_by_idx
  on public.requests(approved_by);
create index if not exists requests_rejected_by_idx
  on public.requests(rejected_by);
create index if not exists seatalk_assignments_item_id_idx
  on public.seatalk_approval_assignments(seatalk_approval_item_id);
create index if not exists seatalk_callback_assignment_id_idx
  on public.seatalk_callback_events(assignment_id);
