'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage('Enviando instruções...');

    try {
      const response = await fetch('/api/auth/password-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const payload = await response.json();
      setMessage(payload.message || payload.error || 'Se esse e-mail estiver cadastrado, enviaremos as instruções de recuperação.');
    } catch {
      setMessage('Se esse e-mail estiver cadastrado, enviaremos as instruções de recuperação.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070A12] px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-4xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[34px] border border-white/10 bg-white shadow-2xl shadow-black/40 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-[#0B1220] p-8 md:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white"><KeyRound size={27} /></div>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.3em] text-red-500">Recuperação segura</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">Esqueceu sua senha?</h1>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">Informe o e-mail usado no Auto Controle. Se houver uma conta válida, enviaremos um link privado para você criar uma nova senha.</p>
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 text-emerald-400" /><div><p className="font-black">Seu gestor não recebe sua senha</p><p className="mt-1 text-sm text-zinc-400">O link de recuperação é enviado somente para o e-mail cadastrado.</p></div></div>
            </div>
          </div>

          <form onSubmit={submit} className="p-7 text-zinc-950 md:p-10">
            <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Mail size={22} /></div><div><p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">Acesso</p><h2 className="text-3xl font-black">Recuperar senha</h2></div></div>
            <p className="mt-4 text-sm text-zinc-500">Digite seu e-mail. Por segurança, a resposta será a mesma mesmo quando o endereço não estiver cadastrado.</p>

            <label className="mt-7 block text-sm font-bold text-zinc-700">E-mail</label>
            <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111827] px-4 py-3 font-semibold text-white outline-none focus:border-red-500" placeholder="seuemail@dominio.com.br" />

            <button type="submit" disabled={submitting} className="btn-primary mt-6 w-full justify-center disabled:cursor-wait disabled:opacity-60">{submitting ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}{submitting ? 'Enviando...' : 'Enviar instruções'}</button>
            {message ? <p className="mt-4 rounded-2xl bg-zinc-100 p-3 text-sm font-semibold text-zinc-600">{message}</p> : null}
            <Link href="/login" className="mt-6 inline-flex text-sm font-black text-red-600 hover:text-red-700">Voltar para o login</Link>
          </form>
        </div>
      </section>
    </main>
  );
}
