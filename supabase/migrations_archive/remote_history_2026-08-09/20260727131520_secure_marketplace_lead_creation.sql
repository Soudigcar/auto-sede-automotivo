alter table public.leads
  drop constraint if exists leads_origin_check;

alter table public.leads
  add constraint leads_origin_check
  check (
    origin::text = any (
      array[
        'street_survey',
        'quick_registration',
        'manual',
        'Facebook Lead Ads',
        'facebook_lead_ads',
        'WhatsApp Oficial',
        'whatsapp_official',
        'WATI / Click-to-WhatsApp',
        'wati_leads',
        'WATI',
        'marketplace_site'
      ]::text[]
    )
  );

create index if not exists leads_marketplace_vehicle_phone_recent_idx
  on public.leads (interested_vehicle_id, created_at desc)
  where origin = 'marketplace_site';

create or replace function public.create_marketplace_lead(
  p_name text,
  p_phone text,
  p_cpf text,
  p_email text,
  p_vehicle_id uuid,
  p_down_payment numeric,
  p_installments integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle public.site_vehicles%rowtype;
  v_store_id uuid;
  v_store_name text;
  v_store_slug text;
  v_owner_count integer;
  v_existing_lead_id uuid;
  v_lead_id uuid;
  v_vehicle_name text;
  v_phone_digits text;
  v_now timestamptz := now();
  v_interest_rate numeric := 1.89;
  v_monthly_rate numeric := 0.0189;
  v_down_payment numeric;
  v_financed_amount numeric;
  v_estimated_installment numeric;
  v_notes text;
  v_metadata jsonb;
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'Nome é obrigatório.' using errcode = '22023';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_phone_digits) not in (10, 11) then
    raise exception 'Telefone inválido.' using errcode = '22023';
  end if;

  if p_installments not in (12, 24, 36, 48, 60) then
    raise exception 'Quantidade de parcelas inválida.' using errcode = '22023';
  end if;

  select *
  into v_vehicle
  from public.site_vehicles
  where id = p_vehicle_id
    and status = 'disponivel'
    and show_on_landing = true
    and coalesce(price, 0) > 0
  for share;

  if not found then
    raise exception 'Este veículo não está disponível no marketplace.' using errcode = 'P0002';
  end if;

  select
    count(distinct s.id),
    min(s.id),
    min(s.store_name),
    min(s.slug)
  into
    v_owner_count,
    v_store_id,
    v_store_name,
    v_store_slug
  from public.store_vehicle_link_submissions l
  join public.stores s on s.id = l.store_id
  where l.imported_vehicle_id = v_vehicle.id
    and l.store_id is not null
    and coalesce(l.metadata ->> 'store_removed', 'false') <> 'true'
    and lower(coalesce(l.status, '')) not in ('rejected', 'duplicate', 'deleted', 'excluido')
    and s.status = 'active'
    and coalesce(s.portal_enabled, true) = true;

  if v_owner_count <> 1 or v_store_id is null then
    raise exception 'Não foi possível confirmar uma única loja responsável por este veículo.' using errcode = 'P0003';
  end if;

  select l.id
  into v_existing_lead_id
  from public.leads l
  where l.origin = 'marketplace_site'
    and l.interested_vehicle_id = v_vehicle.id
    and l.assigned_store_id = v_store_id
    and regexp_replace(coalesce(l.customer_phone, ''), '[^0-9]', '', 'g') = v_phone_digits
    and l.created_at >= v_now - interval '20 minutes'
  order by l.created_at desc
  limit 1;

  if v_existing_lead_id is not null then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'lead_id', v_existing_lead_id,
      'assigned_store_name', v_store_name,
      'routing_strategy', 'vehicle_owner'
    );
  end if;

  v_down_payment := greatest(coalesce(p_down_payment, 0), 0);
  if v_down_payment > coalesce(v_vehicle.price, 0) then
    raise exception 'A entrada não pode ser maior que o valor do veículo.' using errcode = '22023';
  end if;

  v_financed_amount := greatest(coalesce(v_vehicle.price, 0) - v_down_payment, 0);
  v_estimated_installment := case
    when v_financed_amount <= 0 then 0
    else v_financed_amount * v_monthly_rate / (1 - power(1 + v_monthly_rate, -p_installments))
  end;

  v_vehicle_name := btrim(concat_ws(' ',
    nullif(v_vehicle.brand, ''),
    nullif(v_vehicle.model, ''),
    nullif(v_vehicle.version, ''),
    nullif(v_vehicle.year, '')
  ));

  v_notes := concat_ws(' ',
    'Lead criado pelo marketplace permanente.',
    'Veículo selecionado: ' || v_vehicle_name || '.',
    case
      when v_down_payment > 0 then 'Entrada simulada: R$ ' || to_char(v_down_payment, 'FM999G999G999G990D00') || '.'
      else 'Simulação sem entrada informada.'
    end,
    'Prazo simulado: ' || p_installments || ' parcela(s).',
    'Parcela estimada: R$ ' || to_char(v_estimated_installment, 'FM999G999G999G990D00') || '.'
  );

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
    status,
    notes,
    last_activity_at,
    last_activity_type,
    last_activity_label,
    last_activity_by_name
  ) values (
    null,
    btrim(p_name),
    btrim(p_phone),
    '',
    v_vehicle_name,
    v_vehicle.id,
    v_vehicle.price,
    '',
    'marketplace_site',
    v_store_id,
    null,
    null,
    'marketplace_vehicle_owner',
    'new_lead',
    v_notes,
    v_now,
    'marketplace_lead_created',
    'Lead recebido pelo marketplace',
    'Marketplace público'
  )
  returning id into v_lead_id;

  v_metadata := jsonb_build_object(
    'source', 'marketplace_permanente',
    'page', '/',
    'official_domain', 'autosede.com.br',
    'vehicle_owner', jsonb_build_object(
      'store_id', v_store_id,
      'store_name', v_store_name,
      'store_slug', v_store_slug
    ),
    'routing', jsonb_build_object(
      'strategy', 'vehicle_owner',
      'assigned_store_id', v_store_id,
      'assigned_store_name', v_store_name,
      'assigned_at', v_now,
      'routed_lead_id', v_lead_id
    )
  );

  insert into public.leads_base (
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
    installments,
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
    btrim(p_name),
    btrim(p_phone),
    nullif(btrim(p_cpf), ''),
    nullif(lower(btrim(p_email)), ''),
    'Marketplace permanente',
    null,
    null,
    v_vehicle.id,
    v_vehicle_name,
    v_vehicle.price,
    v_down_payment,
    v_financed_amount,
    p_installments,
    v_estimated_installment,
    v_interest_rate,
    'Novo lead',
    v_store_id,
    v_store_name,
    v_now,
    v_lead_id,
    'vehicle_owner',
    v_notes,
    v_metadata,
    v_now,
    v_now
  );

  insert into public.lead_activity_logs (
    lead_id,
    store_id,
    store_name,
    user_name,
    activity_type,
    activity_label,
    customer_name,
    customer_phone,
    vehicle_name,
    notes,
    metadata
  ) values (
    v_lead_id,
    v_store_id,
    v_store_name,
    'Marketplace público',
    'marketplace_lead_created',
    'Lead recebido pelo marketplace',
    btrim(p_name),
    btrim(p_phone),
    v_vehicle_name,
    v_notes,
    v_metadata
  );

  insert into public.lead_activities (
    event_id,
    lead_id,
    user_id,
    activity_type,
    description,
    metadata
  ) values (
    null,
    v_lead_id,
    null,
    'marketplace_lead_created',
    'Lead do marketplace direcionado para ' || v_store_name || '.',
    v_metadata
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'lead_id', v_lead_id,
    'assigned_store_name', v_store_name,
    'routing_strategy', 'vehicle_owner'
  );
end;
$$;

revoke all on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) from public;
revoke all on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) from anon;
revoke all on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) from authenticated;
grant execute on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) to service_role;

