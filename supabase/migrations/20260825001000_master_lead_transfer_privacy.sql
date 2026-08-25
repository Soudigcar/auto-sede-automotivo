-- Master lead transfer with store-facing provenance privacy.
-- Keeps historical source/event/campaign in leads_base for Master while the operational
-- lead received by the destination store is sanitized as master_transfer.

create or replace function public.master_transfer_base_lead_to_store(
  p_base_lead_id uuid,
  p_store_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_base public.leads_base%rowtype;
  v_store public.stores%rowtype;
  v_routed public.leads%rowtype;
  v_routed_id uuid;
  v_now timestamptz := clock_timestamp();
  v_metadata jsonb;
  v_history jsonb;
  v_history_entry jsonb;
  v_previous_routed_user_id uuid;
  v_previous_routed_user_role text;
  v_previous_routed_status text;
begin
  if p_actor_user_id is null or not exists (
    select 1
    from public.users u
    where u.id = p_actor_user_id
      and u.role = 'master'
      and u.status = 'active'
  ) then
    raise exception 'Ator Master invalido.' using errcode = '42501';
  end if;

  perform set_config('app.lead_routing_explicit','on',true);

  select * into v_base
  from public.leads_base
  where id = p_base_lead_id
  for update;

  if not found then
    return jsonb_build_object('outcome','not_found','base_lead_id',p_base_lead_id);
  end if;

  -- Venda concluida nunca participa de transferencia em lote comum.
  if v_base.status = 'Venda concluída' then
    return jsonb_build_object(
      'outcome','protected',
      'reason','sale_completed',
      'status',v_base.status,
      'base_lead_id',v_base.id
    );
  end if;

  select * into v_store
  from public.stores
  where id = p_store_id
    and lower(coalesce(status,'')) = 'active'
  for key share;

  if not found then
    return jsonb_build_object('outcome','invalid_store','store_id',p_store_id);
  end if;

  if v_base.assigned_store_id = v_store.id then
    return jsonb_build_object(
      'outcome','already_store',
      'base_lead_id',v_base.id,
      'store_id',v_store.id
    );
  end if;

  v_routed_id := v_base.routed_lead_id;
  if v_routed_id is not null then
    select * into v_routed
    from public.leads
    where id = v_routed_id
    for update;

    if not found then
      v_routed_id := null;
    else
      v_previous_routed_user_id := v_routed.assigned_user_id;
      v_previous_routed_user_role := v_routed.assigned_user_role;
      v_previous_routed_status := v_routed.status;

      if v_routed.status = 'sale_confirmed' then
        return jsonb_build_object(
          'outcome','protected',
          'reason','sale_completed_operational',
          'status',v_routed.status,
          'base_lead_id',v_base.id,
          'routed_lead_id',v_routed.id
        );
      end if;
    end if;
  end if;

  if v_routed_id is null then
    insert into public.leads(
      event_id,
      customer_name,
      customer_phone,
      customer_bank,
      interested_vehicle,
      vehicle_category_interest,
      origin,
      assigned_store_id,
      status,
      notes,
      assignment_source
    )
    values(
      null,
      coalesce(nullif(btrim(v_base.name),''),'Lead sem nome'),
      nullif(btrim(v_base.phone),''),
      '',
      coalesce(v_base.vehicle_name,''),
      '',
      'master_transfer',
      v_store.id,
      'new_lead',
      'Lead transferido pelo Master.',
      'master_transfer'
    )
    returning * into v_routed;
    v_routed_id := v_routed.id;
  else
    update public.leads
    set
      assigned_store_id = v_store.id,
      event_id = null,
      origin = 'master_transfer',
      status = 'new_lead',
      notes = 'Lead transferido pelo Master.',
      prospector_id = null,
      captured_by_user_id = null,
      pre_sales_user_id = null,
      pre_sales_assigned_at = null,
      seller_user_id = null,
      seller_assigned_at = null,
      assigned_user_id = null,
      assigned_user_role = null,
      assigned_user_at = null,
      assignment_source = 'master_transfer',
      scheduled_at = null,
      appointment_notes = null,
      appointment_cancelled_at = null,
      appointment_cancelled_reason = null,
      lost_reason = null,
      updated_at = v_now
    where id = v_routed_id
    returning * into v_routed;
  end if;

  -- Remove somente fila operacional antiga; decisoes/auditorias anteriores permanecem historicas.
  delete from public.lead_unassigned_queue
  where lead_id = v_routed_id;

  v_metadata := coalesce(v_base.metadata,'{}'::jsonb);
  v_history := coalesce(v_metadata->'master_transfer_history','[]'::jsonb);
  if jsonb_typeof(v_history) <> 'array' then
    v_history := '[]'::jsonb;
  end if;

  v_history_entry := jsonb_build_object(
    'transferred_at',v_now,
    'actor_user_id',p_actor_user_id,
    'from_store_id',v_base.assigned_store_id,
    'from_store_name',v_base.assigned_store_name,
    'to_store_id',v_store.id,
    'to_store_name',v_store.store_name,
    'original_event_id',v_base.event_id,
    'original_source',v_base.source,
    'original_campaign_id',v_base.campaign_id,
    'original_campaign_name',v_base.campaign_name,
    'previous_status',v_base.status,
    'previous_consultant_id',v_base.assigned_consultant_id,
    'previous_routed_user_id',v_previous_routed_user_id,
    'previous_routed_user_role',v_previous_routed_user_role,
    'previous_routed_status',v_previous_routed_status
  );

  v_metadata := jsonb_set(
    v_metadata,
    '{master_transfer_history}',
    v_history || jsonb_build_array(v_history_entry),
    true
  );

  v_metadata := jsonb_set(
    v_metadata,
    '{routing}',
    coalesce(v_metadata->'routing','{}'::jsonb) || jsonb_build_object(
      'strategy','master_transfer',
      'previous_store_id',v_base.assigned_store_id,
      'previous_store_name',v_base.assigned_store_name,
      'assigned_store_id',v_store.id,
      'assigned_store_name',v_store.store_name,
      'assigned_at',v_now,
      'routed_lead_id',v_routed_id,
      'store_visible_origin','Transferência Master'
    ),
    true
  );

  update public.leads_base
  set
    status = 'Novo lead',
    assigned_store_id = v_store.id,
    assigned_store_name = v_store.store_name,
    assigned_consultant_id = null,
    assigned_at = v_now,
    routed_lead_id = v_routed_id,
    routing_strategy = 'master_transfer',
    metadata = v_metadata,
    updated_at = v_now
  where id = v_base.id;

  return jsonb_build_object(
    'outcome','transferred',
    'base_lead_id',v_base.id,
    'routed_lead_id',v_routed_id,
    'store_id',v_store.id,
    'store_name',v_store.store_name,
    'previous_store_id',v_base.assigned_store_id,
    'previous_store_name',v_base.assigned_store_name,
    'previous_user_id',v_previous_routed_user_id,
    'previous_user_role',v_previous_routed_user_role,
    'operational_origin','master_transfer',
    'operational_event_id',null,
    'reopened',true,
    'assigned_user_id',null
  );
end;
$function$;

revoke all on function public.master_transfer_base_lead_to_store(uuid,uuid,uuid) from public;
revoke all on function public.master_transfer_base_lead_to_store(uuid,uuid,uuid) from anon;
revoke all on function public.master_transfer_base_lead_to_store(uuid,uuid,uuid) from authenticated;
grant execute on function public.master_transfer_base_lead_to_store(uuid,uuid,uuid) to service_role;
