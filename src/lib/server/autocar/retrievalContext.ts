import { getAutocarRuntimeClient } from '@/lib/server/autocar/runtimeEnvironment';
import { autocarVectorLiteral, createAutocarRetrievalEmbedding } from '@/lib/server/autocar/openAiDiagnostics';

function safeDbCode(value: unknown) {
  return String(value || 'query_failed').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'query_failed';
}

export async function searchAutocarRetrievalContext(input: {
  storeId: string;
  query: string;
  trainingLimit?: number;
  knowledgeLimit?: number;
  correlationId?: string | null;
}) {
  const query = String(input.query || '').trim().slice(0, 4000);
  if (!query) return { training: [], knowledge: [] };
  const embedding = await createAutocarRetrievalEmbedding(query, input.correlationId);
  const vector = autocarVectorLiteral(embedding);
  const autocar: any = getAutocarRuntimeClient();
  const [trainingResult, knowledgeResult] = await Promise.all([
    autocar.rpc('match_autocar_training', {
      p_store_id: input.storeId,
      p_query_embedding: vector,
      p_match_count: Math.max(1, Math.min(Number(input.trainingLimit || 6), 20))
    }),
    autocar.rpc('match_autocar_knowledge', {
      p_store_id: input.storeId,
      p_query_embedding: vector,
      p_match_count: Math.max(1, Math.min(Number(input.knowledgeLimit || 10), 20))
    })
  ]);
  if (trainingResult.error) {
    const error: any = new Error('autocar_training_retrieval_failed');
    error.code = `training_rpc_${safeDbCode(trainingResult.error.code)}`;
    throw error;
  }
  if (knowledgeResult.error) {
    const error: any = new Error('autocar_knowledge_retrieval_failed');
    error.code = `knowledge_rpc_${safeDbCode(knowledgeResult.error.code)}`;
    throw error;
  }
  return { training: trainingResult.data || [], knowledge: knowledgeResult.data || [] };
}
