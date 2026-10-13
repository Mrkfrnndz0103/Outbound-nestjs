create table if not exists public.workflow_outbox (
  id uuid primary key,
  idempotency_key text not null unique,
  aggregate_type text,
  aggregate_id text,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'DEAD_LETTER')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0 and attempts <= max_attempts),
  available_at timestamptz not null default now(),
  processing_started_at timestamptz,
  last_error text,
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_outbox_pending_idx
  on public.workflow_outbox (status, available_at);
create index if not exists workflow_outbox_aggregate_idx
  on public.workflow_outbox (aggregate_type, aggregate_id, status);

alter table public.notifications
  add column if not exists outbox_id uuid;

create unique index if not exists notifications_outbox_id_uidx
  on public.notifications (outbox_id)
  where outbox_id is not null;

alter table public.workflow_outbox enable row level security;
revoke all privileges on table public.workflow_outbox from public, anon, authenticated;
