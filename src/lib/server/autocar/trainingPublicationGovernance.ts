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

export async function readTrainingGovernance(supabase: any, scenarioIds: string[]) {
  if (!scenarioIds.length) return new Map<string, TrainingGovernanceRow>();
  const { data, error } = await supabase
    .from('ai_training_scenarios')
    .select('id,status,publication_status,approved_at,approved_by_profile_id,published_at,published_by_profile_id')
    .in('id', scenarioIds);
  if (error) throw error;
  return new Map((data || []).map((row: TrainingGovernanceRow) => [row.id, row]));
}

async function findScenario(supabase: any, scenarioId: string) {
  const { data, error } = await supabase
    .from('ai_training_scenarios')
    .select('id,status,publication_status')
    .eq('id', scenarioId)
    .eq('scope', 'global')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Aprendizado global não encontrado.');
  if (data.status === 'archived') throw new Error('Aprendizado arquivado não pode ser alterado.');
  return data;
}

export async function approveTrainingScenario(supabase: any, scenarioId: string, actorProfileId: string) {
  await findScenario(supabase, scenarioId);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('ai_training_scenarios')
    .update({
      status: 'approved',
      approved_at: now,
      approved_by_profile_id: actorProfileId,
      updated_by_profile_id: actorProfileId,
      updated_at: now
    })
    .eq('id', scenarioId)
    .eq('scope', 'global')
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function publishTrainingScenario(supabase: any, scenarioId: string, actorProfileId: string) {
  const current = await findScenario(supabase, scenarioId);
  if (current.status !== 'approved') {
    throw new Error('Apenas aprendizado aprovado pode ser publicado.');
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('ai_training_scenarios')
    .update({
      publication_status: 'published',
      published_at: now,
      published_by_profile_id: actorProfileId,
      updated_by_profile_id: actorProfileId,
      updated_at: now
    })
    .eq('id', scenarioId)
    .eq('scope', 'global')
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function unpublishTrainingScenario(supabase: any, scenarioId: string, actorProfileId: string) {
  await findScenario(supabase, scenarioId);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('ai_training_scenarios')
    .update({
      publication_status: 'unpublished',
      published_at: null,
      published_by_profile_id: null,
      updated_by_profile_id: actorProfileId,
      updated_at: now
    })
    .eq('id', scenarioId)
    .eq('scope', 'global')
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
