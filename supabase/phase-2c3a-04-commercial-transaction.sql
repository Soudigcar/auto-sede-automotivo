-- Fase 2C.3A — atualização transacional das condições comerciais.
-- Aplicar após phase-2c3a-03 e somente com autorização explícita.

begin;

create or replace function public.store_update_commercial_transaction(
  p_lead_id uuid,
  p_store_id uuid,
  p_payment_type text,
  p_financing_bank text,
  p_sale_value numeric,
  p_installment_count integer,
  p_has_down_payment boolean,
  p_down_payment_value numeric,
  p_financed_amount numeric,
  p_installment_value numeric,
  p_has_trade_in boolean,
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
  v_sale public.sales%rowtype;
  v_commercial_id uuid;
  v_now timestamptz := now();
  v_bank text;
  v_installment_count integer;
  v_has_down_payment boolean;
  v_down_payment_value numeric(14,2);
  v_financed_amount numeric(14,2);
  v_installment_value numeric(14,2);
  v_actor_name text;
  v_has_access boolean := false;
begin
  select * into v_actor
  from public.users
  where id = p_actor_user_id and status = 'active';
  if not found or v_actor.role not in ('master', 'store', 'pre_sales', 'seller') then
    raise exception 'Este perfil não pode editar condições comerciais.';
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

  v_has_access := v_actor.role in ('master', 'store')
    or (v_actor.role = 'pre_sales' and (v_lead.pre_sales_user_id = v_actor.id or v_lead.assigned_user_id = v_actor.id))
    or (v_actor.role = 'seller' and (v_lead.seller_user_id = v_actor.id or v_lead.assigned_user_id = v_actor.id));
  if not v_has_access then
    raise exception 'Este lead não pertence à carteira do usuário.';
  end if;

  select * into v_sale
  from public.sales
  where lead_id = v_lead.id and store_id = p_store_id
  for update;

  if found and v_sale.status = 'confirmed' then
    if v_actor.role = 'pre_sales' then
      raise exception 'Pré-vendas não pode alterar uma venda já confirmada.';
    end if;
    if v_actor.role = 'seller' and v_sale.seller_user_id is distinct from v_actor.id then
      raise exception 'O vendedor só pode alterar a própria venda.';
    end if;
  end if;

  if p_payment_type not in ('cash', 'financed', 'consortium', 'other') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if p_sale_value is not null and p_sale_value < 0 then
    raise exception 'O valor negociado não pode ser negativo.';
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
  if p_sale_value is not null and p_down_payment_value is not null and p_down_payment_value > p_sale_value then
    raise exception 'O valor da entrada não pode ser maior que o valor negociado.';
  end if;
  if p_financed_amount is not null and p_financed_amount < 0 then
    raise exception 'O valor financiado não pode ser negativo.';
  end if;
  if p_installment_value is not null and p_installment_value < 0 then
    raise exception 'O valor da parcela não pode ser negativo.';
  end if;
  if p_has_trade_in is null then
    raise exception 'Informe se haverá veículo na troca.';
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
      coalesce(p_financed_amount, case when p_sale_value is not null then greatest(p_sale_value - coalesce(v_down_payment_value, 0), 0) else null end)
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
    updated_at = excluded.updated_at
  returning id into v_commercial_id;

  if v_sale.id is not null and v_sale.status = 'confirmed' then
    update public.sales
    set payment_type = p_payment_type,
        financing_bank = v_bank,
        sale_value = p_sale_value,
        has_trade_in = p_has_trade_in,
        installment_count = v_installment_count,
        has_down_payment = v_has_down_payment,
        down_payment_value = v_down_payment_value,
        financed_amount = v_financed_amount,
        installment_value = v_installment_value
    where id = v_sale.id;
  end if;

  update public.leads
  set last_activity_at = v_now,
      last_activity_type = case when v_sale.id is not null and v_sale.status = 'confirmed' then 'sale_details_updated' else 'lead_commercial_updated' end,
      last_activity_label = case when v_sale.id is not null and v_sale.status = 'confirmed' then 'Dados comerciais da venda atualizados' else 'Condições da negociação atualizadas' end,
      last_activity_by_name = v_actor_name,
      updated_at = v_now
  where id = v_lead.id;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    v_lead.id, v_lead.assigned_store_id,
    (select store_name from public.stores where id = v_lead.assigned_store_id),
    v_actor.id, v_actor_name,
    case when v_sale.id is not null and v_sale.status = 'confirmed' then 'sale_details_updated' else 'lead_commercial_updated' end,
    case when v_sale.id is not null and v_sale.status = 'confirmed' then 'Dados comerciais da venda atualizados' else 'Condições da negociação atualizadas' end,
    v_lead.status, v_lead.status, v_lead.customer_name, v_lead.customer_phone,
    v_lead.interested_vehicle, null,
    jsonb_build_object('commercial_id', v_commercial_id, 'sale_id', v_sale.id, 'transaction', 'store_update_commercial_transaction')
  );

  insert into public.lead_activities (
    event_id, lead_id, user_id, activity_type, description, metadata
  ) values (
    v_lead.event_id, v_lead.id, v_actor.id,
    case when v_sale.id is not null and v_sale.status = 'confirmed' then 'sale_details_updated' else 'lead_commercial_updated' end,
    v_actor_name || ' atualizou as condições comerciais.',
    jsonb_build_object('commercial_id', v_commercial_id, 'sale_id', v_sale.id)
  );

  insert into public.audit_logs (
    event_id, user_id, user_role, action_type, entity_type, entity_id, old_value, new_value
  ) values (
    v_lead.event_id, v_actor.id, v_actor.role,
    case when v_sale.id is not null and v_sale.status = 'confirmed' then 'sale_details_updated' else 'lead_commercial_updated' end,
    'lead_commercial_details', v_commercial_id,
    null,
    jsonb_build_object(
      'lead_id', v_lead.id,
      'sale_id', v_sale.id,
      'payment_type', p_payment_type,
      'financing_bank', v_bank,
      'sale_value', p_sale_value,
      'updated_by', v_actor.id
    )
  );

  return v_commercial_id;
end;
$function$;


revoke all on function public.store_update_commercial_transaction(
  uuid, uuid, text, text, numeric, integer, boolean, numeric, numeric, numeric,
  boolean, uuid, text
) from public, anon, authenticated;
grant execute on function public.store_update_commercial_transaction(
  uuid, uuid, text, text, numeric, integer, boolean, numeric, numeric, numeric,
  boolean, uuid, text
) to service_role;

-- Remove as assinaturas legadas somente depois que todos os novos RPCs existem.
drop function if exists public.confirm_lead_sale_record(
  uuid, uuid, uuid, text, text, boolean, numeric, uuid, text
);
drop function if exists public.confirm_lead_sale_record(
  uuid, uuid, uuid, text, text, boolean, numeric, integer, boolean,
  numeric, numeric, numeric, uuid, text
);

commit;
