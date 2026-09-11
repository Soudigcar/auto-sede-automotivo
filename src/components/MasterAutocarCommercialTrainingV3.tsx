'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  FlaskConical,
  Loader2,
  MessageCircleMore,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Store
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type Scope = 'global' | 'store';
type Mode = 'coach' | 'advanced';

type FormState = {
  scope: Scope;
  store_id: string;
  situation: string;
  intent: string;
  technique: string;
  objective: string;
  restrictions: string;
  next_action: string;
  examples: string;
  reference_response: string;
  conversation_context: string;
  customer_input: string;
};

type StoreRow = { id: string; store_name: string; slug?: string; status?: string };
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

const initialForm: FormState = {
  scope: 'global',
  store_id: '',
  situation: 'Cliente pergunta o preço de um veículo no início da conversa.',
  intent: 'preco_inicial',
  technique: 'Responder a pergunta de forma útil e comercial, sem transformar um sinal isolado de interesse em convite imediato para visita. Depois da resposta, fazer no máximo uma pergunta de descoberta que ajude a entender o contexto de compra.',
  objective: 'Manter confiança, responder o que foi perguntado e avançar a descoberta sem pressionar o cliente.',
  restrictions: 'Não forçar visita ou test-drive apenas porque o cliente perguntou preço.\nNão esconder uma informação confirmada quando ela puder ser respondida com segurança.\nNão inventar preço, condição, desconto ou disponibilidade.',
  next_action: 'Fazer uma pergunta curta de descoberta coerente com o que o cliente acabou de perguntar.',
  examples: 'Quanto custa esse carro?\nQual o valor desse veículo?\nEsse carro está quanto?',
  reference_response: '',
  conversation_context: '',
  customer_input: 'Qual o valor desse carro?'
};

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 300) }; }
}

