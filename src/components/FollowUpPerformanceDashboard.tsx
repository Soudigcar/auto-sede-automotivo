'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarCheck2, Clock3, Loader2, MessageCircleReply, RefreshCw, RotateCcw, ShieldAlert, ShoppingCart, Send } from 'lucide-react';
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

type Performance = {
  periodDays: number;
  generatedAt: string;
  total: Slice;
  scenarios: Record<string, Slice | undefined>;
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

function Metric({ icon: Icon, label, value, helper }: { icon: any; label: string; value: string | number; helper: string }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">{label}</p><p className="mt-2 text-3xl font-black text-zinc-950">{value}</p></div><span className="rounded-xl bg-zinc-950 p-2 text-white"><Icon size={16}/></span></div>
    <p className="mt-2 text-[10px] font-bold leading-4 text-zinc-500">{helper}</p>
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

  return <section className="premium-card p-5 md:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2 text-red-600"><Activity size={18}/><span className="premium-eyebrow">Performance real</span></div><h2 className="mt-2 text-2xl font-black text-zinc-950">Smart Follow-up · Resultado comercial</h2><p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-zinc-500">Mede o que aconteceu depois do Follow-up: resposta do cliente, retomada comercial, agendamento e venda dentro da janela de atribuição de cada jornada.</p></div>
      <div className="flex flex-wrap items-center gap-2"><select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))} className="premium-input min-w-[120px] text-xs"><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option></select><button type="button" onClick={() => void load()} disabled={loading} className="premium-button-secondary"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>Atualizar</button></div>
    </div>

    {message ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">{message}</div> : null}
    {loading && !performance ? <div className="mt-5 flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-xs font-bold text-zinc-600"><Loader2 size={16} className="animate-spin text-red-600"/>Calculando performance real...</div> : null}

    {total ? <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Send} label="Enviados" value={total.sent} helper="Follow-ups realmente enviados no período."/>
        <Metric icon={MessageCircleReply} label="Responderam" value={total.responses} helper={`${formatRate(total.responseRate)} dos envios geraram resposta dentro da janela.`}/>
        <Metric icon={RotateCcw} label="Recuperados" value={total.recovered} helper={`${formatRate(total.recoveryRate)} tiveram resposta e continuidade comercial.`}/>
        <Metric icon={Clock3} label="Tempo até resposta" value={formatMinutes(total.avgResponseMinutes)} helper="Média entre o Follow-up e a primeira resposta do cliente."/>
        <Metric icon={CalendarCheck2} label="Agendamentos" value={total.appointments} helper={`${formatRate(total.appointmentRate)} dos Follow-ups resultaram em agendamento atribuído.`}/>
        <Metric icon={ShoppingCart} label="Vendas" value={total.sales} helper={`${formatRate(total.salesRate)} dos Follow-ups resultaram em venda atribuída.`}/>
        <Metric icon={ShieldAlert} label="Fallback COPILOT" value={total.fallbacks} helper="Casos que a AUTOCAR recusou enviar automaticamente e pediu revisão."/>
        <Metric icon={ShieldAlert} label="Bloqueios / falhas" value={`${total.blocked} / ${total.failed}`} helper="Bloqueios de segurança e falhas técnicas do executor."/>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
        <div className="flex items-center justify-between bg-zinc-950 px-4 py-3 text-white"><div><p className="text-xs font-black">Performance por jornada</p><p className="mt-1 text-[10px] text-zinc-400">Atribuição calculada com a janela configurada em cada jornada.</p></div><span className="text-[10px] font-bold text-zinc-400">{performance.periodDays} dias</span></div>
        {scenarioRows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-zinc-50 text-[10px] uppercase text-zinc-500"><tr><th className="px-4 py-3">Jornada</th><th className="px-3 py-3">Enviados</th><th className="px-3 py-3">Respostas</th><th className="px-3 py-3">Recuperados</th><th className="px-3 py-3">Agend.</th><th className="px-3 py-3">Vendas</th><th className="px-3 py-3">Fallback</th></tr></thead><tbody>{scenarioRows.map(([key, row]) => <tr key={key} className="border-t border-zinc-100"><td className="px-4 py-3 font-black text-zinc-900">{scenarioLabels[key] || key}</td><td className="px-3 py-3 font-bold">{row?.sent || 0}</td><td className="px-3 py-3 font-bold">{row?.responses || 0} <span className="text-zinc-400">({formatRate(row?.responseRate || 0)})</span></td><td className="px-3 py-3 font-bold">{row?.recovered || 0}</td><td className="px-3 py-3 font-bold">{row?.appointments || 0}</td><td className="px-3 py-3 font-bold">{row?.sales || 0}</td><td className="px-3 py-3 font-bold">{row?.fallbacks || 0}</td></tr>)}</tbody></table></div> : <div className="p-5 text-xs font-bold text-zinc-500">Ainda não há eventos de Follow-up suficientes neste período.</div>}
      </div>
      <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] font-bold leading-5 text-sky-900">“Respondido” = primeira mensagem inbound após o Follow-up. “Recuperado” = respondeu e depois houve continuidade comercial. Agendamento e venda só contam quando ocorrem depois do Follow-up e dentro da janela de atribuição.</div>
    </> : null}
  </section>;
}
