'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Building2, Clock3, RefreshCw, ShieldCheck, SlidersHorizontal, Workflow } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { clampStoreFollowUpSettings, defaultFollowUpConfigV2, validateFollowUpConfigV2, type FollowUpConfigV2, type FollowUpMode, type FollowUpScenarioKey, type FollowUpSettings } from '@/lib/server/autocar/smartFollowUpV2';

type DelayUnit = 'minutes' | 'hours' | 'days';
type StoreRow = { id: string; store_name: string };
type StorePayload = { stores?: StoreRow[]; error?: string };

const unitMinutes: Record<DelayUnit, number> = { minutes: 1, hours: 60, days: 1440 };

function timingParts(minutes: number): { amount: number; unit: DelayUnit } {
  const absolute = Math.max(1, Math.abs(minutes));
  if (absolute % 1440 === 0) return { amount: absolute / 1440, unit: 'days' };
  if (absolute % 60 === 0) return { amount: absolute / 60, unit: 'hours' };
  return { amount: absolute, unit: 'minutes' };
}

function safeStoreDraft(master: FollowUpSettings): FollowUpSettings {
  return {
    ...master,
    enabled: false,
    mode: 'off',
    allowedStart: master.allowedStart < '09:00' ? '09:00' : master.allowedStart,
    allowedEnd: master.allowedEnd > '19:00' ? '19:00' : master.allowedEnd,
    maxPerLeadPerDay: Math.min(master.maxPerLeadPerDay, 1),
    maxPerSequence: Math.min(master.maxPerSequence, 3),
    minIntervalMinutes: Math.max(master.minIntervalMinutes, 60)
  };
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[9px] font-black uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-1 text-xl font-black text-white">{value}</p></div>;
}

