alter table public.sales
  add column if not exists installment_count integer,
  add column if not exists has_down_payment boolean,
  add column if not exists down_payment_value numeric(14,2),
  add column if not exists financed_amount numeric(14,2),
  add column if not exists installment_value numeric(14,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_installment_count_check' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_installment_count_check check (installment_count is null or (installment_count between 1 and 120));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_down_payment_value_check' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_down_payment_value_check check (down_payment_value is null or down_payment_value >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_financed_amount_check' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_financed_amount_check check (financed_amount is null or financed_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_installment_value_check' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_installment_value_check check (installment_value is null or installment_value >= 0);
  end if;
end $$;

create or replace function public.confirm_lead_sale_record(
  p_lead_id uuid,
  p_store_id uuid,
  p_seller_user_id uuid,
  p_payment_type text,
  p_financing_bank text,
  p_has_trade_in boolean,
  p_sale_value numeric,
  p_installment_count integer,
  p_has_down_payment boolean,
  p_down_payment_value numeric,
  p_financed_amount numeric,
  p_installment_value numeric,
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
  v_bank text;
  v_installment_count integer;
  v_has_down_payment boolean;
  v_down_payment_value numeric(14,2);
  v_financed_amount numeric(14,2);
  v_installment_value numeric(14,2);
begin
  if p_payment_type not in ('cash', 'financed', 'consortium', 'other') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_has_trade_in is null then
    raise exception 'Informe se houve veículo na troca.';
  end if;

  if p_sale_value is not null and p_sale_value < 0 then
    raise exception 'O valor da venda não pode ser negativo.';
  end if;

  if p_payment_type = 'financed' and nullif(trim(coalesce(p_financing_bank, '')), '') is null then
    raise exception 'Informe o banco do financiamento.';
  end if;

  if p_payment_type in ('financed', 'consortium') and (p_installment_count is null or p_installment_count < 1 or p_installment_count > 120) then
    raise exception 'Informe uma quantidade de parcelas entre 1 e 120.';
  end if;

  if p_payment_type <> 'cash' and p_has_down_payment is null then
    raise exception 'Informe se houve entrada.';
  end if;

  if coalesce(p_has_down_payment, false) and (p_down_payment_value is null or p_down_payment_value <= 0) then
    raise exception 'Informe um valor de entrada maior que zero.';
  end if;

  if p_sale_value is not null and p_down_payment_value is not null and p_down_payment_value > p_sale_value then
    raise exception 'O valor da entrada não pode ser maior que o valor da venda.';
  end if;

  if p_financed_amount is not null and p_financed_amount < 0 then
    raise exception 'O valor financiado não pode ser negativo.';
  end if;

  if p_installment_value is not null and p_installment_value < 0 then
    raise exception 'O valor da parcela não pode ser negativo.';
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

  v_bank := case
    when p_payment_type = 'cash' then 'Não se aplica'
    when p_payment_type = 'financed' then trim(p_financing_bank)
    when p_payment_type = 'consortium' then coalesce(nullif(trim(coalesce(p_financing_bank, '')), ''), 'Consórcio')
    else coalesce(nullif(trim(coalesce(p_financing_bank, '')), ''), 'Outro')
  end;

  v_installment_count := case when p_payment_type = 'cash' then null else p_installment_count end;
  v_has_down_payment := case when p_payment_type = 'cash' then false else p_has_down_payment end;
  v_down_payment_value := case when v_has_down_payment then p_down_payment_value else null end;

  v_financed_amount := case
    when p_payment_type in ('financed', 'consortium') then
      coalesce(
        p_financed_amount,
        case when p_sale_value is not null then greatest(p_sale_value - coalesce(v_down_payment_value, 0), 0) else null end
      )
    else p_financed_amount
  end;

  v_installment_value := coalesce(
    p_installment_value,
    case when v_financed_amount is not null and v_installment_count is not null and v_installment_count > 0
      then round(v_financed_amount / v_installment_count, 2)
      else null
    end
  );

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
    event_id, lead_id, store_id, vehicle_id, prospector_id,
    seller_name, seller_user_id, pre_sales_user_id, captured_by_user_id,
    customer_bank, financing_bank, payment_type, sale_value, vehicle_category,
    sale_vehicle_name, has_trade_in, installment_count, has_down_payment,
    down_payment_value, financed_amount, installment_value, confirmed_by, confirmed_at
  ) values (
    v_lead.event_id, v_lead.id, v_lead.assigned_store_id, null, v_lead.prospector_id,
    coalesce(nullif(trim(v_seller.full_name), ''), v_seller.email, 'Vendedor não informado'),
    v_seller.id, v_lead.pre_sales_user_id, v_lead.captured_by_user_id,
    nullif(trim(coalesce(v_lead.customer_bank, '')), ''), v_bank, p_payment_type,
    p_sale_value, v_lead.vehicle_category_interest, v_lead.interested_vehicle,
    p_has_trade_in, v_installment_count, v_has_down_payment, v_down_payment_value,
    v_financed_amount, v_installment_value, p_confirmed_by, v_now
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
    installment_count = excluded.installment_count,
    has_down_payment = excluded.has_down_payment,
    down_payment_value = excluded.down_payment_value,
    financed_amount = excluded.financed_amount,
    installment_value = excluded.installment_value,
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at
  returning id into v_sale_id;

  return v_sale_id;
end;
$$;

