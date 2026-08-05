create or replace function public.pick_next_lead_store_by_event(
  p_event_id uuid,
  p_routing_key text default 'umbler_talk'
)
returns table(
  store_id uuid,
  store_name text,
  event_id uuid,
  route_position integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_routing_key text := concat(coalesce(nullif(p_routing_key, ''), 'umbler_talk'), ':event:', p_event_id::text);
  total_stores integer;
  current_position integer;
  next_position integer;
  selected_store_id uuid;
begin
  if p_event_id is null then
    return;
  end if;

  insert into public.lead_routing_state (routing_key, last_position)
  values (effective_routing_key, -1)
  on conflict (routing_key) do nothing;

  perform 1
  from public.lead_routing_state
  where routing_key = effective_routing_key
  for update;

  select count(*)
  into total_stores
  from public.stores s
  where s.event_id = p_event_id
    and s.status = 'active'
    and coalesce(s.portal_enabled, true) = true;

  if total_stores = 0 then
    return;
  end if;

  select last_position
  into current_position
  from public.lead_routing_state
  where routing_key = effective_routing_key;

  next_position := (coalesce(current_position, -1) + 1) % total_stores;

  select s.id
  into selected_store_id
  from public.stores s
  where s.event_id = p_event_id
    and s.status = 'active'
    and coalesce(s.portal_enabled, true) = true
  order by s.store_name asc, s.id asc
  offset next_position
  limit 1;

  update public.lead_routing_state
  set
    last_store_id = selected_store_id,
    last_position = next_position,
    last_routed_at = now(),
    updated_at = now()
  where routing_key = effective_routing_key;

  return query
  select
    s.id,
    s.store_name::text,
    s.event_id,
    next_position
  from public.stores s
  where s.id = selected_store_id;
end;
$$;

grant execute on function public.pick_next_lead_store_by_event(uuid, text) to service_role;