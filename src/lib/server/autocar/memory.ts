import type { AutocarExecutionContext } from '@/lib/server/autocar/context';

export async function loadAutocarMemory(supabase: any, context: AutocarExecutionContext) {
  const { data, error } = await supabase.from('ai_conversation_memory')
    .select('rolling_summary,communication_preference,temperature,qualification_score,score_breakdown,active_objections,open_questions,next_best_action,human_state,memory_version,updated_at')
    .eq('store_id', context.storeId)
    .eq('conversation_id', context.conversationId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function loadRecentAutocarMessages(supabase: any, context: AutocarExecutionContext, limit = 18) {
  const safeLimit = Math.max(1, Math.min(limit, 30));
  const { data, error } = await supabase.from('whatsapp_messages')
    .select('id,direction,message_type,body,sent_at')
    .eq('store_id', context.storeId)
    .eq('conversation_id', context.conversationId)
    .order('sent_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return (data || []).reverse();
}

export function buildAutocarMemoryInput(memory: any, recentMessages: any[]) {
  return {
    memory: memory ? {
      summary: memory.rolling_summary || '',
      communication_preference: memory.communication_preference || 'unknown',
      temperature: memory.temperature || 'unknown',
      qualification_score: memory.qualification_score ?? null,
      score_breakdown: memory.score_breakdown || {},
      active_objections: memory.active_objections || [],
      open_questions: memory.open_questions || [],
      next_best_action: memory.next_best_action || null,
      human_state: memory.human_state || 'paused'
    } : null,
    recent_messages: recentMessages.map((message) => ({
      id: message.id,
      direction: message.direction,
      type: message.message_type,
      body: message.body,
      sent_at: message.sent_at
    }))
  };
}
