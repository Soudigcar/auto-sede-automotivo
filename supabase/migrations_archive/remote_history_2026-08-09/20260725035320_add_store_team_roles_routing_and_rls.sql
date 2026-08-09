create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role::text = any (array['master','store','pre_sales','seller','prospector']::text[]));

alter table public.users
  add column if not exists receives_leads boolean not null default false,
  add column if not exists routing_order integer not null default 0,
  add column if not exists max_open_leads integer;

alter table public.users
  drop constraint if exists users_max_open_leads_check;
alter table public.users
  add constraint users_max_open_leads_check
  check (max_open_leads is null or max_open_leads >= 0);

alter table public.users
  drop constraint if exists users_store_role_requires_store;
alter table public.users
  add constraint users_store_role_requires_store
  check (role = 'master' or store_id is not null);

alter table public.prospectors
  add column if not exists store_id uuid references public.stores(id) on delete set null;

update public.prospectors p
set store_id = u.store_id
from public.users u
where p.user_id = u.id
  and p.store_id is null
  and u.store_id is not null;

alter table public.leads
  add column if not exists captured_by_user_id uuid,
  add column if not exists pre_sales_user_id uuid,
  add column if not exists pre_sales_assigned_at timestamptz,
  add column if not exists seller_user_id uuid,
  add column if not exists seller_assigned_at timestamptz,
  add column if not exists assigned_user_id uuid,
  add column if not exists assigned_user_role text,
  add column if not exists assigned_user_at timestamptz,
  add column if not exists assignment_source text;

alter table public.leads
  drop constraint if exists leads_captured_by_user_id_fkey,
  drop constraint if exists leads_pre_sales_user_id_fkey,
  drop constraint if exists leads_seller_user_id_fkey,
  drop constraint if exists leads_assigned_user_id_fkey,
  drop constraint if exists leads_assigned_user_role_check;

alter table public.leads
  add constraint leads_captured_by_user_id_fkey foreign key (captured_by_user_id) references public.users(id) on delete set null,
  add constraint leads_pre_sales_user_id_fkey foreign key (pre_sales_user_id) references public.users(id) on delete set null,
  add constraint leads_seller_user_id_fkey foreign key (seller_user_id) references public.users(id) on delete set null,
  add constraint leads_assigned_user_id_fkey foreign key (assigned_user_id) references public.users(id) on delete set null,
  add constraint leads_assigned_user_role_check check (assigned_user_role is null or assigned_user_role in ('pre_sales','seller','prospector'));

alter table public.leads_base
  drop constraint if exists leads_base_assigned_consultant_id_fkey;
alter table public.leads_base
  add constraint leads_base_assigned_consultant_id_fkey
  foreign key (assigned_consultant_id) references public.users(id) on delete set null;

create index if not exists users_store_role_distribution_idx
  on public.users (store_id, role, status, receives_leads, routing_order, full_name, id);
create index if not exists prospectors_store_user_idx
  on public.prospectors (store_id, user_id);
create index if not exists leads_captured_by_user_idx
  on public.leads (captured_by_user_id, created_at desc);
create index if not exists leads_pre_sales_user_idx
  on public.leads (pre_sales_user_id, status, created_at desc);
create index if not exists leads_seller_user_idx
  on public.leads (seller_user_id, status, created_at desc);
create index if not exists leads_assigned_user_idx
  on public.leads (assigned_user_id, status, created_at desc);
create index if not exists leads_store_assigned_user_idx
  on public.leads (assigned_store_id, assigned_user_id, status, created_at desc);
create index if not exists leads_base_assigned_consultant_idx
  on public.leads_base (assigned_consultant_id, created_at desc);

create table if not exists public.store_team_routing_state (
  store_id uuid not null references public.stores(id) on delete cascade,
  role text not null check (role in ('pre_sales','seller')),
  last_user_id uuid references public.users(id) on delete set null,
  last_position integer not null default -1,
  last_routed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (store_id, role)
);

