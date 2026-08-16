'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleGauge,
  Database,
  MessageCircle,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  Volume2
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type AuraMessage = { id: number; author: 'aura' | 'master'; text: string };
type Telemetry = {
  claims: number;
  completed: number;
  skipped: number;
  failed: number;
  external_executions: number;
  human_blocks: number;
  tokens: { input: number; output: number; total: number };
  model_calls: Record<string, number>;
  lane_calls: Record<string, number>;
  sol_escalations: number;
  audio: { inbound: number; outbound: number };
  purposes: Record<string, number>;
  message_types: Record<string, number>;
  average_claim_latency_ms: number | null;
};
type StoreRow = {
  id: string;
  store_name: string;
  slug: string | null;
  city: string | null;
  state: string | null;
  agent: { status?: string; mode?: string; master_enabled?: boolean; master_autopilot_allowed?: boolean; store_selected_mode?: string } | null;
  telemetry: Telemetry | null;
};
type Snapshot = {
  generated_at: string;
  platform: {
    version: string;
    environment: string;
    execution_policy: string;
    models: { version: string; lanes: Record<string, { model: string; role: string }> };
    telemetry: { global: Telemetry; pricing: { status: string; estimated_cost: number | null } };
  };
  summary: { stores: number; enabled_agents: number; autopilot_agents: number; stores_with_telemetry: number };
  stores: StoreRow[];
};

const initialMessages: AuraMessage[] = [
  { id: 1, author: 'aura', text: 'Olá. Estou conectada ao AI Control Plane do Master em modo somente leitura. Posso explicar uso de modelos, tokens, execuções, áudio, bloqueios humanos e atividade por loja.' }
];

