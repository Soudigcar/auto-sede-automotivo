'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function StoreLegacyPage() {
  const supabase = createClient();
  const router = useRouter();
  const [message, setMessage] = useState('Redirecionando para o portal da loja...');

  async function redirectStore() {
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session?.user) {
      router.replace('/login?redirectedFrom=/store');
      return;
    }

    const email = sessionData.session.user.email || '';

    let { data: profile } = await supabase
      .from('users')
      .select('role,status,store_id')
      .eq('auth_user_id', sessionData.session.user.id)
      .maybeSingle();

    if (!profile) {
      const result = await supabase
        .from('users')
        .select('role,status,store_id')
        .ilike('email', email)
        .maybeSingle();

      profile = result.data;
    }

    if (!profile || profile.status !== 'active') {
      setMessage('Usuario sem perfil ativo.');
      return;
    }

    if (profile.role === 'master') {
      router.replace('/master/dashboard/live');
      return;
    }

    if (profile.role !== 'store' || !profile.store_id) {
      setMessage('Usuario nao possui loja vinculada.');
      return;
    }

    const { data: store } = await supabase
      .from('stores')
      .select('slug,portal_enabled,status')
      .eq('id', profile.store_id)
      .maybeSingle();

    if (!store || store.status !== 'active' || !store.portal_enabled) {
      setMessage('Portal da loja indisponivel.');
      return;
    }

    router.replace(`/loja/${store.slug}`);
  }

  useEffect(() => {
    redirectStore().catch(() => setMessage('Nao foi possivel redirecionar.'));
  }, []);

  return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{message}</main>;
}
