type ConversationIdentity = {
  id: string;
};

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
