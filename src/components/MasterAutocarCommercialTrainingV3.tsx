'use client';

import { useCallback, useMemo, useState } from 'react';
import { BrainCircuit, FlaskConical, Loader2, Play, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type Scope = 'global' | 'store';

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

export function MasterAutocarCommercialTrainingV3() {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<FormState>(initialForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<any | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

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
      const access = await token();
      if (!access) throw new Error('Sessão Master expirada.');
      const response = await fetch('/api/master/autocar/training', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      });
      const payload = await parseResponse(response);
      if (!response.ok) throw new Error(payload.error || 'Não foi possível executar a simulação V3.');
      setResult(payload);
      setMessage('Simulação concluída. Nenhum treinamento, lead, mensagem ou configuração foi gravado.');
    } catch (error: any) {
      setMessage(error?.message || 'Falha na simulação V3.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="/master/autocar/training" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-red-600"><BrainCircuit size={18} /><span className="premium-eyebrow">I.A AUTOCAR · Commercial Intelligence Training V3</span></div>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Treinar técnica, não decorar resposta</h1>
              <p className="premium-muted mt-3 max-w-4xl text-sm leading-6">Ensine como conduzir a situação comercial: intenção, técnica, objetivo, o que evitar e o próximo movimento. Exemplos de resposta são apenas referência; a AUTOCAR deve gerar a fala adequada ao contexto atual.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-[10px] font-black uppercase text-emerald-700"><ShieldCheck size={14} /> Preview sintético · sem gravação</span>
          </header>

          <section className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              ['1. SITUAÇÃO', 'O que está acontecendo na conversa.'],
              ['2. TÉCNICA', 'Como o vendedor deve raciocinar e conduzir.'],
              ['3. LIMITES', 'O que deve evitar e quais fatos não pode inventar.'],
              ['4. RETESTE', 'Valide a resposta gerada antes de qualquer publicação.']
            ].map(([title, description]) => <div key={title} className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-red-600">{title}</p><p className="mt-2 text-xs font-bold leading-5 text-zinc-600">{description}</p></div>)}
          </section>

          {message ? <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{busy ? <Loader2 size={16} className="mr-2 inline animate-spin text-red-600" /> : null}{message}</div> : null}

          <section className="mt-6 grid gap-5 2xl:grid-cols-[1.15fr_.85fr]">
            <div className="premium-card p-5 md:p-6">
              <div className="flex items-center gap-2 text-red-600"><Sparkles size={18} /><h2 className="text-xl font-black text-zinc-950">Ensinar comportamento comercial</h2></div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">Nesta validação, os campos ficam somente no navegador. O botão de persistência permanece bloqueado porque nenhuma gravação em Supabase foi autorizada.</p>

              <div className="mt-5 grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Escopo">
                    <select className="premium-input" value={form.scope} onChange={(event) => update('scope', event.target.value as Scope)}>
                      <option value="global">Global · todas as lojas, abaixo das regras Master</option>
                      <option value="store">Loja · ajuste local isolado</option>
                    </select>
                  </Field>
                  {form.scope === 'store' ? <Field label="Loja sintética para o Preview"><input className="premium-input" value={form.store_id} onChange={(event) => update('store_id', event.target.value)} placeholder="synthetic-store-01" /></Field> : <div />}
                </div>

                <Field label="Situação do cliente"><textarea className="premium-input min-h-24" value={form.situation} onChange={(event) => update('situation', event.target.value)} /></Field>
                <Field label="Intenção comercial"><input className="premium-input" value={form.intent} onChange={(event) => update('intent', event.target.value)} placeholder="Ex.: preco_inicial, objeção, troca, financiamento" /></Field>
                <Field label="Técnica / forma de condução"><textarea className="premium-input min-h-32" value={form.technique} onChange={(event) => update('technique', event.target.value)} placeholder="Descreva o raciocínio comercial que deve ser aplicado, não uma frase pronta." /></Field>
                <Field label="Objetivo comercial"><textarea className="premium-input min-h-24" value={form.objective} onChange={(event) => update('objective', event.target.value)} /></Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="O que evitar · uma regra por linha"><textarea className="premium-input min-h-28" value={form.restrictions} onChange={(event) => update('restrictions', event.target.value)} /></Field>
                  <Field label="Próximo movimento preferido"><textarea className="premium-input min-h-28" value={form.next_action} onChange={(event) => update('next_action', event.target.value)} /></Field>
                </div>
                <Field label="Exemplos de fala do cliente · um por linha"><textarea className="premium-input min-h-24" value={form.examples} onChange={(event) => update('examples', event.target.value)} /></Field>
                <Field label="Exemplo de resposta · opcional e NÃO vinculante"><textarea className="premium-input min-h-24" value={form.reference_response} onChange={(event) => update('reference_response', event.target.value)} placeholder="Use apenas se quiser demonstrar um estilo ou uma aplicação possível da técnica." /></Field>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-black text-amber-900">Governança preservada</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">A arquitetura de rascunho → aprovação → publicação continua separada. Nesta autorização, não executaremos nenhuma dessas gravações.</p>
                  <button type="button" disabled className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-zinc-300 px-4 text-xs font-black text-white"><Save size={15} /> Salvar rascunho · bloqueado no Preview</button>
                </div>
              </div>
            </div>

            <div className="premium-card p-5 md:p-6">
              <div className="flex items-center gap-2 text-red-600"><FlaskConical size={18} /><h2 className="text-xl font-black text-zinc-950">Replay / Reteste sintético</h2></div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">Cole contexto sintético da conversa, informe a última fala do cliente e teste como a AUTOCAR aplicaria a técnica. Nenhuma ferramenta operacional é executada.</p>
              <Field label="Contexto anterior · opcional, uma mensagem por linha"><textarea className="premium-input mt-4 min-h-28" value={form.conversation_context} onChange={(event) => update('conversation_context', event.target.value)} placeholder="Cliente: Vi o Civic no anúncio.\nAUTOCAR: ..." /></Field>
              <Field label="Última fala do cliente"><textarea className="premium-input mt-4 min-h-24" value={form.customer_input} onChange={(event) => update('customer_input', event.target.value)} /></Field>
              <button type="button" onClick={() => void retest()} disabled={busy || !form.technique.trim() || !form.customer_input.trim()} className="premium-button-primary mt-3 w-full justify-center"><Play size={16} />{busy ? 'Simulando...' : 'Retestar com AUTOCAR V3'}</button>

              {result ? <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Resposta gerada</p><p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-zinc-900">{result.response}</p></div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Por que essa condução</p><p className="mt-2 text-xs leading-5 text-zinc-700">{result.reasoning_summary}</p><p className="mt-3 text-[10px] font-black uppercase tracking-wider text-zinc-500">Próximo movimento</p><p className="mt-1 text-xs font-bold text-zinc-800">{result.next_action}</p></div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs font-bold leading-5 text-blue-900">preview_synthetic: {String(result.preview_synthetic)} · external_execution: {String(result.external_execution)} · persistência: nenhuma</div>
              </div> : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-black text-zinc-700">{label}<div className="mt-1.5">{children}</div></label>;
}
