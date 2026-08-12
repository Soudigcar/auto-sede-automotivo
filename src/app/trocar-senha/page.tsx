'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/routes';
  return value;
}

function ChangePasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const nextPath = safeNextPath(searchParams.get('next'));

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('Validando acesso...');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        router.replace(`/login?redirectedFrom=${encodeURIComponent(nextPath)}`);
        return;
      }
      setMessage('');
      setChecking(false);
    }

    void check();
    return () => { cancelled = true; };
  }, [nextPath, router, supabase]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    if (password.length < 8) {
      setMessage('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    if (password !== confirmation) {
      setMessage('A confirmação da senha não confere.');
      return;
    }

    setSaving(true);
    setSuccess(false);
    setMessage('Salvando sua nova senha...');

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const token = session?.access_token || '';
      const email = session?.user.email?.trim() || '';

      if (!token || !email) {
        throw new Error('Sua sessão não pôde ser renovada. Entre novamente e repita a troca de senha.');
      }

      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ password, password_confirmation: confirmation })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível alterar a senha.');

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError || !signInData.session) {
        throw new Error('Senha alterada, mas não foi possível renovar sua sessão. Entre novamente com a nova senha.');
      }

      setSuccess(true);
      setMessage('Senha alterada. Liberando seu acesso...');
      router.replace(nextPath);
      router.refresh();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível alterar a senha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070A12] px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[34px] border border-white/10 bg-white shadow-2xl shadow-black/40 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-[#0B1220] p-8 md:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white"><KeyRound size={27} /></div>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.3em] text-red-500">Primeiro acesso</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">Crie sua nova senha</h1>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">A senha recebida do Gestor é temporária. Defina uma senha pessoal antes de acessar os leads da loja.</p>
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 text-emerald-400" /><div><p className="font-black">Requisitos mínimos</p><p className="mt-1 text-sm text-zinc-400">Pelo menos 8 caracteres, contendo uma letra e um número.</p></div></div>
            </div>
          </div>

          <div className="p-7 text-zinc-950 md:p-10">
            {checking ? (
              <div className="flex min-h-96 flex-col items-center justify-center text-center"><Loader2 className="animate-spin text-red-600" size={32} /><p className="mt-4 font-bold text-zinc-600">Validando acesso...</p></div>
            ) : (
              <form onSubmit={submit}>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">Segurança da conta</p>
                <h2 className="mt-2 text-3xl font-black">Nova senha</h2>
                <p className="mt-2 text-sm text-zinc-500">Não compartilhe essa senha com outras pessoas da equipe.</p>

                <label className="mt-7 block text-sm font-bold text-zinc-700">Digite a nova senha</label>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111827] px-4 py-3 font-semibold text-white outline-none focus:border-red-500" placeholder="Mínimo 8 caracteres" required minLength={8} autoComplete="new-password" disabled={saving || success} />

                <label className="mt-4 block text-sm font-bold text-zinc-700">Confirme a nova senha</label>
                <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111827] px-4 py-3 font-semibold text-white outline-none focus:border-red-500" placeholder="Repita a nova senha" required minLength={8} autoComplete="new-password" disabled={saving || success} />

                <button type="submit" disabled={saving || success} className="btn-primary mt-6 w-full justify-center disabled:cursor-wait disabled:opacity-60">
                  {saving ? <Loader2 size={18} className="animate-spin" /> : success ? <CheckCircle2 size={18} /> : <KeyRound size={18} />}
                  {saving ? 'Alterando senha...' : success ? 'Senha alterada' : 'Salvar nova senha'}
                </button>

                {message ? <p className={success ? 'mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700' : 'mt-4 rounded-2xl bg-zinc-100 p-3 text-sm font-semibold text-zinc-600'}>{message}</p> : null}
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default function ChangePasswordPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#070A12] text-white">Carregando...</main>}><ChangePasswordContent /></Suspense>;
}
