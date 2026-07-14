import { createClient } from '@/lib/supabase';

export async function getStorePortalContext(slug: string) {
  const supabase = createClient();

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session?.user) {
    return { status: 'unauthenticated' as const, profile: null, store: null };
  }

  let profile: any = null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  profile = byAuth;

  if (!profile && session.user.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('*')
      .ilike('email', session.user.email)
      .maybeSingle();

    profile = byEmail;
  }

  if (!profile || profile.status !== 'active') {
    return { status: 'no_profile' as const, profile: null, store: null };
  }

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'active')
    .eq('portal_enabled', true)
    .maybeSingle();

  if (!store) {
    return { status: 'store_not_found' as const, profile, store: null };
  }

  if (profile.role !== 'master' && profile.role !== 'store') {
    return { status: 'forbidden' as const, profile, store };
  }

  if (profile.role === 'store' && profile.store_id !== store.id) {
    return { status: 'wrong_store' as const, profile, store };
  }

  return { status: 'ok' as const, profile, store };
}
