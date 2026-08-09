begin;

alter table public.site_vehicles
  add column if not exists store_id uuid,
  add column if not exists sold_at timestamptz,
  add column if not exists sold_lead_id uuid,
  add column if not exists sold_by_user_id uuid,
  add column if not exists previous_status_before_sale text,
  add column if not exists previous_visibility_before_sale boolean,
  add column if not exists previous_featured_before_sale boolean;

alter table public.site_vehicles drop constraint if exists site_vehicles_campaign_id_fkey;
alter table public.site_vehicles
  add constraint site_vehicles_campaign_id_fkey
  foreign key (campaign_id) references public.site_campaigns(id) on delete set null;

alter table public.site_vehicles drop constraint if exists site_vehicles_store_id_fkey;
alter table public.site_vehicles
  add constraint site_vehicles_store_id_fkey
  foreign key (store_id) references public.stores(id) on delete set null;

alter table public.site_vehicles drop constraint if exists site_vehicles_sold_lead_id_fkey;
alter table public.site_vehicles
  add constraint site_vehicles_sold_lead_id_fkey
  foreign key (sold_lead_id) references public.leads(id) on delete set null;

alter table public.site_vehicles drop constraint if exists site_vehicles_sold_by_user_id_fkey;
alter table public.site_vehicles
  add constraint site_vehicles_sold_by_user_id_fkey
  foreign key (sold_by_user_id) references public.users(id) on delete set null;

create index if not exists idx_site_vehicles_store_id on public.site_vehicles(store_id);
create index if not exists idx_site_vehicles_sold_lead_id on public.site_vehicles(sold_lead_id);
create index if not exists idx_site_vehicles_marketplace_owner_status
  on public.site_vehicles(store_id, status, show_on_landing);

with unique_active_owners as (
  select
    l.imported_vehicle_id as vehicle_id,
    (array_agg(distinct l.store_id))[1] as store_id
  from public.store_vehicle_link_submissions l
  join public.stores s on s.id = l.store_id
  where l.imported_vehicle_id is not null
    and l.store_id is not null
    and l.status not in ('rejected', 'duplicate')
    and coalesce(l.metadata ->> 'store_removed', 'false') <> 'true'
    and s.status = 'active'
    and s.portal_enabled = true
  group by l.imported_vehicle_id
  having count(distinct l.store_id) = 1
)
update public.site_vehicles v
set
  store_id = o.store_id,
  store_name = s.store_name,
  updated_at = now()
from unique_active_owners o
join public.stores s on s.id = o.store_id
where v.id = o.vehicle_id
  and v.store_id is null;

create unique index if not exists idx_store_vehicle_link_one_active_owner
  on public.store_vehicle_link_submissions(imported_vehicle_id)
  where imported_vehicle_id is not null
    and status not in ('rejected', 'duplicate')
    and coalesce(metadata ->> 'store_removed', 'false') <> 'true';

alter table public.sales
  add column if not exists status text not null default 'confirmed',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancellation_reason text;

alter table public.sales drop constraint if exists sales_status_check;
alter table public.sales
  add constraint sales_status_check check (status in ('confirmed', 'cancelled'));

alter table public.sales drop constraint if exists sales_cancelled_by_fkey;
alter table public.sales
  add constraint sales_cancelled_by_fkey
  foreign key (cancelled_by) references public.users(id) on delete set null;

create index if not exists idx_sales_status on public.sales(status);
create index if not exists idx_sales_vehicle_status on public.sales(vehicle_id, status);

-- Reaponta sales.vehicle_id para o estoque público somente quando os dados existentes são compatíveis.
do $$
declare
  v_fk record;
begin
  if exists (
    select 1
    from public.sales s
    where s.vehicle_id is not null
      and not exists (
        select 1 from public.site_vehicles v where v.id = s.vehicle_id
      )
  ) then
    raise exception 'Existem vendas com vehicle_id legado que não correspondem a site_vehicles. Migração cancelada para preservar o histórico.';
  end if;

  for v_fk in
    select conname
    from pg_constraint
    where conrelid = 'public.sales'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (vehicle_id)%'
  loop
    execute format('alter table public.sales drop constraint %I', v_fk.conname);
  end loop;

  alter table public.sales
    add constraint sales_vehicle_id_fkey
    foreign key (vehicle_id) references public.site_vehicles(id) on delete set null;
end $$;

create unique index if not exists idx_sales_one_confirmed_per_vehicle
  on public.sales(vehicle_id)
  where vehicle_id is not null and status = 'confirmed';

