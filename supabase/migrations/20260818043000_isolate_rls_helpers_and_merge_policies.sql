begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

-- Os helpers SECURITY DEFINER continuam necessários para evitar recursão na
-- RLS de users, mas deixam o schema public exposto pela Data API. Dependências
-- existentes acompanham o mesmo OID; wrappers SECURITY INVOKER preservam
-- compatibilidade com SQL legado sem reabrir execução anônima.
do $$
begin
  if to_regprocedure('private.current_app_role()') is null then
    alter function public.current_app_role() set schema private;
  end if;
  if to_regprocedure('private.current_app_store_id()') is null then
    alter function public.current_app_store_id() set schema private;
  end if;
  if to_regprocedure('private.current_app_user_id()') is null then
    alter function public.current_app_user_id() set schema private;
  end if;
  if to_regprocedure('private.current_app_user()') is null then
    alter function public.current_app_user() set schema private;
  end if;
  if to_regprocedure('private.is_master()') is null then
    alter function public.is_master() set schema private;
  end if;
  if to_regprocedure('private.is_store_user()') is null then
    alter function public.is_store_user() set schema private;
  end if;
  if to_regprocedure('private.is_commercial_team()') is null then
    alter function public.is_commercial_team() set schema private;
  end if;
end;
$$;

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.users
  where auth_user_id = (select auth.uid())
     or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  order by case when auth_user_id = (select auth.uid()) then 0 else 1 end
  limit 1;
$$;

create or replace function private.current_app_store_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select store_id
  from public.users
  where auth_user_id = (select auth.uid())
     or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  order by case when auth_user_id = (select auth.uid()) then 0 else 1 end
  limit 1;
$$;

create or replace function private.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.users
  where auth_user_id = (select auth.uid())
     or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  order by case when auth_user_id = (select auth.uid()) then 0 else 1 end
  limit 1;
$$;

create or replace function private.current_app_user()
returns public.users
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result public.users;
begin
  select *
  into result
  from public.users
  where auth_user_id = (select auth.uid())
     or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  order by case when auth_user_id = (select auth.uid()) then 0 else 1 end
  limit 1;
  return result;
end;
$$;

create or replace function private.is_master()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private.current_app_role(), '') = 'master'; $$;

create or replace function private.is_store_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private.current_app_role(), '') = 'store'; $$;

create or replace function private.is_commercial_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private.current_app_role(), '') in ('prospector', 'pre_sales'); $$;

create or replace function public.current_app_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select private.current_app_role(); $$;

create or replace function public.current_app_store_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$ select private.current_app_store_id(); $$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$ select private.current_app_user_id(); $$;

create or replace function public.current_app_user()
returns public.users
language sql
stable
security invoker
set search_path = ''
as $$ select private.current_app_user(); $$;

create or replace function public.is_master()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_master(); $$;

create or replace function public.is_store_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_store_user(); $$;

create or replace function public.is_commercial_team()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_commercial_team(); $$;

grant usage on schema private to authenticated, service_role;
revoke all on function
  private.current_app_role(),
  private.current_app_store_id(),
  private.current_app_user_id(),
  private.current_app_user(),
  private.is_master(),
  private.is_store_user(),
  private.is_commercial_team()
from public, anon;
grant execute on function
  private.current_app_role(),
  private.current_app_store_id(),
  private.current_app_user_id(),
  private.current_app_user(),
  private.is_master(),
  private.is_store_user(),
  private.is_commercial_team()
to authenticated, service_role;

revoke all on function
  public.current_app_role(),
  public.current_app_store_id(),
  public.current_app_user_id(),
  public.current_app_user(),
  public.is_master(),
  public.is_store_user(),
  public.is_commercial_team()
from public, anon;
grant execute on function
  public.current_app_role(),
  public.current_app_store_id(),
  public.current_app_user_id(),
  public.current_app_user(),
  public.is_master(),
  public.is_store_user(),
  public.is_commercial_team()
to authenticated, service_role;

-- Evita InitPlan por linha e mantém a mesma regra de visibilidade de users.
drop policy if exists secure_users_select on public.users;
create policy secure_users_select
on public.users for select to authenticated
using (
  (select private.is_master())
  or auth_user_id = (select auth.uid())
  or lower(email::text) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  or (
    store_id = (select private.current_app_store_id())
    and (select private.current_app_role()) in ('store','pre_sales','seller','prospector')
  )
);

