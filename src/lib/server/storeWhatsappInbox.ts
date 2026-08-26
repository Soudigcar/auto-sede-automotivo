type ConversationIdentity = {
  id: string;
};

type CollapsibleConversation = ConversationIdentity & {
  whatsapp_number_id?: unknown;
  last_message_at?: unknown;
  updated_at?: unknown;
  unread_count?: unknown;
  status?: unknown;
  contact?: { phone?: unknown; profile_name?: unknown } | null;
  lead?: { customer_phone?: unknown; customer_name?: unknown } | null;
  base_lead?: { phone?: unknown; name?: unknown } | null;
};

export type CollapsedWhatsappConversation<T> = T & {
  related_conversation_ids: string[];
};

function normalizedWhatsappPhone(value: unknown) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length >= 11) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function conversationPhone(conversation: CollapsibleConversation) {
  return normalizedWhatsappPhone(
    conversation.contact?.phone ||
    conversation.lead?.customer_phone ||
    conversation.base_lead?.phone
  );
}

function dateScore(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function recencyScore(conversation: CollapsibleConversation) {
  return dateScore(conversation.last_message_at) || dateScore(conversation.updated_at);
}

function displayName(conversation: CollapsibleConversation) {
  return String(
    conversation.contact?.profile_name ||
    conversation.lead?.customer_name ||
    conversation.base_lead?.name ||
    ''
  ).replace(/\s+/g, ' ').trim();
}

function isFallbackDisplayName(value: string) {
  return !value || /^contato final \d{4}$/i.test(value) || /^cliente whatsapp$/i.test(value);
}

function withDisplayName<T extends CollapsibleConversation>(conversation: T, name: string) {
  if (!name) return conversation;
  return {
    ...conversation,
    contact: conversation.contact ? { ...conversation.contact, profile_name: name } : conversation.contact,
    lead: conversation.lead ? { ...conversation.lead, customer_name: name } : conversation.lead,
    base_lead: conversation.base_lead ? { ...conversation.base_lead, name } : conversation.base_lead
  };
}

export function includeRequestedConversation<T extends ConversationIdentity>(
  recentConversations: T[],
  requestedConversation: T | null
) {
  if (!requestedConversation) return recentConversations;
  if (recentConversations.some((conversation) => conversation.id === requestedConversation.id)) {
    return recentConversations;
  }
  return [requestedConversation, ...recentConversations];
}

export function collapseWhatsappConversations<T extends CollapsibleConversation>(
  conversations: T[]
): Array<CollapsedWhatsappConversation<T>> {
  const groups = new Map<string, T[]>();

  for (const conversation of conversations) {
    const phone = conversationPhone(conversation);
    const numberId = String(conversation.whatsapp_number_id || '').trim();
    const key = phone ? `${numberId || 'unknown-channel'}:${phone}` : `conversation:${conversation.id}`;
    const members = groups.get(key);
    if (members) members.push(conversation);
    else groups.set(key, [conversation]);
  }

  return Array.from(groups.values())
    .map((members) => {
      const ordered = [...members].sort((left, right) => recencyScore(right) - recencyScore(left));
      const canonical = ordered[0];
      const preferredName = ordered.map(displayName).find((name) => !isFallbackDisplayName(name)) || displayName(canonical);
      const namedCanonical = withDisplayName(canonical, preferredName);
      const unreadCount = ordered.reduce((sum, member) => sum + Math.max(0, Number(member.unread_count || 0)), 0);

      return {
        ...namedCanonical,
        status: ordered.some((member) => member.status === 'open') ? 'open' : canonical.status,
        unread_count: unreadCount,
        related_conversation_ids: ordered.map((member) => member.id)
      } as CollapsedWhatsappConversation<T>;
    })
    .sort((left, right) => recencyScore(right) - recencyScore(left));
}

export function relatedWhatsappConversationIds<T extends CollapsibleConversation>(
  conversations: T[],
  selectedConversationId: string
) {
  const selectedGroup = collapseWhatsappConversations(conversations)
    .find((conversation) => conversation.related_conversation_ids.includes(selectedConversationId));
  return selectedGroup?.related_conversation_ids || [selectedConversationId];
}
