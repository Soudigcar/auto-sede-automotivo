import { autocarModelName } from '@/lib/server/autocar/client';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    booking_requested: { type: 'boolean' },
    booking_type: { type: 'string', enum: ['none', 'visit', 'test_drive'] },
    planner_confirmed: { type: 'boolean' },
    confirmation_evidence: { type: 'string' },
    requested_date: { type: 'string' },
    requested_time: { type: 'string' }
  },
  required: ['booking_requested', 'booking_type', 'planner_confirmed', 'confirmation_evidence', 'requested_date', 'requested_time']
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

function saoPauloNow() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}

export async function resolveBookingContext(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
}) {
  const autocar = getAutocarDevClient();
  const [messageResult, claimResult] = await Promise.all([
    input.productionSupabase.from('whatsapp_messages')
      .select('id,direction,body,sent_at,created_at')
      .eq('store_id', input.storeId)
      .eq('conversation_id', input.conversationId)
      .order('sent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(12),
    autocar.from('ai_runtime_message_claims')
      .select('id,result,created_at,status')
      .eq('store_id', input.storeId)
      .eq('production_conversation_id', input.conversationId)
      .eq('purpose', 'autopilot_reply')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);
  if (messageResult.error) throw messageResult.error;
  if (claimResult.error) throw claimResult.error;

  const ordered = (messageResult.data || []).reverse().map((message: any) => ({
    id: message.id,
    direction: String(message.direction || ''),
    body: String(message.body || '').trim(),
    sent_at: message.sent_at || message.created_at || null
  })).filter((message: any) => message.body);

  const latestInboundIndex = [...ordered].map((message: any) => message.direction).lastIndexOf('inbound');
  const latestInbound = latestInboundIndex >= 0 ? ordered[latestInboundIndex] : null;
  const productionPreviousOutbound = latestInboundIndex > 0
    ? [...ordered.slice(0, latestInboundIndex)].reverse().find((message: any) => message.direction === 'outbound') || null
    : null;

  const previousShadow = claimResult.data?.result || null;
  const shadowResponse = String(previousShadow?.response || '').trim();
  const shadowBooking = previousShadow?.booking_guard || null;
  const shadowOperational = previousShadow?.operational_preview || null;
  const shadowProposal = shadowResponse ? {
    response: shadowResponse,
    booking_state: shadowBooking?.state || null,
    booking_type: shadowBooking?.booking_type || null,
    requested_date: shadowBooking?.requested_date || shadowOperational?.plan?.requested_date || '',
    requested_time: shadowBooking?.requested_time || shadowOperational?.plan?.requested_time || ''
  } : null;

  const previousOutboundText = shadowResponse || productionPreviousOutbound?.body || null;

  if (!latestInbound) {
    return {
      booking_requested: false,
      booking_type: 'none',
      planner_confirmed: false,
      confirmation_evidence: '',
      requested_date: '',
      requested_time: '',
      latest_inbound: '',
      previous_outbound: previousOutboundText,
      shadow_proposal: shadowProposal
    };
  }

  const instructions = [
    'Analise somente se a ÚLTIMA mensagem inbound confirma ou solicita um agendamento de visita/test-drive.',
    `Agora em America/Sao_Paulo: ${saoPauloNow()}.`,
    'Use a proposta Shadow anterior quando existir como se fosse a resposta que a AUTOCAR teria enviado; ela é memória de simulação, não prova de execução.',
    'Use o histórico imediatamente anterior apenas para resolver referências como "sim", "pode ser", "fechado" e para recuperar data/hora já propostas.',
    'planner_confirmed só pode ser true quando a última mensagem inbound demonstrar concordância inequívoca com um horário concreto ou disser explicitamente para agendar/marcar/confirmar.',
    'Perguntas como "tem horário?", "posso ir?", "10h está livre?" NÃO são confirmação.',
    'Se houver confirmação de um horário citado na proposta anterior, preserve esse requested_date YYYY-MM-DD e requested_time HH:MM.',
    'Se não houver data/hora concreta suficiente, use string vazia.',
    'booking_type deve ser test_drive apenas quando o contexto indicar test-drive; caso contrário visit para visita à loja; none se não houver intenção de agendamento.',
    'confirmation_evidence deve resumir em poucas palavras o trecho que sustentou a decisão. Não invente.'
  ].join(' ');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: autocarModelName(),
      store: false,
      max_output_tokens: 500,
      instructions,
      input: JSON.stringify({
        latest_inbound: latestInbound,
        previous_outbound: productionPreviousOutbound,
        previous_shadow_proposal: shadowProposal,
        recent_messages: ordered.slice(-8)
      }),
      text: { format: { type: 'json_schema', name: 'autocar_booking_context', strict: true, schema } }
    }),
    cache: 'no-store'
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(raw?.error?.message || `OpenAI respondeu com HTTP ${response.status}.`).slice(0, 500));
  const text = outputText(raw);
  if (!text) throw new Error('A OpenAI não retornou o contexto de agendamento.');
  const parsed = JSON.parse(text);

  return {
    ...parsed,
    latest_inbound: latestInbound.body,
    previous_outbound: previousOutboundText,
    shadow_proposal: shadowProposal
  };
}