-- Preenche o veículo da venda quando o lead possui vínculo técnico seguro.
update public.sales s
set vehicle_id = l.interested_vehicle_id
from public.leads l
join public.site_vehicles v on v.id = l.interested_vehicle_id
where s.lead_id = l.id
  and s.vehicle_id is null
  and l.status = 'sale_confirmed'
  and (v.store_id is null or v.store_id = l.assigned_store_id);

-- Corrige retroativamente somente veículos ligados a um único lead confirmado.
with single_confirmed_vehicle as (
  select l.interested_vehicle_id as vehicle_id
  from public.leads l
  join public.site_vehicles v on v.id = l.interested_vehicle_id
  where l.status = 'sale_confirmed'
    and l.interested_vehicle_id is not null
    and (v.store_id is null or v.store_id = l.assigned_store_id)
  group by l.interested_vehicle_id
  having count(*) = 1
), confirmed_rows as (
  select
    l.id as lead_id,
    l.interested_vehicle_id as vehicle_id,
    coalesce(s.confirmed_by, l.seller_user_id, l.assigned_user_id) as actor_id,
    coalesce(s.confirmed_at, l.updated_at, now()) as confirmed_at
  from public.leads l
  join single_confirmed_vehicle c on c.vehicle_id = l.interested_vehicle_id
  left join public.sales s on s.lead_id = l.id
  where l.status = 'sale_confirmed'
)
update public.site_vehicles v
set
  previous_status_before_sale = case when v.sold_lead_id is null then v.status else v.previous_status_before_sale end,
  previous_visibility_before_sale = case when v.sold_lead_id is null then v.show_on_landing else v.previous_visibility_before_sale end,
  previous_featured_before_sale = case when v.sold_lead_id is null then v.is_featured else v.previous_featured_before_sale end,
  status = 'vendido',
  show_on_landing = false,
  is_featured = false,
  sold_at = coalesce(v.sold_at, c.confirmed_at),
  sold_lead_id = c.lead_id,
  sold_by_user_id = coalesce(c.actor_id, v.sold_by_user_id),
  updated_at = now()
from confirmed_rows c
where v.id = c.vehicle_id
  and (v.sold_lead_id is null or v.sold_lead_id = c.lead_id);

update public.sales s
set
  status = 'confirmed',
  cancelled_at = null,
  cancelled_by = null,
  cancellation_reason = null
from public.leads l
where s.lead_id = l.id
  and l.status = 'sale_confirmed';

update public.store_vehicle_link_submissions l
set
  metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
    'publication_status', 'vendido',
    'sold_at', v.sold_at,
    'sold_lead_id', v.sold_lead_id,
    'sold_by_user_id', v.sold_by_user_id
  ),
  updated_at = now()
from public.site_vehicles v
where l.imported_vehicle_id = v.id
  and v.status = 'vendido'
  and v.sold_lead_id is not null;

