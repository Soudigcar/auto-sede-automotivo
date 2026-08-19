'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Building2, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';

const initialForm = {
  store_name: '',
  responsible_name: '',
  responsible_phone: '',
  email: '',
  cnpj: '',
  privacy_acknowledged: false,
  terms_acknowledged: false
};

export default function CreateAccountPage() {
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage('Iniciando cadastro seguro...');

    try {
      const response = await fetch('/api/saas/onboarding/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (result.code === 'SAAS_WRITE_DISABLED') {
          setMessage('Este Preview está em modo seguro de demonstração. Nenhuma conta ou dado será criado até conectarmos um banco SaaS de teste isolado.');
        } else {
          setMessage(result.error || 'Não foi possível iniciar o cadastro.');
        }
        setLoading(false);
        return;
      }

      setStarted(true);
      setMessage('Cadastro iniciado. A próxima etapa será confirmar seu e-mail antes da criação da credencial de acesso.');
    } catch {
      setMessage('Falha de conexão. Tente novamente.');
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#070A12] px-5 py-10 text-white">
      <section className="mx-auto grid max-w-6xl gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/30 md:p-9">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-red-400">Auto Controle Automotivo</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">Crie a conta da sua loja</h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-300">O cadastro começa pelos dados mínimos da empresa. Sua senha não é enviada por e-mail nem WhatsApp: você criará sua própria credencial somente após confirmar o e-mail.</p>

          <div className="mt-7 grid gap-3">
            <SecurityItem icon={<ShieldCheck size={20} />} title="Isolamento por loja" text="Cada usuário recebe vínculo e permissões específicas da loja." />
            <SecurityItem icon={<LockKeyhole size={20} />} title="Credencial individual" text="Nenhuma senha compartilhada entre proprietário e equipe." />
            <SecurityItem icon={<CheckCircle2 size={20} />} title="MFA para acessos privilegiados" text="Proprietário e Master terão exigência reforçada após a etapa de implantação." />
          </div>

          <p className="mt-7 text-sm text-zinc-400">Já possui acesso? <Link href="/login" className="font-black text-red-400 hover:text-red-300">Entrar no sistema</Link></p>
        </div>

        <form onSubmit={submit} className="rounded-[34px] border border-white/10 bg-white p-6 text-[#101828] shadow-2xl shadow-black/30 md:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white"><Building2 size={23} /></span>
            <div><p className="text-xs font-black uppercase tracking-[0.22em] text-red-600">Etapa 1</p><h2 className="text-2xl font-black text-zinc-950">Identificação da loja</h2></div>
          </div>

          {started ? (
            <div className="mt-7 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
              <h3 className="mt-3 text-xl font-black text-emerald-950">Cadastro iniciado</h3>
              <p className="mt-2 text-sm leading-relaxed text-emerald-800">{message}</p>
            </div>
          ) : (
            <>
              <div className="mt-7 grid gap-4 md:grid-cols-2">
                <Field label="Nome da loja" value={form.store_name} onChange={(value) => setForm({ ...form, store_name: value })} required />
                <Field label="CNPJ" value={form.cnpj} onChange={(value) => setForm({ ...form, cnpj: value })} inputMode="numeric" />
                <Field label="Responsável" value={form.responsible_name} onChange={(value) => setForm({ ...form, responsible_name: value })} required />
                <Field label="WhatsApp" value={form.responsible_phone} onChange={(value) => setForm({ ...form, responsible_phone: value })} inputMode="tel" />
                <div className="md:col-span-2"><Field label="E-mail de acesso" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} required /></div>
              </div>

              <div className="mt-5 grid gap-3">
                <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold text-zinc-700">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-red-600" checked={form.privacy_acknowledged} onChange={(event) => setForm({ ...form, privacy_acknowledged: event.target.checked })} required />
                  <span>Li e compreendi a <Link href="/privacidade" target="_blank" className="font-black text-red-600 underline">Política de Privacidade</Link>.</span>
                </label>
                <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold text-zinc-700">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-red-600" checked={form.terms_acknowledged} onChange={(event) => setForm({ ...form, terms_acknowledged: event.target.checked })} required />
                  <span>Li e aceito os <Link href="/termos" target="_blank" className="font-black text-red-600 underline">Termos de Uso</Link>.</span>
                </label>
              </div>

              <button type="submit" disabled={loading} className="mt-6 w-full rounded-2xl bg-red-600 px-5 py-4 font-black text-white shadow-lg shadow-red-600/20 disabled:cursor-wait disabled:opacity-60">
                {loading ? 'Validando...' : 'Continuar com segurança'}
              </button>
              {message ? <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-relaxed text-amber-800">{message}</p> : null}
            </>
          )}
        </form>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, type = 'text', inputMode, required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal' | 'search' | 'url' | 'none'; required?: boolean }) {
  return <label className="block text-sm font-bold text-zinc-700">{label}<input className="mt-2 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 font-semibold text-zinc-950 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100" type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} required={required} /></label>;
}

function SecurityItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-4"><span className="mt-0.5 text-red-400">{icon}</span><div><p className="font-black text-white">{title}</p><p className="mt-1 text-xs leading-relaxed text-zinc-400">{text}</p></div></div>;
}
