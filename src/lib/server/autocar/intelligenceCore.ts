import { searchAutocarKnowledge } from '@/lib/server/autocar/knowledgeLibrary';
import { searchTrainingScenarios } from '@/lib/server/autocar/trainingLab';
import { autocarHardPolicyInstructions, autocarHardPolicyManifest } from '@/lib/server/autocar/policyEngine';

export type AutocarIntelligenceMode = 'copilot' | 'autopilot';

export async function buildAutocarIntelligenceContext(input: {
  storeId: string;
  query: string;
  mode: AutocarIntelligenceMode;
}) {
  const query = String(input.query || '').trim().slice(0, 6000);
  if (!query) {
    return {
      mode: input.mode,
      hardPolicies: autocarHardPolicyManifest(),
      hardPolicyInstructions: autocarHardPolicyInstructions(),
      training: [],
      knowledge: [],
      methodKnowledge: [],
      storeKnowledge: []
    };
  }

  const [training, knowledge] = await Promise.all([
    searchTrainingScenarios(query, input.storeId, 6),
    searchAutocarKnowledge(input.storeId, query, 10)
  ]);

  const methodKnowledge = (knowledge || []).filter((item: any) => item.scope === 'method');
  const storeKnowledge = (knowledge || []).filter((item: any) => item.scope === 'store' && item.store_id === input.storeId);

  return {
    mode: input.mode,
    hardPolicies: autocarHardPolicyManifest(),
    hardPolicyInstructions: autocarHardPolicyInstructions(),
    training: training || [],
    knowledge: knowledge || [],
    methodKnowledge,
    storeKnowledge
  };
}

export function autocarModeInstructions(mode: AutocarIntelligenceMode) {
  if (mode === 'copilot') {
    return [
      'MODO COPILOT: você prepara uma sugestão para revisão humana.',
      'Não execute ações externas, não envie mensagens e não afirme que algo já foi feito.',
      'A resposta sugerida deve poder ser copiada pelo operador humano após revisão.'
    ].join(' ');
  }
  return [
    'MODO AUTOPILOT EM SIMULAÇÃO: raciocine como o agente autônomo responderia e quais próximos passos proporia, mas NÃO execute nenhuma ação externa neste Preview.',
    'Não envie WhatsApp, não altere CRM, não agende, não transfira lead e não chame ferramentas de escrita.',
    'Quando uma ação depender de aprovação humana ou violar hard policy, indique handoff/aprovação em vez de executá-la.'
  ].join(' ');
}

export function serializeAutocarIntelligenceContext(context: Awaited<ReturnType<typeof buildAutocarIntelligenceContext>>) {
  return {
    hard_policies: context.hardPolicies,
    approved_training: context.training.map((item: any) => ({
      id: item.id,
      situation: item.situation,
      intent: item.intent,
      ideal_response: item.ideal_response,
      objective: item.objective,
      next_action: item.next_action,
      restrictions: item.restrictions,
      tags: item.tags,
      similarity: item.similarity
    })),
    method_and_global_knowledge: context.methodKnowledge.map((item: any) => ({
      document_id: item.document_id,
      title: item.title,
      excerpt: item.content,
      similarity: item.similarity
    })),
    store_specific_knowledge: context.storeKnowledge.map((item: any) => ({
      document_id: item.document_id,
      title: item.title,
      excerpt: item.content,
      similarity: item.similarity
    }))
  };
}