drop policy if exists whatsapp_numbers_master_all on public.whatsapp_numbers;
create policy whatsapp_numbers_master_all
on public.whatsapp_numbers for all to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = (select auth.uid())
      and u.role = 'master'
      and u.status = 'active'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = (select auth.uid())
      and u.role = 'master'
      and u.status = 'active'
  )
);

-- Uma policy por ação/role evita avaliações permissivas duplicadas sem mudar
-- o alcance: Master administra; loja vê o próprio vínculo; anon vê publicação.
drop policy if exists event_vehicle_assignments_master_all on public.event_vehicle_assignments;
drop policy if exists event_vehicle_assignments_store_select_own on public.event_vehicle_assignments;
drop policy if exists event_vehicle_assignments_authenticated_select on public.event_vehicle_assignments;
drop policy if exists event_vehicle_assignments_master_insert on public.event_vehicle_assignments;
drop policy if exists event_vehicle_assignments_master_update on public.event_vehicle_assignments;
drop policy if exists event_vehicle_assignments_master_delete on public.event_vehicle_assignments;

create policy event_vehicle_assignments_authenticated_select
on public.event_vehicle_assignments for select to authenticated
using ((select private.is_master()) or store_id = (select private.current_app_store_id()));
create policy event_vehicle_assignments_master_insert
on public.event_vehicle_assignments for insert to authenticated
with check ((select private.is_master()));
create policy event_vehicle_assignments_master_update
on public.event_vehicle_assignments for update to authenticated
using ((select private.is_master())) with check ((select private.is_master()));
create policy event_vehicle_assignments_master_delete
on public.event_vehicle_assignments for delete to authenticated
using ((select private.is_master()));

drop policy if exists site_campaigns_master_all on public.site_campaigns;
drop policy if exists site_campaigns_public_select on public.site_campaigns;
drop policy if exists site_campaigns_anon_select on public.site_campaigns;
drop policy if exists site_campaigns_authenticated_select on public.site_campaigns;
drop policy if exists site_campaigns_master_insert on public.site_campaigns;
drop policy if exists site_campaigns_master_update on public.site_campaigns;
drop policy if exists site_campaigns_master_delete on public.site_campaigns;

create policy site_campaigns_anon_select
on public.site_campaigns for select to anon using (is_active = true);
create policy site_campaigns_authenticated_select
on public.site_campaigns for select to authenticated
using ((select private.is_master()) or is_active = true);
create policy site_campaigns_master_insert
on public.site_campaigns for insert to authenticated
with check ((select private.is_master()));
create policy site_campaigns_master_update
on public.site_campaigns for update to authenticated
using ((select private.is_master())) with check ((select private.is_master()));
create policy site_campaigns_master_delete
on public.site_campaigns for delete to authenticated
using ((select private.is_master()));

drop policy if exists site_vehicles_master_all on public.site_vehicles;
drop policy if exists site_vehicles_public_select on public.site_vehicles;
drop policy if exists site_vehicles_store_select_own on public.site_vehicles;
drop policy if exists site_vehicles_store_insert_own on public.site_vehicles;
drop policy if exists site_vehicles_store_update_own on public.site_vehicles;
drop policy if exists site_vehicles_anon_select on public.site_vehicles;
drop policy if exists site_vehicles_authenticated_select on public.site_vehicles;
drop policy if exists site_vehicles_authenticated_insert on public.site_vehicles;
drop policy if exists site_vehicles_authenticated_update on public.site_vehicles;
drop policy if exists site_vehicles_master_delete on public.site_vehicles;

create policy site_vehicles_anon_select
on public.site_vehicles for select to anon
using (show_on_landing = true and status = 'disponivel' and price > 0);
create policy site_vehicles_authenticated_select
on public.site_vehicles for select to authenticated
using (
  (select private.is_master())
  or (show_on_landing = true and status = 'disponivel' and price > 0)
  or ((select private.current_app_role()) = 'store' and store_id = (select private.current_app_store_id()))
);
create policy site_vehicles_authenticated_insert
on public.site_vehicles for insert to authenticated
with check (
  (select private.is_master())
  or ((select private.current_app_role()) = 'store' and store_id = (select private.current_app_store_id()))
);
create policy site_vehicles_authenticated_update
on public.site_vehicles for update to authenticated
using (
  (select private.is_master())
  or ((select private.current_app_role()) = 'store' and store_id = (select private.current_app_store_id()))
)
with check (
  (select private.is_master())
  or ((select private.current_app_role()) = 'store' and store_id = (select private.current_app_store_id()))
);
create policy site_vehicles_master_delete
on public.site_vehicles for delete to authenticated
using ((select private.is_master()));

commit;
