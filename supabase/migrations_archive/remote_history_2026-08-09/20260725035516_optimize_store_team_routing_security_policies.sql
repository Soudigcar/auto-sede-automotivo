create index if not exists lead_assignment_logs_from_user_idx
  on public.lead_assignment_logs (from_user_id);
create index if not exists lead_assignment_logs_assigned_by_user_idx
  on public.lead_assignment_logs (assigned_by_user_id);
create index if not exists store_team_routing_state_last_user_idx
  on public.store_team_routing_state (last_user_id);
create index if not exists prospectors_user_id_idx
  on public.prospectors (user_id);

-- Evita que a política de serviço seja considerada permissiva para todos os papéis.
drop policy if exists lead_activity_logs_service_role_all on public.lead_activity_logs;
create policy lead_activity_logs_service_role_all
on public.lead_activity_logs for all to service_role
using (true) with check (true);

-- Avalia os dados de autenticação uma única vez por consulta.
drop policy if exists secure_users_select on public.users;
create policy secure_users_select
on public.users for select to authenticated
using (
  public.is_master()
  or auth_user_id = (select auth.uid())
  or lower(email::text) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  or (
    store_id = public.current_app_store_id()
    and public.current_app_role() in ('store','pre_sales','seller','prospector')
  )
);

