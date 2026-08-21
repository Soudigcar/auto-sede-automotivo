import {
  emptyAutocarStoreKnowledgeConfig,
  renderAutocarStoreKnowledgeContent,
  sanitizeAutocarStoreKnowledgeConfig,
  type AutocarStoreKnowledgeConfig
} from '@/lib/autocar/storeKnowledgeConfig';
import { ensureAutocarDevStore, getAutocarDevClient } from '@/lib/server/autocar/devAdmin';

const CATEGORY = 'portal_config';
const TITLE = 'store_intelligence_v1';

export async function getAutocarStoreKnowledgeConfig(storeId: string) {
  const autocar = getAutocarDevClient();
  const { data, error } = await autocar
    .from('ai_store_knowledge')
    .select('id,store_id,category,title,content,structured_data,status,version,updated_at')
    .eq('store_id', storeId)
    .eq('category', CATEGORY)
    .eq('title', TITLE)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      config: emptyAutocarStoreKnowledgeConfig,
      content: '',
      version: 0,
      updated_at: null
    };
  }

  const structured = data.structured_data && typeof data.structured_data === 'object'
    ? (data.structured_data as Record<string, unknown>).config ?? data.structured_data
    : {};
  const config = sanitizeAutocarStoreKnowledgeConfig(structured);

  return {
    config,
    content: String(data.content || renderAutocarStoreKnowledgeContent(config)),
    version: Number(data.version || 1),
    updated_at: data.updated_at || null
  };
}

export async function saveAutocarStoreKnowledgeConfig(input: {
  store: { id: string; store_name: string; slug?: string | null; status?: string | null; portal_enabled?: boolean | null };
  profileId?: string | null;
  config: AutocarStoreKnowledgeConfig | Record<string, unknown>;
}) {
  const autocar = getAutocarDevClient();
  await ensureAutocarDevStore(autocar, input.store);

  const config = sanitizeAutocarStoreKnowledgeConfig(input.config);
  const content = renderAutocarStoreKnowledgeContent(config);
  const { data: existing, error: existingError } = await autocar
    .from('ai_store_knowledge')
    .select('id,version')
    .eq('store_id', input.store.id)
    .eq('category', CATEGORY)
    .eq('title', TITLE)
    .maybeSingle();

  if (existingError) throw existingError;
  const now = new Date().toISOString();
  const version = Math.max(1, Number(existing?.version || 0) + 1);
  const payload = {
    store_id: input.store.id,
    category: CATEGORY,
    title: TITLE,
    content,
    structured_data: {
      config,
      source: 'store_portal_autocar',
      updated_by_crm_profile_id: input.profileId || null
    },
    status: 'active',
    version,
    created_by: null,
    updated_by: null,
    updated_at: now
  };

  const { data, error } = await autocar
    .from('ai_store_knowledge')
    .upsert(payload, { onConflict: 'store_id,category,title' })
    .select('id,store_id,category,title,content,structured_data,status,version,updated_at')
    .single();

  if (error) throw error;
  return {
    config,
    content: String(data.content || content),
    version: Number(data.version || version),
    updated_at: data.updated_at || now
  };
}
