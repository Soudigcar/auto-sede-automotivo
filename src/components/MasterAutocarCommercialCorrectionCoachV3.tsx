'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, MessageCircleMore, Play, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type Scope = 'global' | 'store';
type StoreRow = { id: string; store_name: string };
type ConversationRow = { id: string; status: string; last_message: string; last_message_at: string | null };
type CoachMessage = {
  id: string;
  direction: string;
  speaker: 'CLIENTE' | 'AUTOCAR' | 'LOJA/HUMANO';
  message_type: string;
  body: string;
  sent_at: string | null;
  is_autocar: boolean;
};

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 300) }; }
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

export function MasterAutocarCommercialCorrectionCoachV3() {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState('');
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [selectedAutocarId, setSelectedAutocarId] = useState('');
  const [correctedResponse, setCorrectedResponse] = useState('');
  const [feedback, setFeedback] = useState('');
  const [scope, setScope] = useState<Scope>('global');
  const [result, setResult] = useState<any | null>(null);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

  const requestTraining = useCallback(async (body: Record<string, unknown>) => {
    const access = await token();
    if (!access) throw new Error('Sessão Master expirada.');
    const response = await fetch('/api/master/autocar/training', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await parseResponse(response);
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação.');
    return payload;
  }, [token]);

  const requestCorrection = useCallback(async (body: Record<string, unknown>) => {
    const access = await token();
    if (!access) throw new Error('Sessão Master expirada.');
    const response = await fetch('/api/master/autocar/training/correction-preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await parseResponse(response);
    if (!response.ok) throw new Error(payload.error || 'Não foi possível corrigir e retestar a resposta.');
    return payload;
  }, [token]);

  const resetSelection = useCallback(() => {
    setSelectedAutocarId('');
    setCorrectedResponse('');
    setFeedback('');
    setResult(null);
  }, []);

  const loadStores = useCallback(async () => {
    setBusy(true);
    try {
      const payload = await requestTraining({ action: 'coach-stores-preview' });
      setStores(payload.stores || []);
      setMessage('Selecione uma loja, uma conversa e depois clique na resposta da AUTOCAR que deseja corrigir.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar as lojas.');
    } finally {
      setBusy(false);
    }
  }, [requestTraining]);

  useEffect(() => { void loadStores(); }, [loadStores]);

  async function loadConversations(nextStoreId: string) {
    setStoreId(nextStoreId);
    setConversationId('');
    setMessages([]);
    resetSelection();
    if (!nextStoreId) {
      setConversations([]);
      return;
    }
    setBusy(true);
    try {
      const payload = await requestTraining({ action: 'coach-conversations-preview', store_id: nextStoreId });
      setConversations(payload.conversations || []);
      setMessage('Agora escolha uma conversa recente.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar as conversas.');
    } finally {
      setBusy(false);
    }
  }

  async function loadConversation(nextConversationId: string) {
    setConversationId(nextConversationId);
    setMessages([]);
    resetSelection();
    if (!nextConversationId) return;
    setBusy(true);
    try {
      const payload = await requestTraining({
        action: 'coach-conversation-preview',
        store_id: storeId,
        conversation_id: nextConversationId
      });
      setMessages(payload.messages || []);
      setMessage('Clique em uma mensagem verde da AUTOCAR para abrir uma cópia editável. A mensagem histórica original não será alterada.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar a conversa.');
    } finally {
      setBusy(false);
    }
  }

  function selectAutocar(messageRow: CoachMessage) {
    if (!messageRow.is_autocar) return;
    setSelectedAutocarId(messageRow.id);
    setCorrectedResponse(messageRow.body);
    setFeedback('');
    setResult(null);
    setMessage('Edite a cópia da resposta como você gostaria que a AUTOCAR tivesse respondido. Você também pode explicar o motivo da correção.');
  }

  async function retestCorrection() {
    if (!storeId || !conversationId || !selectedAutocarId) return;
    if (!correctedResponse.trim() && !feedback.trim()) {
      setMessage('Edite a resposta ou explique a correção desejada.');
      return;
    }
    setBusy(true);
    setResult(null);
    setMessage('Comparando a resposta original com sua correção e retestando, sem gravar nada...');
    try {
      const payload = await requestCorrection({
        store_id: storeId,
        conversation_id: conversationId,
        autocar_message_id: selectedAutocarId,
        corrected_response: correctedResponse,
        trainer_feedback: feedback,
        scope
      });
      setResult(payload);
      setMessage('Reteste concluído. A conversa original permanece imutável e nenhum aprendizado foi salvo.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível corrigir e retestar esta resposta.');
    } finally {
      setBusy(false);
    }
  }

  const selectedAutocar = messages.find((item) => item.id === selectedAutocarId) || null;

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="/master/autocar/training" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-red-600"><Sparkles size={18} /><span className="premium-eyebrow">I.A AUTOCAR · Commercial Coach V3</span></div>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Corrija a resposta. Ensine a técnica.</h1>
              <p className="premium-muted mt-3 max-w-4xl text-sm leading-6">Clique em uma resposta real da AUTOCAR, edite uma cópia do texto e reteste. O Coach usa a diferença para extrair técnica, objetivo e limites. A mensagem histórica continua imutável.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-[10px] font-black uppercase text-emerald-700"><ShieldCheck size={14} /> Preview read-only · sem gravação</span>
          </header>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white"><MessageCircleMore size={15} className="mr-2 inline" />Treinar com Conversas Reais</span>
            <a href="/master/autocar/training/advanced" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs font-black text-zinc-700">Editor Avançado</a>
          </div>

          {message ? <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{busy ? <Loader2 size={16} className="mr-2 inline animate-spin text-red-600" /> : null}{message}</div> : null}

          <section className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ['1. ESCOLHA', 'Loja, conversa e resposta da AUTOCAR.'],
                ['2. EDITE', 'Altere palavras ou reescreva a resposta desejada.'],
                ['3. APRENDA', 'O Coach extrai a técnica por trás da correção.'],
                ['4. RETESTE', 'Veja como a AUTOCAR responderia agora.']
              ].map(([title, description]) => <div key={title} className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-red-600">{title}</p><p className="mt-2 text-xs font-bold leading-5 text-zinc-600">{description}</p></div>)}
            </div>

            <div className="premium-card p-5 md:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
                <Field label="1. Loja">
                  <select className="premium-input" value={storeId} onChange={(event) => void loadConversations(event.target.value)}>
                    <option value="">Selecione uma loja</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
                  </select>
                </Field>
                <Field label="2. Conversa recente">
                  <select className="premium-input" value={conversationId} onChange={(event) => void loadConversation(event.target.value)} disabled={!storeId}>
                    <option value="">Selecione uma conversa</option>
                    {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{shortId(conversation.id)} · {conversation.last_message.slice(0, 70) || 'sem prévia'}</option>)}
                  </select>
                </Field>
                <button type="button" onClick={() => void loadStores()} disabled={busy} className="premium-button-secondary shrink-0"><RefreshCw size={15} />Atualizar</button>
              </div>
            </div>

            {messages.length ? <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
              <div className="premium-card p-5 md:p-6">
                <h2 className="text-xl font-black text-zinc-950">Conversa real · somente leitura</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-500">As mensagens originais não podem ser editadas. Clique somente em uma resposta verde da AUTOCAR para criar uma cópia de treinamento.</p>
                <div className="mt-4 max-h-[640px] space-y-2 overflow-y-auto pr-1">
                  {messages.map((item) => {
                    const selectable = item.is_autocar;
                    const active = item.id === selectedAutocarId;
                    return <button key={item.id} type="button" disabled={!selectable} onClick={() => selectable && selectAutocar(item)} className={`block w-full rounded-2xl border p-3 text-left transition ${active ? 'border-emerald-500 bg-emerald-100 ring-2 ring-emerald-100' : item.speaker === 'AUTOCAR' ? 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-400' : item.speaker === 'CLIENTE' ? 'border-zinc-200 bg-white' : 'border-blue-100 bg-blue-50/50'} ${!selectable ? 'cursor-default' : 'cursor-pointer'}`}>
                      <div className="flex items-center justify-between gap-3"><span className={`text-[9px] font-black uppercase tracking-wider ${item.speaker === 'AUTOCAR' ? 'text-emerald-700' : item.speaker === 'CLIENTE' ? 'text-red-600' : 'text-blue-700'}`}>{item.speaker}</span><span className="text-[9px] font-bold text-zinc-400">{item.message_type}</span></div>
                      <p className="mt-1 whitespace-pre-wrap text-xs font-semibold leading-5 text-zinc-800">{item.body}</p>
                      {selectable ? <p className="mt-2 text-[10px] font-black uppercase text-emerald-700">Clique para corrigir uma cópia</p> : null}
                    </button>;
                  })}
                </div>
              </div>

              <div className="premium-card p-5 md:p-6">
                <h2 className="text-xl font-black text-zinc-950">Correção de treinamento</h2>
                {!selectedAutocar ? <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm font-bold text-zinc-400">Selecione uma resposta verde da AUTOCAR na conversa ao lado.</div> : <>
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Original · imutável</p><p className="mt-2 text-xs font-semibold leading-5 text-zinc-800">{selectedAutocar.body}</p></div>
                  <Field label="Sua correção · edite como gostaria que a AUTOCAR respondesse">
                    <textarea className="premium-input mt-3 min-h-40" value={correctedResponse} onChange={(event) => setCorrectedResponse(event.target.value)} />
                  </Field>
                  <p className="mt-2 text-[10px] font-bold leading-4 text-zinc-500">Esta caixa é apenas uma cópia de treinamento. Ela não altera nem sobrescreve a mensagem histórica original.</p>
                  <Field label="Por que você mudou? · opcional">
                    <textarea className="premium-input mt-3 min-h-24" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Ex.: não quero que ofereça visita logo na primeira demonstração de interesse; primeiro entenda melhor o cliente." />
                  </Field>
                  <Field label="Esse aprendizado deveria valer para">
                    <select className="premium-input mt-3" value={scope} onChange={(event) => setScope(event.target.value as Scope)}>
                      <option value="global">Global / Master · todas as lojas</option>
                      <option value="store">Somente esta loja · complemento local</option>
                    </select>
                  </Field>
                  <button type="button" onClick={() => void retestCorrection()} disabled={busy || (!correctedResponse.trim() && !feedback.trim())} className="premium-button-primary mt-4 w-full justify-center"><Play size={16} />Comparar, aprender técnica e retestar</button>
                </>}
              </div>
            </div> : null}

            {result ? <div className="premium-card p-5 md:p-6">
              <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-700" /><h2 className="text-xl font-black text-zinc-950">Original → sua correção → nova resposta</h2></div>
              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                <ResultCard eyebrow="ORIGINAL" title="Resposta histórica" text={result.source?.original_autocar_response || ''} />
                <ResultCard eyebrow="SUA CORREÇÃO" title="Exemplo não vinculante" text={result.trainer?.corrected_response || ''} variant="blue" />
                <ResultCard eyebrow="RETESTE" title="Como a AUTOCAR responderia agora" text={result.retest?.response || ''} />
              </div>
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">TÉCNICA EXTRAÍDA</p>
                <p className="mt-2 text-sm font-black text-zinc-900">{result.coaching?.lesson?.situation}</p>
                <p className="mt-3 text-xs leading-5 text-zinc-700"><strong>Técnica:</strong> {result.coaching?.lesson?.technique}</p>
                <p className="mt-2 text-xs leading-5 text-zinc-700"><strong>Objetivo:</strong> {result.coaching?.lesson?.objective}</p>
                <p className="mt-2 text-xs leading-5 text-zinc-700"><strong>Próximo movimento:</strong> {result.coaching?.lesson?.next_action}</p>
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900"><ShieldCheck size={18} className="shrink-0" />Nada foi salvo ou publicado. Mensagem histórica imutável · external_execution=false · persistence=false.</div>
              <div className="mt-3 flex items-center gap-2 text-[10px] font-black uppercase text-zinc-500">Original <ArrowRight size={12} /> Correção <ArrowRight size={12} /> Técnica <ArrowRight size={12} /> Reteste</div>
            </div> : null}
          </section>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-4 block min-w-0 flex-1 text-xs font-black text-zinc-700">{label}<div className="mt-1.5">{children}</div></label>;
}

function ResultCard({ eyebrow, title, text, variant = 'green' }: { eyebrow: string; title: string; text: string; variant?: 'green' | 'blue' }) {
  const style = variant === 'blue' ? 'border-blue-200 bg-blue-50/60' : 'border-emerald-200 bg-emerald-50/60';
  const eyebrowStyle = variant === 'blue' ? 'text-blue-700' : 'text-emerald-700';
  return <div className={`rounded-2xl border p-4 ${style}`}><p className={`text-[10px] font-black uppercase tracking-wider ${eyebrowStyle}`}>{eyebrow}</p><p className="mt-2 text-sm font-black text-zinc-950">{title}</p><p className="mt-2 whitespace-pre-wrap text-xs font-semibold leading-5 text-zinc-800">{text}</p></div>;
}
