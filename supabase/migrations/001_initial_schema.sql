create extension if not exists pgcrypto;

create type public.user_role as enum ('ops_pic','fte_ops','fte_mm','doc_officer');
create type public.request_status as enum (
  'PENDING','APPROVED','CANCELLED','REJECTED_BY_MM','ASSIGNED',
  'FOR_DOCKING','DOCKED','CONFIRMED'
);
create type public.truck_size as enum ('4W','6W','10W','6WF','4WAUV','4WCV');
create type public.truck_type as enum ('WETLEASE','DRYLEASE');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  role public.user_role not null,
  ops_id text unique,
  email text unique,
  is_fte boolean generated always as (role in ('fte_ops','fte_mm')) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role = 'ops_pic' and ops_id is not null) or email is not null)
);

create table public.clusters (
  id uuid primary key default gen_random_uuid(),
  cluster_name text not null,
  hub_name text not null,
  region text not null,
  dock_number text not null,
  backlogs integer not null default 0 check (backlogs >= 0),
  backlogs_ts timestamptz,
  unique(cluster_name, hub_name, dock_number)
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  request_timestamp timestamptz not null default now(),
  cluster_id uuid references public.clusters(id),
  cluster text not null,
  region text not null,
  dock_no text not null,
  backlogs integer not null default 0 check (backlogs >= 0),
  backlogs_timestamp timestamptz,
  ob_fte text,
  ob_ops_pic text,
  midmile_fte text,
  truck_size public.truck_size not null,
  truck_type public.truck_type not null,
  plate_number text,
  provide_time timestamptz,
  linehaul_trip_no text,
  docked_time timestamptz,
  status public.request_status not null default 'PENDING',
  rejection_remarks text,
  driver_id text,
  created_by uuid not null references public.profiles(id),
  approved_at timestamptz,
  rejected_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests(id) on delete cascade,
  event_type text not null,
  actor_id uuid references public.profiles(id),
  from_status public.request_status,
  to_status public.request_status,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  target_role public.user_role,
  request_id uuid references public.requests(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (user_id is not null or target_role is not null)
);

create index requests_status_created_idx on public.requests(status, created_at desc);
create index requests_creator_created_idx on public.requests(created_by, created_at desc);
create index request_events_request_created_idx on public.request_events(request_id, created_at desc);
create index notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index notifications_role_unread_idx on public.notifications(target_role, created_at desc) where read_at is null;

create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger requests_updated_at before update on public.requests
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.clusters enable row level security;
alter table public.requests enable row level security;
alter table public.request_events enable row level security;
alter table public.notifications enable row level security;

create function public.current_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create policy "read own profile" on public.profiles for select
using (id = auth.uid() or public.current_role() in ('fte_ops','fte_mm'));
create policy "authenticated read clusters" on public.clusters for select
using (auth.uid() is not null);
create policy "role-scoped request reads" on public.requests for select using (
  created_by = auth.uid() or public.current_role() in ('fte_ops','fte_mm','doc_officer')
);
create policy "role-scoped event reads" on public.request_events for select using (
  exists (select 1 from public.requests r where r.id = request_id and
    (r.created_by = auth.uid() or public.current_role() in ('fte_ops','fte_mm','doc_officer')))
);
create policy "own notifications" on public.notifications for select using (
  user_id = auth.uid() or target_role = public.current_role()
);

-- Protected writes intentionally have no browser RLS policy; Laravel uses the
-- service role after validating authentication, authorization, and transitions.
alter publication supabase_realtime add table public.notifications;
