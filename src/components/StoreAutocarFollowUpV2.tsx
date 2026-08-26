'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { BarChart3, Clock3, Loader2, Save, ShieldCheck, SlidersHorizontal, Workflow } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import {
  clampStoreFollowUpSettings,
  defaultFollowUpConfigV2,
  type FollowUpConfigV2,
  type FollowUpMode,
  type FollowUpScenarioKey
} from '@/lib/server/autocar/smartFollowUpV2';

type DelayUnit = 'minutes' | 'hours' | 'days';
const unitMinutes: Record<DelayUnit, number> = { minutes: 1, hours: 60, days: 1440 };

function timingParts(minutes: number): { amount: number; unit: DelayUnit } {
  const absolute = Math.max(1, Math.abs(minutes));
  if (absolute % 1440 === 0) return { amount: absolute / 1440, unit: 'days' };
  if (absolute % 60 === 0) return { amount: absolute / 60, unit: 'hours' };
  return { amount: absolute, unit: 'minutes' };
}

function storeFallback(): FollowUpConfigV2 {
  const master = structuredClone(defaultFollowUpConfigV2);
  return {
    version: 2,
    global: {
      ...master.global,
      enabled: false,
      mode: 'off',
      allowedStart: '09:00',
      allowedEnd: '19:00',
      maxPerLeadPerDay: 1,
      maxPerSequence: 3,
      maxSequenceDays: 7,
      minIntervalMinutes: 60
    },
    scenarios: master.scenarios.map((scenario) => ({ ...scenario, enabled: false }))
  };
}

