import { createAutocarStructuredResponse } from '@/lib/server/autocar/client';
import {
  autocarModeInstructions,
  buildAutocarIntelligenceContext,
  serializeAutocarIntelligenceContext
} from '@/lib/server/autocar/intelligenceCore';
import { evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';
import type { AutocarCapability } from '@/lib/server/autocar/types';
import {
  consultAutocarAvailability,
  consultAutocarStoreHours,
  consultAutocarStoreLocation,
  consultAutocarVehiclePhotos
} from '@/lib/server/autocar/operationalTools';
import { evolutionDisplayBody } from '@/lib/server/evolutionMessage';

const shadowCapabilities: AutocarCapability[] = [
  'respond_first_contact', 'qualify_lead', 'consult_stock', 'send_vehicles', 'send_photos',
  'respond_audio_with_audio', 'schedule_visit', 'schedule_test_drive', 'create_follow_up',
  'transfer_lead', 'alter_pipeline', 'negotiate_price', 'grant_discount', 'alter_stock_price',
  'confirm_sale', 'promise_credit_approval', 'final_trade_appraisal'
];

const responseSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    response: { type: 'string' }, summary: { type: 'string' }, next_best_action: { type: 'string' },
    referenced_vehicle_ids: { type: 'array', items: { type: 'string' } },
    proposed_actions: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: { capability: { type: 'string', enum: shadowCapabilities }, reason: { type: 'string' } },
        required: ['capability', 'reason']
      }
    }
  },
  required: ['response', 'summary', 'next_best_action', 'referenced_vehicle_ids', 'proposed_actions']
};

const operationalPlanSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    needs_hours: { type: 'boolean' },
    needs_availability: { type: 'boolean' },
    needs_location: { type: 'boolean' },
    needs_photos: { type: 'boolean' },
    requested_date: { type: 'string' },
    requested_time: { type: 'string' },
    photo_vehicle_id: { type: 'string' }
  },
  required: ['needs_hours', 'needs_availability', 'needs_location', 'needs_photos', 'requested_date', 'requested_time', 'photo_vehicle_id']
};

function routingSummary(routing: any) {
  if (!routing) return null;
  return {
    version: routing.version,
    task: routing.task,
    lane: routing.lane,
    model: routing.model,
    reason: routing.reason,
    escalated: routing.escalated
  };
}

function realReferencedVehicles(intelligence: Awaited<ReturnType<typeof buildAutocarIntelligenceContext>>, ids: unknown) {
  if (!intelligence.inventory) return [];
  const allowed = new Map<string, any>();
  for (const vehicle of intelligence.inventory.inventory_index || []) if (vehicle?.id) allowed.set(String(vehicle.id), vehicle);
  for (const vehicle of intelligence.inventory.matching_vehicles || []) if (vehicle?.id) allowed.set(String(vehicle.id), vehicle);
  return (Array.isArray(ids) ? ids : []).map((value) => String(value || '').trim()).filter(Boolean).slice(0, 8).map((id) => allowed.get(id)).filter(Boolean);
}

function saoPauloNow() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}

