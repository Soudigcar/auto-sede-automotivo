'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Clipboard, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type Conversation = {
  id: string;
  contact?: { profile_name?: string | null; phone?: string | null } | null;
  lead?: { customer_name?: string | null; customer_phone?: string | null; interested_vehicle?: string | null } | null;
  base_lead?: { name?: string | null; phone?: string | null } | null;
  last_message?: string | null;
  last_message_at?: string | null;
};

type CopilotAnalysis = {
  summary: string;
  objections: string[];
  next_best_question: string;
  suggested_reply: string;
  qualification: Record<string, unknown>;
  known_fields: string[];
  missing_fields: string[];
  score: number;
  temperature: 'FRIO' | 'MORNO' | 'QUENTE';
  score_breakdown: Record<string, number>;
  score_version: string;
  model: string;
};

function conversationName(item: Conversation) {
  return item.contact?.profile_name || item.lead?.customer_name || item.base_lead?.name || 'Cliente WhatsApp';
}

function conversationPhone(item: Conversation) {
  return item.contact?.phone || item.lead?.customer_phone || item.base_lead?.phone || '';
}

function temperatureClass(value?: string) {
  if (value === 'QUENTE') return 'bg-red-50 text-red-700 border-red-200';
  if (value === 'MORNO') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
}