create table if not exists public.lead_assignment_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('pre_sales','seller','prospector')),
  from_user_id uuid references public.users(id) on delete set null,
  to_user_id uuid references public.users(id) on delete set null,
  assignment_mode text not null default 'round_robin' check (assignment_mode in ('round_robin','manual','system')),
  assigned_by_user_id uuid references public.users(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_assignment_logs_lead_created_idx
  on public.lead_assignment_logs (lead_id, created_at desc);
create index if not exists lead_assignment_logs_store_created_idx
  on public.lead_assignment_logs (store_id, created_at desc);
create index if not exists lead_assignment_logs_to_user_created_idx
  on public.lead_assignment_logs (to_user_id, created_at desc);

alter table public.store_team_routing_state enable row level security;
alter table public.lead_assignment_logs enable row level security;

create or replace function private.can_manage_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(public.is_master(), false)
    or (
      coalesce(public.current_app_role(), '') = 'store'
      and public.current_app_store_id() = p_store_id
    );
$$;

create or replace function private.can_access_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and (
        coalesce(public.is_master(), false)
        or (
          public.current_app_role() = 'store'
          and l.assigned_store_id = public.current_app_store_id()
        )
        or (
          public.current_app_role() = 'pre_sales'
          and l.assigned_store_id = public.current_app_store_id()
          and (
            l.pre_sales_user_id = public.current_app_user_id()
            or l.assigned_user_id = public.current_app_user_id()
          )
        )
        or (
          public.current_app_role() = 'seller'
          and l.assigned_store_id = public.current_app_store_id()
          and (
            l.seller_user_id = public.current_app_user_id()
            or l.assigned_user_id = public.current_app_user_id()
          )
        )
        or (
          public.current_app_role() = 'prospector'
          and l.assigned_store_id = public.current_app_store_id()
          and (
            l.captured_by_user_id = public.current_app_user_id()
            or l.assigned_user_id = public.current_app_user_id()
          )
        )
      )
  );
$$;

create or replace function private.is_own_prospector(p_prospector_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.prospectors p
    where p.id = p_prospector_id
      and p.user_id = public.current_app_user_id()
  );
$$;

revoke all on function private.can_manage_store(uuid) from public, anon;
revoke all on function private.can_access_lead(uuid) from public, anon;
revoke all on function private.is_own_prospector(uuid) from public, anon;
grant execute on function private.can_manage_store(uuid) to authenticated, service_role;
grant execute on function private.can_access_lead(uuid) to authenticated, service_role;
grant execute on function private.is_own_prospector(uuid) to authenticated, service_role;

