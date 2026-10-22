drop policy if exists intraday_dispatch_active_authenticated_read on public.intraday_dispatch;

create policy intraday_dispatch_active_authenticated_read
  on public.intraday_dispatch for select to authenticated using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active
    )
    and (select private.current_role()) in ('ops_pic', 'fte_ops', 'fte_mm', 'doc_officer')
  );
