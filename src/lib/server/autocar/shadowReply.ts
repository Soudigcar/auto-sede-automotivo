import { autocarModelName } from '@/lib/server/autocar/client';
import {
  autocarModeInstructions,
  buildAutocarIntelligenceContext,
  serializeAutocarIntelligenceContext
} from '@/lib/server/autocar/intelligenceCore';
import { evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';
import type { AutocarCapability } from '@/lib/server/autocar/types';
import { evolutionDisplayBody } from '@/lib/server/evolutionMessage';

const shadowCapabilities: AutocarCapability[] = [
  'respond_first_contact',
  'qualify_lead',
  'consult_stock',
  'send_vehicles',
  'send_photos',
  'respond_audio_with_audio',
  'schedule_visit',
  'schedule_test_drive',
  'create_follow_up',
  'transfer_lead',
  'alter_pipeline',
  'negotiate_price',
  'grant_discount',
  'alter_stock_price',
  'confirm_sale',
  'promise_credit_approval',
  'final_trade_appraisal'
];

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    response: { type: 'string' },
    summary: { type: 'string' },
    next_best_action: { type: 'string' },
    referenced_vehicle_ids: { type: 'array', items: { type: 'string' } },
    proposed_actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          capability: { type: 'string', enum: shadowCapabilities },
          reason: { type: 'string' }
        },
        required: ['capability', 'reason']
      }
    }
  },
  required: ['response', 'summary', 'next_best_action', 'referenced_vehicle_ids', 'proposed_actions']
};

function openAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível no ambiente de Preview.');
  return key;
}

function outputText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return '';
}

