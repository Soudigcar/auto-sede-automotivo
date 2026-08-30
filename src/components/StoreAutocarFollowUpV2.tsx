'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Info,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Workflow
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import {
  clampStoreFollowUpSettings,
  defaultFollowUpConfigV2,
  followUpScenarioRollout,
  followUpStepDescription,
  followUpStepLabel,
  validateFollowUpConfigV2,
  validateFollowUpScenarioSteps,
  type FollowUpConfigV2,
  type FollowUpMode,
  type FollowUpScenario,
  type FollowUpScenarioKey,
  type FollowUpSettings
} from '@/lib/server/autocar/smartFollowUpV2';

type DelayUnit = 'minutes' | 'hours' | 'days';
type PerformanceSlice = {
  sent: number;
  responses: number;
  recovered: number;
  appointments: number;
  sales: number;
  fallbacks: number;
  blocked: number;
  failed: number;
  responseRate: number;
};
type Performance = {
  periodDays: number;
  scenarios: Partial<Record<FollowUpScenarioKey, PerformanceSlice>>;
};

const unitMinutes: Record<DelayUnit, number> = { minutes: 1, hours: 60, days: 1440 };

function timingParts(minutes: number): { amount: number; unit: DelayUnit } {
  const absolute = Math.max(1, Math.abs(Math.round(minutes)));
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

function cloneConfig(config: FollowUpConfigV2) {
  return structuredClone(config);
}

function sameConfig(left: FollowUpConfigV2, right: FollowUpConfigV2) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatMode(mode: FollowUpMode) {
  if (mode === 'autopilot') return 'AUTOPILOT';
  if (mode === 'copilot') return 'COPILOT';
  return 'OFF';
}

function previewConfig(master: FollowUpConfigV2, requested: FollowUpConfigV2): FollowUpConfigV2 {
  const global = clampStoreFollowUpSettings(master.global, requested.global);
  return {
    version: 2,
    global,
    scenarios: requested.scenarios.map((scenario) => {
      const ceiling = master.scenarios.find((item) => item.key === scenario.key);
      return {
        ...scenario,
        enabled: Boolean(global.enabled && ceiling?.enabled && scenario.enabled),
        steps: scenario.steps.slice(0, Math.max(1, global.maxPerSequence))
      };
    })
  };
}

const settingRows: Array<{
  label: string;
  helper: string;
  value: (settings: FollowUpSettings) => string;
}> = [
  { label: 'Status', helper: 'Liga ou desliga toda a automação.', value: (item) => item.enabled ? 'ATIVADO' : 'DESATIVADO' },
  { label: 'Modo', helper: 'OFF, revisão humana ou envio automático.', value: (item) => formatMode(item.mode) },
  { label: 'Horário permitido', helper: 'Janela diária de disparo em Brasília.', value: (item) => `${item.allowedStart}–${item.allowedEnd}` },
  { label: 'Máx. por lead/dia', helper: 'Limite somando todas as jornadas.', value: (item) => String(item.maxPerLeadPerDay) },
  { label: 'Máx. por sequência', helper: 'Máximo de etapas na mesma jornada.', value: (item) => String(item.maxPerSequence) },
  { label: 'Duração máxima', helper: 'Prazo total em que a sequência pode rodar.', value: (item) => `${item.maxSequenceDays} dias` },
  { label: 'Intervalo mínimo', helper: 'Espaço mínimo entre dois contatos.', value: (item) => `${item.minIntervalMinutes} min` }
];

function SettingsComparison({
  saved,
  master,
  effective,
  draftPreview,
  dirty
}: {
  saved: FollowUpSettings;
  master: FollowUpSettings;
  effective: FollowUpSettings;
  draftPreview: FollowUpSettings;
  dirty: boolean;
}) {
  return <div className="premium-card p-5">
    <div className="flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-600"/><h3 className="text-lg font-black">Loja × Master × efetivo</h3></div>
    <p className="mt-2 text-xs font-bold leading-5 text-zinc-500">O valor efetivo é o que o sistema usa agora. Ele nunca ultrapassa o teto de segurança definido pelo Master.</p>
    <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200">
      <table className="min-w-[720px] w-full text-left text-xs">
        <thead className="bg-zinc-950 text-white"><tr><th className="px-3 py-3">Regra</th><th className="px-3 py-3">Loja salva</th><th className="px-3 py-3">Teto Master</th><th className="px-3 py-3">Efetivo agora</th></tr></thead>
        <tbody>{settingRows.map((row) => <tr key={row.label} className="border-t border-zinc-100 align-top">
          <td className="px-3 py-3"><strong className="block text-zinc-950">{row.label}</strong><span className="mt-1 block text-[10px] font-bold leading-4 text-zinc-500">{row.helper}</span></td>
          <td className="px-3 py-3 font-black text-zinc-700">{row.value(saved)}</td>
          <td className="px-3 py-3 font-black text-zinc-700">{row.value(master)}</td>
          <td className="px-3 py-3 font-black text-emerald-700">{row.value(effective)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {dirty ? <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-950">
      <p className="font-black">Prévia depois de salvar</p>
      <p className="mt-1 leading-5">Status {draftPreview.enabled ? 'ATIVADO' : 'DESATIVADO'} · {formatMode(draftPreview.mode)} · {draftPreview.allowedStart}–{draftPreview.allowedEnd} · {draftPreview.maxPerLeadPerDay}/dia · {draftPreview.maxPerSequence}/sequência · intervalo {draftPreview.minIntervalMinutes} min.</p>
    </div> : null}
  </div>;
}

function RolloutBadge({ scenario, effective, global }: { scenario: FollowUpScenario; effective: boolean; global: FollowUpSettings }) {
  const rollout = followUpScenarioRollout(scenario.key);
  if (rollout === 'preparation') {
    return <span className="rounded-full bg-violet-100 px-3 py-1.5 text-[9px] font-black uppercase text-violet-800">Em preparação · não envia</span>;
  }
  if (!effective || !global.enabled || global.mode === 'off') {
    return <span className="rounded-full bg-zinc-200 px-3 py-1.5 text-[9px] font-black uppercase text-zinc-700">LIVE · inativa agora</span>;
  }
  return <span className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase ${global.mode === 'autopilot' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>
    {global.mode === 'autopilot' ? 'LIVE · envio automático' : 'LIVE · revisão COPILOT'}
  </span>;
}

function ScenarioPerformance({ slice, periodDays }: { slice?: PerformanceSlice; periodDays: number }) {
  const metrics = [
    ['Enviados', slice?.sent ?? 0],
    ['Respostas', slice?.responses ?? 0],
    ['Recuperados', slice?.recovered ?? 0],
    ['Agendamentos', slice?.appointments ?? 0],
    ['Vendas', slice?.sales ?? 0],
    ['Fallback COPILOT', slice?.fallbacks ?? 0],
    ['Bloqueios', slice?.blocked ?? 0],
    ['Falhas', slice?.failed ?? 0]
  ];
  return <div className="mt-3">
    <p className="text-[10px] font-bold leading-4 text-zinc-400">Dados reais dos últimos {periodDays} dias. Sem evento registrado significa zero; nenhum número é simulado.</p>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="rounded-lg bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-zinc-500">{label}</p><strong>{value}</strong></div>)}</div>
    <p className="mt-3 text-[10px] font-bold text-zinc-400">Taxa de resposta: {(slice?.responseRate ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%.</p>
  </div>;
}

export function StoreAutocarFollowUpV2({ storeName, canManage }: { storeName: string; canManage: boolean }) {
  const params = useParams();
  const slug = String(params?.slug || '');
  const supabase = useMemo(() => createClient(), []);
  const [requested, setRequested] = useState<FollowUpConfigV2>(() => storeFallback());
  const [savedRequested, setSavedRequested] = useState<FollowUpConfigV2>(() => storeFallback());
  const [effective, setEffective] = useState<FollowUpConfigV2>(() => storeFallback());
  const [master, setMaster] = useState<FollowUpConfigV2>(() => cloneConfig(defaultFollowUpConfigV2));
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [autopilotCanaryAllowed, setAutopilotCanaryAllowed] = useState(false);
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
      const saved = cloneConfig(body.config.requested);
      setMaster(body.config.master);
      setRequested(saved);
      setSavedRequested(cloneConfig(saved));
      setEffective(body.config.effective);
      setPerformance(body.performance || null);
      setAutopilotCanaryAllowed(body.autopilot_canary_allowed === true);
      setMessage('Valores salvos e efetivos carregados do AUTOCAR.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar a persistência do Smart Follow-up.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, slug]);

  useEffect(() => { void load(); }, [load]);

  const dirty = !sameConfig(requested, savedRequested);
  const validation = useMemo(() => validateFollowUpConfigV2(requested), [requested]);
  const draftEffective = useMemo(() => previewConfig(master, requested), [master, requested]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function changeGlobal<K extends keyof FollowUpConfigV2['global']>(key: K, value: FollowUpConfigV2['global'][K]) {
    if (!canManage) return;
    setRequested((current) => ({ ...current, global: { ...current.global, [key]: value } }));
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
        steps: scenario.steps.map((step) => step.id === stepId ? {
          ...step,
          delayMinutes,
          label: followUpStepLabel(key, delayMinutes)
        } : step)
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

  function discardDraft() {
    setRequested(cloneConfig(savedRequested));
    setMessage('Alterações não salvas foram descartadas.');
  }

  async function save() {
    if (!canManage || saving || !dirty || !validation.ok) return;
    setSaving(true);
    setMessage('Salvando todas as regras em uma única transação...');
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
      const saved = cloneConfig(body.config.requested);
      setMaster(body.config.master);
      setRequested(saved);
      setSavedRequested(cloneConfig(saved));
      setEffective(body.config.effective);
      setAutopilotCanaryAllowed(body.autopilot_canary_allowed === true);
      setMessage('Smart Follow-up salvo por completo. Os valores em “Efetivo agora” já são os vigentes.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar o Smart Follow-up. Nenhuma alteração parcial foi mantida.');
    } finally {
      setSaving(false);
    }
  }

  const canaryActive = effective.global.enabled && effective.global.mode === 'autopilot';

  return <div className="space-y-5">
    <section className="premium-card p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><div className="flex items-center gap-2 text-red-600"><Workflow size={18}/><span className="premium-eyebrow">Smart Follow-up</span></div><h2 className="mt-2 text-2xl font-black text-zinc-950">Configuração da {storeName}</h2><p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-zinc-500">As regras gerais limitam todas as jornadas. O tempo de cada etapa é contado a partir do evento indicado nela — não é somado à etapa anterior.</p></div>
        <div className="flex flex-wrap gap-2"><span className={`rounded-full px-3 py-2 text-[10px] font-black uppercase ${canaryActive ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{canaryActive ? 'AUTOPILOT CANÁRIO · SAFE CORE' : autopilotCanaryAllowed ? 'A4 · AUTOPILOT DISPONÍVEL' : 'COPILOT · AUTOPILOT BLOQUEADO'}</span>{canManage ? <button type="button" onClick={() => void save()} disabled={saving || loading || !dirty || !validation.ok} className="premium-button-primary"><Save size={14}/>{saving ? 'Salvando...' : 'Salvar Follow-up'}</button> : null}</div>
      </div>
      {!canManage ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">Seu perfil pode visualizar esta área, mas não pode alterar a configuração.</div> : null}
      {dirty ? <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs font-bold text-amber-950 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><div><strong className="block font-black">Existem alterações não salvas</strong><span className="mt-1 block leading-5">Os campos editados são apenas uma prévia. O sistema continua usando “Efetivo agora” até você salvar.</span></div></div><button type="button" onClick={discardDraft} disabled={saving} className="premium-button-secondary shrink-0"><RotateCcw size={14}/>Descartar alterações</button></div> : !loading ? <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-900"><CheckCircle2 size={15}/>Não há alterações pendentes. Os campos exibem o que está salvo.</div> : null}
      {!validation.ok ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-900"><strong className="font-black">Corrija antes de salvar:</strong><ul className="mt-2 list-disc space-y-1 pl-5">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
      {message ? <div className="mt-4 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-bold text-zinc-700">{loading || saving ? <Loader2 size={14} className="animate-spin"/> : null}{message}</div> : null}
    </section>

    <section className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
      <div className="premium-card p-5">
        <div className="flex items-center gap-2"><SlidersHorizontal size={17} className="text-red-600"/><h3 className="text-lg font-black">Regras gerais da loja</h3></div>
        <p className="mt-2 text-xs font-bold leading-5 text-zinc-500">Estas regras são limites globais. Colocar “30 min” em uma etapa não reduz o intervalo mínimo nem ignora o horário permitido.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black">Status geral<span className="mt-1 block text-[10px] font-bold text-zinc-500">Desativado impede qualquer jornada.</span><select disabled={!canManage || loading} value={requested.global.enabled ? 'on' : 'off'} onChange={(event) => changeGlobal('enabled', event.target.value === 'on')} className="premium-input mt-1.5"><option value="off">DESATIVADO</option><option value="on">ATIVADO</option></select></label>
          <label className="text-xs font-black">Modo de execução<span className="mt-1 block text-[10px] font-bold text-zinc-500">COPILOT exige revisão; AUTOPILOT pode enviar.</span><select disabled={!canManage || loading} value={requested.global.mode} onChange={(event) => changeGlobal('mode', event.target.value as FollowUpMode)} className="premium-input mt-1.5"><option value="off">OFF</option><option value="copilot">COPILOT</option>{autopilotCanaryAllowed ? <option value="autopilot">AUTOPILOT CANÁRIO</option> : null}</select></label>
          <label className="text-xs font-black">Início dos envios<span className="mt-1 block text-[10px] font-bold text-zinc-500">Horário de Brasília.</span><input disabled={!canManage || loading} type="time" value={requested.global.allowedStart} onChange={(event) => changeGlobal('allowedStart', event.target.value)} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Fim dos envios<span className="mt-1 block text-[10px] font-bold text-zinc-500">Fora da janela, aguarda o próximo período.</span><input disabled={!canManage || loading} type="time" value={requested.global.allowedEnd} onChange={(event) => changeGlobal('allowedEnd', event.target.value)} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Máximo por lead/dia<span className="mt-1 block text-[10px] font-bold text-zinc-500">Soma todas as jornadas do mesmo lead.</span><input disabled={!canManage || loading} type="number" min={1} max={5} value={requested.global.maxPerLeadPerDay} onChange={(event) => changeGlobal('maxPerLeadPerDay', Number(event.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Máximo por sequência<span className="mt-1 block text-[10px] font-bold text-zinc-500">Quantidade máxima de etapas na jornada.</span><input disabled={!canManage || loading} type="number" min={1} max={10} value={requested.global.maxPerSequence} onChange={(event) => changeGlobal('maxPerSequence', Number(event.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Duração máxima (dias)<span className="mt-1 block text-[10px] font-bold text-zinc-500">Depois desse prazo, a sequência expira.</span><input disabled={!canManage || loading} type="number" min={1} max={30} value={requested.global.maxSequenceDays} onChange={(event) => changeGlobal('maxSequenceDays', Number(event.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Intervalo mínimo (min)<span className="mt-1 block text-[10px] font-bold text-zinc-500">Proteção entre contatos consecutivos.</span><input disabled={!canManage || loading} type="number" min={15} value={requested.global.minIntervalMinutes} onChange={(event) => changeGlobal('minIntervalMinutes', Number(event.target.value))} className="premium-input mt-1.5"/></label>
        </div>
        {canaryActive ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] font-bold leading-5 text-emerald-800">No AUTOPILOT CANÁRIO, dúvida, ambiguidade ou risco rebaixam o caso para COPILOT e impedem o envio automático.</div> : null}
      </div>

      <SettingsComparison saved={savedRequested.global} master={master.global} effective={effective.global} draftPreview={draftEffective.global} dirty={dirty}/>
    </section>

    <section className="premium-card p-5">
      <div className="flex items-center gap-2"><Workflow size={17} className="text-red-600"/><h3 className="text-lg font-black">Jornadas e etapas da loja</h3></div>
      <div className="mt-2 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] font-bold leading-5 text-sky-900"><Info size={15} className="mt-0.5 shrink-0"/><p>Todos os tempos partem do evento descrito na etapa. Exemplo: etapas de 30 minutos e 4 horas significam 30 minutos e 4 horas após o mesmo evento — não 4h30. A verificação roda aproximadamente a cada 5 minutos e respeita a janela geral.</p></div>
      <div className="mt-4 space-y-3">{requested.scenarios.map((scenario) => {
        const attribution = timingParts(scenario.attributionWindowMinutes);
        const performanceOpen = performanceKey === scenario.key;
        const masterScenario = master.scenarios.find((item) => item.key === scenario.key);
        const effectiveScenario = effective.scenarios.find((item) => item.key === scenario.key);
        const previewScenario = draftEffective.scenarios.find((item) => item.key === scenario.key);
        const effectiveActive = Boolean(effective.global.enabled && effective.global.mode !== 'off' && effectiveScenario?.enabled);
        const previewActive = Boolean(draftEffective.global.enabled && draftEffective.global.mode !== 'off' && previewScenario?.enabled);
        const timingErrors = validateFollowUpScenarioSteps(scenario);
        const rollout = followUpScenarioRollout(scenario.key);
        return <div key={scenario.key} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm font-black">{scenario.title}</strong><RolloutBadge scenario={scenario} effective={effectiveActive} global={effective.global}/><span className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase ${masterScenario?.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{masterScenario?.enabled ? 'Liberada pelo Master' : 'Bloqueada pelo Master'}</span></div><p className="mt-2 text-[11px] font-bold leading-5 text-zinc-500">{scenario.description}</p><p className="mt-2 text-[10px] font-black text-zinc-700">Efetivo agora: {effectiveActive ? 'ATIVA' : 'INATIVA'}{dirty ? ` · Após salvar: ${previewActive ? 'ATIVA' : 'INATIVA'}` : ''}</p>{rollout === 'preparation' ? <p className="mt-1 text-[10px] font-bold leading-4 text-violet-700">Esta jornada pode ser configurada, mas o executor atual ainda não a processa e não envia mensagens.</p> : null}</div>
            <div className="flex shrink-0 gap-2"><button disabled={!canManage || loading || (!masterScenario?.enabled && !scenario.enabled)} type="button" onClick={() => toggleScenario(scenario.key)} className="premium-button-secondary">{scenario.enabled ? 'Desativar' : 'Ativar'}</button><button type="button" onClick={() => setPerformanceKey(performanceOpen ? null : scenario.key)} className="premium-button-secondary"><BarChart3 size={14}/>Performance real</button></div>
          </div>
          {scenario.steps.length ? <div className="mt-3 space-y-2">{scenario.steps.map((step, index) => {
            const timing = timingParts(step.delayMinutes);
            return <div key={step.id} className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="grid gap-2 sm:grid-cols-[105px_1fr_130px]">
                <div className="self-center text-[10px] font-black text-zinc-500"><Clock3 size={11} className="mr-1 inline"/>Etapa {index + 1}</div>
                <input aria-label={`${scenario.title}, etapa ${index + 1}, tempo`} disabled={!canManage || loading} type="number" min={1} value={timing.amount} onChange={(event) => changeStep(scenario.key, step.id, Number(event.target.value), timing.unit)} className="premium-input text-xs"/>
                <select aria-label={`${scenario.title}, etapa ${index + 1}, unidade`} disabled={!canManage || loading} value={timing.unit} onChange={(event) => changeStep(scenario.key, step.id, timing.amount, event.target.value as DelayUnit)} className="premium-input text-xs"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select>
              </div>
              <p className="mt-2 text-[10px] font-black leading-4 text-zinc-700">{followUpStepDescription(scenario.key, step.delayMinutes)}</p>
            </div>;
          })}</div> : <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] font-bold text-sky-800">Não usa atraso configurado: respeita exatamente a data e a hora que o cliente pediu.</div>}
          {timingErrors.length ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[10px] font-bold text-red-900">{timingErrors.join(' ')}</div> : null}
          {performanceOpen ? <div className="mt-4 rounded-xl bg-zinc-950 p-4 text-white">
            <div className="grid gap-3 sm:grid-cols-[1fr_130px_120px]"><div><p className="text-sm font-black">Performance real · {scenario.title}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">Janela em que resposta e resultado comercial podem ser atribuídos a este Follow-up.</p></div><input aria-label={`${scenario.title}, janela de atribuição`} disabled={!canManage || loading} type="number" min={1} value={attribution.amount} onChange={(event) => changeAttribution(scenario.key, Number(event.target.value), attribution.unit)} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs"/><select aria-label={`${scenario.title}, unidade da atribuição`} disabled={!canManage || loading} value={attribution.unit} onChange={(event) => changeAttribution(scenario.key, attribution.amount, event.target.value as DelayUnit)} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></div>
            <ScenarioPerformance slice={performance?.scenarios?.[scenario.key]} periodDays={performance?.periodDays || 30}/>
          </div> : null}
        </div>;
      })}</div>
    </section>
  </div>;
}
