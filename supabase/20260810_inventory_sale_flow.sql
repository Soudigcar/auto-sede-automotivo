-- Fluxo VENDIDO do Estoque da Loja.
-- IMPORTANTE: este arquivo está apenas versionado nesta branch.
-- Não aplicar no Supabase sem autorização explícita posterior.

begin;

alter table public.sales
  add column if not exists sale_channel text;

alter table public.sales
  drop constraint if exists sales_sale_channel_check;

alter table public.sales
  add constraint sales_sale_channel_check
  check (sale_channel is null or sale_channel in ('door', 'internet', 'event'));

create index if not exists idx_sales_store_channel_confirmed_at
  on public.sales (store_id, sale_channel, confirmed_at desc);

create or replace function public.store_confirm_inventory_sale_transaction(
  p_vehicle_id uuid,
  p_store_id uuid,
  p_sale_channel text,
  p_event_id uuid,
  p_lead_id uuid,
  p_register_customer boolean,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_cpf text,
  p_birth_date date,
  p_responsible_user_id uuid,
  p_payment_type text,
  p_has_trade_in boolean,
  p_actor_user_id uuid,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor public.users%rowtype;
  v_responsible public.users%rowtype;
  v_vehicle public.site_vehicles%rowtype;
  v_lead public.leads%rowtype;
  v_sale public.sales%rowtype;
  v_store public.stores%rowtype;
  v_event public.events%rowtype;
  v_now timestamptz := now();
  v_actor_name text;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_customer_cpf text;
  v_vehicle_name text;
  v_payment_type text;
  v_financing_bank text;
  v_effective_event_id uuid;
  v_detailed_sale boolean;
  v_existing_lead_id uuid;
  v_existing_email_lead_id uuid;
begin
  if p_sale_channel not in ('door', 'internet', 'event') then
    raise exception 'Origem da venda inválida.';
  end if;

  select * into v_actor
  from public.users
  where id = p_actor_user_id
    and status = 'active';

  if not found then
    raise exception 'Usuário responsável não possui perfil ativo.';
  end if;

  if v_actor.role not in ('master', 'store') then
    raise exception 'Somente Gestor ou Master pode registrar venda diretamente pelo estoque.';
  end if;

  if v_actor.role <> 'master' and v_actor.store_id is distinct from p_store_id then
    raise exception 'O usuário responsável não pertence a esta loja.';
  end if;

  select * into v_store
  from public.stores
  where id = p_store_id
    and status = 'active'
  for share;

  if not found then
    raise exception 'Loja não encontrada ou inativa.';
  end if;

  select * into v_vehicle
  from public.site_vehicles
  where id = p_vehicle_id
    and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Veículo não encontrado no estoque desta loja.';
  end if;

  if v_vehicle.status in ('vendido', 'excluido') or v_vehicle.sold_at is not null then
    raise exception 'Este veículo não está disponível para uma nova venda.';
  end if;

  if exists (
    select 1 from public.sales
    where vehicle_id = v_vehicle.id
      and status = 'confirmed'
  ) then
    raise exception 'Este veículo já possui uma venda confirmada.';
  end if;

  if p_sale_channel = 'event' then
    if p_event_id is null then
      raise exception 'Selecione o evento da venda.';
    end if;

    select e.* into v_event
    from public.events e
    join public.store_event_participations participation
      on participation.event_id = e.id
     and participation.store_id = p_store_id
     and participation.status = 'active'
    where e.id = p_event_id
    for share of e;

    if not found then
      raise exception 'A loja não possui participação ativa neste evento.';
    end if;
  end if;

  v_detailed_sale := p_sale_channel <> 'door' or coalesce(p_register_customer, false);
  v_customer_name := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_customer_phone := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_customer_email := nullif(lower(btrim(coalesce(p_customer_email, ''))), '');
  v_customer_cpf := nullif(regexp_replace(coalesce(p_customer_cpf, ''), '[^0-9]', '', 'g'), '');
  v_vehicle_name := btrim(concat_ws(' ', v_vehicle.brand, v_vehicle.model, v_vehicle.version, v_vehicle.year));

  if v_detailed_sale then
    if p_responsible_user_id is null then
      raise exception 'Selecione o responsável pela venda.';
    end if;

    select * into v_responsible
    from public.users
    where id = p_responsible_user_id
      and status = 'active'
      and store_id = p_store_id
      and role in ('store', 'pre_sales', 'seller', 'prospector');

    if not found then
      raise exception 'Responsável ativo não encontrado nesta loja.';
    end if;

    if p_payment_type not in ('cash', 'financed', 'consortium', 'other') then
      raise exception 'Selecione a forma de pagamento.';
    end if;

    if p_has_trade_in is null then
      raise exception 'Informe se houve veículo na troca.';
    end if;
  end if;

  if p_lead_id is not null then
    select * into v_lead
    from public.leads
    where id = p_lead_id
      and assigned_store_id = p_store_id
    for update;

    if not found then
      raise exception 'Lead não encontrado nesta loja.';
    end if;

    if v_lead.status in ('sale_confirmed', 'deleted') then
      raise exception 'O estado atual do lead não permite registrar esta venda.';
    end if;

    if p_sale_channel = 'event' and v_lead.event_id is distinct from p_event_id then
      raise exception 'O lead selecionado não pertence ao evento informado.';
    end if;

    v_customer_name := coalesce(nullif(btrim(v_lead.customer_name), ''), v_customer_name);
    v_customer_phone := coalesce(nullif(btrim(v_lead.customer_phone), ''), v_customer_phone);
  elsif v_detailed_sale then
    if v_customer_name is null or length(v_customer_name) < 3 then
      raise exception 'Informe o nome do cliente.';
    end if;

    if length(regexp_replace(coalesce(v_customer_phone, ''), '[^0-9]', '', 'g')) < 10 then
      raise exception 'Informe um telefone válido.';
    end if;

    select l.id into v_existing_lead_id
    from public.leads l
    where l.assigned_store_id = p_store_id
      and l.status <> 'deleted'
      and regexp_replace(coalesce(l.customer_phone, ''), '[^0-9]', '', 'g') = regexp_replace(v_customer_phone, '[^0-9]', '', 'g')
    order by l.created_at desc
    limit 1;

    if v_customer_email is not null then
      select lb.routed_lead_id into v_existing_email_lead_id
      from public.leads_base lb
      where lb.assigned_store_id = p_store_id
        and lb.routed_lead_id is not null
        and lower(btrim(coalesce(lb.email, ''))) = v_customer_email
      order by lb.created_at desc
      limit 1;
    end if;

    if v_existing_lead_id is not null or v_existing_email_lead_id is not null then
      raise exception 'Este cliente já possui um lead salvo. Selecione o cadastro existente.';
    end if;

    insert into public.leads (
      event_id,
      customer_name,
      customer_phone,
      customer_bank,
      interested_vehicle,
      interested_vehicle_id,
      interested_vehicle_price,
      vehicle_category_interest,
      origin,
      assigned_store_id,
      assigned_user_id,
      assigned_user_role,
      assignment_source,
      pre_sales_user_id,
      pre_sales_assigned_at,
      seller_user_id,
      seller_assigned_at,
      captured_by_user_id,
      status,
      notes,
      created_at,
      updated_at,
      last_activity_at,
      last_activity_type,
      last_activity_label,
      last_activity_by_name
    ) values (
      case when p_sale_channel = 'event' then p_event_id else null end,
      v_customer_name,
      v_customer_phone,
      '',
      v_vehicle_name,
      v_vehicle.id,
      v_vehicle.price,
      '',
      case p_sale_channel when 'event' then 'inventory_sale_event' when 'internet' then 'inventory_sale_internet' else 'inventory_sale_door' end,
      p_store_id,
      v_responsible.id,
      v_responsible.role,
      'inventory_sale',
      case when v_responsible.role = 'pre_sales' then v_responsible.id else null end,
      case when v_responsible.role = 'pre_sales' then v_now else null end,
      case when v_responsible.role = 'seller' then v_responsible.id else null end,
      case when v_responsible.role = 'seller' then v_now else null end,
      case when v_responsible.role = 'prospector' then v_responsible.id else null end,
      'new_lead',
      'Lead cadastrado durante o registro de venda pelo Estoque.',
      v_now,
      v_now,
      v_now,
      'inventory_sale_customer_created',
      'Cliente cadastrado na venda do estoque',
      coalesce(nullif(btrim(p_actor_name), ''), v_actor.full_name, v_actor.email, 'Usuário')
    )
    returning * into v_lead;

    insert into public.leads_base (
      event_id,
      name,
      phone,
      cpf,
      email,
      source,
      campaign_id,
      campaign_name,
      vehicle_id,
      vehicle_name,
      vehicle_price,
      down_payment,
      financed_amount,
      estimated_installment,
      interest_rate,
      status,
      assigned_store_id,
      assigned_store_name,
      assigned_at,
      routed_lead_id,
      routing_strategy,
      notes,
      metadata,
      created_at,
      updated_at
    ) values (
      case when p_sale_channel = 'event' then p_event_id else null end,
      v_customer_name,
      v_customer_phone,
      v_customer_cpf,
      v_customer_email,
      case p_sale_channel when 'event' then 'Venda no evento' when 'internet' then 'Venda Internet' else 'Venda Porta' end,
      null,
      case when p_sale_channel = 'event' then v_event.event_name else null end,
      v_vehicle.id,
      v_vehicle_name,
      v_vehicle.price,
      0,
      0,
      0,
      0,
      'Venda confirmada',
      p_store_id,
      v_store.store_name,
      v_now,
      v_lead.id,
      'inventory_sale',
      'Cadastro criado durante a confirmação de venda no Estoque.',
      jsonb_build_object('sale_channel', p_sale_channel, 'created_from', 'store_inventory_sale'),
      v_now,
      v_now
    );
  end if;

  v_actor_name := coalesce(nullif(btrim(p_actor_name), ''), nullif(btrim(v_actor.full_name), ''), v_actor.email, 'Usuário');
  v_effective_event_id := case
    when p_sale_channel = 'event' then p_event_id
    when v_lead.id is not null then v_lead.event_id
    else null
  end;
  v_payment_type := case when v_detailed_sale then p_payment_type else 'other' end;
  v_financing_bank := case
    when not v_detailed_sale then 'Não informado'
    when p_payment_type = 'cash' then 'Não se aplica'
    when p_payment_type = 'financed' then 'Não informado'
    when p_payment_type = 'consortium' then 'Consórcio'
    else 'Outro'
  end;

  if v_lead.id is not null then
    update public.leads
    set event_id = coalesce(v_effective_event_id, event_id),
        interested_vehicle_id = v_vehicle.id,
        interested_vehicle = v_vehicle_name,
        interested_vehicle_price = v_vehicle.price,
        status = 'sale_confirmed',
        assigned_user_id = case when v_detailed_sale then v_responsible.id else assigned_user_id end,
        assigned_user_role = case when v_detailed_sale then v_responsible.role else assigned_user_role end,
        pre_sales_user_id = case when v_detailed_sale and v_responsible.role = 'pre_sales' then v_responsible.id else pre_sales_user_id end,
        pre_sales_assigned_at = case when v_detailed_sale and v_responsible.role = 'pre_sales' then v_now else pre_sales_assigned_at end,
        seller_user_id = case when v_detailed_sale and v_responsible.role = 'seller' then v_responsible.id else seller_user_id end,
        seller_assigned_at = case when v_detailed_sale and v_responsible.role = 'seller' then v_now else seller_assigned_at end,
        captured_by_user_id = case when v_detailed_sale and v_responsible.role = 'prospector' then v_responsible.id else captured_by_user_id end,
        lost_reason = null,
        updated_at = v_now,
        last_activity_at = v_now,
        last_activity_type = 'sale_confirmed',
        last_activity_label = 'Venda confirmada pelo Estoque',
        last_activity_by_name = v_actor_name
    where id = v_lead.id;
  end if;

  update public.site_vehicles
  set previous_status_before_sale = case when sold_at is null then status else previous_status_before_sale end,
      previous_visibility_before_sale = case when sold_at is null then show_on_landing else previous_visibility_before_sale end,
      previous_featured_before_sale = case when sold_at is null then is_featured else previous_featured_before_sale end,
      status = 'vendido',
      show_on_landing = false,
      is_featured = false,
      sold_at = v_now,
      sold_lead_id = case when v_lead.id is not null then v_lead.id else null end,
      sold_by_user_id = coalesce(case when v_detailed_sale then v_responsible.id else null end, v_actor.id),
      updated_at = v_now
  where id = v_vehicle.id;

  insert into public.sales (
    event_id,
    lead_id,
    store_id,
    vehicle_id,
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
    confirmed_at,
    status,
    sale_channel
  ) values (
    v_effective_event_id,
    case when v_lead.id is not null then v_lead.id else null end,
    p_store_id,
    v_vehicle.id,
    case when v_detailed_sale then coalesce(nullif(btrim(v_responsible.full_name), ''), v_responsible.email, 'Responsável') else v_actor_name end,
    case when v_detailed_sale and v_responsible.role = 'seller' then v_responsible.id else null end,
    case when v_detailed_sale and v_responsible.role = 'pre_sales' then v_responsible.id else null end,
    case when v_detailed_sale and v_responsible.role = 'prospector' then v_responsible.id else null end,
    nullif(btrim(coalesce(v_lead.customer_bank, '')), ''),
    v_financing_bank,
    v_payment_type,
    nullif(v_vehicle.price, 0),
    v_lead.vehicle_category_interest,
    v_vehicle_name,
    case when v_detailed_sale then p_has_trade_in else null end,
    v_actor.id,
    v_now,
    'confirmed',
    p_sale_channel
  )
  returning * into v_sale;

  if v_lead.id is not null and v_detailed_sale then
    insert into public.lead_commercial_details (
      lead_id,
      store_id,
      payment_type,
      financing_bank,
      negotiated_value,
      has_trade_in,
      cpf,
      birth_date,
      updated_by,
      updated_at
    ) values (
      v_lead.id,
      p_store_id,
      v_payment_type,
      v_financing_bank,
      nullif(v_vehicle.price, 0),
      p_has_trade_in,
      v_customer_cpf,
      p_birth_date,
      v_actor.id,
      v_now
    )
    on conflict (lead_id) do update set
      store_id = excluded.store_id,
      payment_type = excluded.payment_type,
      financing_bank = excluded.financing_bank,
      negotiated_value = excluded.negotiated_value,
      has_trade_in = excluded.has_trade_in,
      cpf = coalesce(excluded.cpf, public.lead_commercial_details.cpf),
      birth_date = coalesce(excluded.birth_date, public.lead_commercial_details.birth_date),
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  end if;

  update public.store_vehicle_link_submissions
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'publication_status', 'vendido',
        'sold_at', v_now,
        'sold_lead_id', case when v_lead.id is not null then v_lead.id else null end,
        'sold_by_user_id', coalesce(case when v_detailed_sale then v_responsible.id else null end, v_actor.id),
        'sale_channel', p_sale_channel,
        'sale_id', v_sale.id
      ),
      updated_at = v_now
  where imported_vehicle_id = v_vehicle.id;

  if v_lead.id is not null then
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
      p_store_id,
      v_store.store_name,
      v_actor.id,
      v_actor_name,
      'sale_confirmed',
      'Venda confirmada pelo Estoque',
      v_lead.status,
      'sale_confirmed',
      v_lead.customer_name,
      v_lead.customer_phone,
      v_vehicle_name,
      'Canal da venda: ' || p_sale_channel || '.',
      jsonb_build_object('sale_id', v_sale.id, 'sale_channel', p_sale_channel, 'event_id', v_effective_event_id)
    );

    insert into public.lead_activities (
      event_id,
      lead_id,
      user_id,
      activity_type,
      description,
      metadata
    ) values (
      v_effective_event_id,
      v_lead.id,
      v_actor.id,
      'sale_confirmed',
      v_actor_name || ' confirmou a venda de ' || v_vehicle_name || ' pelo Estoque.',
      jsonb_build_object('sale_id', v_sale.id, 'sale_channel', p_sale_channel)
    );
  end if;

  insert into public.audit_logs (
    event_id,
    user_id,
    user_role,
    action_type,
    entity_type,
    entity_id,
    old_value,
    new_value
  ) values (
    v_effective_event_id,
    v_actor.id,
    v_actor.role,
    'inventory_sale_confirmed',
    'sales',
    v_sale.id,
    jsonb_build_object('vehicle_status', v_vehicle.status, 'show_on_landing', v_vehicle.show_on_landing),
    jsonb_build_object(
      'store_id', p_store_id,
      'vehicle_id', v_vehicle.id,
      'lead_id', case when v_lead.id is not null then v_lead.id else null end,
      'sale_channel', p_sale_channel,
      'event_id', v_effective_event_id,
      'confirmed_at', v_now
    )
  );

  return jsonb_build_object(
    'success', true,
    'sale_id', v_sale.id,
    'lead_id', case when v_lead.id is not null then v_lead.id else null end,
    'sold_at', v_now,
    'sale_channel', p_sale_channel,
    'listing_removed', true,
    'message', 'Venda registrada. O veículo foi retirado do portal.'
  );
end;
$function$;

revoke all on function public.store_confirm_inventory_sale_transaction(
  uuid, uuid, text, uuid, uuid, boolean, text, text, text, text, date, uuid, text, boolean, uuid, text
) from public, anon, authenticated;

grant execute on function public.store_confirm_inventory_sale_transaction(
  uuid, uuid, text, uuid, uuid, boolean, text, text, text, text, date, uuid, text, boolean, uuid, text
) to service_role;

commit;
