'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Clock3, ShieldCheck, SlidersHorizontal, Workflow } from 'lucide-react';
import { clampStoreFollowUpSettings, defaultFollowUpConfigV2, type FollowUpMode, type FollowUpScenarioKey, type FollowUpSettings } from '@/lib/server/autocar/smartFollowUpV2';

type DelayUnit = 'minutes' | 'hours' | 'days';
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

export function StoreAutocarFollowUpV2({ storeName, canManage }: { storeName: string; canManage: boolean }) {
  const master = defaultFollowUpConfigV2.global;
  const [requested, setRequested] = useState<FollowUpSettings>(() => safeStoreDraft(master));
  const [scenarios, setScenarios] = useState(() => structuredClone(defaultFollowUpConfigV2.scenarios));
  const [performanceKey, setPerformanceKey] = useState<FollowUpScenarioKey | null>(null);
  const effective = useMemo(() => clampStoreFollowUpSettings(master, requested), [master, requested]);

  function change<K extends keyof FollowUpSettings>(key: K, value: FollowUpSettings[K]) {
    if (!canManage) return;
    setRequested((current) => ({ ...current, [key]: value }));
  }

  function toggleScenario(key: FollowUpScenarioKey) {
    if (!canManage) return;
    setScenarios((current) => current.map((scenario) => scenario.key === key ? { ...scenario, enabled: !scenario.enabled } : scenario));
  }

  function changeStep(key: FollowUpScenarioKey, stepId: string, amount: number, unit: DelayUnit) {
    if (!canManage) return;
    const sign = key === 'visit_confirmation' ? -1 : 1;
    const delayMinutes = sign * Math.max(1, amount) * unitMinutes[unit];
    setScenarios((current) => current.map((scenario) => scenario.key === key ? {
      ...scenario,
      steps: scenario.steps.map((step) => step.id === stepId ? { ...step, delayMinutes } : step)
    } : scenario));
  }

  function changeAttribution(key: FollowUpScenarioKey, amount: number, unit: DelayUnit) {
    if (!canManage) return;
    const attributionWindowMinutes = Math.max(1, amount) * unitMinutes[unit];
    setScenarios((current) => current.map((scenario) => scenario.key === key ? { ...scenario, attributionWindowMinutes } : scenario));
  }

  return <div className="space-y-5">
    <section className="premium-card p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2 text-red-600"><Workflow size={18}/><span className="premium-eyebrow">Smart Follow-up</span></div><h2 className="mt-2 text-2xl font-black text-zinc-950">Configuração da {storeName}</h2><p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-zinc-500">A loja personaliza dentro do teto definido pelo Master. O planner integrado usa esta mesma estrutura como fonte de verdade. Nesta etapa Preview, nada é persistido e nenhum WhatsApp é enviado.</p></div><span className="rounded-full bg-red-50 px-3 py-2 text-[10px] font-black uppercase text-red-700">DRY-RUN · SEM ENVIO</span></div>
      {!canManage ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">Seu perfil pode visualizar esta área, mas não possui permissão para alterar a configuração da AUTOCAR.</div> : null}
    </section>

    <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
      <div className="premium-card p-5"><div className="flex items-center gap-2"><SlidersHorizontal size={17} className="text-red-600"/><h3 className="text-lg font-black">Configurações da loja</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-black">Status<select disabled={!canManage} value={requested.enabled ? 'on' : 'off'} onChange={(e) => change('enabled', e.target.value === 'on')} className="premium-input mt-1.5"><option value="off">DESATIVADO</option><option value="on">ATIVADO</option></select></label>
        <label className="text-xs font-black">Modo<select disabled={!canManage} value={requested.mode} onChange={(e) => change('mode', e.target.value as FollowUpMode)} className="premium-input mt-1.5"><option value="off">OFF</option><option value="copilot">COPILOT</option><option value="autopilot">AUTOPILOT</option></select></label>
        <label className="text-xs font-black">Início<input disabled={!canManage} type="time" value={requested.allowedStart} onChange={(e) => change('allowedStart', e.target.value)} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Fim<input disabled={!canManage} type="time" value={requested.allowedEnd} onChange={(e) => change('allowedEnd', e.target.value)} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Máx. por lead/dia<input disabled={!canManage} type="number" min={1} max={5} value={requested.maxPerLeadPerDay} onChange={(e) => change('maxPerLeadPerDay', Number(e.target.value))} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Máx. por sequência<input disabled={!canManage} type="number" min={1} max={10} value={requested.maxPerSequence} onChange={(e) => change('maxPerSequence', Number(e.target.value))} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Duração máx. (dias)<input disabled={!canManage} type="number" min={1} max={30} value={requested.maxSequenceDays} onChange={(e) => change('maxSequenceDays', Number(e.target.value))} className="premium-input mt-1.5"/></label>
        <label className="text-xs font-black">Intervalo mínimo (min)<input disabled={!canManage} type="number" min={15} value={requested.minIntervalMinutes} onChange={(e) => change('minIntervalMinutes', Number(e.target.value))} className="premium-input mt-1.5"/></label>
      </div></div>

      <div className="premium-card p-5"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-600"/><h3 className="text-lg font-black">O que realmente vale</h3></div><p className="mt-2 text-xs font-bold leading-5 text-zinc-500">A configuração efetiva é sempre limitada pelo Master e pelo SAFE CORE.</p><div className="mt-4 grid gap-2 text-xs font-bold"><div className="rounded-xl bg-zinc-50 p-3">Status efetivo: <strong>{effective.enabled ? 'ATIVADO' : 'DESATIVADO'}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Modo efetivo: <strong>{effective.mode.toUpperCase()}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Janela: <strong>{effective.allowedStart}–{effective.allowedEnd}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Máx. por lead/dia: <strong>{effective.maxPerLeadPerDay}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Máx. por sequência: <strong>{effective.maxPerSequence}</strong></div><div className="rounded-xl bg-zinc-50 p-3">Intervalo mínimo: <strong>{effective.minIntervalMinutes} min</strong></div></div><div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] font-bold leading-5 text-emerald-800">Resposta do cliente, venda, takeover humano e conversa fechada continuam cancelando a sequência obrigatoriamente.</div></div>
    </section>

    <section className="premium-card p-5"><div className="flex items-center gap-2"><Workflow size={17} className="text-red-600"/><h3 className="text-lg font-black">Jornadas da loja</h3></div><p className="mt-1 text-xs font-bold text-zinc-500">A loja escolhe quais jornadas usar e pode ser mais restritiva que o padrão do Master.</p><div className="mt-4 space-y-3">{scenarios.map((scenario) => { const attribution = timingParts(scenario.attributionWindowMinutes); const performanceOpen = performanceKey === scenario.key; return <div key={scenario.key} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><strong className="text-sm font-black">{scenario.title}</strong><p className="mt-1 text-[11px] font-bold leading-5 text-zinc-500">{scenario.description}</p></div><div className="flex gap-2"><button disabled={!canManage} type="button" onClick={() => toggleScenario(scenario.key)} className="premium-button-secondary">{scenario.enabled ? 'Desativar' : 'Ativar'}</button><button type="button" onClick={() => setPerformanceKey(performanceOpen ? null : scenario.key)} className="premium-button-secondary"><BarChart3 size={14}/>Performance</button></div></div>
        {scenario.steps.length ? <div className="mt-3 space-y-2">{scenario.steps.map((step, index) => { const timing = timingParts(step.delayMinutes); return <div key={step.id} className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-[100px_1fr_120px]"><div className="self-center text-[10px] font-black text-zinc-500"><Clock3 size={11} className="mr-1 inline"/>Etapa {index + 1}</div><input disabled={!canManage} type="number" min={1} value={timing.amount} onChange={(e) => changeStep(scenario.key, step.id, Number(e.target.value), timing.unit)} className="premium-input text-xs"/><select disabled={!canManage} value={timing.unit} onChange={(e) => changeStep(scenario.key, step.id, timing.amount, e.target.value as DelayUnit)} className="premium-input text-xs"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></div>; })}</div> : <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] font-bold text-sky-800">Usa a data/hora explicitamente pedida pelo cliente.</div>}
        {performanceOpen ? <div className="mt-4 rounded-xl bg-zinc-950 p-4 text-white"><div className="grid gap-3 sm:grid-cols-[1fr_130px_120px]"><div><p className="text-sm font-black">Performance · {scenario.title}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">Dados reais aparecem após a ativação e atribuição dos eventos.</p></div><input disabled={!canManage} type="number" min={1} value={attribution.amount} onChange={(e) => changeAttribution(scenario.key, Number(e.target.value), attribution.unit)} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs"/><select disabled={!canManage} value={attribution.unit} onChange={(e) => changeAttribution(scenario.key, attribution.amount, e.target.value as DelayUnit)} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-zinc-500">Respostas</p><strong>0</strong></div><div className="rounded-lg bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-zinc-500">Recuperadas</p><strong>0</strong></div><div className="rounded-lg bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-zinc-500">Agendamentos</p><strong>0</strong></div><div className="rounded-lg bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-zinc-500">Vendas</p><strong>0</strong></div></div></div> : null}
      </div>; })}</div></section>
  </div>;
}
