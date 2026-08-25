'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export default function RedefinePasswordPage() {
  const supabase = useMemo(
    () =>
      createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        {
          auth: {
            flowType: 'implicit',
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true
          }
        }
      ),
    []
  );
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('Validando link de recuperação...');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hashLooksLikeRecovery = typeof window !== 'undefined' && window.location.hash.includes('type=recovery');

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true);
        setChecking(false);
        setMessage('');
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || ready) return;
      if (hashLooksLikeRecovery && data.session) {
        setReady(true);
        setMessage('');
      } else {
        setMessage('Este link de recuperação é inválido ou expirou. Solicite um novo link.');
      }
      setChecking(false);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [ready, supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || saving) return;

    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setMessage('Use ao menos 12 caracteres, com maiúscula, minúscula, número e símbolo.');
      return;
    }
    if (password !== confirmation) {
      setMessage('A confirmação da senha não confere.');
      return;
    }

    setSaving(true);
    setMessage('Salvando nova senha...');

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || '';
      if (!token) throw new Error('Sessão de recuperação expirada. Solicite um novo link.');

      const response = await fetch('/api/auth/password-recovery/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password, password_confirmation: confirmation })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível redefinir a senha.');

      await supabase.auth.signOut();
      setSuccess(true);
      setMessage('Senha redefinida. Você já pode entrar novamente.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível redefinir a senha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070A12] px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-4xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[34px] border border-white/10 bg-white shadow-2xl shadow-black/40 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-[#0B1220] p-8 md:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white"><KeyRound size={27} /></div>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.3em] text-red-500">Segurança da conta</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">Crie uma nova senha</h1>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">Esta página só libera a alteração quando o link privado de recuperação estabelece uma sessão válida.</p>
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 text-emerald-400" /><div><p className="font-black">Senha forte obrigatória</p><p className="mt-1 text-sm text-zinc-400">Mínimo de 12 caracteres, com maiúscula, minúscula, número e símbolo.</p></div></div>
            </div>
          </div>

          <div className="p-7 text-zinc-950 md:p-10">
            {checking ? (
              <div className="flex min-h-96 flex-col items-center justify-center text-center"><Loader2 className="animate-spin text-red-600" size={32} /><p className="mt-4 font-bold text-zinc-600">Validando recuperação...</p></div>
            ) : success ? (
              <div className="flex min-h-96 flex-col items-center justify-center text-center"><CheckCircle2 className="text-emerald-500" size={54} /><h2 className="mt-4 text-3xl font-black">Senha redefinida</h2><p className="mt-2 text-sm text-zinc-500">{message}</p><Link href="/login" className="btn-primary mt-6">Entrar no sistema</Link></div>
            ) : ready ? (
              <form onSubmit={submit}>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">Recuperação confirmada</p>
                <h2 className="mt-2 text-3xl font-black">Nova senha</h2>
                <label className="mt-7 block text-sm font-bold text-zinc-700">Digite a nova senha</label>
                <input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={saving} className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111827] px-4 py-3 font-semibold text-white outline-none focus:border-red-500" />
                <label className="mt-4 block text-sm font-bold text-zinc-700">Confirme a nova senha</label>
                <input type="password" required minLength={12} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={saving} className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111827] px-4 py-3 font-semibold text-white outline-none focus:border-red-500" />
                <button type="submit" disabled={saving} className="btn-primary mt-6 w-full justify-center disabled:cursor-wait disabled:opacity-60">{saving ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}{saving ? 'Salvando...' : 'Salvar nova senha'}</button>
                {message ? <p className="mt-4 rounded-2xl bg-zinc-100 p-3 text-sm font-semibold text-zinc-600">{message}</p> : null}
              </form>
            ) : (
              <div className="flex min-h-96 flex-col items-center justify-center text-center"><KeyRound className="text-zinc-300" size={46} /><h2 className="mt-4 text-2xl font-black">Link inválido ou expirado</h2><p className="mt-2 max-w-sm text-sm text-zinc-500">{message}</p><Link href="/recuperar-senha" className="btn-primary mt-6">Solicitar novo link</Link></div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
