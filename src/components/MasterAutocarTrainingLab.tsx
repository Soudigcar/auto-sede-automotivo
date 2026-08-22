'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  EyeOff,
  FlaskConical,
  Loader2,
  PencilLine,
  Play,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type Scenario = {
  id: string;
  situation: string;
  intent: string | null;
  ideal_response: string;
  objective: string | null;
  next_action: string | null;
  restrictions: string[];
  tags: string[];
  examples: string[];
  priority: number;
  status: 'draft' | 'approved';
  publication_status: 'unpublished' | 'published';
  approved_at: string | null;
  published_at: string | null;
  version: number;
  updated_at: string;
};

type Simulation = {
  id: string;
  customer_input: string;
  ai_response: string;
  corrected_response: string | null;
  evaluation: 'generated' | 'approved' | 'corrected' | 'rejected';
  reasoning_summary: string | null;
  next_action: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
};

type Payload = {
  environment?: string;
  scenarios: Scenario[];
  simulations: Simulation[];
};

type FormState = {
  scenario_id: string;
  situation: string;
  intent: string;
  ideal_response: string;
  objective: string;
  next_action: string;
  restrictions: string;
  tags: string;
  examples: string;
  priority: string;
};

const blank: FormState = {
  scenario_id: '',
  situation: '',
  intent: '',
  ideal_response: '',
  objective: '',
  next_action: '',
  restrictions: '',
  tags: '',
  examples: '',
  priority: '100'
};

function environmentLabel(value: string | undefined) {
  if (value === 'autocar-production') return 'AUTOCAR Production';
  if (value === 'autocar-dev') return 'AUTOCAR DEV';
  return 'Ambiente AUTOCAR';
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 300) };
  }
}

