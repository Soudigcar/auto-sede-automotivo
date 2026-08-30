-- Repair environments that received the transactional RPC before the Master
-- scenario baseline. These rows exactly match the application's disabled
-- fallback and therefore do not activate any journey or outbound execution.

insert into public.ai_follow_up_scenarios (
  scope, store_id, scenario_key, title, description, enabled,
  attribution_window_minutes, version
) values
  ('global', null, 'silent_lead', 'Lead ficou em silêncio', 'Retoma quando o cliente para de responder após uma interação comercial elegível.', false, 1440, 1),
  ('global', null, 'simulation_pending', 'Simulação pendente', 'Retoma clientes que pediram simulação e não avançaram na conversa.', false, 2880, 1),
  ('global', null, 'vehicle_interest', 'Interesse em veículo', 'Retoma a conversa usando o veículo de interesse já conhecido pelo contexto.', false, 2880, 1),
  ('global', null, 'visit_confirmation', 'Confirmar visita', 'Confirma a visita antes do horário marcado.', false, 720, 1),
  ('global', null, 'post_visit', 'Pós-visita', 'Retoma somente quando o CRM comprova comparecimento.', false, 2880, 1),
  ('global', null, 'no_show', 'Não compareceu', 'Recupera ausência comprovada e oferece reagendamento.', false, 1440, 1),
  ('global', null, 'callback_requested', 'Retorno solicitado pelo cliente', 'Respeita data e hora explicitamente pedidas pelo cliente; nunca inventa horário.', false, 1440, 1)
on conflict do nothing;
