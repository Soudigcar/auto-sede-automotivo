'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Building2, CheckCircle2, Loader2, ShieldCheck, UserPlus, AlertTriangle } from 'lucide-react';
import {
  TEAM_REGISTRATION_PASSWORD_HINT,
  TEAM_REGISTRATION_PASSWORD_MIN_LENGTH
} from '@/lib/storeTeamRegistration';

type RegistrationContext = {
  store_name: string;
  store_slug: string;
  role: string;
  role_label: string;
  expires_at: string | null;
};

type Step = 'email' | 'new_account' | 'transfer_required' | 'already_member';

function formatExpiration(value: string | null) {
  if (!value) return 'Sem data de expiração';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Validade não informada';
  return `Válido até ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function TeamRegistrationPage() {
  const params = useParams();
  const token = String(params?.token || '');
  const [context, setContext] = useState<RegistrationContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('Validando convite...');
  const [completed, setCompleted] = useState(false);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [transferConfirmed, setTransferConfirmed] = useState(false);

  useEffect(() => {
    async function loadContext() {
      try {
        const response = await fetch(`/api/public/team-registration?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
          setMessage(payload.error || 'Este convite não está disponível.');
          return;
        }
        setContext(payload);
        setMessage('');
      } catch {
        setMessage('Não foi possível validar o convite. Tente novamente.');
      } finally {
        setLoading(false);
      }
    }

    if (token) loadContext();
    else {
      setMessage('Link de cadastro inválido.');
      setLoading(false);
    }
  }, [token]);

  async function checkEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('Verificando sua conta...');
    const formData = new FormData(event.currentTarget);
    const normalizedEmail = String(formData.get('email') || '').trim().toLowerCase();

    try {
      const response = await fetch('/api/public/team-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_email', token, email: normalizedEmail })
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error || 'Não foi possível verificar este e-mail.');
        return;
      }
      setEmail(normalizedEmail);
      setStep(payload.account_state as Step);
      setMessage(payload.message || '');
    } catch {
      setMessage('Falha de conexão. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNewAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('Criando seu cadastro...');
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/public/team-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register', token, email,
          full_name: formData.get('full_name'), phone: formData.get('phone'),
          password: formData.get('password'), password_confirmation: formData.get('password_confirmation')
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error || 'Não foi possível concluir o cadastro.');
        return;
      }
      setCompleted(true);
      setMessage(payload.message || 'Cadastro enviado com sucesso.');
    } catch {
      setMessage('Falha de conexão ao enviar o cadastro.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferConfirmed) {
      setMessage('Marque a confirmação para continuar.');
      return;
    }
    setSubmitting(true);
    setMessage('Confirmando transferência...');
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/public/team-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_transfer', token, email,
          password: formData.get('password'), confirm_transfer: true
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error || 'Não foi possível concluir a transferência.');
        return;
      }
      setCompleted(true);
      setMessage(payload.message || 'Transferência concluída.');
    } catch {
      setMessage('Falha de conexão ao confirmar a transferência.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070A12] px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[34px] border border-white/10 bg-white shadow-2xl shadow-black/40 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-[#0B1220] p-7 md:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white"><UserPlus size={27} /></div>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.3em] text-red-500">Auto Controle Automotivo</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">Cadastro da equipe</h1>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">Seu convite é vinculado à loja e ao cargo definidos pelo Gestor.</p>
            {context ? <div className="mt-8 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center gap-3"><Building2 size={18} className="text-red-500" /><div><p className="text-xs uppercase tracking-wider text-zinc-500">Nova loja</p><p className="mt-1 font-black text-white">{context.store_name}</p></div></div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center gap-3"><ShieldCheck size={18} className="text-red-500" /><div><p className="text-xs uppercase tracking-wider text-zinc-500">Cargo</p><p className="mt-1 font-black text-white">{context.role_label}</p></div></div></div>
              <p className="text-xs text-zinc-500">{formatExpiration(context.expires_at)}</p>
            </div> : null}
          </div>

          <div className="p-7 text-zinc-950 md:p-10">
            {loading ? <div className="flex min-h-96 flex-col items-center justify-center text-center"><Loader2 className="animate-spin text-red-600" size={32} /><p className="mt-4 font-bold text-zinc-600">Validando convite...</p></div>
            : completed ? <div className="flex min-h-96 flex-col items-center justify-center text-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 size={34} /></div><h2 className="mt-5 text-3xl font-black">Tudo certo</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-500">{message}</p><Link href="/login" className="premium-button-primary mt-6">Entrar no sistema</Link></div>
            : context && step === 'email' ? <form onSubmit={checkEmail}><p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">Identificação</p><h2 className="mt-2 text-3xl font-black">Informe seu e-mail</h2><p className="mt-2 text-sm text-zinc-500">Vamos verificar se você já possui uma conta antes de continuar.</p><label className="mt-7 block text-sm font-bold text-zinc-700">E-mail<input name="email" type="email" className="premium-input mt-2" placeholder="seuemail@dominio.com" required autoComplete="email" /></label><button type="submit" disabled={submitting} className="premium-button-primary mt-7 w-full justify-center disabled:opacity-60">{submitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}{submitting ? 'Verificando...' : 'Continuar'}</button>{message ? <p className="mt-4 rounded-2xl bg-zinc-100 p-3 text-sm font-semibold text-zinc-600">{message}</p> : null}</form>
            : context && step === 'transfer_required' ? <form onSubmit={confirmTransfer}><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><AlertTriangle size={27} /></div><p className="mt-5 text-xs font-black uppercase tracking-[0.25em] text-amber-700">Conta existente</p><h2 className="mt-2 text-3xl font-black">Você já possui uma conta</h2><p className="mt-3 text-sm leading-relaxed text-zinc-600">Sua conta está atualmente vinculada a outra empresa. Você foi convidado para fazer parte da equipe da <strong>{context.store_name}</strong>.</p><div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-black">Ao continuar:</p><ul className="mt-2 list-disc space-y-2 pl-5"><li>seu acesso à empresa anterior será encerrado;</li><li>você não terá mais acesso aos leads, conversas, agenda ou informações da empresa anterior;</li><li>os atendimentos e o histórico permanecem armazenados na empresa anterior;</li><li>sua conta passará a fazer parte da equipe da <strong>{context.store_name}</strong>, no cargo <strong>{context.role_label}</strong>.</li></ul></div><label className="mt-5 block text-sm font-bold text-zinc-700">Sua senha atual<input name="password" type="password" className="premium-input mt-2" required autoComplete="current-password" placeholder="Digite sua senha atual" /></label><label className="mt-5 flex cursor-pointer gap-3 rounded-2xl border border-zinc-200 p-4 text-sm font-semibold text-zinc-700"><input type="checkbox" checked={transferConfirmed} onChange={(e) => setTransferConfirmed(e.target.checked)} className="mt-1" /><span>Confirmo que quero encerrar meu vínculo atual e entrar para a equipe da <strong>{context.store_name}</strong>.</span></label><button type="submit" disabled={submitting || !transferConfirmed} className="premium-button-primary mt-6 w-full justify-center disabled:opacity-50">{submitting ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}{submitting ? 'Confirmando...' : 'Confirmar e entrar na nova loja'}</button><button type="button" onClick={() => { setStep('email'); setMessage(''); setTransferConfirmed(false); }} className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-black text-zinc-500 hover:bg-zinc-100">Cancelar</button>{message ? <p className="mt-4 rounded-2xl bg-zinc-100 p-3 text-sm font-semibold text-zinc-600">{message}</p> : null}</form>
            : context && step === 'already_member' ? <div className="flex min-h-96 flex-col items-center justify-center text-center"><ShieldCheck size={38} className="text-emerald-600" /><h2 className="mt-4 text-2xl font-black">Você já faz parte desta equipe</h2><p className="mt-3 max-w-md text-sm text-zinc-500">{message || 'Entre com sua conta atual. Nenhuma transferência é necessária.'}</p><Link href="/login" className="premium-button-primary mt-6">Entrar no sistema</Link></div>
            : context && step === 'new_account' ? <form onSubmit={submitNewAccount}><p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">Nova conta</p><h2 className="mt-2 text-3xl font-black">Crie seu cadastro</h2><p className="mt-2 text-sm text-zinc-500">E-mail: <strong>{email}</strong></p><div className="mt-7 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2 text-sm font-bold text-zinc-700">Nome completo<input name="full_name" className="premium-input mt-2" required minLength={3} /></label><label className="sm:col-span-2 text-sm font-bold text-zinc-700">Telefone<input name="phone" className="premium-input mt-2" autoComplete="tel" /></label><label className="text-sm font-bold text-zinc-700">Senha<input name="password" type="password" className="premium-input mt-2" required minLength={TEAM_REGISTRATION_PASSWORD_MIN_LENGTH} autoComplete="new-password" /><span className="mt-2 block text-xs font-medium text-zinc-500">{TEAM_REGISTRATION_PASSWORD_HINT}</span></label><label className="text-sm font-bold text-zinc-700">Confirmar senha<input name="password_confirmation" type="password" className="premium-input mt-2" required minLength={TEAM_REGISTRATION_PASSWORD_MIN_LENGTH} autoComplete="new-password" /></label></div><button type="submit" disabled={submitting} className="premium-button-primary mt-7 w-full justify-center disabled:opacity-60">{submitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}{submitting ? 'Enviando...' : 'Enviar cadastro'}</button><button type="button" onClick={() => { setStep('email'); setMessage(''); }} className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-black text-zinc-500 hover:bg-zinc-100">Usar outro e-mail</button>{message ? <p className="mt-4 rounded-2xl bg-zinc-100 p-3 text-sm font-semibold text-zinc-600">{message}</p> : null}</form>
            : <div className="flex min-h-96 flex-col items-center justify-center text-center"><ShieldCheck size={38} className="text-red-600" /><h2 className="mt-4 text-2xl font-black">Convite indisponível</h2><p className="mt-3 max-w-md text-sm text-zinc-500">{message}</p></div>}
          </div>
        </div>
      </section>
    </main>
  );
}
