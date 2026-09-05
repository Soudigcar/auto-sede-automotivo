'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Bot, Check, Copy, Loader2, MessageCircle, Sparkles, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type ChatTurn = {
  id: string;
  role: 'operator' | 'autocar';
  text: string;
  suggestedReply?: string | null;
};

type RuntimeState = {
  effective_mode?: string;
  human_state?: string;
};

function resourceConversationId(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    if (url.pathname !== '/api/store-whatsapp') return '';
    return String(url.searchParams.get('conversation_id') || '').trim();
  } catch {
    return '';
  }
}

function latestConversationId() {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return '';
  const entries = performance.getEntriesByType('resource');
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const conversationId = resourceConversationId(entries[index]?.name || '');
    if (conversationId) return conversationId;
  }
  return '';
}

function localTurnId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function AutocarConversationalCopilot() {
  const params = useParams();
  const slug = String(params?.slug || '');
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState('');
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    function detect() {
      const next = latestConversationId();
      if (next) setConversationId((current) => current === next ? current : next);
    }

    detect();
    const timer = window.setInterval(detect, 1200);
    let observer: PerformanceObserver | null = null;
    if (typeof PerformanceObserver !== 'undefined') {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const next = resourceConversationId(entry.name || '');
          if (next) setConversationId((current) => current === next ? current : next);
        }
      });
      try {
        observer.observe({ type: 'resource', buffered: true });
      } catch {
        observer = null;
      }
    }

    return () => {
      window.clearInterval(timer);
      observer?.disconnect();
    };
  }, [slug]);

  useEffect(() => {
    setTurns([]);
    setPrompt('');
    setError('');
    setCopyStatus('');
    setRuntime(null);
    if (conversationId && slug) void loadRuntime(conversationId);
  }, [conversationId, slug]);

  async function authToken() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || '';
    if (!token) throw new Error('Sessão não encontrada. Entre novamente para usar o Copilot.');
    return token;
  }

  async function loadRuntime(targetConversationId: string) {
    setRuntimeLoading(true);
    try {
      const token = await authToken();
      const query = new URLSearchParams({ slug, conversation_id: targetConversationId });
      const response = await fetch(`/api/store/portal/autocar/runtime?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar o modo AUTOCAR.');
      setRuntime(result.runtime || null);
      setError('');
    } catch (err: any) {
      setRuntime(null);
      setError(err?.message || 'Não foi possível consultar o modo AUTOCAR.');
    } finally {
      setRuntimeLoading(false);
    }
  }

  async function askAutocar() {
    const question = prompt.replace(/\s+/g, ' ').trim();
    if (!conversationId || !slug || loading || question.length < 3) return;
    if (String(runtime?.effective_mode || '').toLowerCase() !== 'copilot') {
      setError('O Copilot conversacional só fica disponível quando o modo efetivo desta conversa é COPILOT.');
      return;
    }

    setLoading(true);
    setError('');
    setCopyStatus('');
    const operatorTurn: ChatTurn = { id: localTurnId(), role: 'operator', text: question };
    try {
      const token = await authToken();
      const history = turns.slice(-8).map((turn) => ({ role: turn.role, text: turn.text }));
      const response = await fetch('/api/store/portal/autocar/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          slug,
          conversation_id: conversationId,
          operator_prompt: question,
          history
        }),
        cache: 'no-store'
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar a AUTOCAR.');
      if (result.no_external_execution !== true) throw new Error('Resposta recusada: garantia de não execução externa ausente.');

      const answer = String(result.answer || '').trim();
      if (!answer) throw new Error('A AUTOCAR não retornou orientação para esta pergunta.');
      setTurns((current) => [
        ...current,
        operatorTurn,
        {
          id: localTurnId(),
          role: 'autocar',
          text: answer,
          suggestedReply: result.suggested_reply ? String(result.suggested_reply) : null
        }
      ].slice(-16));
      setPrompt('');
    } catch (err: any) {
      setError(err?.message || 'Erro ao consultar a AUTOCAR.');
    } finally {
      setLoading(false);
    }
  }

  async function copyReply(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Resposta copiada. Cole no campo do Inbox e revise antes de enviar.');
    } catch {
      setCopyStatus('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.');
    }
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void askAutocar();
    }
  }

  const effectiveMode = String(runtime?.effective_mode || '').toLowerCase();
  const copilotReady = Boolean(conversationId) && effectiveMode === 'copilot' && !runtimeLoading;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-[70] inline-flex h-12 items-center gap-2 rounded-full bg-[#071020] px-4 text-[10px] font-black uppercase tracking-wide text-white shadow-2xl transition hover:scale-[1.02]"
        aria-label="Abrir Copilot conversacional AUTOCAR"
      >
        <Sparkles size={16} /> AUTOCAR Copilot
      </button>

      {open ? (
        <aside className="fixed bottom-20 right-5 z-[70] flex max-h-[72vh] w-[min(390px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-red-600"><Bot size={14} /> AUTOCAR · COPILOT CONVERSACIONAL</p>
              <p className="mt-1 text-[10px] font-bold text-zinc-600">Conversa ativa do Inbox · assistência somente consultiva</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${copilotReady ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>
                  {runtimeLoading ? 'consultando modo' : effectiveMode || 'aguardando conversa'}
                </span>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[8px] font-black uppercase text-blue-700">não envia mensagens</span>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500" aria-label="Fechar Copilot"><X size={14} /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {!conversationId ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-bold leading-relaxed text-amber-900">Selecione uma conversa no Inbox. O Copilot acompanha a conversa aberta sem alterar o atendimento.</div>
            ) : null}
            {conversationId && !runtimeLoading && effectiveMode !== 'copilot' ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-[10px] font-bold leading-relaxed text-zinc-700">Esta conversa está em <b>{(effectiveMode || 'OFF').toUpperCase()}</b>. O painel conversacional permanece bloqueado porque este recurso é exclusivo do COPILOT.</div>
            ) : null}

            {copilotReady && turns.length === 0 ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-red-100 bg-red-50/50 p-3 text-[10px] font-semibold leading-relaxed text-zinc-700">Pergunte à AUTOCAR usando o histórico real do cliente, conhecimento da loja e estoque disponível. A IA apenas orienta o vendedor; nenhuma ação externa é executada.</div>
                <div className="grid gap-2">
                  {['O que eu respondo agora?', 'O que ainda falta qualificar?', 'Qual é a melhor próxima pergunta?'].map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-[10px] font-bold text-zinc-700 hover:border-red-200 hover:text-red-700">{suggestion}</button>
                  ))}
                </div>
              </div>
            ) : null}

            {turns.length ? (
              <div className="space-y-2">
                {turns.map((turn) => (
                  <div key={turn.id} className={`rounded-xl p-3 ${turn.role === 'operator' ? 'ml-8 bg-zinc-100' : 'mr-5 border border-red-100 bg-red-50/40'}`}>
                    <p className="text-[8px] font-black uppercase tracking-wide text-zinc-400">{turn.role === 'operator' ? 'Você' : 'AUTOCAR'}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[11px] font-semibold leading-relaxed text-zinc-800">{turn.text}</p>
                    {turn.role === 'autocar' && turn.suggestedReply ? (
                      <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-2.5">
                        <p className="text-[8px] font-black uppercase text-zinc-400">Resposta sugerida ao cliente</p>
                        <p className="mt-1 whitespace-pre-wrap text-[11px] font-semibold leading-relaxed text-zinc-800">{turn.suggestedReply}</p>
                        <button type="button" onClick={() => void copyReply(turn.suggestedReply || '')} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#071020] px-3 text-[9px] font-black uppercase text-white"><Copy size={12} /> Copiar para o Inbox</button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {error ? <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-[10px] font-bold leading-relaxed text-red-800">{error}</div> : null}
            {copyStatus ? <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-[9px] font-bold leading-relaxed text-emerald-800"><Check size={12} className="mt-0.5 shrink-0" /> {copyStatus}</div> : null}
          </div>

          <footer className="border-t border-zinc-100 bg-white p-3">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value.slice(0, 1200))}
              onKeyDown={keyDown}
              disabled={!copilotReady || loading}
              placeholder={copilotReady ? 'Pergunte algo sobre esta conversa…' : 'Abra uma conversa em modo COPILOT'}
              className="min-h-20 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-[11px] font-semibold leading-relaxed text-zinc-800 outline-none focus:border-red-300 focus:bg-white disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[8px] font-bold leading-relaxed text-zinc-400">Enter consulta · Shift+Enter quebra linha. A AUTOCAR não envia nem executa ações.</p>
              <button type="button" onClick={() => void askAutocar()} disabled={!copilotReady || loading || prompt.trim().length < 3} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-red-600 px-4 text-[9px] font-black uppercase text-white disabled:opacity-50">{loading ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />} {loading ? 'Pensando...' : 'Perguntar'}</button>
            </div>
          </footer>
        </aside>
      ) : null}
    </>
  );
}
