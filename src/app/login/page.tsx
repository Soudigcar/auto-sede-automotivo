'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('evento@bradesco.com.br');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Validando acesso...');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage('Não foi possível acessar. Verifique e-mail e senha.');
      return;
    }

    setMessage('Acesso validado. Direcionamento por perfil será aplicado na próxima etapa.');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-black px-6 text-white">
      <form onSubmit={handleLogin} className="card w-full max-w-md p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Acesso</p>
        <h1 className="mt-3 text-3xl font-black">Entrar no sistema</h1>
        <label className="mt-6 block text-sm text-zinc-300">E-mail</label>
        <input className="mt-2 w-full rounded-xl px-4 py-3" value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="mt-4 block text-sm text-zinc-300">Senha</label>
        <input className="mt-2 w-full rounded-xl px-4 py-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="btn-primary mt-6 w-full" type="submit">Entrar</button>
        {message ? <p className="mt-4 text-sm text-zinc-300">{message}</p> : null}
      </form>
    </main>
  );
}
