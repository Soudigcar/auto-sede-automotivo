-- Keep configured-rotation multistore distribution fully atomic.
-- The V1 implementation is retained as a private implementation function;
-- the public service-role surface rolls back any newly-created store instance
-- when the destination routing engine does not assign an eligible user.

alter function public.distribute_base_lead_multistore(uuid,uuid,uuid,text,uuid)
  rename to distribute_base_lead_multistore_impl;

revoke all on function public.distribute_base_lead_multistore_impl(uuid,uuid,uuid,text,uuid) from public;
revoke all on function public.distribute_base_lead_multistore_impl(uuid,uuid,uuid,text,uuid) from anon;
revoke all on function public.distribute_base_lead_multistore_impl(uuid,uuid,uuid,text,uuid) from authenticated;
revoke all on function public.distribute_base_lead_multistore_impl(uuid,uuid,uuid,text,uuid) from service_role;

create or replace function public.distribute_base_lead_multistore(
  p_base_lead_id uuid,
  p_store_id uuid,
  p_actor_user_id uuid,
  p_mode text default 'configured_rotation',
  p_selected_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_routing_outcome text;
begin
  v_result := public.distribute_base_lead_multistore_impl(
    p_base_lead_id,
    p_store_id,
    p_actor_user_id,
    p_mode,
    p_selected_user_id
  );

  if p_mode = 'configured_rotation'
    and coalesce(v_result->>'outcome','') = 'distributed' then
    v_routing_outcome := coalesce(v_result->>'routing_outcome','');
    if v_routing_outcome <> 'assigned' then
      raise exception 'Roteamento multiloja fail-closed cancelado: %',
        coalesce(v_result->'routing','{}'::jsonb)::text
        using errcode = 'P0001';
    end if;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.distribute_base_lead_multistore(uuid,uuid,uuid,text,uuid) from public;
revoke all on function public.distribute_base_lead_multistore(uuid,uuid,uuid,text,uuid) from anon;
revoke all on function public.distribute_base_lead_multistore(uuid,uuid,uuid,text,uuid) from authenticated;
grant execute on function public.distribute_base_lead_multistore(uuid,uuid,uuid,text,uuid) to service_role;

-- Recompile compatibility wrappers against the new public fail-closed surface.
create or replace function public.distribute_base_lead_to_store(
  p_base_lead_id uuid,
  p_store_id uuid,
  p_actor_user_id uuid,
  p_mode text default 'configured_rotation',
  p_selected_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  v_result := public.distribute_base_lead_multistore(
    p_base_lead_id,p_store_id,p_actor_user_id,p_mode,p_selected_user_id
  );

  if coalesce(v_result->>'outcome','') = 'distributed' then
    return v_result || jsonb_build_object(
      'outcome','assigned',
      'strategy',case when p_mode = 'configured_rotation' then 'routing_rule' else 'master_bulk_distribution' end
    );
  end if;

  if coalesce(v_result->>'outcome','') = 'already_present' then
    return v_result || jsonb_build_object('outcome','already_assigned');
  end if;

  return v_result;
end;
$function$;

revoke all on function public.distribute_base_lead_to_store(uuid,uuid,uuid,text,uuid) from public;
revoke all on function public.distribute_base_lead_to_store(uuid,uuid,uuid,text,uuid) from anon;
revoke all on function public.distribute_base_lead_to_store(uuid,uuid,uuid,text,uuid) from authenticated;
grant execute on function public.distribute_base_lead_to_store(uuid,uuid,uuid,text,uuid) to service_role;

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
  v_result jsonb;
begin
  v_result := public.distribute_base_lead_multistore(
    p_base_lead_id,p_store_id,p_actor_user_id,'configured_rotation',null
  );

  if coalesce(v_result->>'outcome','') = 'distributed' then
    return v_result || jsonb_build_object(
      'outcome','transferred',
      'multistore',true,
      'privacy_mode','master_transfer'
    );
  end if;

  return v_result;
end;
$function$;

revoke all on function public.master_transfer_base_lead_to_store(uuid,uuid,uuid) from public;
revoke all on function public.master_transfer_base_lead_to_store(uuid,uuid,uuid) from anon;
revoke all on function public.master_transfer_base_lead_to_store(uuid,uuid,uuid) from authenticated;
grant execute on function public.master_transfer_base_lead_to_store(uuid,uuid,uuid) to service_role;
