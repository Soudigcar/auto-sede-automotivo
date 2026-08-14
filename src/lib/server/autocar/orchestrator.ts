import { resolveAutocarExecutionContext } from '@/lib/server/autocar/context';
import { buildAutocarMemoryInput, loadAutocarMemory, loadRecentAutocarMessages } from '@/lib/server/autocar/memory';

export async function prepareAutocarTurn(input: {
  supabase: any;
  conversationId: string;
  triggerMessageId?: string | null;
}) {
  const context = await resolveAutocarExecutionContext(input);

  if (!context.agentId || context.mode === 'off') {
    return {
      status: 'skipped' as const,
      reason: 'AUTOCAR está desligada ou ainda não foi configurada para esta loja.',
      context
    };
  }

  const [memory, recentMessages] = await Promise.all([
    loadAutocarMemory(input.supabase, context),
    loadRecentAutocarMessages(input.supabase, context)
  ]);

  return {
    status: 'ready' as const,
    context,
    modelInput: buildAutocarMemoryInput(memory, recentMessages)
  };
}