export default function AutocarCopilotDock() {
  const params = useParams();
  const slug = String(params?.slug || '');
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CopilotAnalysis | null>(null);
  const [reply, setReply] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  async function authToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadConversations() {
    if (!slug) return;
    setLoadingList(true);
    setMessage('');
    try {
      const token = await authToken();
      if (!token) throw new Error('Sessão não encontrada.');
      const response = await fetch(`/api/store-whatsapp?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as conversas.');
      const rows = (result.conversations || []) as Conversation[];
      setConversations(rows);
      setConversationId((current) => current && rows.some((item) => item.id === current) ? current : rows[0]?.id || '');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao carregar conversas.');
    } finally {
      setLoadingList(false);
    }
  }

  async function analyze() {
    if (!conversationId) return;
    setAnalyzing(true);
    setAnalysis(null);
    setReply('');
    setMessage('');
    setCopied(false);
    try {
      const token = await authToken();
      if (!token) throw new Error('Sessão não encontrada.');
      const response = await fetch('/api/store/portal/autocar/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug, conversation_id: conversationId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível analisar a conversa.');
      setAnalysis(result.analysis);
      setReply(result.analysis?.suggested_reply || '');
    } catch (error: any) {
      setMessage(error?.message || 'Erro na análise AUTOCAR.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function copyReply() {
    const text = reply.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.');
    }
  }

  useEffect(() => {
    if (open && !conversations.length) void loadConversations();
  }, [open, slug]);

  useEffect(() => {
    setAnalysis(null);
    setReply('');
    setMessage('');
    setCopied(false);
  }, [conversationId]);

  const selected = conversations.find((item) => item.id === conversationId) || null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-[430] inline-flex h-12 items-center gap-2 rounded-2xl bg-[#071020] px-4 text-xs font-black text-white shadow-2xl shadow-black/25 transition hover:-translate-y-0.5" title="Abrir Copilot da I.A AUTOCAR">
        <Sparkles size={17} className="text-red-400" /> I.A AUTOCAR
      </button>
    );
  }

  return (
    <aside className="fixed bottom-3 right-3 z-[430] flex max-h-[88vh] w-[430px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-2xl shadow-black/25">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-[#071020] px-4 py-3 text-white">
        <div><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-red-400"><Sparkles size={13} /> Copilot comercial</p><h2 className="mt-1 text-base font-black">I.A AUTOCAR</h2><p className="mt-1 text-[10px] font-bold text-zinc-400">Analisa e sugere. Nunca envia automaticamente.</p></div>
        <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 text-zinc-300 hover:bg-white/10" aria-label="Fechar Copilot"><X size={15} /></button>
      </header>

      <div className="overflow-y-auto p-4">
        <div className="flex gap-2">
          <label className="min-w-0 flex-1 text-[9px] font-black uppercase tracking-wide text-zinc-400">Conversa
            <select value={conversationId} onChange={(event) => setConversationId(event.target.value)} disabled={loadingList || analyzing} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold normal-case text-zinc-800 outline-none focus:border-red-300">
              {!conversations.length ? <option value="">Nenhuma conversa disponível</option> : null}
              {conversations.map((item) => <option key={item.id} value={item.id}>{conversationName(item)}{conversationPhone(item) ? ` · ${conversationPhone(item)}` : ''}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void loadConversations()} disabled={loadingList || analyzing} className="mt-[21px] flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-50" title="Atualizar conversas">{loadingList ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}</button>
        </div>

        {selected ? <div className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-[10px] font-bold text-zinc-500"><b className="text-zinc-800">{conversationName(selected)}</b>{selected.lead?.interested_vehicle ? ` · ${selected.lead.interested_vehicle}` : ''}<br /><span className="line-clamp-1">{selected.last_message || 'Sem prévia da última mensagem.'}</span></div> : null}

        <button type="button" onClick={() => void analyze()} disabled={analyzing || !conversationId} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-black uppercase text-white shadow-md shadow-red-600/15 transition hover:bg-red-700 disabled:opacity-50">
          {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {analyzing ? 'Analisando conversa...' : 'Analisar com AUTOCAR'}
        </button>

        {message ? <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">{message}</div> : null}

        {analysis ? <div className="mt-4 space-y-3">
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <div className={`rounded-2xl border p-3 text-center ${temperatureClass(analysis.temperature)}`}><p className="text-[9px] font-black uppercase">Score V1</p><strong className="mt-1 block text-3xl font-black leading-none">{analysis.score}</strong><p className="mt-1 text-[10px] font-black">{analysis.temperature}</p></div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">Resumo</p><p className="mt-1.5 text-xs font-semibold leading-relaxed text-zinc-700">{analysis.summary}</p></div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3"><p className="text-[9px] font-black uppercase text-emerald-700">Já sabemos</p><div className="mt-2 flex flex-wrap gap-1">{analysis.known_fields.length ? analysis.known_fields.map((item) => <span key={item} className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-emerald-700">{item}</span>) : <span className="text-[10px] font-bold text-zinc-500">Ainda sem campos completos.</span>}</div></section>
            <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3"><p className="text-[9px] font-black uppercase text-amber-700">Falta descobrir</p><div className="mt-2 flex flex-wrap gap-1">{analysis.missing_fields.length ? analysis.missing_fields.map((item) => <span key={item} className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-amber-700">{item}</span>) : <span className="text-[10px] font-bold text-zinc-500">Qualificação completa.</span>}</div></section>
          </div>

          {analysis.objections?.length ? <section className="rounded-2xl border border-zinc-200 p-3"><p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">Objeções percebidas</p><ul className="mt-2 list-disc space-y-1 pl-4 text-xs font-semibold text-zinc-700">{analysis.objections.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}

          {analysis.next_best_question ? <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3"><p className="text-[9px] font-black uppercase text-blue-700">Próxima melhor pergunta</p><p className="mt-1.5 text-xs font-bold leading-relaxed text-zinc-800">{analysis.next_best_question}</p></section> : null}

          <section className="rounded-2xl border border-red-100 bg-red-50/40 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-black uppercase text-red-700">Resposta sugerida · editável</p><span className="text-[8px] font-black uppercase text-zinc-400">Não envia</span></div><textarea value={reply} onChange={(event) => setReply(event.target.value)} className="mt-2 min-h-28 w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 text-sm font-semibold leading-relaxed text-zinc-800 outline-none focus:border-red-300" /><button type="button" onClick={() => void copyReply()} disabled={!reply.trim()} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#071020] px-4 text-xs font-black uppercase text-white disabled:opacity-50">{copied ? <Check size={15} /> : <Clipboard size={15} />} {copied ? 'Resposta copiada' : 'Copiar resposta'}</button><p className="mt-2 text-center text-[9px] font-bold text-zinc-400">Cole no campo do WhatsApp, revise e só então use o botão Enviar do Inbox.</p></section>
        </div> : null}
      </div>
    </aside>
  );
}