async function buildOperationalPreview(input: {
  productionSupabase: any;
  storeId: string;
  leadId?: string | null;
  lastInbound: string;
  recentConversation: Array<{ direction: string; type: string; body: string; sent_at?: string | null }>;
  intelligence: Awaited<ReturnType<typeof buildAutocarIntelligenceContext>>;
}) {
  const plannerInstructions = [
    'Extraia somente necessidades operacionais da mensagem atual do cliente, interpretando-a semanticamente no contexto da conversa recente.',
    'Use a conversa recente para resolver referências naturais como dele, dela, esse, essa, aquele, aquela, o carro, esse modelo ou expressões equivalentes.',
    'Não use listas de palavras ou correspondência literal como decisão: interprete o sentido da conversa e a referência pretendida.',
    'Uma referência contextual só pode apontar para um veículo quando o histórico recente identificar de forma inequívoca um único veículo existente no estoque fornecido.',
    'Se houver ambiguidade entre dois ou mais veículos plausíveis, não escolha: deixe photo_vehicle_id vazio.',
    'Não carregue automaticamente uma intenção operacional antiga para uma nova mensagem independente; só mantenha a intenção quando a mensagem atual for continuação semântica clara do pedido anterior.',
    `Agora em America/Sao_Paulo: ${saoPauloNow()}. Resolva datas relativas como hoje, amanhã, sábado para YYYY-MM-DD.`,
    'requested_time deve ser HH:MM em 24h quando houver horário explícito; caso contrário use string vazia.',
    'requested_date deve ser YYYY-MM-DD quando houver dia/data identificável; caso contrário use string vazia.',
    'Para fotos, photo_vehicle_id deve ser sempre um ID exato do estoque fornecido e corresponder ao veículo efetivamente pedido pelo cliente.',
    'Mensagens anteriores ajudam a interpretar a referência, mas o estoque atual é a fonte oficial para o ID e a existência do veículo.',
    'Se não for possível identificar o veículo com segurança, deixe photo_vehicle_id vazio.',
    'Não responda ao cliente e não invente dados.'
  ].join(' ');

  const planResult = await createAutocarStructuredResponse({
    task: 'operational_planning',
    instructions: plannerInstructions,
    input: {
      mensagem_atual: input.lastInbound,
      conversa_recente: input.recentConversation.slice(-12),
      inventory: input.intelligence.inventory || null
    },
    schemaName: 'autocar_operational_plan',
    schema: operationalPlanSchema,
    maxOutputTokens: 650
  });
  const plan = planResult.parsed;
  const preview: any = {
    plan,
    hours: null,
    availability: null,
    location: null,
    photos: null,
    planner_model_routing: routingSummary(planResult.routing)
  };

  if (plan.needs_hours && plan.requested_date) preview.hours = await consultAutocarStoreHours(input.storeId, plan.requested_date);
  if (plan.needs_availability && plan.requested_date && /^([01]\d|2[0-3]):[0-5]\d$/.test(plan.requested_time || '')) {
    preview.availability = await consultAutocarAvailability({
      productionSupabase: input.productionSupabase, storeId: input.storeId, date: plan.requested_date,
      time: plan.requested_time, excludeLeadId: input.leadId || null
    });
  }
  if (plan.needs_location) preview.location = await consultAutocarStoreLocation(input.storeId);
  if (plan.needs_photos && plan.photo_vehicle_id) preview.photos = await consultAutocarVehiclePhotos({
    productionSupabase: input.productionSupabase, storeId: input.storeId, vehicleId: plan.photo_vehicle_id
  });

  return preview;
}