function lines(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

export function MasterAutocarCommercialTrainingV3() {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<Mode>('coach');
  const [form, setForm] = useState<FormState>(initialForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<any | null>(null);

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [coachStoreId, setCoachStoreId] = useState('');
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState('');
  const [trainerFeedback, setTrainerFeedback] = useState('');
  const [coachScope, setCoachScope] = useState<Scope>('global');
  const [coachResult, setCoachResult] = useState<any | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

  const request = useCallback(async (body: Record<string, unknown>) => {
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

  const loadStores = useCallback(async () => {
    setBusy(true);
    try {
      const payload = await request({ action: 'coach-stores-preview' });
      setStores(payload.stores || []);
      setMessage('Conversas reais estão disponíveis somente para leitura neste Preview.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar as lojas para o Coach V3.');
    } finally {
      setBusy(false);
    }
  }, [request]);

  useEffect(() => { void loadStores(); }, [loadStores]);

  async function loadConversations(storeId: string) {
    setCoachStoreId(storeId);
    setConversationId('');
    setCoachMessages([]);
    setSelectedMessageId('');
    setCoachResult(null);
    if (!storeId) {
      setConversations([]);
      return;
    }
    setBusy(true);
    try {
      const payload = await request({ action: 'coach-conversations-preview', store_id: storeId });
      setConversations(payload.conversations || []);
      setMessage('Selecione uma conversa recente e depois uma mensagem do cliente para treinar a AUTOCAR.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar as conversas.');
    } finally {
      setBusy(false);
    }
  }

  async function loadConversation(id: string) {
    setConversationId(id);
    setCoachMessages([]);
    setSelectedMessageId('');
    setCoachResult(null);
    if (!id) return;
    setBusy(true);
    try {
      const payload = await request({ action: 'coach-conversation-preview', store_id: coachStoreId, conversation_id: id });
      setCoachMessages(payload.messages || []);
      setMessage('Conversa carregada em modo read-only. Escolha uma fala do CLIENTE que você quer usar como ponto de treinamento.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar a conversa.');
    } finally {
      setBusy(false);
    }
  }

  async function coachAndRetest() {
    if (!coachStoreId || !conversationId || !selectedMessageId || !trainerFeedback.trim()) return;
    setBusy(true);
    setCoachResult(null);
    setMessage('O Coach V3 está estruturando sua orientação e retestando o mesmo momento da conversa, sem gravar nada...');
    try {
      const payload = await request({
        action: 'coach-retest-real-preview',
        store_id: coachStoreId,
        conversation_id: conversationId,
        message_id: selectedMessageId,
        trainer_feedback: trainerFeedback,
        scope: coachScope
      });
      setCoachResult(payload);
      setMessage('Treinamento estruturado e retestado. Nenhum dado, aprendizado ou mensagem foi gravado.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível estruturar e retestar este treinamento.');
    } finally {
      setBusy(false);
    }
  }

  async function retest() {
    if (!form.customer_input.trim() || !form.technique.trim()) return;
    if (form.scope === 'store' && !form.store_id.trim()) {
      setMessage('Informe um identificador sintético de loja para testar o isolamento de escopo no Preview.');
      return;
    }
    setBusy(true);
    setMessage('Executando simulação V3 sem persistência e sem ação externa...');
    setResult(null);
    try {
      const payload = await request({
        action: 'simulate-v3-preview',
        scope: form.scope,
        store_id: form.scope === 'store' ? form.store_id.trim() : null,
        situation: form.situation,
        intent: form.intent,
        technique: form.technique,
        objective: form.objective,
        restrictions: lines(form.restrictions),
        next_action: form.next_action,
        examples: lines(form.examples),
        reference_response: form.reference_response,
        conversation_context: lines(form.conversation_context),
        customer_input: form.customer_input
      });
      setResult(payload);
      setMessage('Simulação concluída. Nenhum treinamento, lead, mensagem ou configuração foi gravado.');
    } catch (error: any) {
      setMessage(error?.message || 'Falha na simulação V3.');
    } finally {
      setBusy(false);
    }
  }

  const selectedMessage = coachMessages.find((item) => item.id === selectedMessageId) || null;
  const selectedIndex = selectedMessage ? coachMessages.findIndex((item) => item.id === selectedMessage.id) : -1;
  const observedAutocar = selectedIndex >= 0
    ? coachMessages.slice(selectedIndex + 1).find((item) => item.is_autocar) || null
    : null;

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="/master/autocar/training" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-red-600"><BrainCircuit size={18} /><span className="premium-eyebrow">I.A AUTOCAR · Commercial Intelligence Training V3</span></div>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Treinar como um vendedor aprende</h1>
              <p className="premium-muted mt-3 max-w-4xl text-sm leading-6">Use uma conversa real para apontar o que deveria ter acontecido. O Coach transforma sua orientação em técnica reutilizável e retesta o mesmo momento. O editor avançado continua disponível quando você quiser controlar cada campo.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-[10px] font-black uppercase text-emerald-700"><ShieldCheck size={14} /> Preview read-only · sem gravação</span>
          </header>

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => setMode('coach')} className={`rounded-xl px-4 py-3 text-xs font-black ${mode === 'coach' ? 'bg-red-600 text-white' : 'border border-zinc-200 bg-white text-zinc-700'}`}><MessageCircleMore size={15} className="mr-2 inline" />Treinar com Conversas Reais</button>
            <button type="button" onClick={() => setMode('advanced')} className={`rounded-xl px-4 py-3 text-xs font-black ${mode === 'advanced' ? 'bg-zinc-950 text-white' : 'border border-zinc-200 bg-white text-zinc-700'}`}><FlaskConical size={15} className="mr-2 inline" />Editor Avançado</button>
          </div>

          {message ? <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{busy ? <Loader2 size={16} className="mr-2 inline animate-spin text-red-600" /> : null}{message}</div> : null}

          {mode === 'coach' ? (
            <section className="mt-6 space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ['1. ESCOLHA', 'Loja, conversa e fala do cliente.'],
                  ['2. EXPLIQUE', 'Diga em português normal o que deveria acontecer.'],
                  ['3. ESTRUTURE', 'O Coach converte isso em técnica, objetivo e limites.'],
                  ['4. RETESTE', 'A AUTOCAR responde novamente ao mesmo momento.']
                ].map(([title, description]) => <div key={title} className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-red-600">{title}</p><p className="mt-2 text-xs font-bold leading-5 text-zinc-600">{description}</p></div>)}
              </div>

              <div className="premium-card p-5 md:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
                  <Field label="1. Loja">
                    <select className="premium-input" value={coachStoreId} onChange={(event) => void loadConversations(event.target.value)}>
                      <option value="">Selecione uma loja</option>
                      {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
                    </select>
                  </Field>
                  <Field label="2. Conversa recente">
                    <select className="premium-input" value={conversationId} onChange={(event) => void loadConversation(event.target.value)} disabled={!coachStoreId}>
                      <option value="">Selecione uma conversa</option>
                      {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{shortId(conversation.id)} · {conversation.last_message.slice(0, 70) || 'sem prévia'}</option>)}
                    </select>
                  </Field>
                  <button type="button" onClick={() => void loadStores()} disabled={busy} className="premium-button-secondary shrink-0"><RefreshCw size={15} />Atualizar</button>
                </div>
              </div>

              {coachMessages.length ? <div className="grid gap-5 2xl:grid-cols-[1.05fr_.95fr]">
                <div className="premium-card p-5 md:p-6">
                  <div className="flex items-center gap-2"><MessageCircleMore size={18} className="text-red-600" /><h2 className="text-xl font-black text-zinc-950">Conversa real · somente leitura</h2></div>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">Clique em uma mensagem do CLIENTE para definir o momento exato que será reavaliado. Mensagens futuras não entram no contexto do replay.</p>
                  <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                    {coachMessages.map((item) => {
                      const selectable = item.speaker === 'CLIENTE';
                      const active = item.id === selectedMessageId;
                      return <button key={item.id} type="button" disabled={!selectable} onClick={() => selectable && setSelectedMessageId(item.id)} className={`block w-full rounded-2xl border p-3 text-left transition ${active ? 'border-red-400 bg-red-50' : item.speaker === 'CLIENTE' ? 'border-zinc-200 bg-white hover:border-red-200' : item.speaker === 'AUTOCAR' ? 'border-emerald-200 bg-emerald-50/60' : 'border-blue-100 bg-blue-50/50'} ${!selectable ? 'cursor-default' : ''}`}>
                        <div className="flex items-center justify-between gap-3"><span className={`text-[9px] font-black uppercase tracking-wider ${item.speaker === 'CLIENTE' ? 'text-red-600' : item.speaker === 'AUTOCAR' ? 'text-emerald-700' : 'text-blue-700'}`}>{item.speaker}</span><span className="text-[9px] font-bold text-zinc-400">{item.message_type}</span></div>
                        <p className="mt-1 whitespace-pre-wrap text-xs font-semibold leading-5 text-zinc-800">{item.body}</p>
                      </button>;
                    })}
                  </div>
                </div>

                <div className="premium-card p-5 md:p-6">
                  <div className="flex items-center gap-2"><Sparkles size={18} className="text-red-600" /><h2 className="text-xl font-black text-zinc-950">Ensine em linguagem normal</h2></div>
                  {!selectedMessage ? <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm font-bold text-zinc-400">Selecione uma fala do cliente na conversa ao lado.</div> : <>
                    <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-red-600">Cliente</p><p className="mt-2 text-sm font-bold leading-6 text-zinc-900">{selectedMessage.body}</p></div>
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Resposta AUTOCAR observada depois desse ponto</p><p className="mt-2 text-xs leading-5 text-zinc-700">{observedAutocar?.body || 'Nenhuma resposta identificada como AUTOCAR nas mensagens carregadas. O backend fará uma segunda verificação antes do reteste.'}</p></div>
                    <Field label="O que a AUTOCAR deveria aprender com este caso?">
                      <textarea className="premium-input mt-4 min-h-36" value={trainerFeedback} onChange={(event) => setTrainerFeedback(event.target.value)} placeholder="Ex.: Aqui ela avançou rápido demais. O cliente só perguntou preço. Quero que responda o valor quando estiver confirmado e faça uma pergunta curta para entender o contexto antes de oferecer visita." />
                    </Field>
                    <Field label="Esse aprendizado deveria valer para">
                      <select className="premium-input mt-3" value={coachScope} onChange={(event) => setCoachScope(event.target.value as Scope)}>
                        <option value="global">Global / Master · regra para todas as lojas</option>
                        <option value="store">Somente esta loja · complemento local</option>
                      </select>
                    </Field>
                    <button type="button" onClick={() => void coachAndRetest()} disabled={busy || !trainerFeedback.trim()} className="premium-button-primary mt-4 w-full justify-center"><Play size={16} />Estruturar técnica e retestar</button>
                  </>}
                </div>
              </div> : null}

              {coachResult ? <div className="premium-card p-5 md:p-6">
                <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 size={18} /><h2 className="text-xl font-black text-zinc-950">Antes × aprendizado × depois</h2></div>
                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  <ResultCard eyebrow="ANTES" title="Resposta observada" text={coachResult.source?.observed_autocar_response?.body || 'Não havia resposta AUTOCAR identificável após essa fala.'} />
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-blue-700">APRENDIZADO ESTRUTURADO</p><p className="mt-2 text-sm font-black text-zinc-900">{coachResult.coaching?.lesson?.situation}</p><p className="mt-3 text-xs leading-5 text-zinc-700"><strong>Técnica:</strong> {coachResult.coaching?.lesson?.technique}</p><p className="mt-2 text-xs leading-5 text-zinc-700"><strong>Objetivo:</strong> {coachResult.coaching?.lesson?.objective}</p><p className="mt-2 text-xs leading-5 text-zinc-700"><strong>Próximo movimento:</strong> {coachResult.coaching?.lesson?.next_action}</p>{(coachResult.coaching?.lesson?.restrictions || []).length ? <div className="mt-3"><p className="text-[10px] font-black uppercase text-zinc-500">Evitar</p><ul className="mt-1 space-y-1 text-xs text-zinc-700">{coachResult.coaching.lesson.restrictions.map((item: string) => <li key={item}>• {item}</li>)}</ul></div> : null}</div>
                  <ResultCard eyebrow="DEPOIS · RETESTE" title="Como responderia agora" text={coachResult.retest?.response || ''} helper={coachResult.retest?.next_action ? `Próximo movimento: ${coachResult.retest.next_action}` : undefined} />
                </div>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black text-amber-900">Ainda não vira aprendizado oficial</p><p className="mt-1 text-xs leading-5 text-amber-800">Este Preview somente lê a conversa e simula. Salvar, aprovar ou publicar este aprendizado exige autorização separada para gravação no ambiente de treinamento.</p><button type="button" disabled className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-zinc-300 px-4 text-xs font-black text-white"><Save size={15} />Salvar aprendizado · bloqueado</button></div>
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[10px] font-black uppercase text-emerald-700">external_execution: false · persistence: false · future_messages_excluded: {String(coachResult.source?.future_messages_excluded_from_context)}</div>
              </div> : null}
            </section>
          ) : (
            <section className="mt-6 space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ['1. SITUAÇÃO', 'O que está acontecendo na conversa.'],
                  ['2. TÉCNICA', 'Como o vendedor deve raciocinar e conduzir.'],
                  ['3. LIMITES', 'O que deve evitar e quais fatos não pode inventar.'],
                  ['4. RETESTE', 'Valide a resposta gerada antes de qualquer publicação.']
                ].map(([title, description]) => <div key={title} className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-red-600">{title}</p><p className="mt-2 text-xs font-bold leading-5 text-zinc-600">{description}</p></div>)}
              </div>

              <div className="grid gap-5 2xl:grid-cols-[1.15fr_.85fr]">
                <div className="premium-card p-5 md:p-6">
                  <div className="flex items-center gap-2 text-red-600"><Sparkles size={18} /><h2 className="text-xl font-black text-zinc-950">Editor avançado da técnica</h2></div>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">Controle diretamente a estrutura interna do treinamento. Os campos ficam somente no navegador nesta validação.</p>
                  <div className="mt-5 grid gap-4">
                    <div className="grid gap-3 md:grid-cols-2"><Field label="Escopo"><select className="premium-input" value={form.scope} onChange={(event) => update('scope', event.target.value as Scope)}><option value="global">Global · todas as lojas, abaixo das regras Master</option><option value="store">Loja · ajuste local isolado</option></select></Field>{form.scope === 'store' ? <Field label="Loja sintética para o Preview"><input className="premium-input" value={form.store_id} onChange={(event) => update('store_id', event.target.value)} placeholder="synthetic-store-01" /></Field> : <div />}</div>
                    <Field label="Situação do cliente"><textarea className="premium-input min-h-24" value={form.situation} onChange={(event) => update('situation', event.target.value)} /></Field>
                    <Field label="Intenção comercial"><input className="premium-input" value={form.intent} onChange={(event) => update('intent', event.target.value)} /></Field>
                    <Field label="Técnica / forma de condução"><textarea className="premium-input min-h-32" value={form.technique} onChange={(event) => update('technique', event.target.value)} /></Field>
                    <Field label="Objetivo comercial"><textarea className="premium-input min-h-24" value={form.objective} onChange={(event) => update('objective', event.target.value)} /></Field>
                    <div className="grid gap-3 md:grid-cols-2"><Field label="O que evitar · uma regra por linha"><textarea className="premium-input min-h-28" value={form.restrictions} onChange={(event) => update('restrictions', event.target.value)} /></Field><Field label="Próximo movimento preferido"><textarea className="premium-input min-h-28" value={form.next_action} onChange={(event) => update('next_action', event.target.value)} /></Field></div>
                    <Field label="Exemplos de fala do cliente · um por linha"><textarea className="premium-input min-h-24" value={form.examples} onChange={(event) => update('examples', event.target.value)} /></Field>
                    <Field label="Exemplo de resposta · opcional e NÃO vinculante"><textarea className="premium-input min-h-24" value={form.reference_response} onChange={(event) => update('reference_response', event.target.value)} /></Field>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black text-amber-900">Governança preservada</p><p className="mt-1 text-xs leading-5 text-amber-800">Rascunho → aprovação → publicação continua separado. Nesta autorização, nenhuma dessas gravações será executada.</p><button type="button" disabled className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-zinc-300 px-4 text-xs font-black text-white"><Save size={15} />Salvar rascunho · bloqueado no Preview</button></div>
                  </div>
                </div>

                <div className="premium-card p-5 md:p-6">
                  <div className="flex items-center gap-2 text-red-600"><FlaskConical size={18} /><h2 className="text-xl font-black text-zinc-950">Reteste sintético</h2></div>
                  <Field label="Contexto anterior · opcional, uma mensagem por linha"><textarea className="premium-input mt-4 min-h-28" value={form.conversation_context} onChange={(event) => update('conversation_context', event.target.value)} /></Field>
                  <Field label="Última fala do cliente"><textarea className="premium-input mt-4 min-h-24" value={form.customer_input} onChange={(event) => update('customer_input', event.target.value)} /></Field>
                  <button type="button" onClick={() => void retest()} disabled={busy || !form.technique.trim() || !form.customer_input.trim()} className="premium-button-primary mt-3 w-full justify-center"><Play size={16} />{busy ? 'Simulando...' : 'Retestar com AUTOCAR V3'}</button>
                  {result ? <div className="mt-5 space-y-3"><ResultCard eyebrow="RESPOSTA GERADA" title="AUTOCAR" text={result.response} helper={result.next_action ? `Próximo movimento: ${result.next_action}` : undefined} /><div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs font-bold leading-5 text-blue-900">preview_synthetic: {String(result.preview_synthetic)} · external_execution: {String(result.external_execution)} · persistência: nenhuma</div></div> : null}
                </div>
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 flex-1 text-xs font-black text-zinc-700">{label}<div className="mt-1.5">{children}</div></label>;
}

function ResultCard({ eyebrow, title, text, helper }: { eyebrow: string; title: string; text: string; helper?: string }) {
  return <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">{eyebrow}</p><p className="mt-2 text-sm font-black text-zinc-950">{title}</p><p className="mt-2 whitespace-pre-wrap text-xs font-semibold leading-5 text-zinc-800">{text}</p>{helper ? <p className="mt-3 text-[10px] font-black text-zinc-600">{helper}</p> : null}</div>;
}
