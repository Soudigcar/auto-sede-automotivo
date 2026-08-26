'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clipboard, Loader2, MessageSquareText, RefreshCw, Sparkles, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Candidate = {
  conversation_id: string;
  lead_id: string | null;
  customer_name: string;
  interested_vehicle: string | null;
  scenario_key: string;
  step_id: string;
  step_label: string;
  due_at: string;
  last_customer_message_at: string;
  last_store_message_at: string;
  idempotency_key: string;
};

type Suggestion = {
  id: string;
  production_conversation_id: string;
  production_lead_id: string | null;
  scenario_key: string;
  step_id: string;
  due_at: string;
  suggested_message: string;
  status: string;
  idempotency_key: string;
  model?: string | null;
  created_at: string;
};

const scenarioLabels: Record<string, string> = {
  silent_lead: 'Lead em silêncio',
  simulation_pending: 'Simulação pendente',
  vehicle_interest: 'Interesse em veículo'
};

function shortDate(value: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function StoreAutocarFollowUpCopilotQueue({ slug }: { slug: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [message, setMessage] = useState('');

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setMessage('');
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Sessão expirada.');
      const response = await fetch(`/api/store/portal/autocar/follow-up-v2/copilot?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store'
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar a fila COPILOT.');
      setEnabled(Boolean(body.enabled));
      setCandidates(Array.isArray(body.candidates) ? body.candidates : []);
      setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : []);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar a fila COPILOT.');
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => { void load(); }, [load]);

  async function generate(candidate: Candidate) {
    if (workingId) return;
    setWorkingId(candidate.conversation_id);
    setMessage('');
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Sessão expirada.');
      const response = await fetch('/api/store/portal/autocar/follow-up-v2/copilot', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, action: 'generate', conversation_id: candidate.conversation_id })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível gerar o rascunho.');
      const suggestion = body.suggestion as Suggestion;
      setSuggestions((current) => [suggestion, ...current.filter((row) => row.id !== suggestion.id)]);
      setMessage(body.reused ? 'Rascunho já existente reutilizado.' : 'Rascunho AUTOCAR gerado para revisão humana.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível gerar o rascunho.');
      await load();
    } finally {
      setWorkingId('');
    }
  }

  async function dismiss(suggestion: Suggestion) {
    if (workingId) return;
    setWorkingId(suggestion.id);
    setMessage('');
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Sessão expirada.');
      const response = await fetch('/api/store/portal/autocar/follow-up-v2/copilot', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, action: 'dismiss', suggestion_id: suggestion.id })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível descartar o rascunho.');
      setSuggestions((current) => current.filter((row) => row.id !== suggestion.id));
      setMessage('Rascunho descartado. Nenhuma mensagem foi enviada.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível descartar o rascunho.');
    } finally {
      setWorkingId('');
    }
  }

  async function copy(suggestion: Suggestion) {
    await navigator.clipboard.writeText(suggestion.suggested_message);
    setCopiedId(suggestion.id);
    setTimeout(() => setCopiedId(''), 1800);
  }

  const suggestionByKey = useMemo(() => new Map(suggestions.map((row) => [row.idempotency_key, row])), [suggestions]);

  return <section className="premium-card p-5 md:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-zinc-950 p-2.5 text-white"><Sparkles size={18}/></span><div><h3 className="text-xl font-black text-zinc-950">Fila COPILOT de Follow-up</h3><p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-zinc-500">Candidatos reais da loja, revalidados antes da geração. A AUTOCAR cria apenas um rascunho para revisão humana.</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase text-emerald-800">SEM ENVIO AUTOMÁTICO</span><button type="button" onClick={() => void load()} disabled={loading || Boolean(workingId)} className="premium-button-secondary"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>Atualizar fila</button></div>
    </div>

    {message ? <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-bold text-zinc-700">{message}</div> : null}
    {!enabled && !loading ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">O Follow-up efetivo desta loja não está em COPILOT. A fila permanece fechada.</div> : null}
    {loading ? <div className="mt-5 flex items-center gap-2 text-xs font-bold text-zinc-500"><Loader2 size={15} className="animate-spin"/>Revalidando conversas da loja...</div> : null}

    {!loading && enabled ? <div className="mt-5 space-y-4">
      {candidates.length === 0 ? <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm font-bold text-zinc-600">Nenhuma conversa está vencida e segura para Follow-up COPILOT neste momento.</div> : null}
      {candidates.map((candidate) => {
        const suggestion = suggestionByKey.get(candidate.idempotency_key);
        return <article key={candidate.idempotency_key} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm font-black text-zinc-950">{candidate.customer_name}</strong><span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase text-zinc-600">{scenarioLabels[candidate.scenario_key] || candidate.scenario_key}</span></div><p className="mt-1 text-[11px] font-bold text-zinc-500">{candidate.interested_vehicle || 'Sem veículo específico'} · venceu em {shortDate(candidate.due_at)} · {candidate.step_label}</p></div>{!suggestion ? <button type="button" onClick={() => void generate(candidate)} disabled={Boolean(workingId)} className="premium-button-primary"><Sparkles size={14}/>{workingId === candidate.conversation_id ? 'Gerando...' : 'Gerar rascunho AUTOCAR'}</button> : null}</div>
          {suggestion ? <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4"><div className="flex items-center gap-2 text-emerald-700"><MessageSquareText size={15}/><span className="text-[10px] font-black uppercase">Rascunho para revisão humana</span></div><p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-800">{suggestion.suggested_message}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void copy(suggestion)} className="premium-button-secondary">{copiedId === suggestion.id ? <Check size={14}/> : <Clipboard size={14}/>} {copiedId === suggestion.id ? 'Copiado' : 'Copiar rascunho'}</button><button type="button" onClick={() => void dismiss(suggestion)} disabled={Boolean(workingId)} className="premium-button-secondary"><X size={14}/>Descartar</button></div><p className="mt-3 text-[9px] font-black uppercase tracking-wide text-zinc-400">Copiar não envia mensagem. O envio continua fora desta fila e sob ação humana.</p></div> : null}
        </article>;
      })}
    </div> : null}
  </section>;
}