create or replace function public.validate_lead_team_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_store_id uuid;
  v_status text;
  v_changed boolean;
  v_assignment_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_assignment_changed :=
      new.captured_by_user_id is distinct from old.captured_by_user_id
      or new.pre_sales_user_id is distinct from old.pre_sales_user_id
      or new.seller_user_id is distinct from old.seller_user_id
      or new.assigned_user_id is distinct from old.assigned_user_id
      or new.assigned_user_role is distinct from old.assigned_user_role
      or new.assigned_store_id is distinct from old.assigned_store_id;

    if v_assignment_changed
       and coalesce(auth.role(), '') <> 'service_role'
       and not coalesce(public.is_master(), false)
       and not (
         public.current_app_role() = 'store'
         and public.current_app_store_id() = new.assigned_store_id
       ) then
      raise exception 'Somente o gestor da loja pode alterar a atribuição do lead.';
    end if;
  end if;

  if new.assigned_store_id is null and (
    new.captured_by_user_id is not null
    or new.pre_sales_user_id is not null
    or new.seller_user_id is not null
    or new.assigned_user_id is not null
  ) then
    raise exception 'Não é possível atribuir colaborador sem loja responsável.';
  end if;

  if new.captured_by_user_id is not null then
    select u.role, u.store_id, u.status into v_role, v_store_id, v_status
    from public.users u where u.id = new.captured_by_user_id;
    if not found or v_role <> 'prospector' or v_store_id is distinct from new.assigned_store_id then
      raise exception 'Prospectador inválido para esta loja.';
    end if;
    v_changed := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then
      v_changed := new.captured_by_user_id is distinct from old.captured_by_user_id;
    end if;
    if v_changed and v_status <> 'active' then
      raise exception 'O prospectador selecionado não está ativo.';
    end if;
  end if;

  if new.pre_sales_user_id is not null then
    select u.role, u.store_id, u.status into v_role, v_store_id, v_status
    from public.users u where u.id = new.pre_sales_user_id;
    if not found or v_role <> 'pre_sales' or v_store_id is distinct from new.assigned_store_id then
      raise exception 'Pré-vendas inválido para esta loja.';
    end if;
    v_changed := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then
      v_changed := new.pre_sales_user_id is distinct from old.pre_sales_user_id;
    end if;
    if v_changed and v_status <> 'active' then
      raise exception 'O pré-vendas selecionado não está ativo.';
    end if;
  end if;

  if new.seller_user_id is not null then
    select u.role, u.store_id, u.status into v_role, v_store_id, v_status
    from public.users u where u.id = new.seller_user_id;
    if not found or v_role <> 'seller' or v_store_id is distinct from new.assigned_store_id then
      raise exception 'Vendedor inválido para esta loja.';
    end if;
    v_changed := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then
      v_changed := new.seller_user_id is distinct from old.seller_user_id;
    end if;
    if v_changed and v_status <> 'active' then
      raise exception 'O vendedor selecionado não está ativo.';
    end if;
  end if;

  if (new.assigned_user_id is null) is distinct from (new.assigned_user_role is null) then
    raise exception 'Responsável e cargo da atribuição devem ser informados juntos.';
  end if;

  if new.assigned_user_id is not null then
    select u.role, u.store_id, u.status into v_role, v_store_id, v_status
    from public.users u where u.id = new.assigned_user_id;
    if not found
       or v_role <> new.assigned_user_role
       or v_store_id is distinct from new.assigned_store_id then
      raise exception 'Responsável atual inválido para esta loja ou cargo.';
    end if;

    if new.assigned_user_role = 'pre_sales' and new.assigned_user_id is distinct from new.pre_sales_user_id then
      raise exception 'O responsável atual deve ser o pré-vendas informado.';
    elsif new.assigned_user_role = 'seller' and new.assigned_user_id is distinct from new.seller_user_id then
      raise exception 'O responsável atual deve ser o vendedor informado.';
    elsif new.assigned_user_role = 'prospector' and new.assigned_user_id is distinct from new.captured_by_user_id then
      raise exception 'O responsável atual deve ser o prospectador informado.';
    end if;

    v_changed := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then
      v_changed := new.assigned_user_id is distinct from old.assigned_user_id;
    end if;
    if v_changed and v_status <> 'active' then
      raise exception 'O responsável selecionado não está ativo.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_lead_team_assignment() from public, anon, authenticated;

drop trigger if exists trg_validate_lead_team_assignment on public.leads;
create trigger trg_validate_lead_team_assignment
before insert or update on public.leads
for each row execute function public.validate_lead_team_assignment();