create or replace function public.sync_site_vehicle_sale_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle public.site_vehicles%rowtype;
  v_actor_id uuid;
  v_should_sell boolean := false;
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.interested_vehicle_id is not distinct from new.interested_vehicle_id
     and old.assigned_store_id is not distinct from new.assigned_store_id then
    return new;
  end if;

  select u.id into v_actor_id
  from public.users u
  where u.auth_user_id = auth.uid()
     or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when u.auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  if tg_op = 'UPDATE'
     and old.status = 'sale_confirmed'
     and new.status is distinct from 'sale_confirmed' then
    update public.sales
    set
      status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor_id,
      cancellation_reason = coalesce(cancellation_reason, 'Venda cancelada ou lead reaberto no pipeline')
    where lead_id = old.id
      and status = 'confirmed';
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'sale_confirmed'
     and old.interested_vehicle_id is not null
     and (
       new.status is distinct from 'sale_confirmed'
       or old.interested_vehicle_id is distinct from new.interested_vehicle_id
     ) then
    if not exists (
      select 1
      from public.leads other_lead
      where other_lead.id <> old.id
        and other_lead.interested_vehicle_id = old.interested_vehicle_id
        and other_lead.status = 'sale_confirmed'
    ) then
      update public.site_vehicles
      set
        status = coalesce(previous_status_before_sale, 'disponivel'),
        show_on_landing = coalesce(previous_visibility_before_sale, false),
        is_featured = coalesce(previous_featured_before_sale, false),
        sold_at = null,
        sold_lead_id = null,
        sold_by_user_id = null,
        previous_status_before_sale = null,
        previous_visibility_before_sale = null,
        previous_featured_before_sale = null,
        updated_at = now()
      where id = old.interested_vehicle_id
        and sold_lead_id = old.id;

      update public.store_vehicle_link_submissions
      set
        metadata = (coalesce(metadata, '{}'::jsonb)
          - 'sold_at'
          - 'sold_lead_id'
          - 'sold_by_user_id') || jsonb_build_object(
            'publication_status', 'venda_cancelada',
            'sale_reverted_at', now()
          ),
        updated_at = now()
      where imported_vehicle_id = old.interested_vehicle_id;
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_should_sell := new.status = 'sale_confirmed' and new.interested_vehicle_id is not null;
  else
    v_should_sell := new.status = 'sale_confirmed'
      and new.interested_vehicle_id is not null
      and (
        old.status is distinct from 'sale_confirmed'
        or old.interested_vehicle_id is distinct from new.interested_vehicle_id
      );
  end if;

  if v_should_sell then
    select * into v_vehicle
    from public.site_vehicles
    where id = new.interested_vehicle_id
    for update;

    if not found then
      raise exception 'Veículo vinculado ao lead não foi encontrado.';
    end if;

    if v_vehicle.store_id is not null
       and new.assigned_store_id is not null
       and v_vehicle.store_id <> new.assigned_store_id then
      raise exception 'O veículo vendido pertence a outra loja.';
    end if;

    if v_vehicle.sold_lead_id is not null and v_vehicle.sold_lead_id <> new.id then
      raise exception 'Este veículo já está vinculado a outra venda confirmada.';
    end if;

    if v_vehicle.status = 'vendido' and v_vehicle.sold_lead_id is null then
      raise exception 'Este veículo já está marcado como vendido.';
    end if;

    if exists (
      select 1
      from public.leads other_lead
      where other_lead.id <> new.id
        and other_lead.interested_vehicle_id = new.interested_vehicle_id
        and other_lead.status = 'sale_confirmed'
    ) then
      raise exception 'Este veículo já possui outra venda confirmada.';
    end if;

    update public.site_vehicles
    set
      previous_status_before_sale = case when sold_lead_id is null then status else previous_status_before_sale end,
      previous_visibility_before_sale = case when sold_lead_id is null then show_on_landing else previous_visibility_before_sale end,
      previous_featured_before_sale = case when sold_lead_id is null then is_featured else previous_featured_before_sale end,
      status = 'vendido',
      show_on_landing = false,
      is_featured = false,
      sold_at = coalesce(sold_at, now()),
      sold_lead_id = new.id,
      sold_by_user_id = coalesce(v_actor_id, new.seller_user_id, new.assigned_user_id, sold_by_user_id),
      updated_at = now()
    where id = new.interested_vehicle_id;

    update public.sales
    set
      vehicle_id = new.interested_vehicle_id,
      status = 'confirmed',
      cancelled_at = null,
      cancelled_by = null,
      cancellation_reason = null
    where lead_id = new.id;

    update public.store_vehicle_link_submissions
    set
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'publication_status', 'vendido',
        'sold_at', now(),
        'sold_lead_id', new.id,
        'sold_by_user_id', coalesce(v_actor_id, new.seller_user_id, new.assigned_user_id)
      ),
      updated_at = now()
    where imported_vehicle_id = new.interested_vehicle_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_site_vehicle_sale_lifecycle on public.leads;
create trigger trg_sync_site_vehicle_sale_lifecycle
after insert or update of status, interested_vehicle_id, assigned_store_id
on public.leads
for each row execute function public.sync_site_vehicle_sale_lifecycle();

create or replace function public.sync_sale_vehicle_from_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_vehicle_id uuid;
  v_lead_store_id uuid;
  v_lead_status text;
  v_vehicle_store_id uuid;
