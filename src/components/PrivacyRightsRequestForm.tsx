'use client';

import { useState } from 'react';

const labels: Record<string, string> = {
  confirmation: 'Confirmação de tratamento', access: 'Acesso aos dados', correction: 'Correção', portability: 'Portabilidade',
  anonymization: 'Anonimização ou bloqueio', deletion: 'Eliminação', consent_revocation: 'Revogação do consentimento', information: 'Informações sobre o tratamento'
};

export function PrivacyRightsRequestForm() {
  const [startedAt] = useState(() => Date.now());
  const [form, setForm] = useState({ request_type: 'access', requester_name: '', requester_email: '', requester_phone: '', details: '', company_website: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/privacy/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, form_started_at: startedAt })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar.');
      setMessage(`Solicitação registrada. Protocolo: ${result.protocol}`);
      setForm((current) => ({ ...current, requester_name: '', requester_email: '', requester_phone: '', details: '' }));
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível enviar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <select className="rounded-xl border border-slate-300 bg-white px-3 py-2" value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })}>
        {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <input className="rounded-xl border border-slate-300 px-3 py-2" required minLength={3} placeholder="Nome completo" value={form.requester_name} onChange={(e) => setForm({ ...form, requester_name: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="rounded-xl border border-slate-300 px-3 py-2" type="email" placeholder="E-mail" value={form.requester_email} onChange={(e) => setForm({ ...form, requester_email: e.target.value })} />
        <input className="rounded-xl border border-slate-300 px-3 py-2" placeholder="Telefone" value={form.requester_phone} onChange={(e) => setForm({ ...form, requester_phone: e.target.value })} />
      </div>
      <textarea className="min-h-24 rounded-xl border border-slate-300 px-3 py-2" placeholder="Detalhes da solicitação" maxLength={2000} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
      <input tabIndex={-1} aria-hidden="true" autoComplete="off" className="hidden" value={form.company_website} onChange={(e) => setForm({ ...form, company_website: e.target.value })} />
      <button type="submit" disabled={loading || (!form.requester_email && !form.requester_phone)} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? 'Enviando...' : 'Registrar solicitação'}</button>
      {message ? <p className="text-xs font-bold text-slate-700" role="status">{message}</p> : null}
    </form>
  );
}
