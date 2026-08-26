'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Building2, Clock3, Loader2, RefreshCw, Save, ShieldCheck, SlidersHorizontal, Workflow } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import {
  clampStoreFollowUpSettings,
  defaultFollowUpConfigV2,
  validateFollowUpConfigV2,
  type FollowUpConfigV2,
  type FollowUpMode,
  type FollowUpScenarioKey,
  type FollowUpSettings
} from '@/lib/server/autocar/smartFollowUpV2';

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
    maxSequenceDays: Math.min(master.maxSequenceDays, 7),
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
  const [storeRequested, setStoreRequested] = useState<FollowUpConfigV2 | null>(null);
  const [storeEffective, setStoreEffective] = useState<FollowUpConfigV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMaster, setSavingMaster] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [message, setMessage] = useState('');
  const validation = useMemo(() => validateFollowUpConfigV2(config), [config]);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

  const loadStores = useCallback(async () => {
    const access = await token();
    if (!access) throw new Error('Sessão Master expirada.');
    const response = await fetch('/api/master/autocar', { headers: { Authorization: `Bearer ${access}` }, cache: 'no-store' });
    const body = await response.json() as StorePayload;
    if (!response.ok) throw new Error(body.error || 'Não foi possível carregar as lojas.');
    const rows = body.stores || [];
    setStores(rows);
    setStoreId((current) => current || rows[0]?.id || '');
  }, [token]);

  const loadMaster = useCallback(async () => {
    const access = await token();
    if (!access) throw new Error('Sessão Master expirada.');
    const response = await fetch('/api/master/autocar/follow-up-v2', { headers: { Authorization: `Bearer ${access}` }, cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Persistência do Smart Follow-up indisponível.');
    setConfig(body.master);
  }, [token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadStores(), loadMaster()]);
      setMessage('Configuração Master carregada do AUTOCAR.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar a persistência. O Preview continua fail-closed.');
    } finally {
      setLoading(false);
    }
  }, [loadMaster, loadStores]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    let cancelled = false;
    async function loadStore() {
      if (!storeId) { setStoreRequested(null); setStoreEffective(null); return; }
      try {
        const access = await token();
        if (!access) throw new Error('Sessão Master expirada.');
        const response = await fetch(`/api/master/autocar/follow-up-v2?store_id=${encodeURIComponent(storeId)}`, { headers: { Authorization: `Bearer ${access}` }, cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Não foi possível carregar a loja.');
        if (!cancelled) {
          setConfig(body.master);
          setStoreRequested(body.store.requested);
          setStoreEffective(body.store.effective);
        }
      } catch (error: any) {
        if (!cancelled) {
          const fallback: FollowUpConfigV2 = { version: 2, global: safeStoreDraft(config.global), scenarios: config.scenarios.map((s) => ({ ...s, enabled: false })) };
          setStoreRequested(fallback);
          setStoreEffective({ ...fallback, global: clampStoreFollowUpSettings(config.global, fallback.global) });
          setMessage(error?.message || 'Persistência da loja indisponível neste ambiente.');
        }
      }
    }
    void loadStore();
    return () => { cancelled = true; };
  }, [config.global, config.scenarios, storeId, token]);

  function setGlobal<K extends keyof FollowUpSettings>(key: K, value: FollowUpSettings[K]) {
    setConfig((current) => ({ ...current, global: { ...current.global, [key]: value } }));
  }

  function toggleScenario(key: FollowUpScenarioKey) {
    setConfig((current) => ({ ...current, scenarios: current.scenarios.map((scenario) => scenario.key === key ? { ...scenario, enabled: !scenario.enabled } : scenario) }));
  }

  function changeStep(key: FollowUpScenarioKey, stepId: string, amount: number, unit: DelayUnit) {
    const sign = key === 'visit_confirmation' ? -1 : 1;
    const delayMinutes = sign * Math.max(1, amount) * unitMinutes[unit];
    setConfig((current) => ({ ...current, scenarios: current.scenarios.map((scenario) => scenario.key === key ? { ...scenario, steps: scenario.steps.map((step) => step.id === stepId ? { ...step, delayMinutes } : step) } : scenario) }));
  }

  function changeAttribution(key: FollowUpScenarioKey, amount: number, unit: DelayUnit) {
    const attributionWindowMinutes = Math.max(1, amount) * unitMinutes[unit];
    setConfig((current) => ({ ...current, scenarios: current.scenarios.map((scenario) => scenario.key === key ? { ...scenario, attributionWindowMinutes } : scenario) }));
  }

  function changeStore<K extends keyof FollowUpSettings>(key: K, value: FollowUpSettings[K]) {
    setStoreRequested((current) => current ? { ...current, global: { ...current.global, [key]: value } } : current);
  }

  async function saveMaster() {
    if (savingMaster || !validation.ok) return;
    setSavingMaster(true);
    try {
      const access = await token();
      const response = await fetch('/api/master/autocar/follow-up-v2', {
        method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-master', config })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Falha ao salvar Master.');
      setConfig(body.master);
      setMessage('Teto Master salvo. AUTOPILOT do Follow-up permanece bloqueado.');
    } catch (error: any) { setMessage(error?.message || 'Falha ao salvar Master.'); }
    finally { setSavingMaster(false); }
  }

  async function saveStore() {
    if (!storeId || !storeRequested || savingStore) return;
    setSavingStore(true);
    try {
      const access = await token();
      const response = await fetch('/api/master/autocar/follow-up-v2', {
        method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-store', store_id: storeId, config: storeRequested })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Falha ao salvar loja.');
      setStoreRequested(body.store.requested);
      setStoreEffective(body.store.effective);
      setMessage('Configuração da loja salva em COPILOT/OFF. AUTOPILOT permanece bloqueado.');
    } catch (error: any) { setMessage(error?.message || 'Falha ao salvar loja.'); }
    finally { setSavingStore(false); }
  }

  const effectivePreview = storeRequested ? clampStoreFollowUpSettings(config.global, storeRequested.global) : null;

  return <div className="mt-6 space-y-5">
    <section className="premium-card p-5 md:p-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="flex items-start gap-3"><span className="rounded-xl bg-zinc-950 p-2.5 text-white"><Workflow size={19}/></span><div><h2 className="text-xl font-black">Smart Follow-up V2 Integrado</h2><p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-zinc-500">Configuração persistida e compartilhada por Master, Loja e planner da Intelligence V2.</p></div></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-amber-50 px-3 py-2 text-[10px] font-black uppercase text-amber-800">COPILOT · AUTOPILOT BLOQUEADO</span><button type="button" onClick={() => void saveMaster()} disabled={loading || savingMaster || !validation.ok} className="premium-button-primary"><Save size={14}/>{savingMaster ? 'Salvando...' : 'Salvar Master'}</button></div></div>{message ? <div className="mt-4 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-bold text-zinc-700">{loading || savingMaster || savingStore ? <Loader2 size={14} className="animate-spin"/> : null}{message}</div> : null}</section>

    <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="premium-card p-5"><div className="flex items-center gap-2"><SlidersHorizontal size={17} className="text-red-600"/><h3 className="text-lg font-black">Teto global Master</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-black">Status<select disabled={loading} value={config.global.enabled ? 'on' : 'off'} onChange={(e) => setGlobal('enabled', e.target.value === 'on')} className="premium-input mt-1.5"><option value="off">DESATIVADO</option><option value="on">ATIVADO</option></select></label>
        <label className="text-xs font-black">Modo<select disabled={loading} value={config.global.mode} onChange={(e) => setGlobal('mode', e.target.value as FollowUpMode)} className="premium-input mt-1.5"><option value="off">OFF</option><option value="copilot">COPILOT</option></select></label>
        <label className="text-xs font-black">Início<input disabled={loading} type="time" value={config.global.allowedStart} onChange={(e) => setGlobal('allowedStart', e.target.value)} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Fim<input disabled={loading} type="time" value={config.global.allowedEnd} onChange={(e) => setGlobal('allowedEnd', e.target.value)} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Máx. por lead/dia<input disabled={loading} type="number" min={1} max={5} value={config.global.maxPerLeadPerDay} onChange={(e) => setGlobal('maxPerLeadPerDay', Number(e.target.value))} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Máx. por sequência<input disabled={loading} type="number" min={1} max={10} value={config.global.maxPerSequence} onChange={(e) => setGlobal('maxPerSequence', Number(e.target.value))} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Duração máx. (dias)<input disabled={loading} type="number" min={1} max={30} value={config.global.maxSequenceDays} onChange={(e) => setGlobal('maxSequenceDays', Number(e.target.value))} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Intervalo mínimo (min)<input disabled={loading} type="number" min={15} value={config.global.minIntervalMinutes} onChange={(e) => setGlobal('minIntervalMinutes', Number(e.target.value))} className="premium-input mt-1.5"/></label>
      </div><div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] font-bold text-emerald-800"><ShieldCheck size={13} className="mr-2 inline"/>Resposta, venda, takeover humano e conversa fechada continuam cancelamentos obrigatórios.</div>{!validation.ok ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">{validation.errors.join(' · ')}</div> : null}</div>

      <div className="premium-card p-5"><div className="flex items-center gap-2"><Workflow size={17} className="text-red-600"/><h3 className="text-lg font-black">Jornadas Master</h3></div><p className="mt-1 text-xs font-bold text-zinc-500">A Loja só consegue ativar jornadas liberadas aqui.</p><div className="mt-4 space-y-3">{config.scenarios.map((scenario) => { const attribution = timingParts(scenario.attributionWindowMinutes); const open = performanceKey === scenario.key; return <div key={scenario.key} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><strong className="text-sm font-black">{scenario.title}</strong><p className="mt-1 text-[11px] font-bold text-zinc-500">{scenario.description}</p></div><div className="flex gap-2"><button disabled={loading} type="button" onClick={() => toggleScenario(scenario.key)} className="premium-button-secondary">{scenario.enabled ? 'Desativar' : 'Ativar'}</button><button type="button" onClick={() => setPerformanceKey(open ? null : scenario.key)} className="premium-button-secondary"><BarChart3 size={14}/>Performance</button></div></div>{scenario.steps.length ? <div className="mt-3 space-y-2">{scenario.steps.map((step, index) => { const timing = timingParts(step.delayMinutes); return <div key={step.id} className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-[100px_1fr_120px]"><div className="self-center text-[10px] font-black text-zinc-500"><Clock3 size={11} className="mr-1 inline"/>Etapa {index + 1}</div><input disabled={loading} type="number" min={1} value={timing.amount} onChange={(e) => changeStep(scenario.key, step.id, Number(e.target.value), timing.unit)} className="premium-input text-xs"/><select disabled={loading} value={timing.unit} onChange={(e) => changeStep(scenario.key, step.id, timing.amount, e.target.value as DelayUnit)} className="premium-input text-xs"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></div>; })}</div> : <div className="mt-3 rounded-xl bg-sky-50 p-3 text-[10px] font-bold text-sky-800">Usa data/hora explicitamente pedida pelo cliente.</div>}{open ? <div className="mt-4 rounded-xl bg-zinc-950 p-4 text-white"><div className="grid gap-3 sm:grid-cols-[1fr_130px_120px]"><div><p className="text-sm font-black">Dashboard · {scenario.title}</p><p className="mt-1 text-[10px] text-zinc-400">Janela de atribuição configurável.</p></div><input disabled={loading} type="number" min={1} value={attribution.amount} onChange={(e) => changeAttribution(scenario.key, Number(e.target.value), attribution.unit)} className="rounded-lg bg-white/10 px-3 py-2 text-xs"/><select disabled={loading} value={attribution.unit} onChange={(e) => changeAttribution(scenario.key, attribution.amount, e.target.value as DelayUnit)} className="rounded-lg bg-white/10 px-3 py-2 text-xs"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Respostas" value={0}/><Metric label="Recuperadas" value={0}/><Metric label="Agendamentos" value={0}/><Metric label="Vendas" value={0}/></div></div> : null}</div>; })}</div></div>
    </section>

    <section className="premium-card p-5 md:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex items-start gap-3"><span className="rounded-xl bg-zinc-950 p-2.5 text-white"><Building2 size={18}/></span><div><h3 className="text-lg font-black">Configuração por Loja</h3><p className="mt-1 text-xs font-bold text-zinc-500">A loja pode restringir o teto do Master, nunca ampliá-lo.</p></div></div><div className="flex gap-2"><button type="button" onClick={() => void loadStores()} className="premium-button-secondary"><RefreshCw size={14}/>Lojas</button><button type="button" onClick={() => void saveStore()} disabled={!storeRequested || savingStore} className="premium-button-primary"><Save size={14}/>{savingStore ? 'Salvando...' : 'Salvar Loja'}</button></div></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]"><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><label className="text-xs font-black">Loja<select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="premium-input mt-2"><option value="">Selecione</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select></label>{storeRequested ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black">Status<select value={storeRequested.global.enabled ? 'on' : 'off'} onChange={(e) => changeStore('enabled', e.target.value === 'on')} className="premium-input mt-1.5"><option value="off">DESATIVADO</option><option value="on">ATIVADO</option></select></label><label className="text-xs font-black">Modo<select value={storeRequested.global.mode} onChange={(e) => changeStore('mode', e.target.value as FollowUpMode)} className="premium-input mt-1.5"><option value="off">OFF</option><option value="copilot">COPILOT</option></select></label><label className="text-xs font-black">Início<input type="time" value={storeRequested.global.allowedStart} onChange={(e) => changeStore('allowedStart', e.target.value)} className="premium-input mt-1.5"/></label><label className="text-xs font-black">Fim<input type="time" value={storeRequested.global.allowedEnd} onChange={(e) => changeStore('allowedEnd', e.target.value)} className="premium-input mt-1.5"/></label></div> : null}</div><div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-600"/><h4 className="font-black">Configuração efetiva</h4></div>{effectivePreview ? <div className="mt-4 grid gap-2 text-xs font-bold"><div className="rounded-xl bg-zinc-50 p-3">Status: <strong>{effectivePreview.enabled ? 'ATIVADO' : 'DESATIVADO'}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Modo: <strong>{effectivePreview.mode.toUpperCase()}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Janela: <strong>{effectivePreview.allowedStart}–{effectivePreview.allowedEnd}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Máx. lead/dia: <strong>{effectivePreview.maxPerLeadPerDay}</strong></div></div> : <p className="mt-4 text-xs text-zinc-500">Selecione uma loja.</p>}{storeEffective ? <p className="mt-3 text-[10px] font-bold text-zinc-400">Última configuração efetiva persistida disponível.</p> : null}</div></div>
    </section>
  </div>;
}
