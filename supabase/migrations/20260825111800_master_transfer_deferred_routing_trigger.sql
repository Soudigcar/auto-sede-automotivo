-- Defer Master-transfer routing until the transfer RPC has finished sanitizing the
-- operational lead and preserving the historical Master-only context.
-- Existing transferred rows are NOT reprocessed by this migration.

-- The first migration creates a wrapper while developing the atomic flow. The deferred
-- trigger is the final mechanism, so remove the unused wrapper before exposing the change.
drop function if exists public.master_transfer_base_lead_to_store_routed(uuid,uuid,uuid);

create or replace function public.route_master_transfer_after_sanitization_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_user_id uuid;
begin
  if coalesce(new.origin,'') <> 'master_transfer'
    or new.assigned_store_id is null
    or new.assigned_user_id is not null then
    return new;
  end if;

  -- Recover the actor from the immutable Master transfer audit created earlier
  -- in the same transaction. If it is not available, routing remains system-audited.
  select a.user_id
  into v_actor_user_id
  from public.leads_base lb
  join public.audit_logs a
    on a.entity_type = 'leads_base'
   and a.entity_id = lb.id
   and a.action_type = 'master_lead_transfer'
  where lb.routed_lead_id = new.id
  order by a.created_at desc
  limit 1;

  perform public.route_master_transfer_lead_by_rules(new.id,v_actor_user_id);
  return new;
end;
$function$;

revoke all on function public.route_master_transfer_after_sanitization_trigger() from public;
revoke all on function public.route_master_transfer_after_sanitization_trigger() from anon;
revoke all on function public.route_master_transfer_after_sanitization_trigger() from authenticated;

-- Idempotent installation. A deferred constraint trigger makes routing part of the
-- same transaction while allowing all sanitization/history writes to complete first.
drop trigger if exists trg_route_master_transfer_after_sanitization on public.leads;

create constraint trigger trg_route_master_transfer_after_sanitization
after insert or update on public.leads
deferrable initially deferred
for each row
when (new.origin = 'master_transfer')
execute function public.route_master_transfer_after_sanitization_trigger();
