import { createClient } from '@supabase/supabase-js';

export function cleanText(value: unknown, maxLength = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !serviceKey) {
    throw new Error('Configuração do servidor incompleta.');
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function requireMaster(request: Request, supabase = getAdminClient()) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('id,role,status,full_name,email')
    .eq('auth_user_id', data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== 'master' || profile.status !== 'active') return null;
  return profile;
}
