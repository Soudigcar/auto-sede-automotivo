'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getRoleHomePath } from '@/lib/auth';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState('evento@bradesco.com.br');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const redirectedFrom = searchParams.get('redirectedFrom');

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    setMessage('Validando acesso...');

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error) {
      setMessage('Nao foi possivel acessar. Verifique e-mail e senha.');
      return;
    }

    const { data: authData } = await supabase.auth.getUser();

    let profile: any = null;

    if (authData.user?.id) {
      const { data } = await supabase
        .from('users')
        .select('id,role,status,store_id,email')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();

      profile = data;
    }

    if (!profile) {
      const { data } = await supabase
        .from('users')
        .select('id,role,status,store_id,email')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      profile = data;
    }

    if (!profile || profile.status !== 'active') {
      setMessage('Usuario sem perfil ativo no sistema.');
      return;
    }

    let target = redirectedFrom || getRoleHomePath(profile.role);

    if (profile.role === 'store') {
      if (!profile.store_id) {
        setMessage('Usuario de loja sem loja vinculada. Fale com o administrador.');
        return;
      }

      const { data: store } = await supabase
        .from('stores')
        .select('id,slug,portal_enabled,status')
        .eq('id', profile.store_id)
        .maybeSingle();

      if (!store || store.status !== 'active' || !store.portal_enabled) {
        setMessage('Portal da loja indisponivel ou desativado.');
        return;
      }

      const storeHome = `/loja/${store.slug}`;
      const storePrefix = `/loja/${store.slug}`;

      target = redirectedFrom?.startsWith(storePrefix) ? redirectedFrom : storeHome;
    }

    setMessage('Acesso validado. Redirecionando...');
    router.push(target);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4F6FA] px-6 text-[#101828]">
      <form onSubmit={handleLogin} className="w-full max-w-md rounded-[28px] border border-zinc-200 bg-white p-8 shadow-2xl shadow-slate-200/70">
        <p className="text-sm font-black uppercase tracking-[0.25em] text-red-600">Acesso</p>
        <h1 className="mt-3 text-3xl font-black text-zinc-950">Entrar no sistema</h1>
        <p className="mt-3 text-sm text-zinc-500">O sistema direciona conforme o perfil cadastrado.</p>

        <label className="mt-6 block text-sm font-bold text-zinc-700">E-mail</label>
        <input
          className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111827] px-4 py-3 font-semibold text-white outline-none transition placeholder:text-zinc-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label className="mt-4 block text-sm font-bold text-zinc-700">Senha</label>
        <input
          className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111827] px-4 py-3 font-semibold text-white outline-none transition placeholder:text-zinc-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Digite sua senha"
        />

        <button className="btn-primary mt-6 w-full" type="submit">Entrar</button>

        {message ? (
          <p className="mt-4 rounded-2xl bg-zinc-50 p-3 text-sm font-semibold text-zinc-600">{message}</p>
        ) : null}
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#F4F6FA] px-6 text-[#101828]"><p className="text-sm font-bold text-zinc-500">Carregando acesso...</p></main>}>
      <LoginContent />
    </Suspense>
  );
}
