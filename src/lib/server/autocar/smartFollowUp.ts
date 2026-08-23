import { evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';

type TriggerType = 'visit_confirmation' | 'post_visit' | 'no_show' | 'callback_requested';
type EventRow = {
  id: string;
  store_id: string;
  production_conversation_id: string;
  production_lead_id?: string | null;
  trigger_type: TriggerType;
  contact_basis: 'appointment_service' | 'customer_requested_callback';
  due_at: string;
  status: string;
  source_type: 'appointment' | 'callback_request' | 'manual_test';
  source_id?: string | null;
  anchor_message_id?: string | null;
  context_last_message_at?: string | null;
  idempotency_key: string;
  source_snapshot?: Record<string, unknown> | null;
  attempt_count?: number;
};

type Decision = {
  decision: 'would_send' | 'blocked' | 'cancelled';
  reason: string;
  proposed_text: string | null;
  trigger_type: TriggerType;
  gates: Record<string, unknown>;
  external_execution: false;
};

const FOLLOW_UP_VERSION = 'autocar-smart-follow-up-v1-dry-run';
const allowedBases = new Set(['appointment_service', 'customer_requested_callback']);

function safeName(value: unknown) {
  const name = String(value || '').trim().split(/\s+/)[0] || 'cliente';
  return name.slice(0, 60);
}

function appointmentIso(dateValue: unknown, timeValue: unknown) {
  const date = String(dateValue || '').slice(0, 10);
  const time = String(timeValue || '00:00:00').slice(0, 8);
  const parsed = new Date(`${date}T${time}-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function eventKey(storeId: string, sourceId: string, trigger: TriggerType) {
  return `autocar-follow-up:v1:${storeId}:${sourceId}:${trigger}`;
}

function visitWhen(scheduledAt?: string | null) {
  if (!scheduledAt) return 'no horário combinado';
  const parsed = new Date(scheduledAt);
  if (Number.isNaN(parsed.getTime())) return 'no horário combinado';
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(parsed);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(parsed);
  return `no dia ${date} às ${time}`;
}

function textFor(trigger: TriggerType, name: string, scheduledAt?: string | null) {
  if (trigger === 'visit_confirmation') {
    return `Oi, ${name}! Passando para confirmar sua visita conosco ${visitWhen(scheduledAt)}. Continua tudo certo para você?`;
  }
  if (trigger === 'post_visit') return `Oi, ${name}! Queria saber se você foi bem atendido na visita e se deu tudo certo com a negociação.`;
  if (trigger === 'no_show') return `Oi, ${name}! Conseguiu passar na loja como combinado? Se não conseguiu, sem problema — posso te ajudar a encontrar um novo horário.`;
  return `Oi, ${name}! Você pediu para eu falar com você agora. Podemos continuar de onde paramos?`;
}

function saoPauloParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function parseExplicitCallbackRequest(textValue: unknown, now = new Date()) {
  const text = String(textValue || '').trim().toLowerCase();
  if (!text) return { matched: false, due_at: null as string | null, reason: 'Mensagem vazia.' };
  const asksCallback = /(me chama|me chame|fala comigo|fale comigo|pode chamar|pode me chamar|retorna|retorne|me liga|me ligue)/i.test(text);
  if (!asksCallback) return { matched: false, due_at: null as string | null, reason: 'Mensagem não contém pedido explícito de retorno.' };

  const timeMatch = text.match(/(?:às|as|a)?\s*(\d{1,2})(?::|h)(\d{2})?\b/i);
  if (!timeMatch) return { matched: false, due_at: null as string | null, reason: 'Pedido de retorno sem horário explícito; V1 não adivinha “mais tarde”.' };
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { matched: false, due_at: null as string | null, reason: 'Horário solicitado é inválido.' };

  const dateParts = saoPauloParts(now);
  const base = new Date(`${dateParts.year}-${dateParts.month}-${dateParts.day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`);
  const tomorrow = /amanh[ãa]/i.test(text);
  const due = new Date(base.getTime() + (tomorrow ? 24 * 60 * 60 * 1000 : 0));
  if (!tomorrow && due.getTime() <= now.getTime()) {
    return { matched: false, due_at: null as string | null, reason: 'Horário de hoje já passou; é necessária confirmação explícita de outro dia.' };
  }
  if (due.getTime() - now.getTime() > 7 * 24 * 60 * 60 * 1000) {
    return { matched: false, due_at: null as string | null, reason: 'Callback fora da janela máxima do V1.' };
  }
  return { matched: true, due_at: due.toISOString(), reason: 'Pedido explícito de callback com horário determinado.' };
}

async function activeConversationForLead(production: any, storeId: string, leadId: string) {
  const { data, error } = await production.from('whatsapp_conversations')
    .select('id,store_id,lead_id,base_lead_id,status,last_message_at')
    .eq('store_id', storeId).eq('lead_id', leadId)
    .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function insertEventIfMissing(autocar: any, row: Record<string, unknown>) {
  const { data, error } = await autocar.from('ai_follow_up_events')
    .upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true })
    .select('id,idempotency_key,status,due_at,trigger_type').maybeSingle();
  if (error) throw error;
  return data;
}

export async function planAppointmentFollowUps(input: { production: any; autocar: any; now?: Date }) {
  const now = input.now || new Date();
  const minDate = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: appointments, error } = await input.production.from('appointments')
    .select('id,lead_id,store_id,appointment_date,appointment_time,status,updated_at')
    .gte('appointment_date', minDate).lte('appointment_date', maxDate)
    .in('status', ['scheduled']).limit(100);
  if (error) throw error;

  let planned = 0;
  let skipped = 0;
  for (const appointment of appointments || []) {
    if (!appointment?.lead_id || !appointment?.store_id) { skipped += 1; continue; }
    const scheduledAt = appointmentIso(appointment.appointment_date, appointment.appointment_time);
    if (!scheduledAt) { skipped += 1; continue; }
    const conversation = await activeConversationForLead(input.production, appointment.store_id, appointment.lead_id);
    if (!conversation?.id) { skipped += 1; continue; }
    const startMs = new Date(scheduledAt).getTime();
    const confirmationMs = Math.max(now.getTime() + 60_000, startMs - 24 * 60 * 60 * 1000);
    const outcomeMs = startMs + 2 * 60 * 60 * 1000;
    const snapshot = { appointment_id: appointment.id, scheduled_at: scheduledAt, appointment_status: appointment.status };
    const common = {
      store_id: appointment.store_id,
      production_conversation_id: conversation.id,
      production_lead_id: appointment.lead_id,
      contact_basis: 'appointment_service',
      source_type: 'appointment',
      source_id: appointment.id,
      context_last_message_at: conversation.last_message_at || null,
      source_snapshot: snapshot,
      status: 'pending'
    };
    const rows = [
      { ...common, trigger_type: 'visit_confirmation', due_at: new Date(confirmationMs).toISOString(), idempotency_key: eventKey(appointment.store_id, appointment.id, 'visit_confirmation') },
      { ...common, trigger_type: 'post_visit', due_at: new Date(outcomeMs).toISOString(), idempotency_key: eventKey(appointment.store_id, appointment.id, 'post_visit') },
      { ...common, trigger_type: 'no_show', due_at: new Date(outcomeMs + 60_000).toISOString(), idempotency_key: eventKey(appointment.store_id, appointment.id, 'no_show') }
    ];
    for (const row of rows) { await insertEventIfMissing(input.autocar, row); planned += 1; }
  }
  return { version: FOLLOW_UP_VERSION, appointments: (appointments || []).length, planned, skipped, external_execution: false };
}

export async function createCallbackRequestedEvent(input: {
  autocar: any; storeId: string; conversationId: string; leadId?: string | null; dueAt: string;
  anchorMessageId: string; contextLastMessageAt?: string | null;
}) {
  const due = new Date(input.dueAt);
  if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) throw new Error('Callback deve ter horário futuro válido.');
  const key = eventKey(input.storeId, input.anchorMessageId, 'callback_requested');
  return insertEventIfMissing(input.autocar, {
    store_id: input.storeId,
    production_conversation_id: input.conversationId,
    production_lead_id: input.leadId || null,
    trigger_type: 'callback_requested',
    contact_basis: 'customer_requested_callback',
    due_at: due.toISOString(),
    status: 'pending',
    source_type: 'callback_request',
    source_id: input.anchorMessageId,
    anchor_message_id: input.anchorMessageId,
    context_last_message_at: input.contextLastMessageAt || null,
    idempotency_key: key,
    source_snapshot: { customer_requested_callback: true }
  });
}

export async function evaluateFollowUpEvent(input: { production: any; autocar: any; event: EventRow }): Promise<Decision> {
  const event = input.event;
  const gates: Record<string, unknown> = { version: FOLLOW_UP_VERSION, dry_run: true, contact_basis: event.contact_basis };
  if (!allowedBases.has(event.contact_basis)) return { decision: 'blocked', reason: 'Base de contato não permitida no Smart Follow-up V1.', proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };

  const [globalPolicyResult, storePolicyResult, agentResult, runtimeResult] = await Promise.all([
    input.autocar.from('ai_global_capability_policies').select('effect,is_active').eq('capability', 'create_follow_up').maybeSingle(),
    input.autocar.from('ai_store_policies').select('effect,is_active,priority').eq('store_id', event.store_id).eq('policy_key', 'create_follow_up').eq('is_active', true).order('priority', { ascending: false }).limit(1).maybeSingle(),
    input.autocar.from('ai_store_agents').select('status,mode,master_enabled,master_autopilot_allowed,store_selected_mode').eq('store_id', event.store_id).maybeSingle(),
    input.autocar.from('ai_runtime_conversations').select('effective_mode,human_state,pause_reason').eq('store_id', event.store_id).eq('production_conversation_id', event.production_conversation_id).maybeSingle()
  ]);
  if (globalPolicyResult.error) throw globalPolicyResult.error;
  if (storePolicyResult.error) throw storePolicyResult.error;
  if (agentResult.error) throw agentResult.error;
  if (runtimeResult.error) throw runtimeResult.error;
  const globalEffect = globalPolicyResult.data?.is_active ? globalPolicyResult.data.effect : null;
  const storeEffect = storePolicyResult.data?.is_active ? storePolicyResult.data.effect : null;
  gates.global_policy = globalEffect || 'default';
  gates.store_policy = storeEffect || 'default';
  if (globalEffect !== 'allow') return { decision: 'blocked', reason: 'Smart Follow-up exige liberação explícita do Master.', proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };
  if (storeEffect !== 'allow') return { decision: 'blocked', reason: 'Smart Follow-up exige liberação explícita da loja dentro do teto do Master.', proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };
  const policy = evaluateAutocarPolicy({ mode: 'autopilot', capability: 'create_follow_up', globalEffect: 'allow', storeEffect: 'allow' });
  gates.policy_effect = policy.effect;
  if (policy.effect !== 'allow') return { decision: 'blocked', reason: `Governança create_follow_up: ${policy.reason}`, proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };

  const agent = agentResult.data;
  const runtime = runtimeResult.data;
  const modeOk = Boolean(agent?.master_enabled && agent?.master_autopilot_allowed && agent?.status === 'active' && agent?.mode === 'autopilot' && agent?.store_selected_mode === 'autopilot' && runtime?.effective_mode === 'autopilot');
  gates.autopilot_gate = modeOk;
  if (!modeOk) return { decision: 'blocked', reason: 'Master + loja + runtime não estão efetivamente em AUTOPILOT.', proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };
  gates.human_state = runtime?.human_state || null;
  if (runtime?.human_state !== 'autocar_active') return { decision: 'blocked', reason: `Conversa em takeover humano: ${runtime?.pause_reason || runtime?.human_state}.`, proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };

  const [leadResult, saleResult, conversationResult] = await Promise.all([
    event.production_lead_id ? input.production.from('leads').select('id,customer_name,status,scheduled_at,appointment_cancelled_at').eq('id', event.production_lead_id).eq('assigned_store_id', event.store_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    event.production_lead_id ? input.production.from('sales').select('id,status,confirmed_at').eq('lead_id', event.production_lead_id).eq('store_id', event.store_id).eq('status', 'confirmed').limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
    input.production.from('whatsapp_conversations').select('id,status,last_message_at,lead_id').eq('id', event.production_conversation_id).eq('store_id', event.store_id).maybeSingle()
  ]);
  if (leadResult.error) throw leadResult.error;
  if (saleResult.error) throw saleResult.error;
  if (conversationResult.error) throw conversationResult.error;
  const lead = leadResult.data;
  const sale = saleResult.data;
  const conversation = conversationResult.data;
  gates.lead_status = lead?.status || null;
  gates.sale_confirmed = Boolean(sale);
  gates.conversation_status = conversation?.status || null;
  if (sale) return { decision: 'cancelled', reason: 'Venda já confirmada; follow-up comercial encerrado.', proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };
  if (!conversation || conversation.status !== 'open') return { decision: 'cancelled', reason: 'Conversa canônica não está aberta.', proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };

  if (event.context_last_message_at && conversation.last_message_at && new Date(conversation.last_message_at).getTime() > new Date(event.context_last_message_at).getTime()) {
    gates.new_message_since_plan = true;
    return { decision: 'cancelled', reason: 'Houve nova mensagem depois do planejamento; o evento ficou obsoleto e deve ser reavaliado pela conversa atual.', proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };
  }
  gates.new_message_since_plan = false;

  let appointment: any = null;
  if (event.source_type === 'appointment' && event.source_id) {
    const { data, error } = await input.production.from('appointments').select('id,status,appointment_date,appointment_time,updated_at').eq('id', event.source_id).eq('store_id', event.store_id).maybeSingle();
    if (error) throw error;
    appointment = data;
    gates.appointment_status = appointment?.status || null;
    if (!appointment || appointment.status !== 'scheduled') {
      return { decision: 'cancelled', reason: 'Agendamento original não está mais ativo.', proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };
    }
  }

  if (event.trigger_type === 'post_visit' && lead?.status !== 'showed_up') return { decision: 'cancelled', reason: 'Pós-visita só ocorre quando o CRM comprova comparecimento.', proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };
  if (event.trigger_type === 'no_show' && lead?.status === 'showed_up') return { decision: 'cancelled', reason: 'Cliente compareceu; recuperação de ausência não se aplica.', proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };
  if (event.trigger_type === 'no_show' && !['scheduled','appointment_cancelled'].includes(String(lead?.status || ''))) return { decision: 'cancelled', reason: 'Estado atual do lead não comprova ausência elegível para recuperação.', proposed_text: null, trigger_type: event.trigger_type, gates, external_execution: false };

  const scheduledAt = appointment ? appointmentIso(appointment.appointment_date, appointment.appointment_time) : String(event.source_snapshot?.scheduled_at || '');
  const proposed = textFor(event.trigger_type, safeName(lead?.customer_name), scheduledAt);
  return { decision: 'would_send', reason: 'Todos os gates do Smart Follow-up V1 passaram. V1 permanece dry-run e não envia mensagem.', proposed_text: proposed, trigger_type: event.trigger_type, gates, external_execution: false };
}

export async function processDueFollowUpsDryRun(input: { production: any; autocar: any; workerId: string; limit?: number }) {
  const planning = await planAppointmentFollowUps({ production: input.production, autocar: input.autocar });
  const { data: events, error } = await input.autocar.rpc('claim_autocar_follow_up_events', { p_worker_id: input.workerId, p_limit: input.limit || 25, p_lease_seconds: 120 });
  if (error) throw error;
  const results: any[] = [];
  for (const event of (events || []) as EventRow[]) {
    let decision: Decision;
    try { decision = await evaluateFollowUpEvent({ production: input.production, autocar: input.autocar, event }); }
    catch (error: any) { decision = { decision: 'blocked', reason: `Erro de revalidação: ${String(error?.message || error).slice(0, 300)}`, proposed_text: null, trigger_type: event.trigger_type, gates: { dry_run: true }, external_execution: false }; }
    const status = decision.decision === 'would_send' ? 'dry_run_ready' : decision.decision === 'cancelled' ? 'cancelled' : 'dry_run_blocked';
    const { error: updateError } = await input.autocar.from('ai_follow_up_events').update({ status, lease_owner: null, lease_until: null, last_decision: decision }).eq('id', event.id).eq('lease_owner', input.workerId);
    if (updateError) throw updateError;
    const { error: auditError } = await input.autocar.from('ai_follow_up_event_audit').insert({ event_id: event.id, event_status: status, action: 'dry_run_evaluated', detail: decision });
    if (auditError) throw auditError;
    results.push({ event_id: event.id, status, ...decision });
  }
  return { version: FOLLOW_UP_VERSION, dry_run: true, external_execution: false, planning, claimed: (events || []).length, results };
}

export function simulateSmartFollowUp(input: {
  trigger_type: TriggerType; global_policy?: string; store_policy?: string; autopilot?: boolean; human_active?: boolean;
  sale_confirmed?: boolean; new_message?: boolean; appointment_status?: string; lead_status?: string; customer_name?: string;
  scheduled_at?: string | null;
}) {
  const gates = {
    global_policy: input.global_policy || 'default', store_policy: input.store_policy || 'default',
    autopilot: input.autopilot === true, human_active: input.human_active === true,
    sale_confirmed: input.sale_confirmed === true, new_message: input.new_message === true,
    appointment_status: input.appointment_status || 'scheduled', lead_status: input.lead_status || 'scheduled'
  };
  if (gates.global_policy !== 'allow') return { decision: 'blocked', reason: 'Smart Follow-up exige liberação explícita do Master.', proposed_text: null, gates, external_execution: false };
  if (gates.store_policy !== 'allow') return { decision: 'blocked', reason: 'Smart Follow-up exige liberação explícita da loja.', proposed_text: null, gates, external_execution: false };
  if (!gates.autopilot) return { decision: 'blocked', reason: 'AUTOPILOT efetivo é obrigatório para execução futura.', proposed_text: null, gates, external_execution: false };
  if (!gates.human_active) return { decision: 'blocked', reason: 'Takeover humano bloqueia follow-up automático.', proposed_text: null, gates, external_execution: false };
  if (gates.sale_confirmed) return { decision: 'cancelled', reason: 'Venda confirmada encerra follow-up comercial.', proposed_text: null, gates, external_execution: false };
  if (gates.new_message) return { decision: 'cancelled', reason: 'Nova mensagem tornou o evento anterior obsoleto.', proposed_text: null, gates, external_execution: false };
  if (input.trigger_type !== 'callback_requested' && gates.appointment_status !== 'scheduled') return { decision: 'cancelled', reason: 'Agendamento não está mais ativo.', proposed_text: null, gates, external_execution: false };
  if (input.trigger_type === 'post_visit' && gates.lead_status !== 'showed_up') return { decision: 'cancelled', reason: 'Pós-visita exige comparecimento comprovado.', proposed_text: null, gates, external_execution: false };
  if (input.trigger_type === 'no_show' && gates.lead_status === 'showed_up') return { decision: 'cancelled', reason: 'Cliente compareceu; no-show não se aplica.', proposed_text: null, gates, external_execution: false };
  return { decision: 'would_send', reason: 'Cenário elegível, mas o V1 apenas simula.', proposed_text: textFor(input.trigger_type, safeName(input.customer_name || 'Cliente'), input.scheduled_at), gates, external_execution: false };
}
