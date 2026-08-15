import { createClient } from '@supabase/supabase-js';

export type AutocarStoreMode = 'off' | 'copilot' | 'autopilot';

export function getAutocarDevClient() {
  const url = String(process.env.AUTOCAR_KNOWLEDGE_SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !serviceRoleKey) {
    throw new Error('Ambiente isolado da AUTOCAR não está configurado neste Preview.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function ensureAutocarDevStore(
  supabase: ReturnType<typeof getAutocarDevClient>,
  store: { id: string; store_name: string; slug?: string | null; status?: string | null; portal_enabled?: boolean | null }
) {
  const slug = String(store.slug || '').trim() || `autocar-${store.id.slice(0, 8)}`;
  const status = String(store.status || 'active').trim() || 'active';

  const { error } = await supabase.from('stores').upsert({
    id: store.id,
    store_name: store.store_name,
    responsible_name: 'AUTOCAR DEV',
    slug,
    status,
    portal_enabled: Boolean(store.portal_enabled ?? true),
    registration_source: 'autocar-master-preview',
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });

  if (error) throw error;
}

export async function setAutocarStoreMode(
  supabase: ReturnType<typeof getAutocarDevClient>,
  store: { id: string; store_name: string; slug?: string | null; status?: string | null; portal_enabled?: boolean | null },
  mode: AutocarStoreMode
) {
  await ensureAutocarDevStore(supabase, store);

  const status = mode === 'off' ? 'inactive' : 'active';
  const { data, error } = await supabase.from('ai_store_agents').upsert({
    store_id: store.id,
    name: 'AUTOCAR',
    status,
    mode,
    updated_at: new Date().toISOString()
  }, { onConflict: 'store_id' }).select('id,store_id,name,status,mode,tone,language,version,updated_at').single();

  if (error) throw error;
  return data;
}
