drop policy if exists "read own active profile" on public.profiles;
create policy "read own active profile" on public.profiles for select using (
  is_active and (id = (select auth.uid()) or (select private.current_role()) in ('fte_ops','fte_mm'))
);

drop policy if exists "active users read clusters" on public.clusters;
create policy "active users read clusters" on public.clusters for select using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active)
);

drop policy if exists "active role-scoped request reads" on public.requests;
create policy "active role-scoped request reads" on public.requests for select using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active)
  and (created_by = (select auth.uid()) or (select private.current_role()) in ('fte_ops','fte_mm','doc_officer'))
);

drop policy if exists "active role-scoped event reads" on public.request_events;
create policy "active role-scoped event reads" on public.request_events for select using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active)
  and exists (
    select 1 from public.requests r
    where r.id = request_id
      and (r.created_by = (select auth.uid()) or (select private.current_role()) in ('fte_ops','fte_mm','doc_officer'))
  )
);

drop policy if exists "active own notifications" on public.notifications;
create policy "active own notifications" on public.notifications for select using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active)
  and (user_id = (select auth.uid()) or target_role = (select private.current_role()))
);

drop policy if exists intraday_dispatch_active_authenticated_read on public.intraday_dispatch;
create policy intraday_dispatch_active_authenticated_read
  on public.intraday_dispatch for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active)
    and (select private.current_role()) in ('fte_ops', 'fte_mm')
  );

drop policy if exists "active fte read user events" on public.user_events;
create policy "active fte read user events" on public.user_events for select using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active)
  and (select private.current_role()) in ('fte_ops','fte_mm')
);

drop policy if exists "own active notification receipts" on public.notification_reads;
create policy "own active notification receipts" on public.notification_reads for select using (
  user_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active)
);

drop index if exists public.clusters_cluster_name_uidx;
