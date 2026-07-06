-- MVP policies for authenticated development usage.
-- These policies are intentionally broad for the first functional MVP.
-- Before production, replace them with strict role-based policies.

create policy "authenticated_select_events"
  on public.events for select
  to authenticated
  using (true);

create policy "authenticated_insert_events"
  on public.events for insert
  to authenticated
  with check (true);

create policy "authenticated_update_events"
  on public.events for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_select_users"
  on public.users for select
  to authenticated
  using (true);

create policy "authenticated_insert_users"
  on public.users for insert
  to authenticated
  with check (true);

create policy "authenticated_update_users"
  on public.users for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_stores"
  on public.stores for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_prospectors"
  on public.prospectors for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_leads"
  on public.leads for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_street_surveys"
  on public.street_surveys for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_lead_activities"
  on public.lead_activities for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_appointments"
  on public.appointments for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_inventory"
  on public.inventory for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_sales"
  on public.sales for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_losses"
  on public.losses for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_read_banks"
  on public.banks for select
  to authenticated
  using (true);

create policy "authenticated_all_audit_logs"
  on public.audit_logs for all
  to authenticated
  using (true)
  with check (true);
