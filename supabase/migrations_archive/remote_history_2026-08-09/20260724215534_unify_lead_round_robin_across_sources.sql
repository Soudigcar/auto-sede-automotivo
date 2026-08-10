create or replace function public.pick_next_lead_store(
  p_routing_key text default 'default'::text
)
returns table(
  store_id uuid,
  store_name text,
  event_id uuid,
  route_position integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  effective_routing_key constant text := 'default';
  total_stores integer;
  current_position integer;
  next_position integer;
  selected_store_id uuid;
begin
  -- Todas as origens compartilham um único rodízio global.
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
  where s.status = 'active'
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
  where s.status = 'active'
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
    s.id as store_id,
    s.store_name::text as store_name,
    s.event_id,
    next_position as route_position
  from public.stores s
  where s.id = selected_store_id;
end;
$function$;

-- Reposiciona o rodízio global na última loja que realmente recebeu um lead,
-- independentemente da origem, para que o próximo lead continue a sequência correta.
with eligible_stores as (
  select
    s.id,
    row_number() over (order by s.store_name asc, s.id asc)::integer - 1 as route_position
  from public.stores s
  where s.status = 'active'
    and coalesce(s.portal_enabled, true) = true
),
latest_assignment as (
  select
    lb.assigned_store_id,
    coalesce(lb.assigned_at, lb.created_at) as routed_at
  from public.leads_base lb
  join eligible_stores es on es.id = lb.assigned_store_id
  where lb.assigned_store_id is not null
  order by coalesce(lb.assigned_at, lb.created_at) desc, lb.created_at desc, lb.id desc
  limit 1
)
update public.lead_routing_state state
set
  last_store_id = latest.assigned_store_id,
  last_position = stores.route_position,
  last_routed_at = latest.routed_at,
  updated_at = now()
from latest_assignment latest
join eligible_stores stores on stores.id = latest.assigned_store_id
where state.routing_key = 'default';

