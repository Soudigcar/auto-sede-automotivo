'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Building2, CheckCircle2, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
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

  useEffect(() => {
    async function loadContext() {
      try {
        const response = await fetch(`/api/public/team-registration?token=${encodeURIComponent(token)}`, {
          cache: 'no-store'
        });
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

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('Criando seu cadastro...');

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch('/api/public/team-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          full_name: formData.get('full_name'),
          email: formData.get('email'),
          phone: formData.get('phone'),
          password: formData.get('password'),
          password_confirmation: formData.get('password_confirmation')
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || 'Não foi possível concluir o cadastro.');
        return;
      }

      setCompleted(true);
      setMessage(payload.message || 'Cadastro enviado com sucesso.');
      form.reset();
    } catch {
      setMessage('Falha de conexão ao enviar o cadastro.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070A12] px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[34px] border border-white/10 bg-white shadow-2xl shadow-black/40 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-[#0B1220] p-7 md:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white">
              <UserPlus size={27} />
            </div>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.3em] text-red-500">Auto Controle Automotivo</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">Cadastro da equipe</h1>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              Preencha seus dados para receber acesso ao portal da loja. O cargo e a loja foram definidos pelo Gestor que compartilhou este convite.
            </p>

            {context ? (
              <div className="mt-8 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-3">
                    <Building2 size={18} className="text-red-500" />
                    <div>
                      <p className="text-xs uppercase tracking-wider text-zinc-500">Loja</p>
                      <p className="mt-1 font-black text-white">{context.store_name}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={18} className="text-red-500" />
                    <div>
                      <p className="text-xs uppercase tracking-wider text-zinc-500">Cargo</p>
                      <p className="mt-1 font-black text-white">{context.role_label}</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-zinc-500">{formatExpiration(context.expires_at)}</p>
              </div>
            ) : null}
          </div>

          <div className="p-7 text-zinc-950 md:p-10">
            {loading ? (
              <div className="flex min-h-96 flex-col items-center justify-center text-center">
                <Loader2 className="animate-spin text-red-600" size={32} />
                <p className="mt-4 font-bold text-zinc-600">Validando convite...</p>
              </div>
            ) : completed ? (
              <div className="flex min-h-96 flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 size={34} />
                </div>
                <h2 className="mt-5 text-3xl font-black">Cadastro enviado</h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-500">{message}</p>
                <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                  Você poderá entrar após o Gestor ativar seu usuário na página Equipe.
                </p>
              </div>
            ) : context ? (
              <form onSubmit={submitRegistration}>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">Dados de acesso</p>
                <h2 className="mt-2 text-3xl font-black">Crie seu cadastro</h2>
                <p className="mt-2 text-sm text-zinc-500">Use um e-mail individual. Ele será seu usuário para entrar no sistema.</p>

                <div className="mt-7 grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2 text-sm font-bold text-zinc-700">
                    Nome completo
                    <input name="full_name" className="premium-input mt-2" placeholder="Seu nome completo" required minLength={3} />
                  </label>
                  <label className="text-sm font-bold text-zinc-700">
                    E-mail
                    <input name="email" type="email" className="premium-input mt-2" placeholder="seuemail@dominio.com" required autoComplete="email" />
                  </label>
                  <label className="text-sm font-bold text-zinc-700">
                    Telefone
                    <input name="phone" className="premium-input mt-2" placeholder="(61) 99999-9999" autoComplete="tel" />
                  </label>
                  <label className="text-sm font-bold text-zinc-700">
                    Senha
                    <input name="password" type="password" className="premium-input mt-2" placeholder="Mínimo 12 caracteres" required minLength={TEAM_REGISTRATION_PASSWORD_MIN_LENGTH} autoComplete="new-password" />
                    <span className="mt-2 block text-xs font-medium text-zinc-500">{TEAM_REGISTRATION_PASSWORD_HINT}</span>
                  </label>
                  <label className="text-sm font-bold text-zinc-700">
                    Confirmar senha
                    <input name="password_confirmation" type="password" className="premium-input mt-2" placeholder="Repita a senha" required minLength={TEAM_REGISTRATION_PASSWORD_MIN_LENGTH} autoComplete="new-password" />
                  </label>
                </div>

                <button type="submit" disabled={submitting} className="premium-button-primary mt-7 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60">
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                  {submitting ? 'Enviando cadastro...' : 'Enviar cadastro'}
                </button>

                {message ? <p className="mt-4 rounded-2xl bg-zinc-100 p-3 text-sm font-semibold text-zinc-600">{message}</p> : null}
              </form>
            ) : (
              <div className="flex min-h-96 flex-col items-center justify-center text-center">
                <ShieldCheck size={38} className="text-red-600" />
                <h2 className="mt-4 text-2xl font-black">Convite indisponível</h2>
                <p className="mt-3 max-w-md text-sm text-zinc-500">{message}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
