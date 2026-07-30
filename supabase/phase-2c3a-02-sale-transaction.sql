-- Fase 2C.3A — confirmação transacional de venda.
-- Aplicar após phase-2c3a-01 e somente com autorização explícita.

begin;

create or replace function public.store_confirm_sale_transaction(
  p_lead_id uuid,
  p_store_id uuid,
  p_seller_user_id uuid,
  p_vehicle_mode text,
  p_vehicle_id uuid,
  p_vehicle_name text,
  p_payment_type text,
  p_financing_bank text,
  p_has_trade_in boolean,
  p_sale_value numeric,
  p_installment_count integer,
  p_has_down_payment boolean,
  p_down_payment_value numeric,
  p_financed_amount numeric,
  p_installment_value numeric,
  p_actor_user_id uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor public.users%rowtype;
  v_lead public.leads%rowtype;
  v_seller public.users%rowtype;
  v_vehicle public.site_vehicles%rowtype;
  v_sale_id uuid;
  v_now timestamptz := now();
  v_vehicle_name text;
  v_vehicle_price numeric;
  v_bank text;
  v_installment_count integer;
  v_has_down_payment boolean;
  v_down_payment_value numeric(14,2);
  v_financed_amount numeric(14,2);
  v_installment_value numeric(14,2);
  v_actor_name text;
begin
  select * into v_actor
  from public.users
  where id = p_actor_user_id and status = 'active';

  if not found then
    raise exception 'Usuário responsável não possui perfil ativo.';
  end if;

  if v_actor.role not in ('master', 'store', 'seller') then
    raise exception 'Este perfil não pode confirmar vendas.';
  end if;

  if v_actor.role <> 'master' and v_actor.store_id is distinct from p_store_id then
    raise exception 'O usuário responsável não pertence a esta loja.';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id and assigned_store_id = p_store_id
  for update;

  if not found then
    raise exception 'Lead não encontrado nesta loja.';
  end if;

  if v_lead.status in ('sale_confirmed', 'lost', 'deleted') then
    raise exception 'O estado atual do lead não permite confirmar uma venda.';
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

  if v_actor.role = 'seller' then
    if v_actor.id <> v_seller.id then
      raise exception 'O vendedor só pode confirmar a própria venda.';
    end if;
    if v_lead.seller_user_id is distinct from v_actor.id
       and v_lead.assigned_user_id is distinct from v_actor.id then
      raise exception 'Este lead não pertence à carteira do vendedor.';
    end if;
  end if;

  if p_vehicle_mode not in ('portal', 'outside_portal') then
    raise exception 'Origem do veículo vendido inválida.';
  end if;

  if p_vehicle_mode = 'portal' then
    if p_vehicle_id is null then
      raise exception 'Selecione o veículo vendido no estoque da loja.';
    end if;

    select * into v_vehicle
    from public.site_vehicles
    where id = p_vehicle_id and store_id = p_store_id
    for update;

    if not found then
      raise exception 'O veículo selecionado não pertence ao estoque desta loja.';
    end if;

    if v_vehicle.status = 'excluido' then
      raise exception 'O veículo selecionado está excluído do estoque.';
    end if;

    if v_vehicle.sold_lead_id is not null and v_vehicle.sold_lead_id <> v_lead.id then
      raise exception 'Este veículo já está vinculado a outra venda.';
    end if;

    if v_vehicle.status = 'vendido' and v_vehicle.sold_lead_id is null then
      raise exception 'Este veículo já está marcado como vendido.';
    end if;

    v_vehicle_name := trim(concat_ws(' ', v_vehicle.brand, v_vehicle.model, v_vehicle.version, v_vehicle.year));
    v_vehicle_price := nullif(v_vehicle.price, 0);
  else
    v_vehicle_name := nullif(trim(coalesce(p_vehicle_name, '')), '');
    v_vehicle_price := v_lead.interested_vehicle_price;
    if v_vehicle_name is null then
      raise exception 'Informe o veículo vendido fora do portal.';
    end if;
  end if;

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

  if p_payment_type in ('financed', 'consortium')
     and (p_installment_count is null or p_installment_count < 1 or p_installment_count > 120) then
    raise exception 'Informe uma quantidade de parcelas entre 1 e 120.';
  end if;

  if p_payment_type <> 'cash' and p_has_down_payment is null then
    raise exception 'Informe se houve entrada.';
  end if;

  if coalesce(p_has_down_payment, false)
     and (p_down_payment_value is null or p_down_payment_value <= 0) then
    raise exception 'Informe um valor de entrada maior que zero.';
  end if;

  if p_sale_value is not null
     and p_down_payment_value is not null
     and p_down_payment_value > p_sale_value then
    raise exception 'O valor da entrada não pode ser maior que o valor da venda.';
  end if;

  if p_financed_amount is not null and p_financed_amount < 0 then
    raise exception 'O valor financiado não pode ser negativo.';
  end if;

  if p_installment_value is not null and p_installment_value < 0 then
    raise exception 'O valor da parcela não pode ser negativo.';
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
  v_actor_name := coalesce(nullif(trim(p_actor_name), ''), nullif(trim(v_actor.full_name), ''), v_actor.email, 'Usuário');

  update public.leads
  set interested_vehicle_id = case when p_vehicle_mode = 'portal' then v_vehicle.id else null end,
      interested_vehicle = v_vehicle_name,
      interested_vehicle_price = v_vehicle_price,
      status = 'sale_confirmed',
      seller_user_id = v_seller.id,
      seller_assigned_at = v_now,
      assigned_user_id = v_seller.id,
      assigned_user_role = 'seller',
      lost_reason = null,
      updated_at = v_now,
      last_activity_at = v_now,
      last_activity_type = 'sale_confirmed',
      last_activity_label = 'Venda confirmada',
      last_activity_by_name = v_actor_name
  where id = v_lead.id;

  insert into public.sales (
    event_id, lead_id, store_id, vehicle_id, prospector_id,
    seller_name, seller_user_id, pre_sales_user_id, captured_by_user_id,
    customer_bank, financing_bank, payment_type, sale_value, vehicle_category,
    sale_vehicle_name, has_trade_in, installment_count, has_down_payment,
    down_payment_value, financed_amount, installment_value, confirmed_by, confirmed_at,
    status, cancelled_at, cancelled_by, cancellation_reason
  ) values (
    v_lead.event_id, v_lead.id, v_lead.assigned_store_id,
    case when p_vehicle_mode = 'portal' then v_vehicle.id else null end,
    v_lead.prospector_id,
    coalesce(nullif(trim(v_seller.full_name), ''), v_seller.email, 'Vendedor não informado'),
    v_seller.id, v_lead.pre_sales_user_id, v_lead.captured_by_user_id,
    nullif(trim(coalesce(v_lead.customer_bank, '')), ''), v_bank, p_payment_type,
    p_sale_value, v_lead.vehicle_category_interest, v_vehicle_name,
    p_has_trade_in, v_installment_count, v_has_down_payment, v_down_payment_value,
    v_financed_amount, v_installment_value, v_actor.id, v_now,
    'confirmed', null, null, null
  )
  on conflict (lead_id) do update set
    event_id = excluded.event_id,
    store_id = excluded.store_id,
    vehicle_id = excluded.vehicle_id,
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
    confirmed_at = excluded.confirmed_at,
    status = 'confirmed',
    cancelled_at = null,
    cancelled_by = null,
    cancellation_reason = null
  returning id into v_sale_id;

  insert into public.lead_commercial_details (
    lead_id, store_id, payment_type, financing_bank, negotiated_value,
    installment_count, has_down_payment, down_payment_value, financed_amount,
    installment_value, has_trade_in, updated_by, updated_at
  ) values (
    v_lead.id, v_lead.assigned_store_id, p_payment_type, v_bank, p_sale_value,
    v_installment_count, v_has_down_payment, v_down_payment_value, v_financed_amount,
    v_installment_value, p_has_trade_in, v_actor.id, v_now
  )
  on conflict (lead_id) do update set
    store_id = excluded.store_id,
    payment_type = excluded.payment_type,
    financing_bank = excluded.financing_bank,
    negotiated_value = excluded.negotiated_value,
    installment_count = excluded.installment_count,
    has_down_payment = excluded.has_down_payment,
    down_payment_value = excluded.down_payment_value,
    financed_amount = excluded.financed_amount,
    installment_value = excluded.installment_value,
    has_trade_in = excluded.has_trade_in,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    v_lead.id, v_lead.assigned_store_id,
    (select store_name from public.stores where id = v_lead.assigned_store_id),
    v_actor.id, v_actor_name, 'sale_confirmed',
    'Venda confirmada por ' || coalesce(nullif(trim(v_seller.full_name), ''), v_seller.email, 'Vendedor'),
    v_lead.status, 'sale_confirmed', v_lead.customer_name, v_lead.customer_phone,
    v_vehicle_name,
    concat_ws('. ',
      case p_payment_type when 'cash' then 'À vista' when 'financed' then 'Financiado por ' || v_bank when 'consortium' then 'Consórcio' else 'Outra forma' end,
      case when v_installment_count is null then 'Sem parcelamento' else v_installment_count || ' parcela(s)' end,
      case when v_has_down_payment then 'Com entrada' else 'Sem entrada' end,
      case when p_has_trade_in then 'Com veículo na troca' else 'Sem veículo na troca' end
    ),
    jsonb_build_object(
      'sale_id', v_sale_id,
      'vehicle_id', case when p_vehicle_mode = 'portal' then v_vehicle.id else null end,
      'vehicle_mode', p_vehicle_mode,
      'seller_user_id', v_seller.id,
      'payment_type', p_payment_type,
      'financing_bank', v_bank,
      'sale_value', p_sale_value,
      'confirmed_by_role', v_actor.role,
      'transaction', 'store_confirm_sale_transaction'
    )
  );

  insert into public.lead_activities (
    event_id, lead_id, user_id, activity_type, description, metadata
  ) values (
    v_lead.event_id, v_lead.id, v_actor.id, 'sale_confirmed',
    v_actor_name || ' confirmou a venda de ' || v_vehicle_name || '.',
    jsonb_build_object('sale_id', v_sale_id, 'vehicle_mode', p_vehicle_mode)
  );

  insert into public.audit_logs (
    event_id, user_id, user_role, action_type, entity_type, entity_id, old_value, new_value
  ) values (
    v_lead.event_id, v_actor.id, v_actor.role, 'sale_confirmed', 'sales', v_sale_id,
    jsonb_build_object('lead_status', v_lead.status),
    jsonb_build_object(
      'lead_id', v_lead.id,
      'store_id', v_lead.assigned_store_id,
      'vehicle_id', case when p_vehicle_mode = 'portal' then v_vehicle.id else null end,
      'seller_user_id', v_seller.id,
      'payment_type', p_payment_type,
      'sale_value', p_sale_value,
      'confirmed_by', v_actor.id
    )
  );

  return v_sale_id;
end;
$function$;


revoke all on function public.store_confirm_sale_transaction(
  uuid, uuid, uuid, text, uuid, text, text, text, boolean, numeric, integer,
  boolean, numeric, numeric, numeric, uuid, text
) from public, anon, authenticated;
grant execute on function public.store_confirm_sale_transaction(
  uuid, uuid, uuid, text, uuid, text, text, text, boolean, numeric, integer,
  boolean, numeric, numeric, numeric, uuid, text
) to service_role;

commit;