create or replace function public.assign_lead_to_store_team(
  p_lead_id uuid,
  p_role text,
  p_requested_user_id uuid default null,
  p_assignment_mode text default 'round_robin',
  p_assigned_by_user_id uuid default null,
  p_notes text default null
)
returns table(
  lead_id uuid,
  store_id uuid,
  user_id uuid,
  user_name text,
  assigned_role text,
  assignment_mode text,
  route_position integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_selected_user_id uuid;
  v_selected_user_name text;
  v_previous_user_id uuid;
  v_last_user_id uuid;
  v_total integer;
  v_last_position integer;
  v_next_position integer;
  v_mode text;
  v_actor_name text;
  v_store_name text;
begin
  v_mode := lower(coalesce(nullif(trim(p_assignment_mode), ''), 'round_robin'));

  if p_role not in ('pre_sales','seller') then
    raise exception 'Cargo de distribuição inválido.';
  end if;

  if v_mode not in ('round_robin','manual','system') then
    raise exception 'Modo de distribuição inválido.';
  end if;

  select l.* into v_lead
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead não encontrado.';
  end if;

  if v_lead.assigned_store_id is null then
    raise exception 'Lead sem loja responsável.';
  end if;

  if p_requested_user_id is not null then
    select u.id, u.full_name
      into v_selected_user_id, v_selected_user_name
    from public.users u
    where u.id = p_requested_user_id
      and u.store_id = v_lead.assigned_store_id
      and u.role = p_role
      and u.status = 'active';

    if not found then
      raise exception 'Colaborador solicitado não está ativo, não pertence à loja ou possui cargo diferente.';
    end if;

    if v_mode = 'round_robin' then
      v_mode := 'manual';
    end if;
  else
    insert into public.store_team_routing_state (store_id, role, last_position)
    values (v_lead.assigned_store_id, p_role, -1)
    on conflict (store_id, role) do nothing;

    select s.last_user_id
      into v_last_user_id
    from public.store_team_routing_state s
    where s.store_id = v_lead.assigned_store_id
      and s.role = p_role
    for update;

    with eligible as (
      select
        u.id,
        row_number() over (order by u.routing_order asc, u.full_name asc, u.id asc)::integer - 1 as route_position
      from public.users u
      where u.store_id = v_lead.assigned_store_id
        and u.role = p_role
        and u.status = 'active'
        and u.receives_leads = true
        and (
          u.max_open_leads is null
          or (
            select count(*)
            from public.leads open_lead
            where open_lead.assigned_user_id = u.id
              and open_lead.status not in ('sale_confirmed','lost')
          ) < u.max_open_leads
        )
    )
    select count(*) into v_total from eligible;

    if v_total = 0 then
      return;
    end if;

    with eligible as (
      select
        u.id,
        row_number() over (order by u.routing_order asc, u.full_name asc, u.id asc)::integer - 1 as route_position
      from public.users u
      where u.store_id = v_lead.assigned_store_id
        and u.role = p_role
        and u.status = 'active'
        and u.receives_leads = true
        and (
          u.max_open_leads is null
          or (
            select count(*)
            from public.leads open_lead
            where open_lead.assigned_user_id = u.id
              and open_lead.status not in ('sale_confirmed','lost')
          ) < u.max_open_leads
        )
    )
    select e.route_position into v_last_position
    from eligible e
    where e.id = v_last_user_id;

    if v_last_position is null then
      v_next_position := 0;
    else
      v_next_position := (v_last_position + 1) % v_total;
    end if;

    with eligible as (
      select
        u.id,
        u.full_name,
        row_number() over (order by u.routing_order asc, u.full_name asc, u.id asc)::integer - 1 as route_position
      from public.users u
      where u.store_id = v_lead.assigned_store_id
        and u.role = p_role
        and u.status = 'active'
        and u.receives_leads = true
        and (
          u.max_open_leads is null
          or (
            select count(*)
            from public.leads open_lead
            where open_lead.assigned_user_id = u.id
              and open_lead.status not in ('sale_confirmed','lost')
          ) < u.max_open_leads
        )
    )
    select e.id, e.full_name
      into v_selected_user_id, v_selected_user_name
    from eligible e
    where e.route_position = v_next_position;

    update public.store_team_routing_state s
    set last_user_id = v_selected_user_id,
        last_position = v_next_position,
        last_routed_at = now(),
        updated_at = now()
    where s.store_id = v_lead.assigned_store_id
      and s.role = p_role;
  end if;

  if p_role = 'pre_sales' then
    v_previous_user_id := v_lead.pre_sales_user_id;

    update public.leads l
    set pre_sales_user_id = v_selected_user_id,
        pre_sales_assigned_at = now(),
        assigned_user_id = v_selected_user_id,
        assigned_user_role = 'pre_sales',
        assigned_user_at = now(),
        assignment_source = v_mode,
        updated_at = now()
    where l.id = v_lead.id;
  else
    v_previous_user_id := v_lead.seller_user_id;

    update public.leads l
    set seller_user_id = v_selected_user_id,
        seller_assigned_at = now(),
        assigned_user_id = v_selected_user_id,
        assigned_user_role = 'seller',
        assigned_user_at = now(),
        assignment_source = v_mode,
        updated_at = now()
    where l.id = v_lead.id;
  end if;

  update public.leads_base lb
  set assigned_consultant_id = v_selected_user_id,
      updated_at = now()
  where lb.routed_lead_id = v_lead.id;

  insert into public.lead_assignment_logs (
    lead_id,
    store_id,
    assignment_role,
    from_user_id,
    to_user_id,
    assignment_mode,
    assigned_by_user_id,
    notes,
    metadata
  ) values (
    v_lead.id,
    v_lead.assigned_store_id,
    p_role,
    v_previous_user_id,
    v_selected_user_id,
    v_mode,
    p_assigned_by_user_id,
    p_notes,
    jsonb_build_object('route_position', v_next_position)
  );

  select u.full_name into v_actor_name
  from public.users u where u.id = p_assigned_by_user_id;

  select s.store_name into v_store_name
  from public.stores s where s.id = v_lead.assigned_store_id;

  insert into public.lead_activity_logs (
    lead_id,
    store_id,
    store_name,
    user_id,
    user_name,
    activity_type,
    activity_label,
    from_status,
    to_status,
    customer_name,
    customer_phone,
    vehicle_name,
    notes,
    metadata
  ) values (
    v_lead.id,
    v_lead.assigned_store_id,
    v_store_name,
    p_assigned_by_user_id,
    v_actor_name,
    case when p_role = 'pre_sales' then 'lead_assigned_pre_sales' else 'lead_assigned_seller' end,
    case when p_role = 'pre_sales' then 'Lead distribuído para pré-vendas' else 'Lead direcionado para vendedor' end,
    v_lead.status,
    v_lead.status,
    v_lead.customer_name,
    v_lead.customer_phone,
    v_lead.interested_vehicle,
    coalesce(p_notes, 'Responsável: ' || v_selected_user_name),
    jsonb_build_object(
      'assigned_user_id', v_selected_user_id,
      'assigned_user_name', v_selected_user_name,
      'assigned_role', p_role,
      'assignment_mode', v_mode,
      'route_position', v_next_position
    )
  );

  return query
  select
    v_lead.id,
    v_lead.assigned_store_id,
    v_selected_user_id,
    v_selected_user_name,
    p_role,
    v_mode,
    v_next_position;
end;
$$;

revoke all on function public.assign_lead_to_store_team(uuid,text,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.assign_lead_to_store_team(uuid,text,uuid,text,uuid,text) to service_role;

-- Usuários: Master vê tudo; demais veem a si mesmos e a equipe da própria loja.
drop policy if exists secure_users_select on public.users;
create policy secure_users_select
on public.users for select to authenticated
using (
  public.is_master()
  or auth_user_id = auth.uid()
  or lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or (
    store_id = public.current_app_store_id()
    and public.current_app_role() in ('store','pre_sales','seller','prospector')
  )
);

-- Leads: acesso por loja para gestor e por responsabilidade individual para a equipe.
drop policy if exists secure_leads_select on public.leads;
drop policy if exists secure_leads_insert on public.leads;
drop policy if exists secure_leads_update on public.leads;
drop policy if exists secure_leads_delete_master on public.leads;

create policy secure_leads_select
on public.leads for select to authenticated
using (private.can_access_lead(id));

create policy secure_leads_insert
on public.leads for insert to authenticated
with check (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and assigned_store_id = public.current_app_store_id()
  )
  or (
    public.current_app_role() = 'prospector'
    and assigned_store_id = public.current_app_store_id()
    and captured_by_user_id = public.current_app_user_id()
    and (assigned_user_id is null or assigned_user_id = public.current_app_user_id())
  )
);

create policy secure_leads_update
on public.leads for update to authenticated
using (private.can_access_lead(id))
with check (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and assigned_store_id = public.current_app_store_id()
  )
  or (
    public.current_app_role() = 'pre_sales'
    and assigned_store_id = public.current_app_store_id()
    and (pre_sales_user_id = public.current_app_user_id() or assigned_user_id = public.current_app_user_id())
  )
  or (
    public.current_app_role() = 'seller'
    and assigned_store_id = public.current_app_store_id()
    and (seller_user_id = public.current_app_user_id() or assigned_user_id = public.current_app_user_id())
  )
  or (
    public.current_app_role() = 'prospector'
    and assigned_store_id = public.current_app_store_id()
    and (captured_by_user_id = public.current_app_user_id() or assigned_user_id = public.current_app_user_id())
  )
);

