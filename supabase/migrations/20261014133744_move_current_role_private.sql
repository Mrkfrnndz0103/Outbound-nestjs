create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.current_role() returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

revoke all on function private.current_role() from public;
grant execute on function private.current_role() to anon, authenticated;

drop policy if exists "active account required" on public.profiles;
drop policy if exists "read own profile" on public.profiles;
drop policy if exists "read own active profile" on public.profiles;
create policy "active account required" on public.profiles for select using (
  (select private.current_role()) is not null
);
create policy "read own active profile" on public.profiles for select using (
  is_active and (id = auth.uid() or (select private.current_role()) in ('fte_ops','fte_mm'))
);

drop policy if exists "active account required" on public.requests;
drop policy if exists "role-scoped request reads" on public.requests;
drop policy if exists "active role-scoped request reads" on public.requests;
create policy "active account required" on public.requests for select using (
  (select private.current_role()) is not null
);
create policy "active role-scoped request reads" on public.requests for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
  and (created_by = auth.uid() or (select private.current_role()) in ('fte_ops','fte_mm','doc_officer'))
);

drop policy if exists "active account required" on public.request_events;
drop policy if exists "role-scoped event reads" on public.request_events;
drop policy if exists "active role-scoped event reads" on public.request_events;
create policy "active account required" on public.request_events for select using (
  (select private.current_role()) is not null
);
create policy "active role-scoped event reads" on public.request_events for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
  and exists (
    select 1 from public.requests r
    where r.id = request_id
      and (r.created_by = auth.uid() or (select private.current_role()) in ('fte_ops','fte_mm','doc_officer'))
  )
);

drop policy if exists "active account required" on public.notifications;
drop policy if exists "own notifications" on public.notifications;
drop policy if exists "active own notifications" on public.notifications;
create policy "active account required" on public.notifications for select using (
  (select private.current_role()) is not null
);
create policy "active own notifications" on public.notifications for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
  and (user_id = auth.uid() or target_role = (select private.current_role()))
);

drop policy if exists intraday_dispatch_authenticated_read on public.intraday_dispatch;
drop policy if exists intraday_dispatch_active_authenticated_read on public.intraday_dispatch;
create policy intraday_dispatch_active_authenticated_read
  on public.intraday_dispatch for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
    and (select private.current_role()) in ('fte_ops', 'fte_mm')
  );

drop policy if exists "fte read user events" on public.user_events;
drop policy if exists "active fte read user events" on public.user_events;
create policy "active fte read user events" on public.user_events for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
  and (select private.current_role()) in ('fte_ops','fte_mm')
);

drop policy if exists "own notification receipts" on public.notification_reads;
drop policy if exists "own active notification receipts" on public.notification_reads;
create policy "own active notification receipts" on public.notification_reads for select using (
  user_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
);

drop function public.current_role();
