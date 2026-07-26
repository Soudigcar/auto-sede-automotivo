'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Car, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const redirectedFrom = searchParams.get('redirectedFrom');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setMessage('Informe e-mail e senha.');
      return;
    }

    setIsSubmitting(true);
    setMessage('Validando acesso...');

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) {
        setMessage('Não foi possível acessar. Verifique e-mail e senha.');
        setIsSubmitting(false);
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      let profile: any = null;

      if (authData.user?.id) {
        const { data } = await supabase
          .from('users')
          .select('id,role,status,store_id,email,must_change_password')
          .eq('auth_user_id', authData.user.id)
          .maybeSingle();
        profile = data;
      }

      if (!profile) {
        const { data } = await supabase
          .from('users')
          .select('id,role,status,store_id,email,must_change_password')
          .ilike('email', normalizedEmail)
          .maybeSingle();
        profile = data;
      }

      if (!profile || profile.status !== 'active') {
        await supabase.auth.signOut();
        setMessage('Usuário sem perfil ativo no sistema.');
        setIsSubmitting(false);
        return;
      }

      if (profile.role === 'master') {
        const target = redirectedFrom?.startsWith('/master') ? redirectedFrom : '/master/dashboard/live';
        router.replace(target);
        return;
      }

      if (!['store', 'pre_sales', 'seller', 'prospector'].includes(profile.role) || !profile.store_id) {
        await supabase.auth.signOut();
        setMessage('Usuário sem loja vinculada. Fale com o administrador.');
        setIsSubmitting(false);
        return;
      }

      const { data: store } = await supabase
        .from('stores')
        .select('id,slug,portal_enabled,status')
        .eq('id', profile.store_id)
        .maybeSingle();

      if (!store || store.status !== 'active' || !store.portal_enabled) {
        await supabase.auth.signOut();
        setMessage('Portal da loja indisponível ou desativado.');
        setIsSubmitting(false);
        return;
      }

      const storePrefix = `/loja/${store.slug}`;
      const defaultPath = profile.role === 'prospector' ? `${storePrefix}` : `${storePrefix}/pipeline`;
      const target = redirectedFrom?.startsWith(storePrefix) ? redirectedFrom : defaultPath;
      router.replace(profile.must_change_password ? `/trocar-senha?next=${encodeURIComponent(target)}` : target);
    } catch {
      setMessage('Não foi possível concluir o login. Tente novamente.');
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070A12] px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1fr_430px] lg:items-center">
          <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/30 md:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white"><Car size={28} /></div>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.35em] text-red-500">Sistema Automotivo</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">Auto Controle Automotivo</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-300">Um único login para Master, Gestor, Pré-vendas, Vendedores e Prospectadores. O sistema identifica automaticamente o cargo e libera somente o portal e os leads autorizados.</p>
          </div>

          <form onSubmit={handleLogin} className="rounded-[34px] border border-white/10 bg-white p-7 text-[#101828] shadow-2xl shadow-black/40 md:p-8">
            <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white"><LogIn size={23} /></div><div><p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">Login seguro</p><h2 className="text-2xl font-black text-zinc-950">Entrar no sistema</h2></div></div>
            <p className="mt-4 text-sm text-zinc-500">Use o e-mail e a senha cadastrados no sistema.</p>

            <label className="mt-6 block text-sm font-bold text-zinc-700">E-mail</label>
            <input className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111827] px-4 py-3 font-semibold text-white outline-none focus:border-red-500" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seuemail@dominio.com.br" autoComplete="email" disabled={isSubmitting} />

            <label className="mt-4 block text-sm font-bold text-zinc-700">Senha</label>
            <input className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111827] px-4 py-3 font-semibold text-white outline-none focus:border-red-500" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" autoComplete="current-password" disabled={isSubmitting} />

            <button className="btn-primary mt-6 w-full justify-center disabled:cursor-wait disabled:opacity-60" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Entrando...' : 'Entrar no sistema'}</button>
            {message ? <p className="mt-4 rounded-2xl bg-zinc-50 p-3 text-sm font-semibold text-zinc-600">{message}</p> : null}
          </form>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#070A12] text-white">Carregando login...</main>}><LoginContent /></Suspense>;
}
