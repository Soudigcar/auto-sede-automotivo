import { searchAutocarKnowledge } from '@/lib/server/autocar/knowledgeLibrary';
import { searchTrainingScenarios } from '@/lib/server/autocar/trainingLab';
import { autocarHardPolicyInstructions, autocarHardPolicyManifest } from '@/lib/server/autocar/policyEngine';
import { loadAutocarInventory } from '@/lib/server/autocar/inventory';
import { autocarCommercialConstitutionV2 } from '@/lib/server/autocar/commercialConstitutionV2';
import {
  autocarContextBudgetReport,
  selectRelevantKnowledge,
  selectRelevantTraining
} from '@/lib/server/autocar/contextEngineV2';

export type AutocarIntelligenceMode = 'copilot' | 'autopilot';

export async function buildAutocarIntelligenceContext(input: {
  storeId: string;
  query: string;
  mode: AutocarIntelligenceMode;
  inventorySupabase?: any;
}) {
  const query = String(input.query || '').trim().slice(0, 6000);
  const constitution = autocarCommercialConstitutionV2();
  if (!query) {
    return {
      mode: input.mode,
      hardPolicies: autocarHardPolicyManifest(),
      hardPolicyInstructions: autocarHardPolicyInstructions(),
      commercialConstitution: constitution,
      training: [],
      knowledge: [],
      methodKnowledge: [],
      storeKnowledge: [],
      retrieval: autocarContextBudgetReport({
        rawTraining: [], selectedTraining: [], rawKnowledge: [], selectedMethod: [], selectedStore: []
      }),
      inventory: null
    };
  }

  const [rawTraining, rawKnowledge, inventory] = await Promise.all([
    searchTrainingScenarios(query, input.storeId, 6),
    searchAutocarKnowledge(input.storeId, query, 10),
    input.inventorySupabase
      ? loadAutocarInventory({ supabase: input.inventorySupabase, storeId: input.storeId, query, matchLimit: 12, indexLimit: 80 })
      : Promise.resolve(null)
  ]);

  const training = selectRelevantTraining(rawTraining || []);
  const selectedKnowledge = selectRelevantKnowledge(rawKnowledge || [], input.storeId);
  const methodKnowledge = selectedKnowledge.method;
  const storeKnowledge = selectedKnowledge.store;
  const knowledge = selectedKnowledge.all;
  const retrieval = autocarContextBudgetReport({
    rawTraining: rawTraining || [],
    selectedTraining: training,
    rawKnowledge: rawKnowledge || [],
    selectedMethod: methodKnowledge,
    selectedStore: storeKnowledge
  });

  return {
    mode: input.mode,
    hardPolicies: autocarHardPolicyManifest(),
    hardPolicyInstructions: autocarHardPolicyInstructions(),
    commercialConstitution: constitution,
    training,
    knowledge,
    methodKnowledge,
    storeKnowledge,
    retrieval,
    inventory
  };
}

export function autocarModeInstructions(mode: AutocarIntelligenceMode) {
  const handoffRule = [
    'REGRA DE CONTINUIDADE V2: uma ação que exige aprovação, handoff de capability ou validação humana não encerra a conversa por si só.',
    'Continue atendendo comercialmente dentro dos limites seguros.',
    'Só proponha transfer_lead quando o cliente solicitar semanticamente falar com uma pessoa, vendedor, consultor, gerente ou equivalente.',
    'Se faltar informação, diga que precisa confirmar o dado e continue o atendimento sem inventar.'
  ].join(' ');

  if (mode === 'copilot') {
    return [
      'MODO COPILOT: você prepara uma sugestão para revisão humana.',
      'Não execute ações externas, não envie mensagens e não afirme que algo já foi feito.',
      'A resposta sugerida deve poder ser copiada pelo operador humano após revisão.',
      handoffRule
    ].join(' ');
  }
  return [
    'MODO AUTOPILOT EM SIMULAÇÃO: raciocine como o agente autônomo responderia e quais próximos passos proporia, mas NÃO execute nenhuma ação externa neste Preview.',
    'Não envie WhatsApp, não altere CRM, não agende, não transfira lead e não chame ferramentas de escrita.',
    'Quando uma consequência depender de aprovação humana ou violar hard policy, não execute a consequência; mantenha a conversa comercial dentro dos limites seguros.',
    handoffRule
  ].join(' ');
}

export function serializeAutocarIntelligenceContext(context: Awaited<ReturnType<typeof buildAutocarIntelligenceContext>>) {
  return {
    hard_policies: context.hardPolicies,
    commercial_constitution: context.commercialConstitution,
    context_engine: context.retrieval,
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
    })),
    store_inventory: context.inventory ? {
      source: context.inventory.source,
      store_id: context.inventory.store_id,
      available_count: context.inventory.available_count,
      matched_count: context.inventory.matched_count,
      query_constraints: context.inventory.constraints,
      matching_vehicles: context.inventory.matching_vehicles.map((vehicle: any) => ({
        id: vehicle.id,
        brand: vehicle.brand,
        model: vehicle.model,
        version: vehicle.version,
        year: vehicle.year,
        manufacture_year: vehicle.manufacture_year,
        model_year: vehicle.model_year,
        mileage: vehicle.mileage,
        color: vehicle.color,
        transmission: vehicle.transmission,
        fuel: vehicle.fuel,
        price: vehicle.price,
        primary_photo: vehicle.primary_photo,
        photos: vehicle.photos,
        portal_url: vehicle.portal_url,
        published: vehicle.published
      })),
      inventory_index: context.inventory.inventory_index
    } : null
  };
}
