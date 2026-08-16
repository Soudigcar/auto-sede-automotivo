'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, AudioLines, Bot, BrainCircuit, Building2, Gauge, Loader2, ShieldCheck, Sparkles, TriangleAlert, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Telemetry = {
  source?: string;
  sample_limit?: number;
  pricing?: { status?: string; estimated_cost?: number | null };
  global?: {
    claims?: number;
    completed?: number;
    skipped?: number;
    failed?: number;
    external_executions?: number;
    human_blocks?: number;
    tokens?: { input?: number; output?: number; total?: number };
    model_calls?: Record<string, number>;
    lane_calls?: Record<string, number>;
    sol_escalations?: number;
    audio?: { inbound?: number; outbound?: number };
    average_claim_latency_ms?: number | null;
  };
};

type ModelRegistry = {
  version?: string;
  lanes?: Record<string, { model?: string; role?: string }>;
};

type GovernanceSnapshot = {
  generated_at?: string;
  summary?: {
    stores?: number;
    enabled_agents?: number;
    autopilot_agents?: number;
    stores_with_telemetry?: number;
  };
  stores?: Array<{
    id: string;
    store_name: string;
    slug?: string | null;
    city?: string | null;
    state?: string | null;
    agent?: {
      status?: string;
      mode?: string;
      master_enabled?: boolean;
      master_autopilot_allowed?: boolean;
      store_selected_mode?: string;
      updated_at?: string;
    } | null;
    telemetry?: { claims?: number } | null;
  }>;
  platform?: {
    version?: string;
    environment?: string;
    execution_policy?: string;
  };
};

function number(value: unknown) {
  return Math.max(0, Number(value || 0)).toLocaleString('pt-BR');
}

