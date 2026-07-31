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

  const fields = 'id,auth_user_id,role,status,full_name,email';

  const { data: linkedProfile } = await supabase
    .from('users')
    .select(fields)
    .eq('auth_user_id', data.user.id)
    .maybeSingle();

  let profile = linkedProfile;

  if (!profile && data.user.email) {
    const { data: emailProfile } = await supabase
      .from('users')
      .select(fields)
      .ilike('email', data.user.email)
      .limit(1)
      .maybeSingle();

    const canUseEmailFallback = Boolean(
      emailProfile &&
      (!emailProfile.auth_user_id || emailProfile.auth_user_id === data.user.id)
    );

    if (canUseEmailFallback) {
      profile = emailProfile;

      if (!emailProfile.auth_user_id) {
        await supabase
          .from('users')
          .update({ auth_user_id: data.user.id, updated_at: new Date().toISOString() })
          .eq('id', emailProfile.id)
          .is('auth_user_id', null);
      }
    }
  }

  if (!profile) return null;
  if (String(profile.role || '').toLowerCase() !== 'master') return null;
  if (String(profile.status || '').toLowerCase() !== 'active') return null;

  return profile;
}