create policy secure_leads_delete_manager
on public.leads for delete to authenticated
using (public.is_master() or private.can_manage_store(assigned_store_id));

-- Base central: somente Master lê ou altera. A política pública de captação permanece.
drop policy if exists "Authenticated can read leads" on public.leads_base;
drop policy if exists "Authenticated can update leads" on public.leads_base;
create policy leads_base_master_select
on public.leads_base for select to authenticated
using (public.is_master());
create policy leads_base_master_update
on public.leads_base for update to authenticated
using (public.is_master())
with check (public.is_master());

-- Histórico e atividades seguem a mesma visibilidade do lead.
drop policy if exists secure_lead_activities_select on public.lead_activities;
drop policy if exists secure_lead_activities_insert on public.lead_activities;
create policy secure_lead_activities_select
on public.lead_activities for select to authenticated
using (private.can_access_lead(lead_id));
create policy secure_lead_activities_insert
on public.lead_activities for insert to authenticated
with check (private.can_access_lead(lead_id));

drop policy if exists lead_activity_logs_select_master_or_store on public.lead_activity_logs;
create policy lead_activity_logs_select_by_lead_access
on public.lead_activity_logs for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
);

-- Estado do rodízio e histórico de atribuições.
drop policy if exists store_team_routing_state_select_manager on public.store_team_routing_state;
drop policy if exists store_team_routing_state_service_all on public.store_team_routing_state;
create policy store_team_routing_state_select_manager
on public.store_team_routing_state for select to authenticated
using (private.can_manage_store(store_id));
create policy store_team_routing_state_service_all
on public.store_team_routing_state for all to service_role
using (true) with check (true);