function milliseconds(value: unknown) {
  const ms = Number(value || 0);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

function Metric({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">{label}</p><p className="mt-2 text-3xl font-black tracking-tight text-zinc-950">{value}</p></div><span className="rounded-xl bg-zinc-950 p-2.5 text-white">{icon}</span></div>
    <p className="mt-3 text-[11px] font-bold leading-5 text-zinc-500">{helper}</p>
  </div>;
}

function StatePill({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{active ? activeLabel : inactiveLabel}</span>;
}

export function MasterAutocarMonitoring({ telemetry, modelRegistry }: { telemetry?: Telemetry | null; modelRegistry?: ModelRegistry | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [governance, setGovernance] = useState<GovernanceSnapshot | null>(null);
  const [governanceLoading, setGovernanceLoading] = useState(true);
  const [governanceError, setGovernanceError] = useState('');
  const global = telemetry?.global || {};
  const lanes = modelRegistry?.lanes || {};
  const modelRows = [
    ['Luna', lanes.luna?.model || 'gpt-5.6-luna', global.lane_calls?.luna || 0, 'Estruturação e planejamento'],
    ['Terra', lanes.terra?.model || 'gpt-5.6-terra', global.lane_calls?.terra || 0, 'Conversa comercial principal'],
    ['Sol', lanes.sol?.model || 'gpt-5.6-sol', global.lane_calls?.sol || 0, 'Escalada seletiva']
  ];

  useEffect(() => {
    let cancelled = false;
    async function loadGovernance() {
      setGovernanceLoading(true);
      setGovernanceError('');
      try {
        const { data } = await supabase.auth.getSession();
        const access = data.session?.access_token;
        if (!access) throw new Error('Sessão Master expirada.');
        const response = await fetch('/api/master/ai-platform', {
          headers: { Authorization: `Bearer ${access}` },
          cache: 'no-store'
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Não foi possível carregar a governança da Plataforma de I.A.');
        if (!cancelled) setGovernance(body);
      } catch (error: any) {
        if (!cancelled) setGovernanceError(error?.message || 'Não foi possível carregar a governança da Plataforma de I.A.');
      } finally {
        if (!cancelled) setGovernanceLoading(false);
      }
    }
    void loadGovernance();
    return () => { cancelled = true; };
  }, [supabase]);

  const governedStores = (governance?.stores || []).filter((store) => store.agent);

  return <section className="mt-6 space-y-5">
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 md:flex-row md:items-center md:justify-between">
      <div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700"><ShieldCheck size={14}/> AI Control Plane V1</p><h2 className="mt-2 text-2xl font-black text-zinc-950">Governança, modelos e telemetria</h2><p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-zinc-600">O Master enxerga o estado real da AUTOCAR e do Model Router. Esta área é somente leitura nesta fase e não altera CRM, agentes ou providers.</p></div>
      <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-right"><p className="text-[9px] font-black uppercase text-zinc-400">Control Plane</p><p className="mt-1 text-xs font-black text-zinc-800">{governance?.platform?.version || 'ai-control-plane-v1'}</p><p className="mt-1 text-[9px] font-bold text-zinc-400">{governance?.platform?.environment || 'autocar-dev'}</p></div>
    </div>

    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2"><Building2 size={18} className="text-red-600"/><h3 className="text-lg font-black text-zinc-950">Governança Master por loja</h3></div><p className="mt-2 text-xs font-bold text-zinc-500">A liberação da AUTOCAR e a permissão de AUTOPILOT continuam sob autoridade do Master.</p></div>{governanceLoading?<span className="inline-flex items-center gap-2 text-xs font-black text-zinc-500"><Loader2 size={15} className="animate-spin"/>Carregando snapshot...</span>:null}</div>
      {governanceError?<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">{governanceError}</div>:null}
      {!governanceLoading&&!governanceError?<>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Lojas do SaaS" value={number(governance?.summary?.stores)} helper="Lojas ativas observadas pelo snapshot Master." icon={<Building2 size={19}/>} /><Metric label="Agentes liberados" value={number(governance?.summary?.enabled_agents)} helper="AUTOCAR habilitadas pelo Master no ambiente de I.A." icon={<Bot size={19}/>} /><Metric label="Em AUTOPILOT" value={number(governance?.summary?.autopilot_agents)} helper="Agentes cujo modo efetivo está em AUTOPILOT." icon={<Zap size={19}/>} /><Metric label="Com telemetria" value={number(governance?.summary?.stores_with_telemetry)} helper="Lojas que já possuem claims observáveis no Control Plane." icon={<Activity size={19}/>} /></div>
        <div className="mt-4 space-y-2">{governedStores.length?governedStores.map((store)=><div key={store.id} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center"><div className="min-w-0"><p className="truncate text-sm font-black text-zinc-950">{store.store_name}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">{[store.city,store.state].filter(Boolean).join(' / ')||store.slug||'Loja'} · {number(store.telemetry?.claims)} claims</p></div><StatePill active={store.agent?.master_enabled===true} activeLabel="AUTOCAR liberada" inactiveLabel="AUTOCAR bloqueada"/><StatePill active={store.agent?.master_autopilot_allowed===true} activeLabel="Autopilot permitido" inactiveLabel="Autopilot bloqueado"/><span className="rounded-full bg-white px-3 py-1 text-[9px] font-black uppercase text-zinc-700">Modo: {String(store.agent?.mode||store.agent?.store_selected_mode||'off')}</span></div>):<div className="rounded-xl border border-dashed border-zinc-300 p-5 text-center text-xs font-bold text-zinc-400">Nenhum agente AUTOCAR configurado no snapshot atual.</div>}</div>
      </>:null}
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Bot size={18} className="text-red-600"/><h3 className="text-lg font-black text-zinc-950">Model Router compartilhado</h3></div>
        <p className="mt-2 text-xs font-bold text-zinc-500">Os modelos exibidos são os modelos resolvidos pelo registry central no ambiente atual. A AUTOCAR consome esse contrato sem controlar modelos diretamente.</p>
        <div className="mt-4 space-y-2">{modelRows.map(([lane, model, calls, role]) => <div key={String(lane)} className="grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-[90px_1fr_auto] md:items-center"><div><p className="text-sm font-black text-zinc-950">{lane}</p><p className="text-[9px] font-black uppercase text-zinc-400">{role}</p></div><code className="text-xs font-bold text-zinc-600">{model}</code><span className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-zinc-800">{number(calls)} chamadas</span></div>)}</div>
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] font-bold leading-5 text-blue-800">A edição de modelos ainda não está exposta no painel. Mudanças de roteamento continuam exigindo alteração versionada e validação técnica.</div>
        <p className="mt-3 text-[10px] font-bold text-zinc-500">Escaladas para Sol registradas: <strong className="text-zinc-900">{number(global.sol_escalations)}</strong>.</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Sparkles size={18} className="text-red-600"/><h3 className="text-lg font-black text-zinc-950">Custos e uso</h3></div>
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black text-amber-900">Custo estimado ainda não configurado</p><p className="mt-2 text-[11px] font-bold leading-5 text-amber-800">O V1 exibe apenas consumo comprovado pelos claims. Não atribuímos preço por token enquanto a tabela de preços/modelos não estiver versionada e governada pelo Master.</p></div>
        <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-zinc-50 p-4"><p className="text-[9px] font-black uppercase text-zinc-400">Entrada</p><p className="mt-1 text-xl font-black">{number(global.tokens?.input)}</p></div><div className="rounded-xl bg-zinc-50 p-4"><p className="text-[9px] font-black uppercase text-zinc-400">Saída</p><p className="mt-1 text-xl font-black">{number(global.tokens?.output)}</p></div></div>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Claims observados" value={number(global.claims)} helper={`${number(global.completed)} concluídos · ${number(global.skipped)} ignorados`} icon={<Activity size={19}/>} />
      <Metric label="Tokens registrados" value={number(global.tokens?.total)} helper={`${number(global.tokens?.input)} entrada · ${number(global.tokens?.output)} saída`} icon={<BrainCircuit size={19}/>} />
      <Metric label="Execuções externas" value={number(global.external_executions)} helper="Ações que efetivamente chegaram ao provider após os gates de segurança." icon={<Zap size={19}/>} />
      <Metric label="Latência média do claim" value={milliseconds(global.average_claim_latency_ms)} helper={`Amostra limitada aos ${number(telemetry?.sample_limit || 500)} claims mais recentes.`} icon={<Gauge size={19}/>} />
      <Metric label="Áudios recebidos" value={number(global.audio?.inbound)} helper="Mensagens de áudio processadas pelo fluxo AUTOCAR." icon={<AudioLines size={19}/>} />
      <Metric label="Áudios enviados" value={number(global.audio?.outbound)} helper="Respostas em áudio com execução externa registrada." icon={<AudioLines size={19}/>} />
      <Metric label="Bloqueios humanos" value={number(global.human_blocks)} helper="Mensagens em que o takeover humano impediu a resposta automática." icon={<ShieldCheck size={19}/>} />
      <Metric label="Falhas registradas" value={number(global.failed)} helper="Claims que terminaram com status failed na amostra atual." icon={<TriangleAlert size={19}/>} />
    </div>
  </section>;
}
