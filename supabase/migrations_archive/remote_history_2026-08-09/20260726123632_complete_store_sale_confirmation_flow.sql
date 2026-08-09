alter table public.sales add column if not exists seller_user_id uuid;
alter table public.sales add column if not exists pre_sales_user_id uuid;
alter table public.sales add column if not exists captured_by_user_id uuid;
alter table public.sales add column if not exists has_trade_in boolean;
alter table public.sales add column if not exists sale_vehicle_name varchar(300);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_seller_user_id_fkey') then
    alter table public.sales add constraint sales_seller_user_id_fkey foreign key (seller_user_id) references public.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_pre_sales_user_id_fkey') then
    alter table public.sales add constraint sales_pre_sales_user_id_fkey foreign key (pre_sales_user_id) references public.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_captured_by_user_id_fkey') then
    alter table public.sales add constraint sales_captured_by_user_id_fkey foreign key (captured_by_user_id) references public.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_lead_id_key') then
    alter table public.sales add constraint sales_lead_id_key unique (lead_id);
  end if;
end $$;

create index if not exists idx_sales_store_confirmed_at on public.sales(store_id, confirmed_at desc);
create index if not exists idx_sales_seller_user_id on public.sales(seller_user_id);
create index if not exists idx_sales_pre_sales_user_id on public.sales(pre_sales_user_id);
create index if not exists idx_sales_captured_by_user_id on public.sales(captured_by_user_id);

create or replace function public.confirm_lead_sale_record(
  p_lead_id uuid,
  p_store_id uuid,
  p_seller_user_id uuid,
  p_payment_type text,
  p_financing_bank text,
  p_has_trade_in boolean,
  p_sale_value numeric,
  p_confirmed_by uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_seller public.users%rowtype;
  v_sale_id uuid;
  v_now timestamptz := now();
begin
  if p_payment_type not in ('cash', 'financed') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_has_trade_in is null then
    raise exception 'Informe se houve veículo na troca.';
  end if;

  if p_payment_type = 'financed' and nullif(trim(coalesce(p_financing_bank, '')), '') is null then
    raise exception 'Informe o banco do financiamento.';
  end if;

  if p_sale_value is not null and p_sale_value < 0 then
    raise exception 'O valor da venda não pode ser negativo.';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id and assigned_store_id = p_store_id
  for update;

  if not found then
    raise exception 'Lead não encontrado nesta loja.';
  end if;

  select * into v_seller
  from public.users
  where id = p_seller_user_id
    and role = 'seller'
    and status = 'active'
    and store_id = p_store_id;

  if not found then
    raise exception 'Vendedor ativo não encontrado nesta loja.';
  end if;

  update public.leads
  set status = 'sale_confirmed',
      seller_user_id = v_seller.id,
      seller_assigned_at = v_now,
      assigned_user_id = v_seller.id,
      assigned_user_role = 'seller',
      updated_at = v_now,
      last_activity_at = v_now,
      last_activity_type = 'sale_confirmed',
      last_activity_label = 'Venda confirmada',
      last_activity_by_name = nullif(trim(coalesce(p_actor_name, '')), '')
  where id = v_lead.id;

  insert into public.sales (
    event_id,
    lead_id,
    store_id,
    vehicle_id,
    prospector_id,
    seller_name,
    seller_user_id,
    pre_sales_user_id,
    captured_by_user_id,
    customer_bank,
    financing_bank,
    payment_type,
    sale_value,
    vehicle_category,
    sale_vehicle_name,
    has_trade_in,
    confirmed_by,
    confirmed_at
  ) values (
    v_lead.event_id,
    v_lead.id,
    v_lead.assigned_store_id,
    null,
    v_lead.prospector_id,
    coalesce(nullif(trim(v_seller.full_name), ''), v_seller.email, 'Vendedor não informado'),
    v_seller.id,
    v_lead.pre_sales_user_id,
    v_lead.captured_by_user_id,
    nullif(trim(coalesce(v_lead.customer_bank, '')), ''),
    case when p_payment_type = 'cash' then 'Não se aplica' else trim(p_financing_bank) end,
    p_payment_type,
    p_sale_value,
    v_lead.vehicle_category_interest,
    v_lead.interested_vehicle,
    p_has_trade_in,
    p_confirmed_by,
    v_now
  )
  on conflict (lead_id) do update set
    event_id = excluded.event_id,
    store_id = excluded.store_id,
    prospector_id = excluded.prospector_id,
    seller_name = excluded.seller_name,
    seller_user_id = excluded.seller_user_id,
    pre_sales_user_id = excluded.pre_sales_user_id,
    captured_by_user_id = excluded.captured_by_user_id,
    customer_bank = excluded.customer_bank,
    financing_bank = excluded.financing_bank,
    payment_type = excluded.payment_type,
    sale_value = excluded.sale_value,
    vehicle_category = excluded.vehicle_category,
    sale_vehicle_name = excluded.sale_vehicle_name,
    has_trade_in = excluded.has_trade_in,
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at
  returning id into v_sale_id;

  return v_sale_id;
end;
$$;

revoke all on function public.confirm_lead_sale_record(uuid, uuid, uuid, text, text, boolean, numeric, uuid, text) from public;
grant execute on function public.confirm_lead_sale_record(uuid, uuid, uuid, text, text, boolean, numeric, uuid, text) to service_role;

insert into public.sales (
  event_id,
  lead_id,
  store_id,
  vehicle_id,
  prospector_id,
  seller_name,
  seller_user_id,
  pre_sales_user_id,
  captured_by_user_id,
  customer_bank,
  financing_bank,
  payment_type,
  sale_value,
  vehicle_category,
  sale_vehicle_name,
  has_trade_in,
  confirmed_by,
  confirmed_at
)
select
  l.event_id,
  l.id,
  l.assigned_store_id,
  null,
  l.prospector_id,
  coalesce(nullif(trim(u.full_name), ''), u.email, 'Não informado'),
  l.seller_user_id,
  l.pre_sales_user_id,
  l.captured_by_user_id,
  nullif(trim(coalesce(l.customer_bank, '')), ''),
  'Não informado',
  'not_informed',
  l.interested_vehicle_price,
  l.vehicle_category_interest,
  l.interested_vehicle,
  null,
  null,
  coalesce(l.updated_at, l.created_at, now())
from public.leads l
left join public.users u on u.id = l.seller_user_id
where l.status = 'sale_confirmed'
  and l.assigned_store_id is not null
on conflict (lead_id) do nothing;

