-- Additive only: do not reinterpret historical CANCELLED or REROUTED records.
-- Apply before the backend release that writes REJECTED.
alter type public.request_status add value if not exists 'REJECTED';

alter table public.requests
  add column if not exists rejection_return_role varchar(24),
  add column if not exists cancellation_remarks text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'requests_rejection_return_role_check'
      and conrelid = 'public.requests'::regclass
  ) then
    alter table public.requests add constraint requests_rejection_return_role_check
      check (rejection_return_role is null or rejection_return_role in ('ops_pic', 'fte_ops'));
  end if;
end;
$$;
