import { autocarModelName } from '@/lib/server/autocar/client';

function openAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível no ambiente de Preview.');
  return key;
}

function outputText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
        return content.text.trim();
      }
    }
  }
  return '';
}

function formatAppointment(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return {
    iso: raw,
    date: new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date),
    time: new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date)
  };
}

async function requestReply(instructions: string, payload: unknown, maxOutputTokens: number) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: autocarModelName(),
      store: false,
      max_output_tokens: maxOutputTokens,
      instructions,
      input: JSON.stringify(payload)
    }),
    cache: 'no-store'
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      text: '',
      error: String(raw?.error?.message || `OpenAI respondeu com HTTP ${response.status}.`).slice(0, 500)
    };
  }

  const text = outputText(raw).slice(0, 1800);
  return text
    ? { text, error: null }
    : { text: '', error: 'A OpenAI retornou uma confirmação pós-ação vazia.' };
}

export async function generateAutocarVehicleStatePostActionReply(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  leadId: string;
  vehicleState: any;
}) {
  const operation = input.vehicleState?.claim?.result || {};
  const updated = input.vehicleState?.updated === true && operation?.db_execution === true;
  const noop = input.vehicleState?.noop === true || operation?.noop === true;
  if (!updated && !noop) {
    return { generated: false, response: '', reason: 'Vehicle State não concluiu atualização nem confirmação idempotente.' };
  }

  const [leadResult, messagesResult] = await Promise.all([
    input.productionSupabase.from('leads')
      .select('id,assigned_store_id,customer_name,status,scheduled_at,appointment_type,interested_vehicle_id,interested_vehicle,interested_vehicle_price')
      .eq('id', input.leadId)
      .eq('assigned_store_id', input.storeId)
      .maybeSingle(),
    input.productionSupabase.from('whatsapp_messages')
      .select('id,direction,body,sent_at,created_at')
      .eq('store_id', input.storeId)
      .eq('conversation_id', input.conversationId)
      .order('sent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(8)
  ]);
  if (leadResult.error) throw leadResult.error;
  if (messagesResult.error) throw messagesResult.error;
  if (!leadResult.data) throw new Error('Lead canônico não encontrado após Vehicle State.');

  const lead = leadResult.data;
  const activeVehicleId = String(operation?.active_vehicle_id || lead.interested_vehicle_id || '').trim();
  if (!activeVehicleId || activeVehicleId !== String(lead.interested_vehicle_id || '')) {
    throw new Error('Veículo ativo pós-ação não confere com o estado atual do CRM.');
  }

  const recentMessages = (messagesResult.data || []).reverse().map((message: any) => ({
    direction: String(message.direction || ''),
    body: String(message.body || '').trim(),
    sent_at: message.sent_at || message.created_at || null
  })).filter((message: any) => message.body);

  const appointment = formatAppointment(lead.scheduled_at);
  const instructions = [
    'Você é a AUTOCAR respondendo ao cliente imediatamente DEPOIS de uma ação interna já validada pelo backend.',
    'Gere uma única mensagem curta, natural e comercial em português do Brasil. Não use JSON.',
    'A fonte de verdade sobre o que realmente aconteceu é operation_result + current_lead. Não invente ações.',
    'Se operation_result.db_execution=true, você pode afirmar naturalmente que o veículo principal/interesse da visita foi atualizado para o active_vehicle_name.',
    'Se operation_result.noop=true, diga naturalmente que o veículo já está correto/confirmado, sem fingir que houve nova alteração.',
    'O agendamento existente NÃO foi recriado, NÃO foi reagendado e NÃO teve data/horário alterados por esta ação. Nunca diga que criou ou alterou o agendamento.',
    'Se current_lead tiver appointment real, você pode mencionar a visita já existente apenas como contexto, usando somente a data e hora fornecidas.',
    'Não diga que vai confirmar com a loja algo que o backend já confirmou. Não diga que o cliente precisa aguardar atualização se ela já ocorreu.',
    'Não mencione backend, claim, policy, banco, IDs, logs ou detalhes técnicos.',
    'Não ofereça desconto, não prometa financiamento e não invente informações do veículo além das fornecidas.',
    'Evite frase engessada; responda de acordo com o histórico recente e com o resultado real da ação.',
    'Prefira 1 ou 2 frases. Pode usar um emoji discreto se combinar naturalmente com a conversa.'
  ].join(' ');

  const payload = {
    operation_result: {
      updated,
      noop,
      active_vehicle_id: activeVehicleId,
      active_vehicle_name: operation?.active_vehicle_name || lead.interested_vehicle || null,
      previous_vehicle_id: operation?.previous_vehicle_id || null,
      previous_vehicle_name: operation?.previous_vehicle_name || null,
      history_recorded: operation?.history_recorded === true
    },
    current_lead: {
      customer_name: lead.customer_name || null,
      status: lead.status || null,
      active_vehicle_id: lead.interested_vehicle_id || null,
      active_vehicle_name: lead.interested_vehicle || null,
      active_vehicle_price: lead.interested_vehicle_price == null ? null : Number(lead.interested_vehicle_price),
      appointment_type: lead.appointment_type || null,
      appointment
    },
    recent_conversation: recentMessages
  };

  let firstError = '';
  for (const maxOutputTokens of [260, 420]) {
    const attempt = await requestReply(instructions, payload, maxOutputTokens);
    if (attempt.text) {
      return {
        generated: true,
        response: attempt.text,
        model: autocarModelName(),
        operation: updated ? 'updated' : 'noop'
      };
    }
    if (!firstError) firstError = attempt.error || '';
  }

  return {
    generated: false,
    response: '',
    reason: firstError || 'Não foi possível gerar confirmação pós-ação.'
  };
}