export function MasterAutocarFollowUpIntegratedV2() {
  const supabase = useMemo(() => createClient(), []);
  const [config, setConfig] = useState<FollowUpConfigV2>(() => structuredClone(defaultFollowUpConfigV2));
  const [performanceKey, setPerformanceKey] = useState<FollowUpScenarioKey | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState('');
  const [storeDrafts, setStoreDrafts] = useState<Record<string, FollowUpSettings>>({});
  const [loadingStores, setLoadingStores] = useState(false);
  const [storeMessage, setStoreMessage] = useState('');
  const validation = useMemo(() => validateFollowUpConfigV2(config), [config]);

  const loadStores = useCallback(async () => {
    setLoadingStores(true);
    setStoreMessage('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sessão Master expirada.');
      const response = await fetch('/api/master/autocar', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const body = await response.json() as StorePayload;
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar as lojas.');
      const rows = body.stores || [];
      setStores(rows);
      setStoreId((current) => current || rows[0]?.id || '');
    } catch (error: any) {
      setStoreMessage(error?.message || 'Não foi possível carregar as lojas.');
    } finally {
      setLoadingStores(false);
    }
  }, [supabase]);

  useEffect(() => { void loadStores(); }, [loadStores]);

  function setGlobal<K extends keyof FollowUpSettings>(key: K, value: FollowUpSettings[K]) {
    setConfig((current) => ({ ...current, global: { ...current.global, [key]: value } }));
  }

  function toggleScenario(key: FollowUpScenarioKey) {
    setConfig((current) => ({ ...current, scenarios: current.scenarios.map((scenario) => scenario.key === key ? { ...scenario, enabled: !scenario.enabled } : scenario) }));
  }

  function changeStep(key: FollowUpScenarioKey, stepId: string, amount: number, unit: DelayUnit) {
    const sign = key === 'visit_confirmation' ? -1 : 1;
    const delayMinutes = sign * Math.max(1, amount) * unitMinutes[unit];
    setConfig((current) => ({ ...current, scenarios: current.scenarios.map((scenario) => scenario.key === key ? {
      ...scenario,
      steps: scenario.steps.map((step) => step.id === stepId ? { ...step, delayMinutes } : step)
    } : scenario) }));
  }

  function changeAttribution(key: FollowUpScenarioKey, amount: number, unit: DelayUnit) {
    const attributionWindowMinutes = Math.max(1, amount) * unitMinutes[unit];
    setConfig((current) => ({ ...current, scenarios: current.scenarios.map((scenario) => scenario.key === key ? { ...scenario, attributionWindowMinutes } : scenario) }));
  }

  const requestedStore = storeId ? (storeDrafts[storeId] || safeStoreDraft(config.global)) : safeStoreDraft(config.global);
  const effectiveStore = clampStoreFollowUpSettings(config.global, requestedStore);

  function changeStore<K extends keyof FollowUpSettings>(key: K, value: FollowUpSettings[K]) {
    if (!storeId) return;
    setStoreDrafts((current) => ({ ...current, [storeId]: { ...(current[storeId] || safeStoreDraft(config.global)), [key]: value } }));
  }

  return <div className="mt-6 space-y-5">
    <section className="premium-card p-5 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="flex items-start gap-3"><span className="rounded-xl bg-zinc-950 p-2.5 text-white"><Workflow size={19}/></span><div><h2 className="text-xl font-black">Smart Follow-up V2 Integrado</h2><p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-zinc-500">Uma única fonte de verdade para painel, loja e planner da Intelligence V2. O planner não possui mais horários próprios paralelos.</p></div></div><span className="rounded-full bg-red-50 px-3 py-2 text-[10px] font-black uppercase text-red-700">DRY-RUN · SEM ENVIO</span></div>
      <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[11px] font-bold leading-5 text-sky-900"><strong>Integração:</strong> configuração efetiva → Intelligence V2 → planner. Sem configuração válida e habilitada, o planner bloqueia por padrão.</div>
    </section>

    <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="premium-card p-5">
        <div className="flex items-center gap-2"><SlidersHorizontal size={17} className="text-red-600"/><h3 className="text-lg font-black">Teto global Master</h3></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black">Status<select value={config.global.enabled ? 'on' : 'off'} onChange={(e) => setGlobal('enabled', e.target.value === 'on')} className="premium-input mt-1.5"><option value="off">DESATIVADO</option><option value="on">ATIVADO NO RASCUNHO</option></select></label>
          <label className="text-xs font-black">Modo<select value={config.global.mode} onChange={(e) => setGlobal('mode', e.target.value as FollowUpMode)} className="premium-input mt-1.5"><option value="off">OFF</option><option value="copilot">COPILOT</option><option value="autopilot">AUTOPILOT (simulado)</option></select></label>
          <label className="text-xs font-black">Início<input type="time" value={config.global.allowedStart} onChange={(e) => setGlobal('allowedStart', e.target.value)} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Fim<input type="time" value={config.global.allowedEnd} onChange={(e) => setGlobal('allowedEnd', e.target.value)} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Máx. por lead/dia<input type="number" min={1} max={5} value={config.global.maxPerLeadPerDay} onChange={(e) => setGlobal('maxPerLeadPerDay', Number(e.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Máx. por sequência<input type="number" min={1} max={10} value={config.global.maxPerSequence} onChange={(e) => setGlobal('maxPerSequence', Number(e.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Duração máx. (dias)<input type="number" min={1} max={30} value={config.global.maxSequenceDays} onChange={(e) => setGlobal('maxSequenceDays', Number(e.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Intervalo mínimo (min)<input type="number" min={15} value={config.global.minIntervalMinutes} onChange={(e) => setGlobal('minIntervalMinutes', Number(e.target.value))} className="premium-input mt-1.5"/></label>
        </div>
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] font-bold leading-5 text-emerald-800"><ShieldCheck size={13} className="mr-2 inline"/>Resposta do cliente, venda, takeover humano e conversa fechada permanecem proteções obrigatórias.</div>
        {!validation.ok ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-900">{validation.errors.join(' · ')}</div> : null}
      </div>

      <div className="premium-card p-5">
        <div className="flex items-center gap-2"><Workflow size={17} className="text-red-600"/><h3 className="text-lg font-black">Jornadas</h3></div>
        <div className="mt-4 space-y-3">{config.scenarios.map((scenario) => { const attribution = timingParts(scenario.attributionWindowMinutes); const open = performanceKey === scenario.key; return <div key={scenario.key} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><strong className="text-sm font-black">{scenario.title}</strong><p className="mt-1 text-[11px] font-bold leading-5 text-zinc-500">{scenario.description}</p></div><div className="flex gap-2"><button type="button" onClick={() => toggleScenario(scenario.key)} className="premium-button-secondary">{scenario.enabled ? 'Desativar' : 'Ativar'}</button><button type="button" onClick={() => setPerformanceKey(open ? null : scenario.key)} className="premium-button-secondary"><BarChart3 size={14}/>Performance</button></div></div>
          {scenario.steps.length ? <div className="mt-3 space-y-2">{scenario.steps.map((step, index) => { const timing = timingParts(step.delayMinutes); return <div key={step.id} className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-[100px_1fr_120px]"><div className="self-center text-[10px] font-black text-zinc-500"><Clock3 size={11} className="mr-1 inline"/>Etapa {index + 1}</div><input type="number" min={1} value={timing.amount} onChange={(e) => changeStep(scenario.key, step.id, Number(e.target.value), timing.unit)} className="premium-input text-xs"/><select value={timing.unit} onChange={(e) => changeStep(scenario.key, step.id, timing.amount, e.target.value as DelayUnit)} className="premium-input text-xs"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></div>; })}</div> : <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] font-bold text-sky-800">Usa data e hora explicitamente pedidas pelo cliente.</div>}
          {open ? <div className="mt-4 rounded-xl bg-zinc-950 p-4 text-white"><div className="grid gap-3 sm:grid-cols-[1fr_130px_120px]"><div><p className="text-sm font-black">Dashboard · {scenario.title}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">Dados reais permanecem zerados até a etapa LIVE.</p></div><input type="number" min={1} value={attribution.amount} onChange={(e) => changeAttribution(scenario.key, Number(e.target.value), attribution.unit)} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs"/><select value={attribution.unit} onChange={(e) => changeAttribution(scenario.key, attribution.amount, e.target.value as DelayUnit)} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Respostas" value={0}/><Metric label="Recuperadas" value={0}/><Metric label="Agendamentos" value={0}/><Metric label="Vendas" value={0}/></div></div> : null}
        </div>; })}</div>
      </div>
    </section>

    <section className="premium-card p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex items-start gap-3"><span className="rounded-xl bg-zinc-950 p-2.5 text-white"><Building2 size={18}/></span><div><h3 className="text-lg font-black">Herança por Loja</h3><p className="mt-1 text-xs font-bold text-zinc-500">A loja pode restringir, nunca ampliar o teto do Master.</p></div></div><button type="button" onClick={() => void loadStores()} disabled={loadingStores} className="premium-button-secondary"><RefreshCw size={14} className={loadingStores ? 'animate-spin' : ''}/>Atualizar lojas</button></div>
      {storeMessage ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">{storeMessage}</div> : null}
      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><label className="text-xs font-black">Loja<select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="premium-input mt-2"><option value="">Selecione uma loja</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select></label>{storeId ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black">Status<select value={requestedStore.enabled ? 'on' : 'off'} onChange={(e) => changeStore('enabled', e.target.value === 'on')} className="premium-input mt-1.5"><option value="off">DESATIVADO</option><option value="on">ATIVADO</option></select></label><label className="text-xs font-black">Modo<select value={requestedStore.mode} onChange={(e) => changeStore('mode', e.target.value as FollowUpMode)} className="premium-input mt-1.5"><option value="off">OFF</option><option value="copilot">COPILOT</option><option value="autopilot">AUTOPILOT</option></select></label><label className="text-xs font-black">Início<input type="time" value={requestedStore.allowedStart} onChange={(e) => changeStore('allowedStart', e.target.value)} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Fim<input type="time" value={requestedStore.allowedEnd} onChange={(e) => changeStore('allowedEnd', e.target.value)} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Máx. lead/dia<input type="number" value={requestedStore.maxPerLeadPerDay} onChange={(e) => changeStore('maxPerLeadPerDay', Number(e.target.value))} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Intervalo mínimo<input type="number" value={requestedStore.minIntervalMinutes} onChange={(e) => changeStore('minIntervalMinutes', Number(e.target.value))} className="premium-input mt-1.5"/></label></div> : null}</div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Configuração efetiva</p><div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs font-bold"><div className="rounded-xl bg-zinc-50 p-3">Status: <strong>{effectiveStore.enabled ? 'ATIVO' : 'DESATIVADO'}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Modo: <strong>{effectiveStore.mode.toUpperCase()}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Janela: <strong>{effectiveStore.allowedStart}–{effectiveStore.allowedEnd}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Máx. lead/dia: <strong>{effectiveStore.maxPerLeadPerDay}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Máx. sequência: <strong>{effectiveStore.maxPerSequence}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Intervalo mínimo: <strong>{effectiveStore.minIntervalMinutes} min</strong></div></div><div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] font-bold leading-5 text-sky-800">Ainda é simulação local. Nenhuma alteração é persistida nesta branch.</div></div>
      </div>
    </section>
  </div>;
}
