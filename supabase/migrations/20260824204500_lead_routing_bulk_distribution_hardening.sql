-- Hardening intermediario do Motor de Roteamento.
-- Esta etapa deliberadamente NAO cria triggers nem habilita execucao automatica.
-- O rollout so fica ativo na migration final fail-closed V2.

revoke all on table public.lead_routing_rules from anon, authenticated;
revoke all on table public.lead_routing_rule_state from anon, authenticated;
revoke all on table public.lead_routing_decisions from anon, authenticated;
revoke all on table public.lead_unassigned_queue from anon, authenticated;

grant select, insert, update on table public.lead_routing_rules to service_role;
grant select on table public.lead_routing_rule_state to service_role;
grant select on table public.lead_routing_decisions to service_role;
grant select on table public.lead_unassigned_queue to service_role;

-- Fail-closed entre migrations: nenhum trigger pode permanecer ativo antes da V2 final.
drop trigger if exists leads_auto_route_by_rules on public.leads;
drop trigger if exists leads_base_auto_route_by_rules on public.leads_base;