begin
  if new.lead_id is not null then
    select interested_vehicle_id, assigned_store_id, status
      into v_lead_vehicle_id, v_lead_store_id, v_lead_status
    from public.leads
    where id = new.lead_id;

    if new.vehicle_id is null then
      new.vehicle_id := v_lead_vehicle_id;
    end if;

    if v_lead_status = 'sale_confirmed' then
      new.status := 'confirmed';
      new.cancelled_at := null;
      new.cancelled_by := null;
      new.cancellation_reason := null;
    end if;
  end if;

  if new.vehicle_id is not null then
    select store_id into v_vehicle_store_id
    from public.site_vehicles
    where id = new.vehicle_id;

    if not found then
      raise exception 'O veículo informado na venda não existe no estoque público.';
    end if;

    if v_vehicle_store_id is not null
       and coalesce(new.store_id, v_lead_store_id) is not null
       and v_vehicle_store_id <> coalesce(new.store_id, v_lead_store_id) then
      raise exception 'O veículo informado pertence a outra loja.';
    end if;

    if new.status = 'confirmed' then
      update public.site_vehicles
      set
        status = 'vendido',
        show_on_landing = false,
        is_featured = false,
        sold_at = coalesce(new.confirmed_at, sold_at, now()),
        sold_lead_id = coalesce(new.lead_id, sold_lead_id),
        sold_by_user_id = coalesce(new.confirmed_by, sold_by_user_id),
        updated_at = now()
      where id = new.vehicle_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_sale_vehicle_from_lead on public.sales;
create trigger trg_sync_sale_vehicle_from_lead
before insert or update on public.sales
for each row execute function public.sync_sale_vehicle_from_lead();

-- RLS de veículos: público somente publicados; Master administra tudo; loja administra apenas o próprio estoque.
drop policy if exists "Authenticated can manage site vehicles" on public.site_vehicles;
drop policy if exists "Public can read landing vehicles" on public.site_vehicles;
drop policy if exists site_vehicles_public_select on public.site_vehicles;
drop policy if exists site_vehicles_master_all on public.site_vehicles;
drop policy if exists site_vehicles_store_select_own on public.site_vehicles;
drop policy if exists site_vehicles_store_insert_own on public.site_vehicles;
drop policy if exists site_vehicles_store_update_own on public.site_vehicles;

create policy site_vehicles_public_select
on public.site_vehicles
for select
to public
using (show_on_landing = true and status = 'disponivel' and price > 0);

create policy site_vehicles_master_all
on public.site_vehicles
for all
to authenticated
using (public.is_master())
with check (public.is_master());

create policy site_vehicles_store_select_own
on public.site_vehicles
for select
to authenticated
using (
  public.current_app_role() = 'store'
  and store_id = public.current_app_store_id()
);

create policy site_vehicles_store_insert_own
on public.site_vehicles
for insert
to authenticated
with check (
  public.current_app_role() = 'store'
  and store_id = public.current_app_store_id()
);

create policy site_vehicles_store_update_own
on public.site_vehicles
for update
to authenticated
using (
  public.current_app_role() = 'store'
  and store_id = public.current_app_store_id()
)
with check (
  public.current_app_role() = 'store'
  and store_id = public.current_app_store_id()
);

-- Campanhas: somente Master administra; o público lê apenas campanha ativa.
drop policy if exists "Authenticated can manage site campaigns" on public.site_campaigns;
drop policy if exists "Public can read active site campaigns" on public.site_campaigns;
drop policy if exists site_campaigns_public_select on public.site_campaigns;
drop policy if exists site_campaigns_master_all on public.site_campaigns;

create policy site_campaigns_public_select
on public.site_campaigns
for select
to public
using (is_active = true);

create policy site_campaigns_master_all
on public.site_campaigns
for all
to authenticated
using (public.is_master())
with check (public.is_master());

-- Somente Master ou o gestor da própria loja gerencia a fila de estoque.
drop policy if exists store_vehicle_link_submissions_delete_master on public.store_vehicle_link_submissions;
drop policy if exists store_vehicle_link_submissions_insert on public.store_vehicle_link_submissions;
drop policy if exists store_vehicle_link_submissions_select on public.store_vehicle_link_submissions;
drop policy if exists store_vehicle_link_submissions_update on public.store_vehicle_link_submissions;

create policy store_vehicle_link_submissions_delete_master
on public.store_vehicle_link_submissions
for delete
to authenticated
using (public.is_master());

create policy store_vehicle_link_submissions_insert
on public.store_vehicle_link_submissions
for insert
to authenticated
with check (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and store_id = public.current_app_store_id()
  )
);

create policy store_vehicle_link_submissions_select
on public.store_vehicle_link_submissions
for select
to authenticated
using (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and store_id = public.current_app_store_id()
  )
);

create policy store_vehicle_link_submissions_update
on public.store_vehicle_link_submissions
for update
to authenticated
using (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and store_id = public.current_app_store_id()
  )
)
with check (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and store_id = public.current_app_store_id()
  )
);

commit;

