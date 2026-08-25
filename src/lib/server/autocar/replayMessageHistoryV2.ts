export type AutocarReplayMessageRow = {
  id: string;
  direction: string | null;
  message_type: string | null;
  body: string | null;
  raw_payload?: unknown;
  sent_at: string | null;
  created_at: string | null;
};

const MESSAGE_SELECT = 'id,direction,message_type,body,raw_payload,sent_at,created_at';
const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);

export function clipAutocarReplayRowsV2(
  rowsDescending: AutocarReplayMessageRow[],
  selectedMessageId?: string | null,
  limit = 24
) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 24, 100));
  const ascending = [...rowsDescending].reverse();
  if (!selectedMessageId) return ascending.slice(-boundedLimit);

  const selectedIndex = ascending.findIndex((message) => String(message.id) === String(selectedMessageId));
  if (selectedIndex < 0) throw new Error('Mensagem histórica selecionada não entrou no recorte seguro do replay.');
  return ascending.slice(0, selectedIndex + 1).slice(-boundedLimit);
}

export function createAutocarHistoricalReadClientV2(input: {
  productionSupabase: any;
  cutoff: { sent_at?: string | null; created_at?: string | null };
}) {
  const wrapTable = (tableClient: any, table: string) => new Proxy(tableClient, {
    get(target, prop, receiver) {
      const name = String(prop);
      if (WRITE_METHODS.has(name)) {
        return () => { throw new Error('Replay histórico é estritamente read-only.'); };
      }
      const value = Reflect.get(target, prop, receiver);
      if (table === 'whatsapp_messages' && name === 'select' && typeof value === 'function') {
        return (...args: any[]) => {
          let query = value.apply(target, args);
          if (input.cutoff.sent_at) query = query.lte('sent_at', input.cutoff.sent_at);
          if (input.cutoff.created_at) query = query.lte('created_at', input.cutoff.created_at);
          return query;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

  return new Proxy(input.productionSupabase, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (String(prop) === 'from' && typeof value === 'function') {
        return (table: string) => wrapTable(value.call(target, table), String(table));
      }
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

export async function loadAutocarReplayMessagesV2(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  messageId?: string | null;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(Number(input.limit) || 24, 100));
  const messageId = String(input.messageId || '').trim();
  let selectedMessage: AutocarReplayMessageRow | null = null;

  if (messageId) {
    const { data, error } = await input.productionSupabase
      .from('whatsapp_messages')
      .select(MESSAGE_SELECT)
      .eq('store_id', input.storeId)
      .eq('conversation_id', input.conversationId)
      .eq('id', messageId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('message_id não pertence à conversa e loja informadas.');
    if (String(data.direction || '') !== 'inbound') throw new Error('message_id deve identificar uma mensagem inbound do cliente.');
    selectedMessage = data as AutocarReplayMessageRow;
  }

  let query = input.productionSupabase
    .from('whatsapp_messages')
    .select(MESSAGE_SELECT)
    .eq('store_id', input.storeId)
    .eq('conversation_id', input.conversationId);

  if (selectedMessage?.sent_at) query = query.lte('sent_at', selectedMessage.sent_at);
  if (selectedMessage?.created_at) query = query.lte('created_at', selectedMessage.created_at);
  if (selectedMessage && !selectedMessage.sent_at && !selectedMessage.created_at) {
    throw new Error('Mensagem histórica sem timestamp utilizável para replay seguro.');
  }

  const queryLimit = selectedMessage ? Math.min(Math.max(limit * 2, 32), 100) : limit;
  const { data: rows, error: rowsError } = await query
    .order('sent_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(queryLimit);
  if (rowsError) throw rowsError;

  const messages = clipAutocarReplayRowsV2((rows || []) as AutocarReplayMessageRow[], selectedMessage?.id || null, limit);
  const currentInbound = selectedMessage
    ? messages.find((message) => String(message.id) === String(selectedMessage?.id))
    : [...messages].reverse().find((message) => String(message.direction || '') === 'inbound');

  if (!currentInbound) throw new Error('Replay exige uma mensagem inbound recente ou histórica válida.');

  return {
    messages,
    currentInbound,
    historical: Boolean(selectedMessage),
    selected_message_id: selectedMessage?.id || null
  };
}