function realReferencedVehicles(intelligence: Awaited<ReturnType<typeof buildAutocarIntelligenceContext>>, ids: unknown) {
  if (!intelligence.inventory) return [];
  const allowed = new Map<string, any>();
  for (const vehicle of intelligence.inventory.inventory_index || []) if (vehicle?.id) allowed.set(String(vehicle.id), vehicle);
  for (const vehicle of intelligence.inventory.matching_vehicles || []) if (vehicle?.id) allowed.set(String(vehicle.id), vehicle);
  return (Array.isArray(ids) ? ids : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((id) => allowed.get(id))
    .filter(Boolean);
}

export async function generateAutocarShadowReply(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
}) {
  const [{ data: store, error: storeError }, { data: conversation, error: conversationError }] = await Promise.all([
    input.productionSupabase.from('stores')
      .select('id,store_name,slug,city,state')
      .eq('id', input.storeId).maybeSingle(),
    input.productionSupabase.from('whatsapp_conversations')
      .select('id,store_id,lead_id,base_lead_id')
      .eq('id', input.conversationId).eq('store_id', input.storeId).maybeSingle()
  ]);
  if (storeError) throw storeError;
  if (conversationError) throw conversationError;
  if (!store || !conversation) throw new Error('Contexto canônico da conversa não encontrado para o Shadow Mode.');

  const [{ data: lead, error: leadError }, { data: messages, error: messagesError }] = await Promise.all([
    conversation.lead_id
      ? input.productionSupabase.from('leads')
          .select('id,customer_name,customer_phone,status,interested_vehicle,interested_vehicle_id,interested_vehicle_price,scheduled_at,notes,origin,assigned_store_id')
          .eq('id', conversation.lead_id).eq('assigned_store_id', input.storeId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.productionSupabase.from('whatsapp_messages')
      .select('id,direction,message_type,body,raw_payload,sent_at,created_at')
      .eq('store_id', input.storeId).eq('conversation_id', input.conversationId)
      .order('sent_at', { ascending: false }).order('created_at', { ascending: false }).limit(40)
  ]);
  if (leadError) throw leadError;
  if (messagesError) throw messagesError;

  const [{ data: baseLead, error: baseLeadError }, { data: commercial, error: commercialError }] = await Promise.all([
    conversation.base_lead_id
      ? input.productionSupabase.from('leads_base')
          .select('id,name,phone,status,source,campaign_name')
          .eq('id', conversation.base_lead_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    lead?.id
      ? input.productionSupabase.from('lead_commercial_details')
          .select('payment_type,financing_bank,has_down_payment,down_payment_value,financed_amount,installment_count,installment_value,has_trade_in,trade_vehicle_name,trade_vehicle_manufacture_year,trade_vehicle_model_year')
          .eq('lead_id', lead.id).eq('store_id', input.storeId).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (baseLeadError) throw baseLeadError;
  if (commercialError) throw commercialError;

  const transcript = (messages || []).reverse().map((message: any) => ({
    id: message.id,
    direction: String(message.direction || ''),
    type: String(message.message_type || 'text'),
    body: evolutionDisplayBody(message.body, message.raw_payload),
    sent_at: message.sent_at || message.created_at || null
  })).filter((message: any) => Boolean(String(message.body || '').trim()));

  const lastInbound = [...transcript].reverse().find((message) => message.direction === 'inbound');
  if (!lastInbound?.body) throw new Error('A conversa não possui mensagem inbound textual suficiente para o Shadow Mode.');

  const intelligence = await buildAutocarIntelligenceContext({
    storeId: input.storeId,
    query: String(lastInbound.body).slice(0, 6000),
    mode: 'autopilot',
    inventorySupabase: input.productionSupabase
  });

  const instructions = [
    intelligence.hardPolicyInstructions,
    autocarModeInstructions('autopilot'),
    'Você é a AUTOCAR em SHADOW MODE: produza exatamente a resposta textual que seria enviada ao cliente, mas não execute nem envie nada.',
    'O backend já determinou a loja e a conversa. Nunca escolha, altere ou peça store_id.',
    'Use a conversa, CRM, Método Venda Mais, Biblioteca Global, treinamentos aprovados, conhecimento específico da loja e estoque real somente quando relevantes.',
    'store_inventory é a fonte oficial de disponibilidade. Só afirme disponibilidade, preço, ano, quilometragem ou características quando existirem nos dados fornecidos.',
    'Interprete linguagem natural, abreviações e erros de digitação de forma conservadora.',
    'Nunca invente desconto, aprovação de financiamento, avaliação definitiva de troca, venda concluída ou condição comercial ausente.',
    'A resposta deve ser curta, natural, comercial e em português do Brasil.',
    'referenced_vehicle_ids deve conter apenas IDs exatos existentes em store_inventory que foram efetivamente citados na resposta.',
    'proposed_actions deve listar todas as capacidades operacionais que a resposta ou o próximo passo implicariam. Não decida se elas são permitidas: o backend fará essa decisão deterministicamente.',
    'Se a situação exigir humano por preço, desconto, crédito, avaliação ou outra hard policy, ainda escreva uma resposta segura ao cliente e registre a ação sensível em proposed_actions.'
  ].join(' ');

  const model = autocarModelName();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1400,
      instructions,
      input: JSON.stringify({
        loja: store,
        crm: { lead: lead || null, base_lead: baseLead || null, commercial: commercial || null },
        conversa: transcript,
        intelligence: serializeAutocarIntelligenceContext(intelligence)
      }),
      text: { format: { type: 'json_schema', name: 'autocar_shadow_reply', strict: true, schema } }
    }),
    cache: 'no-store'
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(raw?.error?.message || `OpenAI respondeu com HTTP ${response.status}.`).slice(0, 500));
  const text = outputText(raw);
  if (!text) throw new Error('A OpenAI não retornou resposta para o Shadow Mode.');

  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('A resposta estruturada do Shadow Mode não pôde ser interpretada.'); }

  const actions = (Array.isArray(parsed.proposed_actions) ? parsed.proposed_actions : []).slice(0, 12).map((action: any) => {
    const capability = String(action?.capability || '') as AutocarCapability;
    const decision = evaluateAutocarPolicy({ mode: 'autopilot', capability });
    return {
      capability,
      reason: String(action?.reason || '').trim(),
      decision
    };
  });

  const responseDecision = evaluateAutocarPolicy({ mode: 'autopilot', capability: 'respond_first_contact' });
  const referencedVehicles = realReferencedVehicles(intelligence, parsed.referenced_vehicle_ids);

  return {
    response: String(parsed.response || '').trim(),
    summary: String(parsed.summary || '').trim(),
    next_best_action: String(parsed.next_best_action || '').trim(),
    response_policy: responseDecision,
    proposed_actions: actions,
    referenced_vehicles: referencedVehicles,
    intelligence: {
      training_matches: intelligence.training.length,
      method_matches: intelligence.methodKnowledge.length,
      store_knowledge_matches: intelligence.storeKnowledge.length,
      inventory_available_count: intelligence.inventory?.available_count ?? 0,
      inventory_matches: intelligence.inventory?.matched_count ?? 0,
      hard_policies_applied: true
    },
    model,
    usage: {
      input_tokens: Number(raw?.usage?.input_tokens || 0),
      output_tokens: Number(raw?.usage?.output_tokens || 0)
    },
    no_external_execution: true
  };
}
