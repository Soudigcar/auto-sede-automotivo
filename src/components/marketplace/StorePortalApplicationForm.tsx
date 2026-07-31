'use client';

import { useState, type FormEvent } from 'react';
import { Building2, CheckCircle2, Loader2, Send } from 'lucide-react';

const initialForm = {
  store_name: '',
  legal_name: '',
  cnpj: '',
  responsible_name: '',
  responsible_phone: '',
  responsible_email: '',
  state: '',
  city: '',
  address_text: '',
  website_url: '',
  instagram_url: '',
  approximate_vehicle_count: '',
  interested_in_events: true,
  notes: '',
  company_fax: ''
};

export function StorePortalApplicationForm() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  function update(field: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('Enviando solicitação...');

    try {
      const response = await fetch('/api/store-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível enviar a solicitação.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setForm(initialForm);
      setMessage('Solicitação enviada. A equipe Auto Sede fará a análise antes da publicação da loja.');
    } catch {
      setMessage('Falha de conexão. Tente novamente em alguns instantes.');
    }

    setLoading(false);
  }

  if (success) {
    return (
      <div className="rounded-[32px] border border-emerald-200 bg-emerald-50 p-7 text-center shadow-sm sm:p-10">
        <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
        <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Solicitação recebida</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600">{message}</p>
        <button type="button" onClick={() => { setSuccess(false); setMessage(''); }} className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Enviar outra solicitação</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white"><Building2 size={23} /></span>
        <div>
          <h2 className="text-2xl font-black text-slate-950">Dados da revenda</h2>
          <p className="text-sm text-slate-500">O cadastro passa por aprovação antes de aparecer no portal.</p>
        </div>
      </div>

      <input className="hidden" tabIndex={-1} autoComplete="off" value={form.company_fax} onChange={(event) => update('company_fax', event.target.value)} aria-hidden="true" />

      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <Field label="Nome da loja *" value={form.store_name} onChange={(value) => update('store_name', value)} required />
        <Field label="Razão social" value={form.legal_name} onChange={(value) => update('legal_name', value)} />
        <Field label="CNPJ" value={form.cnpj} onChange={(value) => update('cnpj', value)} inputMode="numeric" />
        <Field label="Nome do responsável *" value={form.responsible_name} onChange={(value) => update('responsible_name', value)} required />
        <Field label="WhatsApp do responsável *" value={form.responsible_phone} onChange={(value) => update('responsible_phone', value)} inputMode="tel" required />
        <Field label="E-mail do responsável *" value={form.responsible_email} onChange={(value) => update('responsible_email', value)} type="email" required />
        <Field label="Estado" value={form.state} onChange={(value) => update('state', value)} />
        <Field label="Cidade" value={form.city} onChange={(value) => update('city', value)} />
        <div className="md:col-span-2"><Field label="Endereço" value={form.address_text} onChange={(value) => update('address_text', value)} /></div>
        <Field label="Site da loja" value={form.website_url} onChange={(value) => update('website_url', value)} />
        <Field label="Instagram" value={form.instagram_url} onChange={(value) => update('instagram_url', value)} />
        <Field label="Quantidade aproximada de veículos" value={form.approximate_vehicle_count} onChange={(value) => update('approximate_vehicle_count', value)} type="number" min="0" />

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={form.interested_in_events} onChange={(event) => update('interested_in_events', event.target.checked)} className="h-5 w-5 accent-red-600" />
          Quero receber convites para eventos Auto Sede
        </label>

        <label className="md:col-span-2">
          <span className="text-xs font-black uppercase tracking-wide text-slate-500">Observações</span>
          <textarea className="mt-1 min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100" value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Conte brevemente sobre a loja e o tipo de estoque." />
        </label>
      </div>

      <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-xs font-semibold leading-relaxed text-slate-500">Ao enviar, você autoriza o contato da equipe Auto Sede para validação comercial. A solicitação não publica automaticamente a loja nem os veículos.</div>

      <button type="submit" disabled={loading} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-black text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}
        {loading ? 'Enviando...' : 'Enviar solicitação para análise'}
      </button>

      {message ? <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</p> : null}
    </form>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, inputMode, min }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal' | 'search' | 'url' | 'none'; min?: string }) {
  return (
    <label>
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      <input className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} inputMode={inputMode} min={min} />
    </label>
  );
}
