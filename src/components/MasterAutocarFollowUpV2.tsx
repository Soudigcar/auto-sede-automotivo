'use client';

import { useMemo, useState } from 'react';
import { Clock3, Play, ShieldCheck, SlidersHorizontal, Sparkles, Store, Workflow } from 'lucide-react';
import { defaultFollowUpConfigV2, validateFollowUpConfigV2, type FollowUpConfigV2, type FollowUpMode } from '@/lib/server/autocar/smartFollowUpV2';

type StoreRow = { id: string; store_name: string };

type Simulation = {
  scenario: string;
  due: string;
  mode: string;
  decision: 'would_prepare' | 'blocked';
  reason: string;
};

function addMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60_000);
}

function timeLabel(value: Date) {
  return value.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function MasterAutocarFollowUpV2({ stores = [] }: { stores?: StoreRow[] }) {
  const [config, setConfig] = useState<FollowUpConfigV2>(() => structuredClone(defaultFollowUpConfigV2));
  const [storeId, setStoreId] = useState(stores[0]?.id || '');
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const validation = useMemo(() => validateFollowUpConfigV2(config), [config]);
  const selectedStore = stores.find((row) => row.id === storeId);

  function setGlobal<K extends keyof FollowUpConfigV2['global']>(key: K, value: FollowUpConfigV2['global'][K]) {
    setConfig((current) => ({ ...current, global: { ...current.global, [key]: value } }));
  }

  function setScenarioEnabled(key: string, enabled: boolean) {
    setConfig((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) => scenario.key === key ? { ...scenario, enabled } : scenario)
    }));
  }

  function simulate(key: string) {
    const scenario = config.scenarios.find((row) => row.key === key);
    if (!scenario) return;
    if (!config.global.enabled) {
      setSimulation({ scenario: scenario.title, due: '—', mode: config.global.mode, decision: 'blocked', reason: 'Follow-up global está desligado no rascunho V2.' });
      return;
    }
    if (config.global.mode === 'off') {
      setSimulation({ scenario: scenario.title, due: '—', mode: config.global.mode, decision: 'blocked', reason: 'Modo global OFF impede qualquer preparação futura.' });
      return;
    }
    if (!scenario.enabled) {
      setSimulation({ scenario: scenario.title, due: '—', mode: config.global.mode, decision: 'blocked', reason: 'Jornada desabilitada no rascunho V2.' });
      return;
    }
    if (!validation.ok) {
      setSimulation({ scenario: scenario.title, due: '—', mode: config.global.mode, decision: 'blocked', reason: validation.errors[0] || 'Configuração inválida.' });
      return;
    }
    const first = scenario.steps.find((step) => step.enabled);
    const due = scenario.key === 'callback_requested' ? 'horário explícito pedido pelo cliente' : first ? timeLabel(addMinutes(new Date(), Math.max(first.delayMinutes, 1))) : 'evento contextual';
    setSimulation({
      scenario: scenario.title,
      due,
      mode: config.global.mode,
      decision: 'would_prepare',
      reason: config.global.mode === 'copilot'
        ? 'A AUTOCAR prepararia uma sugestão para aprovação humana. Nenhuma mensagem é enviada nesta versão.'
        : 'A jornada seria elegível para preparação em dry-run. O V2 desta branch não possui caminho de envio externo.'
    });
  }

  return <section className="mt-6 space-y-5">
    <div className="premium-card p-5 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3"><span className="rounded-xl bg-zinc-950 p-2.5 text-white"><Workflow size={19}/></span><div><h2 className="text-xl font-black">Smart Follow-up V2</h2><p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-zinc-500">Camada de configuração e jornadas em modo seguro. Esta tela não cria cron, não habilita create_follow_up e não possui sender de WhatsApp.</p></div></div>
        <span className="rounded-full bg-red-50 px-3 py-2 text-[10px] font-black uppercase text-red-700">DRY-RUN · SEM ENVIO</span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <label className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs font-black">Status global<select value={config.global.enabled ? 'on' : 'off'} onChange={(event) => setGlobal('enabled', event.target.value === 'on')} className="premium-input mt-2"><option value="off">DESATIVADO</option><option value="on">ATIVADO NO RASCUNHO</option></select></label>
        <label className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs font-black">Modo<select value={config.global.mode} onChange={(event) => setGlobal('mode', event.target.value as FollowUpMode)} className="premium-input mt-2"><option value="off">OFF</option><option value="copilot">COPILOT</option><option value="autopilot">AUTOPILOT (simulado)</option></select></label>
        <label className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs font-black">Loja para simulação<select value={storeId} onChange={(event) => setStoreId(event.target.value)} className="premium-input mt-2"><option value="">Nenhuma loja</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select></label>
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="premium-card p-5">
        <div className="flex items-center gap-2"><SlidersHorizontal size={18} className="text-red-600"/><h3 className="text-lg font-black">Teto global Master</h3></div>
        <p className="mt-1 text-xs font-bold leading-5 text-zinc-500">A loja poderá ser mais restritiva, nunca mais permissiva que estes limites.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black">Início<input type="time" value={config.global.allowedStart} onChange={(event) => setGlobal('allowedStart', event.target.value)} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Fim<input type="time" value={config.global.allowedEnd} onChange={(event) => setGlobal('allowedEnd', event.target.value)} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Máx. por lead/dia<input type="number" min={1} max={5} value={config.global.maxPerLeadPerDay} onChange={(event) => setGlobal('maxPerLeadPerDay', Number(event.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Máx. por sequência<input type="number" min={1} max={10} value={config.global.maxPerSequence} onChange={(event) => setGlobal('maxPerSequence', Number(event.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Duração máx. (dias)<input type="number" min={1} max={30} value={config.global.maxSequenceDays} onChange={(event) => setGlobal('maxSequenceDays', Number(event.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Intervalo mínimo (min)<input type="number" min={15} value={config.global.minIntervalMinutes} onChange={(event) => setGlobal('minIntervalMinutes', Number(event.target.value))} className="premium-input mt-1.5"/></label>
        </div>
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[11px] font-bold leading-5 text-emerald-800"><ShieldCheck size={15} className="mr-2 inline"/>Proteções obrigatórias: cancelar em resposta do cliente, venda, takeover humano e conversa fechada. O V2 não permite desligar essas quatro proteções.</div>
        {!validation.ok ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-900">{validation.errors.join(' · ')}</div> : null}
      </div>

      <div className="premium-card p-5">
        <div className="flex items-center gap-2"><Workflow size={18} className="text-red-600"/><h3 className="text-lg font-black">Jornadas</h3></div>
        <div className="mt-4 space-y-2">{config.scenarios.map((scenario) => <div key={scenario.key} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2"><strong className="text-sm font-black">{scenario.title}</strong><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${scenario.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>{scenario.enabled ? 'ativa no rascunho' : 'desativada'}</span></div><p className="mt-1 text-[11px] font-bold leading-5 text-zinc-500">{scenario.description}</p>{scenario.steps.length ? <div className="mt-2 flex flex-wrap gap-1.5">{scenario.steps.filter((step) => step.enabled).map((step) => <span key={step.id} className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[9px] font-black text-zinc-600"><Clock3 size={10} className="mr-1 inline"/>{step.label}</span>)}</div> : null}</div><div className="flex gap-2"><button type="button" onClick={() => setScenarioEnabled(scenario.key, !scenario.enabled)} className="premium-button-secondary">{scenario.enabled ? 'Desativar' : 'Ativar'}</button><button type="button" onClick={() => simulate(scenario.key)} className="premium-button-secondary"><Play size={14}/>Simular</button></div></div></div>)}</div>
      </div>
    </div>

    <div className="premium-card p-5">
      <div className="flex items-center gap-2"><Sparkles size={18} className="text-red-600"/><h3 className="text-lg font-black">Simulador V2</h3></div>
      {!simulation ? <p className="mt-3 text-xs font-bold text-zinc-500">Ative uma jornada no rascunho e clique em Simular. Nenhuma configuração é persistida e nenhuma ação externa é executada.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl bg-zinc-50 p-4"><p className="text-[9px] font-black uppercase text-zinc-400">Jornada</p><p className="mt-1 text-sm font-black">{simulation.scenario}</p></div><div className="rounded-xl bg-zinc-50 p-4"><p className="text-[9px] font-black uppercase text-zinc-400">Loja</p><p className="mt-1 text-sm font-black">{selectedStore?.store_name || 'Simulação global'}</p></div><div className="rounded-xl bg-zinc-50 p-4"><p className="text-[9px] font-black uppercase text-zinc-400">Próximo evento</p><p className="mt-1 text-sm font-black">{simulation.due}</p></div><div className="rounded-xl bg-zinc-950 p-4 text-white"><p className="text-[9px] font-black uppercase text-zinc-400">Decisão</p><p className="mt-1 text-sm font-black uppercase">{simulation.decision.replaceAll('_',' ')}</p></div><div className="md:col-span-2 xl:col-span-4 rounded-xl border border-zinc-200 bg-white p-4 text-xs font-bold leading-5 text-zinc-600"><Store size={14} className="mr-2 inline"/>{simulation.reason}<br/><span className="mt-2 inline-block font-black text-red-600">Execução externa: NÃO</span></div></div>}
    </div>
  </section>;
}
