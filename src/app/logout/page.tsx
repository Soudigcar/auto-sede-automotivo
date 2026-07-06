'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function LogoutPage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function signOut() {
      await supabase.auth.signOut();
      router.replace('/login');
      router.refresh();
    }

    signOut();
  }, [router, supabase.auth]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-black px-6 text-white">
      <div className="card p-8 text-center">
        <p className="text-sm uppercase tracking-[0.25em] text-brand-red">Sessao</p>
        <h1 className="mt-3 text-2xl font-black">Saindo do sistema...</h1>
      </div>
    </main>
  );
}
