'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Clock3, Play, ShieldCheck, SlidersHorizontal, Sparkles, Store, Workflow } from 'lucide-react';
import { defaultFollowUpConfigV2, validateFollowUpConfigV2, type FollowUpConfigV2, type FollowUpMode, type FollowUpScenarioKey } from '@/lib/server/autocar/smartFollowUpV2';

type StoreRow = { id: string; store_name: string };
type DelayUnit = 'minutes' | 'hours' | 'days';

type Simulation = {
  scenario: string;
  due: string;
  mode: string;
  decision: 'would_prepare' | 'blocked';
  reason: string;
};

const unitMinutes: Record<DelayUnit, number> = { minutes: 1, hours: 60, days: 1440 };
const emptyPerformance = { eligible: 0, prepared: 0, sent: 0, replied: 0, recovered: 0, appointments: 0, showedUp: 0, sales: 0 };

function addMinutes(base: Date, minutes: number) { return new Date(base.getTime() + minutes * 60_000); }
function timeLabel(value: Date) { return value.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function timingParts(delayMinutes: number): { amount: number; unit: DelayUnit } {
  const absolute = Math.max(1, Math.abs(delayMinutes));
  if (absolute % 1440 === 0) return { amount: absolute / 1440, unit: 'days' };
  if (absolute % 60 === 0) return { amount: absolute / 60, unit: 'hours' };
  return { amount: absolute, unit: 'minutes' };
}
function timingLabel(delayMinutes: number, key: FollowUpScenarioKey) {
  const { amount, unit } = timingParts(delayMinutes);
  const unitLabel = unit === 'days' ? (amount === 1 ? 'dia' : 'dias') : unit === 'hours' ? (amount === 1 ? 'hora' : 'horas') : (amount === 1 ? 'minuto' : 'minutos');
  return `${amount} ${unitLabel} ${key === 'visit_confirmation' ? 'antes' : 'depois'}`;
}
function Metric({ label, value, suffix = '' }: { label: string; value: number | string; suffix?: string }) {
  return <div className="rounded-xl border border-zinc-200 bg-white p-3"><p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">{label}</p><p className="mt-1 text-xl font-black text-zinc-950">{value}{suffix}</p></div>;
}

export function MasterAutocarFollowUpV2({ stores = [] }: { stores?: StoreRow[] }) {
  const [config, setConfig] = useState<FollowUpConfigV2>(() => structuredClone(defaultFollowUpConfigV2));
  const [storeId, setStoreId] = useState(stores[0]?.id || '');
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [performanceKey, setPerformanceKey] = useState<FollowUpScenarioKey | null>(null);
  const [performancePeriod, setPerformancePeriod] = useState('30');
  const validation = useMemo(() => validateFollowUpConfigV2(config), [config]);
  const selectedStore = stores.find((row) => row.id === storeId);

  function setGlobal<K extends keyof FollowUpConfigV2['global']>(key: K, value: FollowUpConfigV2['global'][K]) {
    setConfig((current) => ({ ...current, global: { ...current.global, [key]: value } }));
  }
  function setScenarioEnabled(key: string, enabled: boolean) {
    setConfig((current) => ({ ...current, scenarios: current.scenarios.map((scenario) => scenario.key === key ? { ...scenario, enabled } : scenario) }));
  }
  function setAttributionWindow(scenarioKey: FollowUpScenarioKey, amount: number, unit: DelayUnit) {
    const safeAmount = Math.max(1, Number.isFinite(amount) ? amount : 1);
    const minutes = safeAmount * unitMinutes[unit];
    setConfig((current) => ({ ...current, scenarios: current.scenarios.map((scenario) => scenario.key === scenarioKey ? { ...scenario, attributionWindowMinutes: minutes } : scenario) }));
  }
  function setStepEnabled(scenarioKey: FollowUpScenarioKey, stepId: string, enabled: boolean) {
    setConfig((current) => ({ ...current, scenarios: current.scenarios.map((scenario) => scenario.key === scenarioKey ? { ...scenario, steps: scenario.steps.map((step) => step.id === stepId ? { ...step, enabled } : step) } : scenario) }));
  }
  function setStepTiming(scenarioKey: FollowUpScenarioKey, stepId: string, amount: number, unit: DelayUnit) {
    const safeAmount = Math.max(1, Number.isFinite(amount) ? amount : 1);
    const delayMinutes = (scenarioKey === 'visit_confirmation' ? -1 : 1) * safeAmount * unitMinutes[unit];
    setConfig((current) => ({ ...current, scenarios: current.scenarios.map((scenario) => scenario.key === scenarioKey ? { ...scenario, steps: scenario.steps.map((step) => step.id === stepId ? { ...step, delayMinutes, label: timingLabel(delayMinutes, scenarioKey) } : step) } : scenario) }));
  }
  function simulate(key: string) {
    const scenario = config.scenarios.find((row) => row.key === key);
    if (!scenario) return;
    if (!config.global.enabled) return setSimulation({ scenario: scenario.title, due: '—', mode: config.global.mode, decision: 'blocked', reason: 'Follow-up global está desligado no rascunho V2.' });
    if (config.global.mode === 'off') return setSimulation({ scenario: scenario.title, due: '—', mode: config.global.mode, decision: 'blocked', reason: 'Modo global OFF impede qualquer preparação futura.' });
    if (!scenario.enabled) return setSimulation({ scenario: scenario.title, due: '—', mode: config.global.mode, decision: 'blocked', reason: 'Jornada desabilitada no rascunho V2.' });
    if (!validation.ok) return setSimulation({ scenario: scenario.title, due: '—', mode: config.global.mode, decision: 'blocked', reason: validation.errors[0] || 'Configuração inválida.' });
    const first = scenario.steps.find((step) => step.enabled);
    const due = scenario.key === 'callback_requested' ? 'data/hora explícita pedida pelo cliente' : first ? scenario.key === 'visit_confirmation' ? timingLabel(first.delayMinutes, scenario.key) : timeLabel(addMinutes(new Date(), Math.max(first.delayMinutes, 1))) : 'evento contextual';
    setSimulation({ scenario: scenario.title, due, mode: config.global.mode, decision: 'would_prepare', reason: config.global.mode === 'copilot' ? 'A AUTOCAR prepararia uma sugestão para aprovação humana. Nenhuma mensagem é enviada nesta versão.' : 'A jornada seria elegível para preparação em dry-run. O V2 desta branch não possui caminho de envio externo.' });
  }

  return <section className="mt-6 space-y-5">
    <div className="premium-card p-5 md:p-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="flex items-start gap-3"><span className="rounded-xl bg-zinc-950 p-2.5 text-white"><Workflow size={19}/></span><div><h2 className="text-xl font-black">Smart Follow-up V2</h2><p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-zinc-500">Camada de configuração, jornadas e atribuição em modo seguro. Esta tela não cria cron, não habilita create_follow_up e não possui sender de WhatsApp.</p></div></div><span className="rounded-full bg-red-50 px-3 py-2 text-[10px] font-black uppercase text-red-700">DRY-RUN · SEM ENVIO</span></div><div className="mt-5 grid gap-3 md:grid-cols-3"><label className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs font-black">Status global<select value={config.global.enabled ? 'on' : 'off'} onChange={(event) => setGlobal('enabled', event.target.value === 'on')} className="premium-input mt-2"><option value="off">DESATIVADO</option><option value="on">ATIVADO NO RASCUNHO</option></select></label><label className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs font-black">Modo<select value={config.global.mode} onChange={(event) => setGlobal('mode', event.target.value as FollowUpMode)} className="premium-input mt-2"><option value="off">OFF</option><option value="copilot">COPILOT</option><option value="autopilot">AUTOPILOT (simulado)</option></select></label><label className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs font-black">Loja para simulação<select value={storeId} onChange={(event) => setStoreId(event.target.value)} className="premium-input mt-2"><option value="">Nenhuma loja</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select></label></div></div>

    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="premium-card p-5"><div className="flex items-center gap-2"><SlidersHorizontal size={18} className="text-red-600"/><h3 className="text-lg font-black">Teto global Master</h3></div><p className="mt-1 text-xs font-bold leading-5 text-zinc-500">A loja poderá ser mais restritiva, nunca mais permissiva que estes limites.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black">Início<input type="time" value={config.global.allowedStart} onChange={(event) => setGlobal('allowedStart', event.target.value)} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Fim<input type="time" value={config.global.allowedEnd} onChange={(event) => setGlobal('allowedEnd', event.target.value)} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Máx. por lead/dia<input type="number" min={1} max={5} value={config.global.maxPerLeadPerDay} onChange={(event) => setGlobal('maxPerLeadPerDay', Number(event.target.value))} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Máx. por sequência<input type="number" min={1} max={10} value={config.global.maxPerSequence} onChange={(event) => setGlobal('maxPerSequence', Number(event.target.value))} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Duração máx. (dias)<input type="number" min={1} max={30} value={config.global.maxSequenceDays} onChange={(event) => setGlobal('maxSequenceDays', Number(event.target.value))} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Intervalo mínimo (min)<input type="number" min={15} value={config.global.minIntervalMinutes} onChange={(event) => setGlobal('minIntervalMinutes', Number(event.target.value))} className="premium-input mt-1.5"/></label></div><div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[11px] font-bold leading-5 text-emerald-800"><ShieldCheck size={15} className="mr-2 inline"/>Proteções obrigatórias: cancelar em resposta do cliente, venda, takeover humano e conversa fechada. O V2 não permite desligar essas quatro proteções.</div>{!validation.ok ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-900">{validation.errors.join(' · ')}</div> : null}</div>

      <div className="premium-card p-5"><div className="flex items-center gap-2"><Workflow size={18} className="text-red-600"/><h3 className="text-lg font-black">Jornadas</h3></div><p className="mt-1 text-xs font-bold text-zinc-500">Cada etapa e cada janela de atribuição podem ser ajustadas no rascunho.</p><div className="mt-4 space-y-3">{config.scenarios.map((scenario) => { const performanceOpen = performanceKey === scenario.key; const attribution = timingParts(scenario.attributionWindowMinutes); return <div key={scenario.key} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm font-black">{scenario.title}</strong><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${scenario.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>{scenario.enabled ? 'ativa no rascunho' : 'desativada'}</span></div><p className="mt-1 text-[11px] font-bold leading-5 text-zinc-500">{scenario.description}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setScenarioEnabled(scenario.key, !scenario.enabled)} className="premium-button-secondary">{scenario.enabled ? 'Desativar' : 'Ativar'}</button><button type="button" onClick={() => simulate(scenario.key)} className="premium-button-secondary"><Play size={14}/>Simular</button><button type="button" onClick={() => setPerformanceKey(performanceOpen ? null : scenario.key)} className="premium-button-secondary"><BarChart3 size={14}/>Performance</button></div></div>
        {scenario.key === 'callback_requested' ? <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[11px] font-bold leading-5 text-sky-800"><Clock3 size={13} className="mr-2 inline"/>Nesta jornada não existe atraso fixo: a AUTOCAR deve respeitar a data e hora explicitamente pedidas pelo cliente.</div> : <div className="mt-3 space-y-2">{scenario.steps.map((step, index) => { const timing = timingParts(step.delayMinutes); return <div key={step.id} className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-[auto_1fr_110px_130px] sm:items-end"><label className="flex items-center gap-2 text-[10px] font-black text-zinc-600"><input type="checkbox" checked={step.enabled} onChange={(event) => setStepEnabled(scenario.key, step.id, event.target.checked)}/>Etapa {index + 1}</label><label className="text-[9px] font-black uppercase text-zinc-400">Tempo<input type="number" min={1} value={timing.amount} onChange={(event) => setStepTiming(scenario.key, step.id, Number(event.target.value), timing.unit)} className="premium-input mt-1 text-xs"/></label><label className="text-[9px] font-black uppercase text-zinc-400">Unidade<select value={timing.unit} onChange={(event) => setStepTiming(scenario.key, step.id, timing.amount, event.target.value as DelayUnit)} className="premium-input mt-1 text-xs"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></label><div className="rounded-lg bg-zinc-50 px-3 py-2 text-[10px] font-black text-zinc-600"><Clock3 size={11} className="mr-1 inline"/>{step.enabled ? timingLabel(step.delayMinutes, scenario.key) : 'etapa desativada'}</div></div>; })}</div>}
        {performanceOpen ? <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-950 p-4 text-white"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2"><BarChart3 size={17} className="text-red-400"/><strong className="text-sm">Dashboard · {scenario.title}</strong></div><p className="mt-1 text-[10px] font-bold leading-4 text-zinc-400">Performance real será calculada por jornada e loja. Enquanto não existe sender, os indicadores permanecem zerados e não simulam resultado.</p></div><label className="text-[9px] font-black uppercase text-zinc-400">Período<select value={performancePeriod} onChange={(event) => setPerformancePeriod(event.target.value)} className="ml-2 rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-[10px] text-white"><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select></label></div>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Janela de atribuição da jornada</p><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end"><label className="text-[9px] font-black uppercase text-zinc-400">Quantidade<input type="number" min={1} value={attribution.amount} onChange={(event) => setAttributionWindow(scenario.key, Number(event.target.value), attribution.unit)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs text-white"/></label><label className="text-[9px] font-black uppercase text-zinc-400">Unidade<select value={attribution.unit} onChange={(event) => setAttributionWindow(scenario.key, attribution.amount, event.target.value as DelayUnit)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs text-white"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></label><div className="rounded-lg bg-white/10 px-3 py-2 text-[10px] font-black text-zinc-200">Resposta só é atribuída se ocorrer dentro desta janela.</div></div></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Leads elegíveis" value={emptyPerformance.eligible}/><Metric label="Follow-ups preparados" value={emptyPerformance.prepared}/><Metric label="Enviados" value={emptyPerformance.sent}/><Metric label="Respostas" value={emptyPerformance.replied}/><Metric label="Conversas recuperadas" value={emptyPerformance.recovered}/><Metric label="Taxa de recuperação" value={0} suffix="%"/><Metric label="Agendamentos" value={emptyPerformance.appointments}/><Metric label="Comparecimentos" value={emptyPerformance.showedUp}/><Metric label="Vendas atribuídas" value={emptyPerformance.sales}/></div><div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-[10px] font-bold leading-5 text-zinc-300"><strong className="text-white">Regra oficial do V2:</strong> “respondeu” e “recuperou” são métricas diferentes. Recuperada = resposta dentro da janela de atribuição + retorno comprovado a uma etapa comercial ativa. Agendamento, comparecimento e venda ficam ligados à mesma jornada por eventos de atribuição.</div></div> : null}
      </div>; })}</div></div>
    </div>

    <div className="premium-card p-5"><div className="flex items-center gap-2"><Sparkles size={18} className="text-red-600"/><h3 className="text-lg font-black">Simulador V2</h3></div>{!simulation ? <p className="mt-3 text-xs font-bold text-zinc-500">Ative uma jornada no rascunho e clique em Simular. Nenhuma configuração é persistida e nenhuma ação externa é executada.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl bg-zinc-50 p-4"><p className="text-[9px] font-black uppercase text-zinc-400">Jornada</p><p className="mt-1 text-sm font-black">{simulation.scenario}</p></div><div className="rounded-xl bg-zinc-50 p-4"><p className="text-[9px] font-black uppercase text-zinc-400">Loja</p><p className="mt-1 text-sm font-black">{selectedStore?.store_name || 'Simulação global'}</p></div><div className="rounded-xl bg-zinc-50 p-4"><p className="text-[9px] font-black uppercase text-zinc-400">Próximo evento</p><p className="mt-1 text-sm font-black">{simulation.due}</p></div><div className="rounded-xl bg-zinc-950 p-4 text-white"><p className="text-[9px] font-black uppercase text-zinc-400">Decisão</p><p className="mt-1 text-sm font-black uppercase">{simulation.decision.replaceAll('_',' ')}</p></div><div className="md:col-span-2 xl:col-span-4 rounded-xl border border-zinc-200 bg-white p-4 text-xs font-bold leading-5 text-zinc-600"><Store size={14} className="mr-2 inline"/>{simulation.reason}<br/><span className="mt-2 inline-block font-black text-red-600">Execução externa: NÃO</span></div></div>}</div>
  </section>;
}
