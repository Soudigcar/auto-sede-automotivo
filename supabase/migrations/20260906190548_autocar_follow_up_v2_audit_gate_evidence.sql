-- Preserve pre-generation gate evidence without touching policies, modes or existing rows.
-- Provider results continue through the fenced transition function, never this audit-only path.
create or replace function public.audit_autocar_follow_up_v2(p_id uuid,p_outcome jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if p_outcome->>'decision' is null or p_outcome->>'decision' not in ('blocked','cancelled','superseded')
    or p_outcome->'external_execution' is distinct from 'false'::jsonb then
    raise exception 'invalid_audit_only_outcome';
  end if;
  insert into public.ai_follow_up_v2_execution_audit(execution_id,decision,reason,external_execution,metadata)
    values(p_id,p_outcome->>'decision',p_outcome->>'reason',false,
      jsonb_build_object('gates',p_outcome->'gates'));
  -- Preserve another worker's active lease and any durable provider receipt.
  if p_outcome->>'decision' in ('cancelled','superseded') then
    update public.ai_follow_up_autopilot_executions set status=p_outcome->>'decision',reason=p_outcome->>'reason',
      external_execution=false,completed_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=p_id and (status='planned' or (status='claimed' and lease_until<=clock_timestamp()));
  end if;
end $$;
revoke all on function public.audit_autocar_follow_up_v2(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.audit_autocar_follow_up_v2(uuid,jsonb) to service_role;
