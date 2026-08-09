begin;

create table if not exists public.event_lead_routing_state (
  event_id uuid primary key references public.events(id) on delete cascade,
  last_store_id uuid references public.stores(id) on delete set null,
  routed_count bigint not null default 0 check (routed_count >= 0),
  last_routed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.event_lead_routing_state is
  'Estado independente do rodízio de leads de cada evento.';

alter table public.event_lead_routing_state enable row level security;

revoke all on table public.event_lead_routing_state from anon, authenticated;
grant select, insert, update, delete on table public.event_lead_routing_state to service_role;

create index if not exists leads_base_event_campaign_vehicle_recent_idx
  on public.leads_base(event_id, campaign_id, vehicle_id, created_at desc)
  where source = 'Landing Page Simulador';

alter table public.leads
  drop constraint if exists leads_origin_check;

alter table public.leads
  add constraint leads_origin_check
  check (origin in (
    'street_survey',
    'quick_registration',
    'manual',
    'event_landing',
    'Facebook Lead Ads',
    'facebook_lead_ads',
    'WhatsApp Oficial',
    'whatsapp_official',
    'WATI / Click-to-WhatsApp',
    'wati_leads',
    'WATI',
    'marketplace_site'
  ));

create or replace function public.create_event_landing_lead(
  p_name text,
  p_phone text,
  p_cpf text,
  p_email text,
  p_campaign_id uuid,
  p_vehicle_id uuid,
  p_down_payment numeric,
  p_financed_amount numeric,
  p_installments integer,
  p_estimated_installment numeric,
  p_interest_rate numeric,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_phone_digits text;
  v_campaign public.site_campaigns%rowtype;
  v_vehicle public.site_vehicles%rowtype;
  v_vehicle_owner_store_id uuid;
  v_state public.event_lead_routing_state%rowtype;
  v_last_store_sort text;
  v_selected_store_id uuid;
  v_selected_store_name text;
  v_existing_base_lead_id uuid;
  v_existing_routed_lead_id uuid;
  v_existing_store_id uuid;
  v_existing_store_name text;
  v_routed_lead_id uuid;
  v_base_lead_id uuid;
  v_next_position bigint;
  v_vehicle_name text;
  v_notes text;
  v_metadata jsonb;
begin
  if length(btrim(coalesce(p_name, ''))) < 3 then
    raise exception 'Nome é obrigatório.' using errcode = '22023';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_phone_digits) not in (10, 11) then
    raise exception 'Telefone inválido.' using errcode = '22023';
  end if;

  if p_campaign_id is null or p_vehicle_id is null then
    raise exception 'Campanha e veículo são obrigatórios.' using errcode = '22023';
  end if;

  select campaign.*
    into v_campaign
  from public.site_campaigns as campaign
  join public.events as event on event.id = campaign.event_id
  where campaign.id = p_campaign_id
    and campaign.is_active = true
    and campaign.event_id is not null
    and lower(coalesce(event.status, 'active')) not in ('deleted', 'excluido')
  for share of campaign;

  if not found then
    raise exception 'Esta campanha de evento não está disponível.' using errcode = 'P0002';
  end if;

  select vehicle.*
    into v_vehicle
  from public.site_vehicles as vehicle
  where vehicle.id = p_vehicle_id
    and vehicle.status = 'disponivel'
    and vehicle.show_on_landing = true
    and coalesce(vehicle.price, 0) > 0
  for share;

  if not found then
    raise exception 'Este veículo não está disponível no evento.' using errcode = 'P0002';
  end if;

  select assignment.store_id
    into v_vehicle_owner_store_id
  from public.event_vehicle_assignments as assignment
  join public.stores as owner_store
    on owner_store.id = assignment.store_id
   and owner_store.status = 'active'
  join public.store_event_participations as owner_participation
    on owner_participation.event_id = assignment.event_id
   and owner_participation.store_id = assignment.store_id
   and owner_participation.status = 'active'
  where assignment.event_id = v_campaign.event_id
    and assignment.vehicle_id = v_vehicle.id
    and assignment.status = 'active'
    and assignment.show_on_landing = true;

  if not found then
    raise exception 'Este veículo não está vinculado à landing do evento.' using errcode = 'P0003';
  end if;

  insert into public.event_lead_routing_state(event_id)
  values (v_campaign.event_id)
  on conflict (event_id) do nothing;

  select state.*
    into v_state
  from public.event_lead_routing_state as state
  where state.event_id = v_campaign.event_id
  for update;

  -- A trava do evento também serializa esta verificação. Assim, dois envios
  -- simultâneos do mesmo cliente não avançam o rodízio duas vezes.
  select base.id, base.routed_lead_id, base.assigned_store_id, base.assigned_store_name
    into v_existing_base_lead_id, v_existing_routed_lead_id, v_existing_store_id, v_existing_store_name
  from public.leads_base as base
  where base.event_id = v_campaign.event_id
    and base.campaign_id = v_campaign.id
    and base.vehicle_id = v_vehicle.id
    and regexp_replace(coalesce(base.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
    and base.created_at >= v_now - interval '20 minutes'
  order by base.created_at desc
  limit 1;

  if v_existing_base_lead_id is not null then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'queued_for_manual_assignment', v_existing_store_id is null,
      'event_id', v_campaign.event_id,
      'base_lead_id', v_existing_base_lead_id,
      'routed_lead_id', v_existing_routed_lead_id,
      'assigned_store_id', v_existing_store_id,
      'assigned_store_name', coalesce(v_existing_store_name, ''),
      'vehicle_owner_store_id', v_vehicle_owner_store_id,
      'routing_strategy', case
        when v_existing_store_id is null then 'event_round_robin_unassigned'
        else 'event_round_robin'
      end
    );
  end if;

  if v_state.last_store_id is not null then
    select lower(coalesce(store.store_name, ''))
      into v_last_store_sort
    from public.stores as store
    where store.id = v_state.last_store_id;
  end if;

  if v_last_store_sort is not null then
    select store.id, store.store_name
      into v_selected_store_id, v_selected_store_name
    from public.store_event_participations as participation
    join public.stores as store on store.id = participation.store_id
    where participation.event_id = v_campaign.event_id
      and participation.status = 'active'
      and store.status = 'active'
      and coalesce(store.portal_enabled, true) = true
      and (lower(coalesce(store.store_name, '')), store.id) > (v_last_store_sort, v_state.last_store_id)
    order by lower(coalesce(store.store_name, '')), store.id
    limit 1;
  end if;

  if v_selected_store_id is null then
    select store.id, store.store_name
      into v_selected_store_id, v_selected_store_name
    from public.store_event_participations as participation
    join public.stores as store on store.id = participation.store_id
    where participation.event_id = v_campaign.event_id
      and participation.status = 'active'
      and store.status = 'active'
      and coalesce(store.portal_enabled, true) = true
    order by lower(coalesce(store.store_name, '')), store.id
    limit 1;
  end if;

  v_vehicle_name := btrim(concat_ws(' ',
    nullif(v_vehicle.brand, ''),
    nullif(v_vehicle.model, ''),
    nullif(v_vehicle.version, ''),
    nullif(v_vehicle.year, '')
  ));

  v_notes := concat_ws(' ',
    nullif(btrim(coalesce(p_notes, '')), ''),
    'Lead captado pelo simulador da landing do evento.',
    'Campanha: ' || coalesce(v_campaign.name, 'Evento') || '.',
    'Veículo de interesse: ' || coalesce(nullif(v_vehicle_name, ''), 'não informado') || '.',
    'Distribuição: rodízio entre lojas participantes do evento.'
  );

  if v_selected_store_id is null then
    v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'event_id', v_campaign.event_id,
      'campaign_slug', v_campaign.slug,
      'vehicle_owner_store_id', v_vehicle_owner_store_id,
      'routing', jsonb_build_object(
        'strategy', 'event_round_robin_unassigned',
        'assigned_store_id', null,
        'assigned_store_name', null,
        'assigned_at', null,
        'routed_lead_id', null
      )
    );

    insert into public.leads_base (
      event_id, name, phone, cpf, email, source, campaign_id, campaign_name,
      vehicle_id, vehicle_name, vehicle_price, down_payment, financed_amount,
      installments, estimated_installment, interest_rate, status,
      assigned_store_id, assigned_store_name, assigned_at, routed_lead_id,
      routing_strategy, notes, metadata, created_at, updated_at
    ) values (
      v_campaign.event_id, btrim(p_name), btrim(p_phone), nullif(btrim(coalesce(p_cpf, '')), ''),
      nullif(lower(btrim(coalesce(p_email, ''))), ''), 'Landing Page Simulador',
      v_campaign.id, v_campaign.name, v_vehicle.id, v_vehicle_name, v_vehicle.price,
      greatest(coalesce(p_down_payment, 0), 0), greatest(coalesce(p_financed_amount, 0), 0),
      p_installments, greatest(coalesce(p_estimated_installment, 0), 0),
      greatest(coalesce(p_interest_rate, v_campaign.interest_rate, 0), 0),
      'Aguardando distribuição', null, null, null, null,
      'event_round_robin_unassigned', v_notes, v_metadata, v_now, v_now
    )
    returning id into v_base_lead_id;

    return jsonb_build_object(
      'success', true,
      'duplicate', false,
      'queued_for_manual_assignment', true,
      'event_id', v_campaign.event_id,
      'base_lead_id', v_base_lead_id,
      'routed_lead_id', null,
      'assigned_store_id', null,
      'assigned_store_name', '',
      'vehicle_owner_store_id', v_vehicle_owner_store_id,
      'routing_strategy', 'event_round_robin_unassigned'
    );
  end if;

  v_next_position := v_state.routed_count + 1;

  insert into public.leads (
    event_id, customer_name, customer_phone, customer_bank, interested_vehicle,
    interested_vehicle_id, interested_vehicle_price, vehicle_category_interest,
    origin, assigned_store_id, assigned_user_id, assigned_user_role,
    assignment_source, status, notes, created_at, updated_at
  ) values (
    v_campaign.event_id, btrim(p_name), btrim(p_phone), '', v_vehicle_name,
    v_vehicle.id, v_vehicle.price, '', 'event_landing', v_selected_store_id,
    null, null, 'event_round_robin', 'new_lead', v_notes, v_now, v_now
  )
  returning id into v_routed_lead_id;

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'event_id', v_campaign.event_id,
    'campaign_slug', v_campaign.slug,
    'vehicle_owner_store_id', v_vehicle_owner_store_id,
    'routing', jsonb_build_object(
      'strategy', 'event_round_robin',
      'position', v_next_position,
      'assigned_store_id', v_selected_store_id,
      'assigned_store_name', v_selected_store_name,
      'assigned_at', v_now,
      'routed_lead_id', v_routed_lead_id
    )
  );

  insert into public.leads_base (
    event_id, name, phone, cpf, email, source, campaign_id, campaign_name,
    vehicle_id, vehicle_name, vehicle_price, down_payment, financed_amount,
    installments, estimated_installment, interest_rate, status,
    assigned_store_id, assigned_store_name, assigned_at, routed_lead_id,
    routing_strategy, notes, metadata, created_at, updated_at
  ) values (
    v_campaign.event_id, btrim(p_name), btrim(p_phone), nullif(btrim(coalesce(p_cpf, '')), ''),
    nullif(lower(btrim(coalesce(p_email, ''))), ''), 'Landing Page Simulador',
    v_campaign.id, v_campaign.name, v_vehicle.id, v_vehicle_name, v_vehicle.price,
    greatest(coalesce(p_down_payment, 0), 0), greatest(coalesce(p_financed_amount, 0), 0),
    p_installments, greatest(coalesce(p_estimated_installment, 0), 0),
    greatest(coalesce(p_interest_rate, v_campaign.interest_rate, 0), 0),
    'Novo lead', v_selected_store_id, v_selected_store_name, v_now, v_routed_lead_id,
    'event_round_robin', v_notes, v_metadata, v_now, v_now
  )
  returning id into v_base_lead_id;

  insert into public.lead_activities (
    event_id, lead_id, user_id, activity_type, description, metadata
  ) values (
    v_campaign.event_id,
    v_routed_lead_id,
    null,
    'event_round_robin_assigned',
    'Lead da landing distribuído para ' || v_selected_store_name || '.',
    v_metadata
  );

  update public.event_lead_routing_state
  set
    last_store_id = v_selected_store_id,
    routed_count = v_next_position,
    last_routed_at = v_now,
    updated_at = v_now
  where event_id = v_campaign.event_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'queued_for_manual_assignment', false,
    'event_id', v_campaign.event_id,
    'base_lead_id', v_base_lead_id,
    'routed_lead_id', v_routed_lead_id,
    'assigned_store_id', v_selected_store_id,
    'assigned_store_name', v_selected_store_name,
    'vehicle_owner_store_id', v_vehicle_owner_store_id,
    'route_position', v_next_position,
    'routing_strategy', 'event_round_robin'
  );
end;
$$;

revoke all on function public.create_event_landing_lead(
  text, text, text, text, uuid, uuid, numeric, numeric, integer, numeric, numeric, text, jsonb
) from public, anon, authenticated;

grant execute on function public.create_event_landing_lead(
  text, text, text, text, uuid, uuid, numeric, numeric, integer, numeric, numeric, text, jsonb
) to service_role;

commit;