function number(value: unknown) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function ms(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1).replace('.', ',')} s`;
}

function modeLabel(value: unknown) {
  const normalized = String(value || 'off').toLowerCase();
  if (normalized === 'autopilot') return 'AUTOPILOT';
  if (normalized === 'copilot') return 'COPILOT';
  return 'OFF';
}

export function AutomotiveBrainDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('Carregando dados reais do AI Control Plane...');
  const [auraInput, setAuraInput] = useState('');
  const [messages, setMessages] = useState<AuraMessage[]>(initialMessages);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sessão Master expirada.');
      const response = await fetch('/api/master/ai-platform', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar o AI Control Plane.');
      setSnapshot(body);
      setNotice(`Snapshot real atualizado em ${new Date(body.generated_at).toLocaleString('pt-BR')}. Nenhuma ação foi executada.`);
    } catch (error: any) {
      setNotice(error?.message || 'Falha ao carregar o AI Control Plane.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const global = snapshot?.platform.telemetry.global;
  const lanes = snapshot?.platform.models.lanes || {};
  const stores = snapshot?.stores || [];

  function auraAnswer(question: string) {
    if (!snapshot || !global) return 'Ainda não consegui carregar o snapshot real do AI Control Plane.';
    const q = question.toLowerCase();
    if (q.includes('sol') || q.includes('escal')) {
      return `O lane Sol registrou ${number(global.lane_calls?.sol || 0)} chamada(s) e ${number(global.sol_escalations)} escalada(s) no recorte atual.`;
    }
    if (q.includes('terra')) {
      return `Terra está configurado como cérebro comercial principal (${lanes.terra?.model || 'modelo não informado'}) e aparece em ${number(global.lane_calls?.terra || 0)} chamada(s) registradas.`;
    }
    if (q.includes('luna')) {
      return `Luna está configurado para tarefas estruturadas e operacionais (${lanes.luna?.model || 'modelo não informado'}) e aparece em ${number(global.lane_calls?.luna || 0)} chamada(s) registradas.`;
    }
    if (q.includes('token') || q.includes('consumo')) {
      return `O snapshot registra ${number(global.tokens.total)} tokens: ${number(global.tokens.input)} de entrada e ${number(global.tokens.output)} de saída. O custo financeiro ainda não está configurado no Control Plane.`;
    }
    if (q.includes('áudio') || q.includes('audio')) {
      return `Foram registrados ${number(global.audio.inbound)} atendimentos com áudio de entrada e ${number(global.audio.outbound)} envios de áudio pela AUTOCAR.`;
    }
    if (q.includes('humano') || q.includes('takeover') || q.includes('bloque')) {
      return `O SAFE CORE/runtime registrou ${number(global.human_blocks)} bloqueio(s) associado(s) a atendimento humano no recorte atual.`;
    }
    if (q.includes('erro') || q.includes('falha')) {
      return `Existem ${number(global.failed)} claim(s) com status de falha entre ${number(global.claims)} claims observados. Esta tela não executa correções; ela apenas apresenta o estado.`;
    }
    const matchingStore = stores.find((store) => q.includes(store.store_name.toLowerCase()) || (store.slug && q.includes(store.slug.toLowerCase())));
    if (matchingStore) {
      const t = matchingStore.telemetry;
      return t
        ? `${matchingStore.store_name}: modo ${modeLabel(matchingStore.agent?.mode)}, ${number(t.claims)} claims, ${number(t.external_executions)} execuções externas, ${number(t.tokens.total)} tokens e ${number(t.human_blocks)} bloqueios humanos.`
        : `${matchingStore.store_name}: agente ${matchingStore.agent?.master_enabled ? 'habilitado' : 'não habilitado'}, sem telemetria registrada no recorte atual.`;
    }
    return `No snapshot atual há ${number(snapshot.summary.stores)} lojas, ${number(snapshot.summary.enabled_agents)} agentes habilitados, ${number(snapshot.summary.autopilot_agents)} em AUTOPILOT e ${number(global.claims)} claims observados. Posso detalhar Terra, Luna, Sol, tokens, áudio, takeover humano, falhas ou uma loja específica.`;
  }

  function askAura(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = auraInput.trim();
    if (!question) return;
    const now = Date.now();
    setMessages((current) => [...current, { id: now, author: 'master', text: question }, { id: now + 1, author: 'aura', text: auraAnswer(question) }]);
    setAuraInput('');
  }

  return (
    <main className="min-h-screen bg-[#05070D] p-3 text-[#111827] md:p-6">
      <section className="mx-auto flex max-w-[1680px] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-black/50">
        <MasterSidebar active="/master/automotive-brain" />
        <div className="min-w-0 flex-1 bg-[#F4F6FA] p-4 md:p-7">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-red-600">Gestão Master</p>
                <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-600">AI Control Plane V1</span>
              </div>
              <h1 className="mt-3 flex items-center gap-3 text-3xl font-black tracking-[-0.04em] text-[#101828] md:text-4xl">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-red-600/25"><BrainCircuit size={24} /></span>
                Cérebro Automotivo
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">Centro Master de inteligência automotiva. Nesta primeira integração real, o Cérebro observa a operação da plataforma de I.A.; inteligência de mercado, catálogo e aprendizados globais serão conectados em módulos próprios posteriormente.</p>
            </div>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-black text-zinc-700 shadow-sm disabled:opacity-60">
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'Atualizando...' : 'Atualizar snapshot'}
            </button>
          </header>

          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <ShieldCheck className="mt-0.5 shrink-0" size={18} />
            <div><p className="font-black">Modo somente leitura</p><p className="mt-0.5 text-xs leading-5 text-emerald-800">{notice}</p></div>
          </div>

          <section className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <Kpi label="Claims observados" value={number(global?.claims)} helper={`${number(global?.completed)} concluídos · ${number(global?.failed)} falhas`} icon={<Activity size={20} />} />
            <Kpi label="Tokens registrados" value={number(global?.tokens.total)} helper={`${number(global?.tokens.input)} entrada · ${number(global?.tokens.output)} saída`} icon={<Database size={20} />} />
            <Kpi label="Execuções externas" value={number(global?.external_executions)} helper={`${number(global?.human_blocks)} bloqueios por humano`} icon={<ShieldCheck size={20} />} />
            <Kpi label="Áudio AUTOCAR" value={`${number(global?.audio.inbound)} / ${number(global?.audio.outbound)}`} helper="entrada / saída" icon={<Volume2 size={20} />} />
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5">
              <Card title="Model Router — operação real" subtitle="Registro central compartilhado pela plataforma de I.A.">
                <div className="grid gap-3 md:grid-cols-3">
                  {Object.entries(lanes).map(([lane, item]) => (
                    <div key={lane} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex items-center justify-between gap-3"><strong className="text-lg uppercase text-zinc-950">{lane}</strong><CircleGauge size={18} className="text-red-600" /></div>
                      <p className="mt-2 text-sm font-black text-zinc-800">{item.model}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.role}</p>
                      <p className="mt-4 text-2xl font-black text-zinc-950">{number(global?.lane_calls?.[lane] || 0)}</p>
                      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">chamadas registradas</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">Escaladas seletivas para Sol: <strong className="text-zinc-950">{number(global?.sol_escalations)}</strong> · Latência média dos claims: <strong className="text-zinc-950">{ms(global?.average_claim_latency_ms)}</strong>.</div>
              </Card>

              <Card title="Agentes por loja" subtitle="Estado Master e telemetria observada no runtime AUTOCAR.">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead><tr className="border-b border-zinc-200 text-zinc-400"><th className="pb-3">Loja</th><th className="pb-3">Agente</th><th className="pb-3">Modo</th><th className="pb-3">Claims</th><th className="pb-3">Tokens</th><th className="pb-3">Execuções</th><th className="pb-3">Humano</th></tr></thead>
                    <tbody>{stores.map((store) => <tr key={store.id} className="border-b border-zinc-100 last:border-0"><td className="py-3"><strong className="text-zinc-900">{store.store_name}</strong><div className="mt-1 text-[10px] text-zinc-400">{[store.city, store.state].filter(Boolean).join(' / ') || store.slug || '—'}</div></td><td className="py-3">{store.agent?.master_enabled ? <span className="font-black text-emerald-700">HABILITADO</span> : <span className="font-black text-zinc-400">DESLIGADO</span>}</td><td className="py-3 font-black text-zinc-700">{modeLabel(store.agent?.mode)}</td><td className="py-3">{number(store.telemetry?.claims)}</td><td className="py-3">{number(store.telemetry?.tokens.total)}</td><td className="py-3">{number(store.telemetry?.external_executions)}</td><td className="py-3">{number(store.telemetry?.human_blocks)}</td></tr>)}</tbody>
                  </table>
                </div>
              </Card>
            </div>

            <Card title="AURA" subtitle="Interface inteligente do Master sobre o snapshot real do Control Plane.">
              <div className="flex items-center gap-3 rounded-2xl bg-zinc-950 p-4 text-white"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600"><Sparkles size={20} /></span><div><p className="font-black">AURA · Master only</p><p className="text-xs text-zinc-400">Somente leitura nesta fase</p></div></div>
              <div className="mt-4 h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                {messages.map((message) => <div key={message.id} className={`flex ${message.author === 'master' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-5 ${message.author === 'master' ? 'bg-red-600 text-white' : 'border border-zinc-200 bg-white text-zinc-700'}`}><div className="mb-1 flex items-center gap-2 font-black">{message.author === 'aura' ? <><Bot size={14} /> AURA</> : <><MessageCircle size={14} /> Master</>}</div>{message.text}</div></div>)}
              </div>
              <form onSubmit={askAura} className="mt-4 flex gap-2"><input value={auraInput} onChange={(event) => setAuraInput(event.target.value)} className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-300" placeholder="Ex.: Quantos tokens? Como está a A4?" /><button type="submit" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white"><Send size={17} /></button></form>
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800"><CheckCircle2 size={14} className="mr-1 inline" />AURA não executa comandos, não altera CRM e não modifica políticas neste V1.</div>
            </Card>
          </section>
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: React.ReactNode }) {
  return <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">{icon}</span><Store size={15} className="text-zinc-300" /></div><p className="mt-4 text-xs font-black uppercase tracking-wider text-zinc-400">{label}</p><p className="mt-2 text-3xl font-black tracking-tight text-zinc-950">{value}</p><p className="mt-2 text-xs text-zinc-500">{helper}</p></article>;
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="mb-5"><h2 className="text-xl font-black text-zinc-950">{title}</h2><p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p></div>{children}</section>;
}
