import { createClient } from '@supabase/supabase-js';

export type StoreTeamRole = 'pre_sales' | 'seller' | 'prospector';

export const storeTeamRoles: StoreTeamRole[] = ['pre_sales', 'seller', 'prospector'];

export const storeTeamRoleLabels: Record<StoreTeamRole, string> = {
  pre_sales: 'Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospectador'
};

export function isStoreTeamRole(value: unknown): value is StoreTeamRole {
  return storeTeamRoles.includes(String(value || '') as StoreTeamRole);
}

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase Service Role não configurada no servidor.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function readBearerToken(request: Request) {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

export async function getProfileFromToken(supabase: any, token: string) {
  if (!token) return null;

  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) return null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (byAuth) return byAuth;
  if (!authData.user.email) return null;

  const { data: byEmail } = await supabase
    .from('users')
    .select('*')
    .ilike('email', authData.user.email)
    .maybeSingle();

  return byEmail || null;
}

export async function resolveManagedStore(supabase: any, profile: any, slug: string) {
  const { data: store, error } = await supabase
    .from('stores')
    .select('id, store_name, slug, event_id, status, portal_enabled')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!store || store.status !== 'active' || !store.portal_enabled) return null;

  if (profile?.role === 'master') return store;
  if (profile?.role === 'store' && profile.store_id === store.id) return store;

  return null;
}

export function cleanText(value: unknown, maxLength = 250) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function normalizeEmail(value: unknown) {
  return cleanText(value, 320).toLowerCase();
}

export function publicAppUrl(request: Request) {
  const configured = String(process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;

  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');

  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(request.url).origin;
}