export function StoreAutocarFollowUpV2({ storeName, canManage }: { storeName: string; canManage: boolean }) {
  const params = useParams();
  const slug = String(params?.slug || '');
  const supabase = useMemo(() => createClient(), []);
  const [requested, setRequested] = useState<FollowUpConfigV2>(() => storeFallback());
  const [effective, setEffective] = useState<FollowUpConfigV2>(() => storeFallback());
  const [master, setMaster] = useState<FollowUpConfigV2>(() => structuredClone(defaultFollowUpConfigV2));
  const [performanceKey, setPerformanceKey] = useState<FollowUpScenarioKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const accessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão da loja expirada.');
      const response = await fetch(`/api/store/portal/autocar/follow-up-v2?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar o Smart Follow-up.');
      setMaster(body.config.master);
      setRequested(body.config.requested);
      setEffective(body.config.effective);
      setMessage('Configuração carregada do AUTOCAR.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar a persistência do Smart Follow-up.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, slug]);

  useEffect(() => { void load(); }, [load]);

  function changeGlobal<K extends keyof FollowUpConfigV2['global']>(key: K, value: FollowUpConfigV2['global'][K]) {
    if (!canManage) return;
    setRequested((current) => {
      const next = { ...current, global: { ...current.global, [key]: value } };
      return next;
    });
  }

  function toggleScenario(key: FollowUpScenarioKey) {
    if (!canManage) return;
    setRequested((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) => scenario.key === key ? { ...scenario, enabled: !scenario.enabled } : scenario)
    }));
  }

  function changeStep(key: FollowUpScenarioKey, stepId: string, amount: number, unit: DelayUnit) {
    if (!canManage) return;
    const sign = key === 'visit_confirmation' ? -1 : 1;
    const delayMinutes = sign * Math.max(1, amount) * unitMinutes[unit];
    setRequested((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) => scenario.key === key ? {
        ...scenario,
        steps: scenario.steps.map((step) => step.id === stepId ? { ...step, delayMinutes } : step)
      } : scenario)
    }));
  }

  function changeAttribution(key: FollowUpScenarioKey, amount: number, unit: DelayUnit) {
    if (!canManage) return;
    const attributionWindowMinutes = Math.max(1, amount) * unitMinutes[unit];
    setRequested((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) => scenario.key === key ? { ...scenario, attributionWindowMinutes } : scenario)
    }));
  }

  async function save() {
    if (!canManage || saving) return;
    setSaving(true);
    setMessage('Salvando Smart Follow-up...');
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão da loja expirada.');
      const response = await fetch('/api/store/portal/autocar/follow-up-v2', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, config: requested })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível salvar o Smart Follow-up.');
      setMaster(body.config.master);
      setRequested(body.config.requested);
      setEffective(body.config.effective);
      setMessage('Smart Follow-up salvo. AUTOPILOT permanece bloqueado.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar o Smart Follow-up.');
    } finally {
      setSaving(false);
    }
  }

  const previewEffective = useMemo(() => ({
    ...effective,
    global: clampStoreFollowUpSettings(master.global, requested.global)
  }), [effective, master.global, requested.global]);

  return <div className="space-y-5">
    <section className="premium-card p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><div className="flex items-center gap-2 text-red-600"><Workflow size={18}/><span className="premium-eyebrow">Smart Follow-up</span></div><h2 className="mt-2 text-2xl font-black text-zinc-950">Configuração da {storeName}</h2><p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-zinc-500">A loja personaliza o Smart Follow-up dentro do teto definido pelo Master. O modo desta página é independente do atendimento normal da AUTOCAR.</p></div>
        <div className="flex flex-wrap gap-2"><span className="rounded-full bg-amber-50 px-3 py-2 text-[10px] font-black uppercase text-amber-800">COPILOT · AUTOPILOT BLOQUEADO</span>{canManage ? <button type="button" onClick={() => void save()} disabled={saving || loading} className="premium-button-primary"><Save size={14}/>{saving ? 'Salvando...' : 'Salvar Follow-up'}</button> : null}</div>
      </div>
      {!canManage ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">Seu perfil pode visualizar esta área, mas não pode alterar a configuração.</div> : null}
      {message ? <div className="mt-4 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-bold text-zinc-700">{loading || saving ? <Loader2 size={14} className="animate-spin"/> : null}{message}</div> : null}
    </section>

    <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
      <div className="premium-card p-5"><div className="flex items-center gap-2"><SlidersHorizontal size={17} className="text-red-600"/><h3 className="text-lg font-black">Configurações do Follow-up</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-black">Status do Follow-up<select disabled={!canManage || loading} value={requested.global.enabled ? 'on' : 'off'} onChange={(e) => changeGlobal('enabled', e.target.value === 'on')} className="premium-input mt-1.5"><option value="off">DESATIVADO</option><option value="on">ATIVADO</option></select></label>
        <label className="text-xs font-black">Modo do Follow-up<select disabled={!canManage || loading} value={requested.global.mode} onChange={(e) => changeGlobal('mode', e.target.value as FollowUpMode)} className="premium-input mt-1.5"><option value="off">OFF</option><option value="copilot">COPILOT</option></select></label>
        <label className="text-xs font-black">Início<input disabled={!canManage || loading} type="time" value={requested.global.allowedStart} onChange={(e) => changeGlobal('allowedStart', e.target.value)} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Fim<input disabled={!canManage || loading} type="time" value={requested.global.allowedEnd} onChange={(e) => changeGlobal('allowedEnd', e.target.value)} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Máx. por lead/dia<input disabled={!canManage || loading} type="number" min={1} max={5} value={requested.global.maxPerLeadPerDay} onChange={(e) => changeGlobal('maxPerLeadPerDay', Number(e.target.value))} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Máx. por sequência<input disabled={!canManage || loading} type="number" min={1} max={10} value={requested.global.maxPerSequence} onChange={(e) => changeGlobal('maxPerSequence', Number(e.target.value))} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Duração máx. (dias)<input disabled={!canManage || loading} type="number" min={1} max={30} value={requested.global.maxSequenceDays} onChange={(e) => changeGlobal('maxSequenceDays', Number(e.target.value))} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Intervalo mínimo (min)<input disabled={!canManage || loading} type="number" min={15} value={requested.global.minIntervalMinutes} onChange={(e) => changeGlobal('minIntervalMinutes', Number(e.target.value))} className="premium-input mt-1.5"/></label>
      </div></div>

      <div className="premium-card p-5"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-600"/><h3 className="text-lg font-black">O que realmente vale no Follow-up</h3></div><p className="mt-2 text-xs font-bold leading-5 text-zinc-500">A configuração efetiva é limitada pelo Master e pelo SAFE CORE.</p><div className="mt-4 grid gap-2 text-xs font-bold"><div className="rounded-xl bg-zinc-50 p-3">Status efetivo: <strong>{previewEffective.global.enabled ? 'ATIVADO' : 'DESATIVADO'}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Modo efetivo: <strong>{previewEffective.global.mode.toUpperCase()}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Janela: <strong>{previewEffective.global.allowedStart}–{previewEffective.global.allowedEnd}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Máx. por lead/dia: <strong>{previewEffective.global.maxPerLeadPerDay}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Máx. por sequência: <strong>{previewEffective.global.maxPerSequence}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Intervalo mínimo: <strong>{previewEffective.global.minIntervalMinutes} min</strong></div></div><div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] font-bold leading-5 text-emerald-800">Resposta do cliente, venda, takeover humano e conversa fechada cancelam a sequência obrigatoriamente.</div></div>
    </section>

    <section className="premium-card p-5"><div className="flex items-center gap-2"><Workflow size={17} className="text-red-600"/><h3 className="text-lg font-black">Jornadas da loja</h3></div><p className="mt-1 text-xs font-bold text-zinc-500">Uma jornada só fica efetiva se também estiver liberada no teto Master.</p><div className="mt-4 space-y-3">{requested.scenarios.map((scenario) => { const attribution = timingParts(scenario.attributionWindowMinutes); const performanceOpen = performanceKey === scenario.key; return <div key={scenario.key} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><strong className="text-sm font-black">{scenario.title}</strong><p className="mt-1 text-[11px] font-bold leading-5 text-zinc-500">{scenario.description}</p></div><div className="flex gap-2"><button disabled={!canManage || loading} type="button" onClick={() => toggleScenario(scenario.key)} className="premium-button-secondary">{scenario.enabled ? 'Desativar' : 'Ativar'}</button><button type="button" onClick={() => setPerformanceKey(performanceOpen ? null : scenario.key)} className="premium-button-secondary"><BarChart3 size={14}/>Performance</button></div></div>
        {scenario.steps.length ? <div className="mt-3 space-y-2">{scenario.steps.map((step, index) => { const timing = timingParts(step.delayMinutes); return <div key={step.id} className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-[100px_1fr_120px]"><div className="self-center text-[10px] font-black text-zinc-500"><Clock3 size={11} className="mr-1 inline"/>Etapa {index + 1}</div><input disabled={!canManage || loading} type="number" min={1} value={timing.amount} onChange={(e) => changeStep(scenario.key, step.id, Number(e.target.value), timing.unit)} className="premium-input text-xs"/><select disabled={!canManage || loading} value={timing.unit} onChange={(e) => changeStep(scenario.key, step.id, timing.amount, e.target.value as DelayUnit)} className="premium-input text-xs"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></div>; })}</div> : <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] font-bold text-sky-800">Usa a data/hora explicitamente pedida pelo cliente.</div>}
        {performanceOpen ? <div className="mt-4 rounded-xl bg-zinc-950 p-4 text-white"><div className="grid gap-3 sm:grid-cols-[1fr_130px_120px]"><div><p className="text-sm font-black">Performance · {scenario.title}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">A telemetria será preenchida quando houver eventos reais atribuíveis.</p></div><input disabled={!canManage || loading} type="number" min={1} value={attribution.amount} onChange={(e) => changeAttribution(scenario.key, Number(e.target.value), attribution.unit)} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs"/><select disabled={!canManage || loading} value={attribution.unit} onChange={(e) => changeAttribution(scenario.key, attribution.amount, e.target.value as DelayUnit)} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-zinc-500">Respostas</p><strong>0</strong></div><div className="rounded-lg bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-zinc-500">Recuperadas</p><strong>0</strong></div><div className="rounded-lg bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-zinc-500">Agendamentos</p><strong>0</strong></div><div className="rounded-lg bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-zinc-500">Vendas</p><strong>0</strong></div></div></div> : null}
      </div>; })}</div></section>
  </div>;
}
