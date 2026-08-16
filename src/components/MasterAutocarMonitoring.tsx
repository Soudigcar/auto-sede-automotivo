'use client';

import { Activity, AudioLines, Bot, BrainCircuit, Gauge, ShieldCheck, Sparkles, TriangleAlert, Zap } from 'lucide-react';

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

export function MasterAutocarMonitoring({ telemetry, modelRegistry }: { telemetry?: Telemetry | null; modelRegistry?: ModelRegistry | null }) {
  const global = telemetry?.global || {};
  const lanes = modelRegistry?.lanes || {};
  const modelRows = [
    ['Luna', lanes.luna?.model || 'gpt-5.6-luna', global.lane_calls?.luna || 0, 'Estruturação e planejamento'],
    ['Terra', lanes.terra?.model || 'gpt-5.6-terra', global.lane_calls?.terra || 0, 'Conversa comercial principal'],
    ['Sol', lanes.sol?.model || 'gpt-5.6-sol', global.lane_calls?.sol || 0, 'Escalada seletiva']
  ];

  return <section className="mt-6 space-y-5">
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 md:flex-row md:items-center md:justify-between">
      <div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700"><ShieldCheck size={14}/> AI Control Plane V1</p><h2 className="mt-2 text-2xl font-black text-zinc-950">Monitoramento real da AUTOCAR</h2><p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-zinc-600">Leitura consolidada dos claims do SAFE CORE. Esta tela não executa ações na operação e não altera o CRM.</p></div>
      <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-right"><p className="text-[9px] font-black uppercase text-zinc-400">Fonte</p><p className="mt-1 text-xs font-black text-zinc-800">{telemetry?.source || 'ai_runtime_message_claims'}</p></div>
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

    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Bot size={18} className="text-red-600"/><h3 className="text-lg font-black text-zinc-950">Model Router</h3></div>
        <p className="mt-2 text-xs font-bold text-zinc-500">O roteamento agora é servido pela fundação compartilhada da Plataforma de I.A., mantendo o contrato da AUTOCAR.</p>
        <div className="mt-4 space-y-2">{modelRows.map(([lane, model, calls, role]) => <div key={String(lane)} className="grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-[90px_1fr_auto] md:items-center"><div><p className="text-sm font-black text-zinc-950">{lane}</p><p className="text-[9px] font-black uppercase text-zinc-400">{role}</p></div><code className="text-xs font-bold text-zinc-600">{model}</code><span className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-zinc-800">{number(calls)} chamadas</span></div>)}</div>
        <p className="mt-3 text-[10px] font-bold text-zinc-500">Escaladas para Sol registradas: <strong className="text-zinc-900">{number(global.sol_escalations)}</strong>.</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Sparkles size={18} className="text-red-600"/><h3 className="text-lg font-black text-zinc-950">Custos e uso</h3></div>
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black text-amber-900">Custo estimado ainda não configurado</p><p className="mt-2 text-[11px] font-bold leading-5 text-amber-800">O V1 exibe apenas consumo comprovado pelos claims. Não atribuímos preço por token enquanto a tabela de preços/modelos não estiver versionada e governada pelo Master.</p></div>
        <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-zinc-50 p-4"><p className="text-[9px] font-black uppercase text-zinc-400">Entrada</p><p className="mt-1 text-xl font-black">{number(global.tokens?.input)}</p></div><div className="rounded-xl bg-zinc-50 p-4"><p className="text-[9px] font-black uppercase text-zinc-400">Saída</p><p className="mt-1 text-xl font-black">{number(global.tokens?.output)}</p></div></div>
      </div>
    </div>
  </section>;
}