export async function generateAutocarShadowReply(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
}) {
  const [{ data: store, error: storeError }, { data: conversation, error: conversationError }] = await Promise.all([
    input.productionSupabase.from('stores').select('id,store_name,slug,city,state').eq('id', input.storeId).maybeSingle(),
    input.productionSupabase.from('whatsapp_conversations').select('id,store_id,lead_id,base_lead_id').eq('id', input.conversationId).eq('store_id', input.storeId).maybeSingle()
  ]);
  if (storeError) throw storeError;
  if (conversationError) throw conversationError;
  if (!store || !conversation) throw new Error('Contexto canônico da conversa não encontrado para o Shadow Mode.');

  const [{ data: lead, error: leadError }, { data: messages, error: messagesError }] = await Promise.all([
    conversation.lead_id
      ? input.productionSupabase.from('leads').select('id,customer_name,customer_phone,status,interested_vehicle,interested_vehicle_id,interested_vehicle_price,scheduled_at,notes,origin,assigned_store_id').eq('id', conversation.lead_id).eq('assigned_store_id', input.storeId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.productionSupabase.from('whatsapp_messages').select('id,direction,message_type,body,raw_payload,sent_at,created_at').eq('store_id', input.storeId).eq('conversation_id', input.conversationId).order('sent_at', { ascending: false }).order('created_at', { ascending: false }).limit(40)
  ]);
  if (leadError) throw leadError;
  if (messagesError) throw messagesError;

  const [{ data: baseLead, error: baseLeadError }, { data: commercial, error: commercialError }] = await Promise.all([
    conversation.base_lead_id ? input.productionSupabase.from('leads_base').select('id,name,phone,status,source,campaign_name').eq('id', conversation.base_lead_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    lead?.id ? input.productionSupabase.from('lead_commercial_details').select('payment_type,financing_bank,has_down_payment,down_payment_value,financed_amount,installment_count,installment_value,has_trade_in,trade_vehicle_name,trade_vehicle_manufacture_year,trade_vehicle_model_year').eq('lead_id', lead.id).eq('store_id', input.storeId).maybeSingle() : Promise.resolve({ data: null, error: null })
  ]);
  if (baseLeadError) throw baseLeadError;
  if (commercialError) throw commercialError;

  const transcript = (messages || []).reverse().map((message: any) => ({
    id: message.id, direction: String(message.direction || ''), type: String(message.message_type || 'text'),
    body: evolutionDisplayBody(message.body, message.raw_payload), sent_at: message.sent_at || message.created_at || null
  })).filter((message: any) => Boolean(String(message.body || '').trim()));
  const lastInbound = [...transcript].reverse().find((message) => message.direction === 'inbound');
  if (!lastInbound?.body) throw new Error('A conversa não possui mensagem inbound textual suficiente para o Shadow Mode.');

  const intelligence = await buildAutocarIntelligenceContext({
    storeId: input.storeId, query: String(lastInbound.body).slice(0, 6000), mode: 'autopilot', inventorySupabase: input.productionSupabase
  });
  const recentConversation = transcript.slice(-12).map((message: any) => ({
    direction: String(message.direction || ''),
    type: String(message.type || 'text'),
    body: String(message.body || '').slice(0, 2000),
    sent_at: message.sent_at || null
  }));
  const operationalPreview = await buildOperationalPreview({
    productionSupabase: input.productionSupabase, storeId: input.storeId, leadId: lead?.id || null,
    lastInbound: String(lastInbound.body), recentConversation, intelligence
  });

  const instructions = [
    intelligence.hardPolicyInstructions,
    autocarModeInstructions('autopilot'),
    'Você é a AUTOCAR em SHADOW MODE: produza exatamente a resposta textual que seria enviada ao cliente, mas não execute nem envie nada.',
    'O backend já determinou a loja e a conversa. Nunca escolha, altere ou peça store_id.',
    'Use operational_preview como fonte oficial para horário, disponibilidade, localização e fotos. Nunca contradiga essa ferramenta.',
    'Se operational_preview indicar dado não configurado, diga de forma natural que precisa confirmar essa informação; nunca invente.',
    'Se availability.available for false, não confirme o horário solicitado. Se for true, você pode dizer que o horário está disponível, mas proposed_actions deve incluir schedule_visit ou schedule_test_drive, pois o agendamento ainda não foi criado.',
    'Se photos tiver URLs, você pode dizer que separou/encontrou as fotos; proposed_actions deve incluir send_photos. Não diga que já enviou.',
    'Se location estiver configurada, pode informar endereço/link em texto, mas não diga que um pin foi enviado.',
    'store_inventory é a fonte oficial de disponibilidade de veículos. Só afirme disponibilidade, preço, ano, quilometragem ou características quando existirem nos dados fornecidos.',
    'Nunca invente desconto, aprovação de financiamento, avaliação definitiva de troca, venda concluída ou condição comercial ausente.',
    'A resposta deve ser curta, natural, comercial e em português do Brasil.',
    'referenced_vehicle_ids deve conter apenas IDs exatos existentes em store_inventory que foram efetivamente citados na resposta.',
    'proposed_actions deve listar todas as capacidades operacionais que a resposta ou o próximo passo implicariam. O backend decidirá a permissão.'
  ].join(' ');

  const finalResult = await createAutocarStructuredResponse({
    task: 'commercial_reply',
    instructions,
    input: {
      loja: store,
      crm: { lead: lead || null, base_lead: baseLead || null, commercial: commercial || null },
      conversa: transcript,
      intelligence: serializeAutocarIntelligenceContext(intelligence),
      operational_preview: operationalPreview
    },
    schemaName: 'autocar_shadow_reply',
    schema: responseSchema,
    maxOutputTokens: 1400
  });
  const parsed = finalResult.parsed;
  const raw = finalResult.payload;

  const actions = (Array.isArray(parsed.proposed_actions) ? parsed.proposed_actions : []).slice(0, 12).map((action: any) => {
    const capability = String(action?.capability || '') as AutocarCapability;
    return { capability, reason: String(action?.reason || '').trim(), decision: evaluateAutocarPolicy({ mode: 'autopilot', capability }) };
  });

  return {
    response: String(parsed.response || '').trim(),
    summary: String(parsed.summary || '').trim(),
    next_best_action: String(parsed.next_best_action || '').trim(),
    response_policy: evaluateAutocarPolicy({ mode: 'autopilot', capability: 'respond_first_contact' }),
    proposed_actions: actions,
    referenced_vehicles: realReferencedVehicles(intelligence, parsed.referenced_vehicle_ids),
    operational_preview: operationalPreview,
    intelligence: {
      training_matches: intelligence.training.length, method_matches: intelligence.methodKnowledge.length,
      store_knowledge_matches: intelligence.storeKnowledge.length,
      inventory_available_count: intelligence.inventory?.available_count ?? 0,
      inventory_matches: intelligence.inventory?.matched_count ?? 0, hard_policies_applied: true
    },
    model: finalResult.routing.model,
    model_routing: {
      planner: operationalPreview.planner_model_routing || null,
      commercial: routingSummary(finalResult.routing)
    },
    usage: { input_tokens: Number(raw?.usage?.input_tokens || 0), output_tokens: Number(raw?.usage?.output_tokens || 0) },
    no_external_execution: true
  };
}