export function MasterAutocarTrainingLab() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Payload>({ scenarios: [], simulations: [] });
  const [form, setForm] = useState<FormState>(blank);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [correction, setCorrection] = useState('');
  const [saveLearning, setSaveLearning] = useState(false);

  const token = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token || '';
  }, [supabase]);

  const request = useCallback(async (body: Record<string, unknown>) => {
    const access = await token();
    if (!access) throw new Error('Sessão Master expirada.');
    const response = await fetch('/api/master/autocar/training', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await readResponse(response);
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação.');
    return payload;
  }, [token]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const access = await token();
      if (!access) throw new Error('Sessão Master expirada.');
      const response = await fetch('/api/master/autocar/training', {
        headers: { Authorization: `Bearer ${access}` }, cache: 'no-store'
      });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error || 'Falha ao carregar treinamento.');
      setData({ environment: body.environment, scenarios: body.scenarios || [], simulations: body.simulations || [] });
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Falha ao carregar treinamento.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  function editScenario(item: Scenario) {
    setForm({
      scenario_id: item.id,
      situation: item.situation,
      intent: item.intent || '',
      ideal_response: item.ideal_response,
      objective: item.objective || '',
      next_action: item.next_action || '',
      restrictions: (item.restrictions || []).join('\n'),
      tags: (item.tags || []).join(', '),
      examples: (item.examples || []).join('\n'),
      priority: String(item.priority || 100)
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveScenario(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('Salvando como rascunho não publicado...');
    try {
      await request({ action: 'save-scenario', ...form, priority: Number(form.priority || 100) });
      setForm(blank);
      await load();
      setMessage('Rascunho salvo. Ele ainda NÃO participa das respostas da AUTOCAR.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    if (!question.trim()) return;
    setBusy(true);
    setResult(null);
    setMessage('Simulando com Método Venda Mais + aprendizados publicados...');
    try {
      const body = await request({ action: 'simulate', customer_input: question });
      setResult(body);
      setCorrection(body.response || '');
      setSaveLearning(false);
      setMessage(`Simulação concluída em ${environmentLabel(body.environment)}. Nada foi publicado.`);
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'Falha na simulação.');
    } finally {
      setBusy(false);
    }
  }

  async function review(evaluation: 'approved' | 'corrected' | 'rejected') {
    if (!result?.simulation?.id) return;
    setBusy(true);
    try {
      const body = await request({
        action: 'review-simulation',
        simulation_id: result.simulation.id,
        evaluation,
        corrected_response: evaluation === 'corrected' ? correction : null,
        save_as_learning: saveLearning && evaluation !== 'rejected',
        situation: question,
        ideal_response: correction,
        tags: 'simulador-master'
      });
      setMessage(body.learning
        ? 'Revisão concluída e criada como RASCUNHO. Ainda precisa de aprovação e publicação separadas.'
        : 'Simulação revisada. Nenhum aprendizado foi criado/publicado.');
      setResult(null);
      setQuestion('');
      setCorrection('');
      setSaveLearning(false);
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'Falha ao revisar.');
    } finally {
      setBusy(false);
    }
  }

  async function governance(action: 'approve-scenario' | 'publish-scenario' | 'unpublish-scenario', item: Scenario) {
    if (action === 'publish-scenario') {
      const confirmed = window.confirm(
        'PUBLICAÇÃO GLOBAL: este aprendizado passará a poder influenciar a AUTOCAR de todas as lojas habilitadas. Deseja publicar agora neste ambiente?'
      );
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      await request({
        action,
        scenario_id: item.id,
        ...(action === 'publish-scenario' ? { confirmation: 'PUBLICAR_GLOBAL' } : {})
      });
      await load();
      setMessage(action === 'approve-scenario'
        ? 'Aprendizado aprovado, mas ainda NÃO publicado.'
        : action === 'publish-scenario'
          ? 'Aprendizado publicado neste ambiente AUTOCAR.'
          : 'Aprendizado retirado da publicação; permanece preservado para revisão.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível atualizar a governança.');
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setBusy(true);
    try {
      const access = await token();
      const response = await fetch('/api/master/autocar/training', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: id })
      });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error || 'Falha ao arquivar.');
      await load();
      setMessage('Aprendizado arquivado e fora da recuperação da AUTOCAR.');
    } catch (error: any) {
      setMessage(error?.message || 'Falha ao arquivar.');
    } finally {
      setBusy(false);
    }
  }

  const currentEnvironment = environmentLabel(data.environment);

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="/master/autocar/training" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-red-600"><FlaskConical size={18} /><span className="premium-eyebrow">I.A AUTOCAR · Master · {currentEnvironment}</span></div>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Treinar e Testar</h1>
              <p className="premium-muted mt-3 max-w-4xl text-sm">Fluxo governado: criar rascunho → simular/revisar → aprovar → publicar. Somente conteúdo aprovado e publicado pode entrar na recuperação semântica da AUTOCAR.</p>
            </div>
            <button onClick={() => void load()} disabled={busy} className="premium-button-secondary"><RefreshCw size={16} className={busy ? 'animate-spin' : ''} />Atualizar</button>
          </header>

          <section className="mt-5 grid gap-2 md:grid-cols-4">
            {[
              ['1. RASCUNHO', 'Salvar ou editar nunca publica.'],
              ['2. TESTAR / REVISAR', 'Simule antes de liberar comportamento.'],
              ['3. APROVAR', 'Valida o conteúdo, ainda sem uso pela IA.'],
              ['4. PUBLICAR', 'Libera para recuperação semântica neste ambiente.']
            ].map(([title, text]) => <div key={title} className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-red-600">{title}</p><p className="mt-2 text-xs font-bold leading-5 text-zinc-600">{text}</p></div>)}
          </section>

          {message ? <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{busy ? <Loader2 size={16} className="mr-2 inline animate-spin text-red-600" /> : null}{message}</div> : null}

          <section className="mt-6 grid gap-5 2xl:grid-cols-2">
            <form onSubmit={saveScenario} className="premium-card p-5 md:p-6">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-red-600"><Save size={18} /><h2 className="text-xl font-black text-zinc-950">Ensinar</h2></div><span className="rounded-full bg-amber-50 px-3 py-1 text-[9px] font-black uppercase text-amber-700">Sempre salva como rascunho</span></div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">Se você editar um aprendizado já publicado, ele volta automaticamente para rascunho e sai da publicação até nova revisão.</p>
              <div className="mt-4 grid gap-3">
                <Field label="Pergunta ou situação do cliente"><textarea className="premium-input min-h-24" value={form.situation} onChange={(event) => setForm({ ...form, situation: event.target.value })} placeholder="Ex.: Quero fazer um test-drive nesse carro." /></Field>
                <Field label="Intenção"><input className="premium-input" value={form.intent} onChange={(event) => setForm({ ...form, intent: event.target.value })} placeholder="Ex.: test_drive" /></Field>
                <Field label="Resposta ideal"><textarea className="premium-input min-h-28" value={form.ideal_response} onChange={(event) => setForm({ ...form, ideal_response: event.target.value })} placeholder="Como a AUTOCAR deve responder" /></Field>
                <div className="grid gap-3 md:grid-cols-2"><Field label="Objetivo comercial"><textarea className="premium-input min-h-20" value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} /></Field><Field label="Próxima ação"><textarea className="premium-input min-h-20" value={form.next_action} onChange={(event) => setForm({ ...form, next_action: event.target.value })} /></Field></div>
                <div className="grid gap-3 md:grid-cols-2"><Field label="Restrições — uma por linha"><textarea className="premium-input min-h-20" value={form.restrictions} onChange={(event) => setForm({ ...form, restrictions: event.target.value })} placeholder="Não inventar disponibilidade\nNão transferir só por pedir test-drive" /></Field><Field label="Tags"><input className="premium-input" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="test-drive, agenda, visita" /></Field></div>
                <Field label="Outros exemplos de fala do cliente — um por linha"><textarea className="premium-input min-h-20" value={form.examples} onChange={(event) => setForm({ ...form, examples: event.target.value })} /></Field>
                <Field label="Prioridade"><input className="premium-input" type="number" min="1" max="1000" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} /></Field>
              </div>
              <div className="mt-4 flex gap-2"><button disabled={busy || !form.situation.trim() || !form.ideal_response.trim()} className="premium-button-primary flex-1 justify-center"><Save size={16} />{form.scenario_id ? 'Salvar edição como rascunho' : 'Salvar rascunho'}</button>{form.scenario_id ? <button type="button" className="premium-button-secondary" onClick={() => setForm(blank)}>Cancelar edição</button> : null}</div>
            </form>

            <div className="premium-card p-5 md:p-6">
              <div className="flex items-center gap-2 text-red-600"><Sparkles size={18} /><h2 className="text-xl font-black text-zinc-950">Simular</h2></div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">A simulação usa somente aprendizados já publicados + Método/Biblioteca. Nada é enviado ao WhatsApp.</p>
              <textarea className="premium-input mt-4 min-h-28" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ex.: Quero fazer um test-drive nesse carro amanhã." />
              <button type="button" onClick={() => void simulate()} disabled={busy || !question.trim()} className="premium-button-primary mt-3 w-full justify-center"><Play size={16} />{busy ? 'Simulando...' : 'Simular AUTOCAR'}</button>
              {result ? <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Resposta AUTOCAR</p><p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-zinc-900">{result.response}</p></div>
                <div className="rounded-2xl border border-zinc-200 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Resumo para revisão</p><p className="mt-2 text-xs leading-5 text-zinc-600">{result.reasoning_summary}</p><p className="mt-3 text-[10px] font-black uppercase text-zinc-400">Próxima ação</p><p className="mt-1 text-xs font-bold text-zinc-700">{result.next_action}</p></div>
                <Field label="Corrigir resposta"><textarea className="premium-input min-h-24" value={correction} onChange={(event) => setCorrection(event.target.value)} /></Field>
                <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900"><input className="mt-0.5" type="checkbox" checked={saveLearning} onChange={(event) => setSaveLearning(event.target.checked)} /><span>Criar um novo RASCUNHO a partir desta revisão. Ele não será aprovado nem publicado automaticamente.</span></label>
                <div className="grid gap-2 sm:grid-cols-3"><button type="button" onClick={() => void review('approved')} className="rounded-xl bg-emerald-600 px-3 py-3 text-xs font-black text-white"><ThumbsUp size={15} className="mr-1 inline" />Revisão OK</button><button type="button" onClick={() => void review('corrected')} className="rounded-xl bg-amber-500 px-3 py-3 text-xs font-black text-white"><PencilLine size={15} className="mr-1 inline" />Salvar correção</button><button type="button" onClick={() => void review('rejected')} className="rounded-xl bg-zinc-800 px-3 py-3 text-xs font-black text-white"><ThumbsDown size={15} className="mr-1 inline" />Rejeitar</button></div>
              </div> : null}
            </div>
          </section>

          <section className="premium-card mt-6 p-5 md:p-6">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Governança dos aprendizados</h2><p className="mt-1 text-xs text-zinc-500">{data.scenarios.length} cenários preservados neste ambiente.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-blue-700">{currentEnvironment}</span></div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">{data.scenarios.map((item) => {
              const published = item.publication_status === 'published';
              const approved = item.status === 'approved';
              return <div key={item.id} className={`rounded-2xl border p-4 ${published ? 'border-emerald-200 bg-emerald-50/40' : 'border-zinc-200 bg-white'}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${approved ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{approved ? 'Aprovado' : 'Rascunho'}</span><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${published ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}>{published ? 'Publicado' : 'Não publicado'}</span>{item.intent ? <span className="rounded-full bg-zinc-100 px-2 py-1 text-[9px] font-black text-zinc-600">{item.intent}</span> : null}</div><p className="mt-3 text-sm font-black text-zinc-900">{item.situation}</p><p className="mt-2 text-xs leading-5 text-zinc-600"><strong>Resposta ideal:</strong> {item.ideal_response}</p>{item.objective ? <p className="mt-2 text-xs text-zinc-500"><strong>Objetivo:</strong> {item.objective}</p> : null}</div>{published ? <CheckCircle2 size={18} className="text-emerald-600" /> : <EyeOff size={18} className="text-zinc-400" />}</div>
                <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => editScenario(item)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[10px] font-black text-zinc-700"><PencilLine size={12} className="mr-1 inline" />Editar</button>{!approved ? <button type="button" disabled={busy} onClick={() => void governance('approve-scenario', item)} className="rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-black text-white"><CheckCircle2 size={12} className="mr-1 inline" />Aprovar</button> : null}{approved && !published ? <button type="button" disabled={busy} onClick={() => void governance('publish-scenario', item)} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black text-white"><Send size={12} className="mr-1 inline" />Publicar</button> : null}{published ? <button type="button" disabled={busy} onClick={() => void governance('unpublish-scenario', item)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-800"><EyeOff size={12} className="mr-1 inline" />Retirar publicação</button> : null}<button type="button" onClick={() => void archive(item.id)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[10px] font-black text-zinc-500"><Archive size={12} className="mr-1 inline" />Arquivar</button></div>
              </div>;
            })}{!data.scenarios.length ? <div className="rounded-2xl border border-dashed border-zinc-300 p-7 text-center text-sm font-bold text-zinc-400">Nenhum aprendizado ainda. Crie o primeiro rascunho acima.</div> : null}</div>
          </section>

          <section className="premium-card mt-6 p-5 md:p-6">
            <h2 className="text-xl font-black">Histórico de simulações</h2>
            <div className="mt-4 space-y-2">{data.simulations.slice(0, 12).map((item) => <div key={item.id} className="rounded-xl border border-zinc-200 p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black text-zinc-900">Cliente: {item.customer_input}</p><span className="rounded-full bg-zinc-100 px-2 py-1 text-[9px] font-black uppercase text-zinc-600">{item.evaluation}</span></div><p className="mt-2 text-xs leading-5 text-zinc-600">AUTOCAR: {item.corrected_response || item.ai_response}</p></div>)}{!data.simulations.length ? <p className="text-xs font-bold text-zinc-400">Nenhuma simulação realizada ainda.</p> : null}</div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-black text-zinc-700">{label}<div className="mt-1.5">{children}</div></label>;
}
