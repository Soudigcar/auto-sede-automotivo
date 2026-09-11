import type { AutocarTrainingScope } from '@/lib/server/autocar/commercialTrainingV3';

export type TrainingPublicationStatus = 'unpublished' | 'published';

export type TrainingGovernanceRow = {
  id: string;
  status: 'draft' | 'approved' | 'archived';
  publication_status: TrainingPublicationStatus;
  approved_at: string | null;
  approved_by_profile_id: string | null;
  published_at: string | null;
  published_by_profile_id: string | null;
};

export type TrainingApprovalGuard = {
  expectedVersion: number;
  expectedUpdatedAt: string;
  expectedScope?: AutocarTrainingScope;
  expectedStoreId?: string | null;
};

export type TrainingScenarioTarget = {
  scope: AutocarTrainingScope;
  storeId: string | null;
};

export async function readTrainingGovernance(supabase: any, scenarioIds: string[]) {
  if (!scenarioIds.length) return new Map<string, TrainingGovernanceRow>();
  const { data, error } = await supabase
    .from('ai_training_scenarios')
    .select('id,status,publication_status,approved_at,approved_by_profile_id,published_at,published_by_profile_id')
    .in('id', scenarioIds);
  if (error) throw error;
  return new Map((data || []).map((row: TrainingGovernanceRow) => [row.id, row]));
}

function targetFromScenario(row: any): TrainingScenarioTarget {
  const scope: AutocarTrainingScope = row?.scope === 'store' ? 'store' : 'global';
  const storeId = String(row?.store_id || '').trim() || null;
  if (scope === 'store' && !storeId) throw new Error('Aprendizado de loja sem store_id válido.');
  if (scope === 'global' && storeId) throw new Error('Aprendizado global não pode possuir store_id.');
  return { scope, storeId };
}

function applyTarget(query: any, target: TrainingScenarioTarget) {
  const scoped = query.eq('scope', target.scope);
  return target.scope === 'store'
    ? scoped.eq('store_id', target.storeId)
    : scoped.is('store_id', null);
}

async function findScenario(supabase: any, scenarioId: string) {
  const { data, error } = await supabase
    .from('ai_training_scenarios')
    .select('id,scope,store_id,status,publication_status,embedding')
    .eq('id', scenarioId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Aprendizado não encontrado.');
  if (data.status === 'archived') throw new Error('Aprendizado arquivado não pode ser alterado.');
  targetFromScenario(data);
  return data;
}

export async function readTrainingScenarioTarget(supabase: any, scenarioId: string) {
  const current = await findScenario(supabase, scenarioId);
  return targetFromScenario(current);
}

export async function approveTrainingScenario(
  supabase: any,
  scenarioId: string,
  actorProfileId: string,
  guard: TrainingApprovalGuard
) {
  const current = await findScenario(supabase, scenarioId);
  const target = targetFromScenario(current);
  if (guard.expectedScope && guard.expectedScope !== target.scope) {
    throw new Error('O escopo do aprendizado mudou durante a aprovação.');
  }
  if ((guard.expectedStoreId ?? null) !== target.storeId && guard.expectedScope) {
    throw new Error('A loja do aprendizado mudou durante a aprovação.');
  }

  const now = new Date().toISOString();
  let query = supabase
    .from('ai_training_scenarios')
    .update({
      status: 'approved',
      approved_at: now,
      approved_by_profile_id: actorProfileId,
      updated_by_profile_id: actorProfileId,
      updated_at: now
    })
    .eq('id', scenarioId)
    .eq('version', guard.expectedVersion)
    .eq('updated_at', guard.expectedUpdatedAt)
    .neq('status', 'archived');
  query = applyTarget(query, target);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('O aprendizado foi alterado durante a aprovação. Recarregue a tela e tente aprovar novamente.');
  }
  return data;
}

export async function publishTrainingScenario(supabase: any, scenarioId: string, actorProfileId: string) {
  const current = await findScenario(supabase, scenarioId);
  const target = targetFromScenario(current);
  if (current.status !== 'approved') {
    throw new Error('Apenas aprendizado aprovado pode ser publicado.');
  }
  if (!current.embedding) {
    throw new Error('Aprendizado aprovado ainda não possui embedding válido e não pode ser publicado.');
  }
  const now = new Date().toISOString();
  let query = supabase
    .from('ai_training_scenarios')
    .update({
      publication_status: 'published',
      published_at: now,
      published_by_profile_id: actorProfileId,
      updated_by_profile_id: actorProfileId,
      updated_at: now
    })
    .eq('id', scenarioId);
  query = applyTarget(query, target);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data;
}

export async function unpublishTrainingScenario(supabase: any, scenarioId: string, actorProfileId: string) {
  const current = await findScenario(supabase, scenarioId);
  const target = targetFromScenario(current);
  const now = new Date().toISOString();
  let query = supabase
    .from('ai_training_scenarios')
    .update({
      publication_status: 'unpublished',
      published_at: null,
      published_by_profile_id: null,
      updated_by_profile_id: actorProfileId,
      updated_at: now
    })
    .eq('id', scenarioId);
  query = applyTarget(query, target);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data;
}