drop policy if exists lead_assignment_logs_select on public.lead_assignment_logs;
drop policy if exists lead_assignment_logs_service_all on public.lead_assignment_logs;
create policy lead_assignment_logs_select
on public.lead_assignment_logs for select to authenticated
using (
  private.can_manage_store(store_id)
  or private.can_access_lead(lead_id)
);
create policy lead_assignment_logs_service_all
on public.lead_assignment_logs for all to service_role
using (true) with check (true);

-- Agenda individual e da loja.
drop policy if exists secure_appointments_select on public.appointments;
drop policy if exists secure_appointments_insert on public.appointments;
drop policy if exists secure_appointments_update on public.appointments;
drop policy if exists secure_appointments_delete_master on public.appointments;
create policy secure_appointments_select
on public.appointments for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and (
      scheduled_by = public.current_app_user_id()
      or (lead_id is not null and private.can_access_lead(lead_id))
    )
  )
);
create policy secure_appointments_insert
on public.appointments for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and (
      scheduled_by = public.current_app_user_id()
      or (lead_id is not null and private.can_access_lead(lead_id))
    )
  )
);
create policy secure_appointments_update
on public.appointments for update to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or scheduled_by = public.current_app_user_id()
  or (lead_id is not null and private.can_access_lead(lead_id))
)
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and (
      scheduled_by = public.current_app_user_id()
      or (lead_id is not null and private.can_access_lead(lead_id))
    )
  )
);
create policy secure_appointments_delete
on public.appointments for delete to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or scheduled_by = public.current_app_user_id()
);

drop policy if exists store_calendar_tasks_select on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_insert on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_update on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_delete on public.store_calendar_tasks;
create policy store_calendar_tasks_select
on public.store_calendar_tasks for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or created_by = public.current_app_user_id()
  or (lead_id is not null and private.can_access_lead(lead_id))
);
create policy store_calendar_tasks_insert
on public.store_calendar_tasks for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and (
      created_by = public.current_app_user_id()
      or (lead_id is not null and private.can_access_lead(lead_id))
    )
  )
);
create policy store_calendar_tasks_update
on public.store_calendar_tasks for update to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or created_by = public.current_app_user_id()
  or (lead_id is not null and private.can_access_lead(lead_id))
)
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and (
      created_by = public.current_app_user_id()
      or (lead_id is not null and private.can_access_lead(lead_id))
    )
  )
);
create policy store_calendar_tasks_delete
on public.store_calendar_tasks for delete to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or created_by = public.current_app_user_id()
);

-- Loja, evento e estoque ficam limitados à própria loja para a equipe.
drop policy if exists secure_stores_select on public.stores;
create policy secure_stores_select
on public.stores for select to authenticated
using (public.is_master() or id = public.current_app_store_id());

drop policy if exists secure_events_select on public.events;
drop policy if exists authenticated_delete_events on public.events;
create policy secure_events_select
on public.events for select to authenticated
using (
  public.is_master()
  or exists (
    select 1 from public.stores s
    where s.event_id = events.id
      and s.id = public.current_app_store_id()
  )
);

drop policy if exists secure_inventory_select on public.inventory;
drop policy if exists secure_inventory_insert on public.inventory;
drop policy if exists secure_inventory_update on public.inventory;
drop policy if exists secure_inventory_delete_master on public.inventory;
create policy secure_inventory_select
on public.inventory for select to authenticated
using (public.is_master() or store_id = public.current_app_store_id());
create policy secure_inventory_insert
on public.inventory for insert to authenticated
with check (public.is_master() or private.can_manage_store(store_id));
create policy secure_inventory_update
on public.inventory for update to authenticated
using (public.is_master() or private.can_manage_store(store_id))
with check (public.is_master() or private.can_manage_store(store_id));
create policy secure_inventory_delete
on public.inventory for delete to authenticated
using (public.is_master() or private.can_manage_store(store_id));

