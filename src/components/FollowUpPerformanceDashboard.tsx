'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarCheck2, Clock3, Loader2, MessageCircleReply, RefreshCw, RotateCcw, ShieldAlert, ShoppingCart, Send, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Slice = {
  sent: number;
  responses: number;
  recovered: number;
  appointments: number;
  sales: number;
  fallbacks: number;
  blocked: number;
  failed: number;
  responseRate: number;
  recoveryRate: number;
  appointmentRate: number;
  salesRate: number;
  avgResponseMinutes: number | null;
};

type TimelinePoint = {
  date: string;
  sent: number;
  responses: number;
  recovered: number;
  appointments: number;
  sales: number;
};

type Performance = {
  periodDays: number;
  generatedAt: string;
  total: Slice;
  scenarios: Record<string, Slice | undefined>;
  timeline: TimelinePoint[];
};

const scenarioLabels: Record<string, string> = {
  silent_lead: 'Lead silencioso',
  simulation_pending: 'Simulação pendente',
  vehicle_interest: 'Interesse em veículo',
  visit_confirmation: 'Confirmação de visita',
  post_visit: 'Pós-visita',
  no_show: 'Não compareceu',
  callback_requested: 'Retorno solicitado'
};

function formatRate(value: number) {
  return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value < 60) return `${Math.round(value)} min`;
  const hours = value / 60;
  return `${hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function Metric({ icon: Icon, label, value, helper }: { icon: any; label: string; value: string | number; helper: string }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">{label}</p><p className="mt-2 text-3xl font-black text-zinc-950">{value}</p></div><span className="rounded-xl bg-zinc-950 p-2 text-white"><Icon size={16}/></span></div>
    <p className="mt-2 text-[10px] font-bold leading-4 text-zinc-500">{helper}</p>
  </div>;
}

function FunnelStage({ label, value, helper, width }: { label: string; value: number; helper: string; width: number }) {
  return <div className="flex justify-center">
    <div className="rounded-2xl border border-zinc-200 bg-zinc-950 px-5 py-4 text-center text-white shadow-sm transition-all" style={{ width: `${Math.max(42, width)}%` }}>
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      <p className="mt-1 text-[10px] font-bold text-zinc-400">{helper}</p>
    </div>
  </div>;
}

function CommercialResult({ icon: Icon, label, value, rate, helper }: { icon: any; label: string; value: number; rate: number; helper: string }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">{label}</p><p className="mt-2 text-4xl font-black text-zinc-950">{value}</p></div><span className="rounded-2xl bg-red-600 p-3 text-white"><Icon size={20}/></span></div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-red-600" style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}/></div>
    <p className="mt-2 text-[10px] font-bold text-zinc-500">{formatRate(rate)} dos Follow-ups · {helper}</p>
  </div>;
}

export function FollowUpPerformanceDashboard({ scope, slug }: { scope: 'master' | 'store'; slug?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [periodDays, setPeriodDays] = useState(30);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sessão expirada.');
      const endpoint = scope === 'master'
        ? `/api/master/autocar/follow-up-v2?performance_days=${periodDays}`
        : `/api/store/portal/autocar/follow-up-v2?slug=${encodeURIComponent(slug || '')}&performance_days=${periodDays}`;
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar a performance do Follow-up.');
      setPerformance(body.performance || null);
      setMessage('');
    } catch (error: any) {
      setPerformance(null);
      setMessage(error?.message || 'Não foi possível carregar a performance do Follow-up.');
    } finally {
      setLoading(false);
    }
  }, [periodDays, scope, slug, supabase]);

  useEffect(() => { void load(); }, [load]);

  const total = performance?.total;
  const scenarioRows = Object.entries(performance?.scenarios || {})
    .filter(([, value]) => Boolean(value && (value.sent || value.fallbacks || value.blocked || value.failed)))
    .sort((a, b) => Number(b[1]?.sent || 0) - Number(a[1]?.sent || 0));
  const timeline = performance?.timeline || [];
  const visibleTimeline = timeline.slice(Math.max(0, timeline.length - (periodDays === 90 ? 30 : periodDays)));
  const maxTimeline = Math.max(1, ...visibleTimeline.map((point) => Math.max(point.sent, point.responses, point.recovered, point.appointments, point.sales)));
  const sentBase = Math.max(1, total?.sent || 0);
  const respondedBase = Math.max(1, total?.responses || 0);

  return <section className="premium-card p-5 md:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2 text-red-600"><Activity size={18}/><span className="premium-eyebrow">Performance real</span></div><h2 className="mt-2 text-2xl font-black text-zinc-950">Smart Follow-up · Funil comercial</h2><p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-zinc-500">Separa reengajamento de resultado comercial para não confundir resposta com venda. Agendamentos e vendas são atribuídos pela janela da jornada, mesmo quando não passam por todas as etapas do funil de reengajamento.</p></div>
      <div className="flex flex-wrap items-center gap-2"><select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))} className="premium-input min-w-[120px] text-xs"><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option></select><button type="button" onClick={() => void load()} disabled={loading} className="premium-button-secondary"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>Atualizar</button></div>
    </div>

    {message ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">{message}</div> : null}
    {loading && !performance ? <div className="mt-5 flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-xs font-bold text-zinc-600"><Loader2 size={16} className="animate-spin text-red-600"/>Calculando performance real...</div> : null}

    {total ? <>
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
          <div className="flex items-center gap-2"><RotateCcw size={17} className="text-red-600"/><div><p className="text-xs font-black text-zinc-950">Funil de reengajamento</p><p className="mt-1 text-[10px] font-bold text-zinc-500">Aqui a sequência é estrita: enviado → respondeu → teve continuidade comercial.</p></div></div>
          <div className="mt-5 space-y-3">
            <FunnelStage label="Enviados" value={total.sent} helper="Base de Follow-ups disparados" width={100}/>
            <FunnelStage label="Responderam" value={total.responses} helper={`${formatRate(total.responseRate)} dos enviados`} width={(total.responses / sentBase) * 100}/>
            <FunnelStage label="Recuperados" value={total.recovered} helper={`${formatRate(total.responses ? (total.recovered / respondedBase) * 100 : 0)} dos que responderam`} width={(total.recovered / sentBase) * 100}/>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <CommercialResult icon={CalendarCheck2} label="Agendamentos atribuídos" value={total.appointments} rate={total.appointmentRate} helper="ocorridos depois do Follow-up dentro da janela"/>
            <CommercialResult icon={ShoppingCart} label="Vendas atribuídas" value={total.sales} rate={total.salesRate} helper="ocorridas depois do Follow-up dentro da janela"/>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={Clock3} label="Tempo até resposta" value={formatMinutes(total.avgResponseMinutes)} helper="Média até a primeira resposta."/>
            <Metric icon={ShieldAlert} label="Fallback COPILOT" value={total.fallbacks} helper="AUTOCAR pediu revisão humana."/>
            <Metric icon={ShieldAlert} label="Bloqueios / falhas" value={`${total.blocked} / ${total.failed}`} helper="Segurança / erro técnico."/>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><TrendingUp size={17} className="text-red-600"/><div><p className="text-xs font-black text-zinc-950">Evolução temporal</p><p className="mt-1 text-[10px] font-bold text-zinc-500">Volumes por dia do Follow-up e dos resultados atribuídos.</p></div></div><span className="text-[10px] font-bold text-zinc-400">{periodDays === 90 ? 'últimos 30 dias visíveis · filtro 90 dias' : `${periodDays} dias`}</span></div>
        <div className="mt-5 overflow-x-auto pb-2">
          <div className="flex min-w-[680px] items-end gap-2" style={{ height: 180 }}>
            {visibleTimeline.map((point) => <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-[135px] w-full items-end justify-center gap-1">
                <div title={`Enviados: ${point.sent}`} className="w-2 rounded-t bg-zinc-900" style={{ height: `${Math.max(point.sent ? 6 : 0, (point.sent / maxTimeline) * 100)}%` }}/>
                <div title={`Respostas: ${point.responses}`} className="w-2 rounded-t bg-sky-500" style={{ height: `${Math.max(point.responses ? 6 : 0, (point.responses / maxTimeline) * 100)}%` }}/>
                <div title={`Recuperados: ${point.recovered}`} className="w-2 rounded-t bg-emerald-500" style={{ height: `${Math.max(point.recovered ? 6 : 0, (point.recovered / maxTimeline) * 100)}%` }}/>
                <div title={`Agendamentos: ${point.appointments}`} className="w-2 rounded-t bg-amber-500" style={{ height: `${Math.max(point.appointments ? 6 : 0, (point.appointments / maxTimeline) * 100)}%` }}/>
                <div title={`Vendas: ${point.sales}`} className="w-2 rounded-t bg-red-600" style={{ height: `${Math.max(point.sales ? 6 : 0, (point.sales / maxTimeline) * 100)}%` }}/>
              </div>
              <span className="text-[9px] font-bold text-zinc-400">{formatDate(point.date)}</span>
            </div>)}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[9px] font-bold text-zinc-500"><span>■ Enviados</span><span className="text-sky-600">■ Respostas</span><span className="text-emerald-600">■ Recuperados</span><span className="text-amber-600">■ Agendamentos</span><span className="text-red-600">■ Vendas</span></div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
        <div className="flex items-center justify-between bg-zinc-950 px-4 py-3 text-white"><div><p className="text-xs font-black">Performance por jornada</p><p className="mt-1 text-[10px] text-zinc-400">Atribuição calculada com a janela configurada em cada jornada.</p></div><span className="text-[10px] font-bold text-zinc-400">{performance.periodDays} dias</span></div>
        {scenarioRows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-zinc-50 text-[10px] uppercase text-zinc-500"><tr><th className="px-4 py-3">Jornada</th><th className="px-3 py-3">Enviados</th><th className="px-3 py-3">Respostas</th><th className="px-3 py-3">Recuperados</th><th className="px-3 py-3">Agend.</th><th className="px-3 py-3">Vendas</th><th className="px-3 py-3">Fallback</th></tr></thead><tbody>{scenarioRows.map(([key, row]) => <tr key={key} className="border-t border-zinc-100"><td className="px-4 py-3 font-black text-zinc-900">{scenarioLabels[key] || key}</td><td className="px-3 py-3 font-bold">{row?.sent || 0}</td><td className="px-3 py-3 font-bold">{row?.responses || 0} <span className="text-zinc-400">({formatRate(row?.responseRate || 0)})</span></td><td className="px-3 py-3 font-bold">{row?.recovered || 0}</td><td className="px-3 py-3 font-bold">{row?.appointments || 0}</td><td className="px-3 py-3 font-bold">{row?.sales || 0}</td><td className="px-3 py-3 font-bold">{row?.fallbacks || 0}</td></tr>)}</tbody></table></div> : <div className="p-5 text-xs font-bold text-zinc-500">Ainda não há eventos de Follow-up suficientes neste período.</div>}
      </div>
      <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] font-bold leading-5 text-sky-900">“Respondido” = primeira mensagem inbound após o Follow-up. “Recuperado” = respondeu e depois houve continuidade comercial. Agendamento e venda são resultados atribuídos ao Follow-up quando ocorrem depois dele e dentro da janela da jornada; não significam necessariamente que passaram por todas as etapas do funil de reengajamento.</div>
    </> : null}
  </section>;
}
