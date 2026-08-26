'use client';

import { useMemo, useState } from 'react';
import { Bot, History, Loader2, Play, ShieldCheck } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

const A4_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924';

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 500) }; }
}

export function MasterAutocarReplayV2() {
  const supabase = useMemo(() => createClient(), []);
  const [conversationId, setConversationId] = useState('');
  const [messageId, setMessageId] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function replay() {
    const cleanConversation = conversationId.trim();
    const cleanMessage = messageId.trim();
    if (!cleanConversation) return;
    setBusy(true);
    setResult(null);
    setMessage(cleanMessage
      ? 'Executando replay histórico read-only até a mensagem selecionada...'
      : 'Executando replay read-only da mensagem inbound mais recente...');
    try {
      const { data } = await supabase.auth.getSession();
      const access = data.session?.access_token || '';
      if (!access) throw new Error('Sessão Master expirada.');
      const response = await fetch('/api/master/autocar/replay-v2', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: A4_STORE_ID,
          conversation_id: cleanConversation,
          message_id: cleanMessage || null
        }),
        cache: 'no-store'
      });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error || 'Falha ao executar replay.');
      setResult(body);
      setMessage('Replay concluído. Nenhuma mensagem foi enviada e nenhum dado operacional foi alterado.');
    } catch (error: any) {
      setMessage(error?.message || 'Falha ao executar replay.');
    } finally {
      setBusy(false);
    }
  }

  const evaluation = result?.evaluation || null;
  const humanRequest = result?.human_request || null;
  const shadow = result?.shadow || null;
  const selection = result?.replay_selection || null;

  return <main className="premium-page"><section className="premium-shell flex min-h-screen"><MasterSidebar active="/master/autocar/replay-v2"/><div className="premium-canvas min-w-0 flex-1 p-4 md:p-7"><header><div className="flex items-center gap-2 text-red-600"><Bot size={18}/><span className="premium-eyebrow">AUTOCAR · INTELLIGENCE V2 · PREVIEW READ-ONLY</span></div><h1 className="premium-title mt-2 text-4xl md:text-5xl">Replay de conversa A4</h1><p className="premium-muted mt-3 max-w-4xl text-sm">Valida a nova inteligência sobre uma conversa real já existente. Não envia WhatsApp, não altera CRM, não muda modo e não executa handoff.</p></header><section className="premium-card mt-6 p-5 md:p-6"><div className="grid gap-4 lg:grid-cols-2"><label className="text-xs font-black">ID da conversa da A4<input className="premium-input mt-1.5" value={conversationId} onChange={(event) => setConversationId(event.target.value)} placeholder="Cole o conversation_id"/></label><label className="text-xs font-black">ID da mensagem inbound histórica <span className="font-semibold text-zinc-500">(opcional)</span><input className="premium-input mt-1.5" value={messageId} onChange={(event) => setMessageId(event.target.value)} placeholder="Cole o message_id para voltar àquele momento"/></label></div><div className="mt-3 flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-semibold text-zinc-600"><History size={15} className="mt-0.5 shrink-0 text-red-600"/><p>Com <strong>message_id</strong>, o Replay considera somente a conversa até aquela mensagem inbound e exclui mensagens posteriores. Estoque e dados canônicos disponíveis continuam sendo consultados somente em leitura e são identificados como snapshot atual.</p></div><button type="button" onClick={() => void replay()} disabled={busy || !conversationId.trim()} className="premium-button-primary mt-3 w-full justify-center"><Play size={16}/>{busy ? 'Executando replay...' : messageId.trim() ? 'Executar Replay Histórico V2' : 'Executar Replay V2'}</button></section>{message ? <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{busy ? <Loader2 size={16} className="mr-2 inline animate-spin text-red-600"/> : null}{message}</div> : null}{result ? <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]"><div className="premium-card p-5"><h2 className="text-lg font-black">Resposta V2</h2><p className="mt-4 whitespace-pre-wrap text-base font-bold leading-7 text-zinc-900">{shadow?.response || '—'}</p><div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700"><p><strong>Modo do replay:</strong> {selection?.mode === 'historical_message' ? 'MENSAGEM HISTÓRICA' : 'ÚLTIMA MENSAGEM INBOUND'}</p><p className="mt-2"><strong>Message ID:</strong> {result.current_inbound?.id || '—'}</p><p className="mt-2"><strong>Mensagem atual:</strong> {result.current_inbound?.body || '—'}</p><p className="mt-2"><strong>Mensagens futuras excluídas:</strong> {selection?.future_messages_excluded ? 'SIM' : 'N/A'}</p><p className="mt-2"><strong>Resumo:</strong> {shadow?.summary || '—'}</p><p className="mt-2"><strong>Próxima ação:</strong> {shadow?.next_best_action || '—'}</p><p className="mt-2"><strong>Modelo:</strong> {shadow?.model || '—'}</p></div></div><div className="premium-card p-5"><div className="flex items-center gap-2 text-red-600"><ShieldCheck size={18}/><h2 className="text-lg font-black">Governança V2</h2></div><div className={`mt-4 rounded-xl px-4 py-3 text-center text-xs font-black uppercase ${evaluation?.pass ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'}`}>{evaluation?.pass ? 'REPLAY PASSOU' : 'REGRESSÃO DETECTADA'}</div><div className="mt-5 space-y-3 text-sm text-zinc-700"><p><strong>Cliente pediu humano:</strong> {humanRequest?.customer_requested_human ? 'SIM' : 'NÃO'}</p><p><strong>Confiança:</strong> {humanRequest?.confidence == null ? '—' : Number(humanRequest.confidence).toFixed(2)}</p><p><strong>Handoff V2:</strong> {evaluation?.handoff?.should_handoff ? 'SIM' : 'NÃO'}</p><p><strong>Continua IA:</strong> {evaluation?.handoff?.continue_ai_conversation ? 'SIM' : 'NÃO'}</p><p><strong>Transfer indevido:</strong> {evaluation?.regression_flags?.transfer_action_without_customer_request ? 'SIM' : 'NÃO'}</p><p><strong>Texto de transferência indevido:</strong> {evaluation?.regression_flags?.transfer_language_without_customer_request ? 'SIM' : 'NÃO'}</p><p><strong>Promessa de verificação sem ferramenta:</strong> {evaluation?.regression_flags?.unsupported_verification_promise ? 'SIM' : 'NÃO'}</p><p className="text-emerald-700"><strong>Execução externa:</strong> NÃO</p></div></div></section> : null}</div></section></main>;
}
