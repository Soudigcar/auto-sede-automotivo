import { autocarModelName } from '@/lib/server/autocar/client';
import { consultAutocarDayAvailability } from '@/lib/server/autocar/operationalTools';

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    response: { type: 'string' },
    next_best_action: { type: 'string' }
  },
  required: ['response', 'next_best_action']
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

function dateFrom(shadow: any, bookingGuard: any) {
  const guarded = String(bookingGuard?.requested_date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(guarded)) return guarded;
  const planned = String(shadow?.operational_preview?.plan?.requested_date || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(planned) ? planned : '';
}

export async function enhanceAutocarBookingConversation(input: {
  productionSupabase: any;
  storeId: string;
  leadId?: string | null;
  shadow: any;
  bookingGuard: any;
  bookingContext: any;
}) {
  const state = String(input.bookingGuard?.state || 'NOT_APPLICABLE');
  if (!['WAITING_CONFIRMATION', 'SLOT_UNAVAILABLE'].includes(state)) return input.shadow;
  if (String(input.bookingGuard?.booking_type || 'visit') === 'test_drive') return input.shadow;

  const requestedDate = dateFrom(input.shadow, input.bookingGuard);
  if (!requestedDate) return input.shadow;

  const dayAvailability = await consultAutocarDayAvailability({
    productionSupabase: input.productionSupabase,
    storeId: input.storeId,
    date: requestedDate,
    excludeLeadId: input.leadId || null
  });

  const enrichedPreview = {
    ...(input.shadow?.operational_preview || {}),
    day_availability: dayAvailability
  };

  const instructions = [
    'Você é a AUTOCAR conduzindo uma conversa comercial de agendamento de VISITA, sem executar o agendamento.',
    'Interprete a linguagem do cliente semanticamente. Não use listas rígidas de palavras-chave para entender manhã, tarde, aceites ou referências contextuais.',
    'A data em requested_date já foi resolvida semanticamente por uma etapa anterior. Não troque essa data e não invente outra.',
    'day_availability é a fonte oficial para expediente e horários livres. Nunca ofereça horário que não esteja em available_slots.',
    'Nunca diga que a visita já foi agendada. Neste estágio você está apenas conduzindo a escolha e a confirmação.',
    'Se o cliente informou um dia/data, mas ainda não informou horário ou período, confirme naturalmente a data e pergunte se prefere manhã ou tarde quando houver disponibilidade nos dois períodos.',
    'Se o cliente já indicou semanticamente manhã ou tarde, ofereça de 2 a 3 horários livres daquele período, sem exigir que ele repita a preferência.',
    'Se só houver disponibilidade em um período, explique de forma natural e ofereça horários reais desse período.',
    'Se o horário pedido ficou indisponível, informe isso sem culpar o cliente e ofereça de 2 a 3 alternativas reais próximas, preferindo o mesmo período.',
    'Se não houver nenhum horário livre no dia, informe que esse dia está sem disponibilidade e peça outro dia.',
    'Você pode mencionar o expediente real quando isso ajudar a conversa.',
    'Escreva em português do Brasil, de forma curta, humana e comercial. Evite linguagem de sistema, policy, guard ou backend.',
    'Não invente localização, estoque, desconto, financiamento, test-drive ou qualquer informação que não esteja no contexto.',
    'next_best_action deve descrever apenas o próximo passo conversacional, nunca uma execução já realizada.'
  ].join(' ');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: autocarModelName(),
      store: false,
      max_output_tokens: 550,
      instructions,
      input: JSON.stringify({
        requested_date: requestedDate,
        booking_state: state,
        latest_inbound: input.bookingContext?.latest_inbound || '',
        previous_outbound: input.bookingContext?.previous_outbound || null,
        confirmation_mode: input.bookingGuard?.confirmation_mode || 'not_confirmed',
        confirmation_evidence: input.bookingGuard?.confirmation_evidence || '',
        current_shadow_response: input.shadow?.response || '',
        day_availability: dayAvailability
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'autocar_booking_conversation',
          strict: true,
          schema: responseSchema
        }
      }
    }),
    cache: 'no-store'
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(raw?.error?.message || `OpenAI respondeu com HTTP ${response.status}.`).slice(0, 500));
  }

  const text = outputText(raw);
  if (!text) throw new Error('A OpenAI não retornou a continuação conversacional do agendamento.');
  const parsed = JSON.parse(text);

  return {
    ...input.shadow,
    response: String(parsed.response || input.shadow?.response || '').trim(),
    next_best_action: String(parsed.next_best_action || input.shadow?.next_best_action || '').trim(),
    operational_preview: enrichedPreview,
    booking_conversation_version: 'autocar-booking-conversation-v1'
  };
}