-- Vendas e perdas somente da própria carteira, exceto gestor da loja e Master.
drop policy if exists secure_sales_select on public.sales;
drop policy if exists secure_sales_insert on public.sales;
drop policy if exists secure_sales_update on public.sales;
drop policy if exists secure_sales_delete_master on public.sales;
create policy secure_sales_select
on public.sales for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
);
create policy secure_sales_insert
on public.sales for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and lead_id is not null
    and private.can_access_lead(lead_id)
  )
);
create policy secure_sales_update
on public.sales for update to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
)
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and lead_id is not null
    and private.can_access_lead(lead_id)
  )
);
create policy secure_sales_delete
on public.sales for delete to authenticated
using (public.is_master() or private.can_manage_store(store_id));

drop policy if exists secure_losses_select on public.losses;
drop policy if exists secure_losses_insert on public.losses;
drop policy if exists secure_losses_update on public.losses;
drop policy if exists secure_losses_delete_master on public.losses;
create policy secure_losses_select
on public.losses for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
);
create policy secure_losses_insert
on public.losses for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and lead_id is not null
    and private.can_access_lead(lead_id)
  )
);
create policy secure_losses_update
on public.losses for update to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
)
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and lead_id is not null
    and private.can_access_lead(lead_id)
  )
);
create policy secure_losses_delete
on public.losses for delete to authenticated
using (public.is_master() or private.can_manage_store(store_id));

-- Captações e cadastro legado de prospectadores também ficam vinculados à loja.
drop policy if exists secure_prospectors_select on public.prospectors;
drop policy if exists secure_prospectors_insert_master on public.prospectors;
drop policy if exists secure_prospectors_update_master on public.prospectors;
drop policy if exists secure_prospectors_delete_master on public.prospectors;
create policy secure_prospectors_select
on public.prospectors for select to authenticated
using (
  public.is_master()
  or user_id = public.current_app_user_id()
  or private.can_manage_store(store_id)
);
create policy secure_prospectors_insert
on public.prospectors for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    public.current_app_role() = 'prospector'
    and user_id = public.current_app_user_id()
    and store_id = public.current_app_store_id()
  )
);
create policy secure_prospectors_update
on public.prospectors for update to authenticated
using (
  public.is_master()
  or user_id = public.current_app_user_id()
  or private.can_manage_store(store_id)
)
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    public.current_app_role() = 'prospector'
    and user_id = public.current_app_user_id()
    and store_id = public.current_app_store_id()
  )
);
create policy secure_prospectors_delete
on public.prospectors for delete to authenticated
using (public.is_master() or private.can_manage_store(store_id));

drop policy if exists secure_street_surveys_select on public.street_surveys;
drop policy if exists secure_street_surveys_insert on public.street_surveys;
drop policy if exists secure_street_surveys_update on public.street_surveys;
drop policy if exists secure_street_surveys_delete_master on public.street_surveys;
create policy secure_street_surveys_select
on public.street_surveys for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(assigned_store_id)
  or private.is_own_prospector(prospector_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
);
create policy secure_street_surveys_insert
on public.street_surveys for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(assigned_store_id)
  or (
    public.current_app_role() = 'prospector'
    and private.is_own_prospector(prospector_id)
    and (assigned_store_id is null or assigned_store_id = public.current_app_store_id())
  )
);
create policy secure_street_surveys_update
on public.street_surveys for update to authenticated
using (
  public.is_master()
  or private.can_manage_store(assigned_store_id)
  or private.is_own_prospector(prospector_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
)
with check (
  public.is_master()
  or private.can_manage_store(assigned_store_id)
  or (
    public.current_app_role() = 'prospector'
    and private.is_own_prospector(prospector_id)
    and (assigned_store_id is null or assigned_store_id = public.current_app_store_id())
  )
  or (lead_id is not null and private.can_access_lead(lead_id))
);
create policy secure_street_surveys_delete
on public.street_surveys for delete to authenticated
using (
  public.is_master()
  or private.can_manage_store(assigned_store_id)
  or private.is_own_prospector(prospector_id)
);

