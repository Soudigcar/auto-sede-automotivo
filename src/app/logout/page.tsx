'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function LogoutPage() {
  const supabase = createClient();
  const router = useRouter();
  const [message, setMessage] = useState('Saindo do sistema...');

  useEffect(() => {
    async function logout() {
      await supabase.auth.signOut();
      setMessage('Sessão encerrada. Redirecionando...');
      router.replace('/login');
      router.refresh();
    }

    logout().catch(() => {
      setMessage('Não foi possível sair automaticamente. Volte para o login.');
      router.replace('/login');
    });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">
      <p className="text-sm font-bold">{message}</p>
    </main>
  );
}
