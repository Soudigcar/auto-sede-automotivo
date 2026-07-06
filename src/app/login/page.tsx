'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getRoleHomePath } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState('evento@bradesco.com.br');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const redirectedFrom = searchParams.get('redirectedFrom');

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Validando acesso...');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage('Nao foi possivel acessar. Verifique e-mail e senha.');
      return;
    }
    const { data: profile } = await supabase.from('users').select('role,status').eq('email', email).single();
    if (!profile || profile.status !== 'active') {
      setMessage('Usuario sem perfil ativo no sistema.');
      return;
    }
    const target = redirectedFrom || getRoleHomePath(profile.role);
    setMessage('Acesso validado. Redirecionando...');
    router.push(target);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-black px-6 text-white">
      <form onSubmit={handleLogin} className="card w-full max-w-md p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Acesso</p>
        <h1 className="mt-3 text-3xl font-black">Entrar no sistema</h1>
        <p className="mt-3 text-sm text-zinc-400">O sistema direciona conforme o perfil cadastrado.</p>
        <label className="mt-6 block text-sm text-zinc-300">E-mail</label>
        <input className="mt-2 w-full rounded-xl px-4 py-3" value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="mt-4 block text-sm text-zinc-300">Senha</label>
        <input className="mt-2 w-full rounded-xl px-4 py-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" />
        <button className="btn-primary mt-6 w-full" type="submit">Entrar</button>
        {message ? <p className="mt-4 text-sm text-zinc-300">{message}</p> : null}
      </form>
    </main>
  );
}
