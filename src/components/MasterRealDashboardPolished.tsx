'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Car,
  Clock3,
  Inbox,
  Landmark,
  RefreshCcw,
  Sparkles,
  Store,
  Target,
  Trophy,
  UserCheck,
  Users,
  Wallet
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { MasterSidebar } from '@/components/MasterSidebar';

type Summary = {
  totalLeads: number;
  surveysCount: number;
  leadsWithPhone: number;
  salesCount: number;
  conversionSalesCount: number;
  conversionRate: number;
  response: {
    eligible_conversations: number;
    measured_conversations: number;
    unanswered_conversations: number;
    coverage_percent: number;
    average_minutes: number | null;
    median_minutes: number | null;
    p90_minutes: number | null;
  };
  totalRevenue: number;
  financedBanksCount: number;
  financedSalesCount: number;
  directedToStore: number;
  startedCount: number;
  totalCarsInEvent: number;
};

type GoalSummary = {
  sponsorship: number;
  goal: number;
  done: number;
  progress: number;
  label: string;
};

type FunnelItem = { label: string; count: number; percent: number; color: string };
type CategoryItem = { label: string; leads: number; sales: number; conversion: number };
type HourItem = { hour: number; count: number };

type DashboardPayload = {
  events: any[];
  stores: any[];
  summary: Summary;
  goal: GoalSummary;
  funnel: FunnelItem[];
  categories: CategoryItem[];
  heatmap: HourItem[];
  heatmapSource: string;
  rankings: {
    stores: string[];
    sellers: string[];
    preSales: string[];
    prospectors: string[];
  };
  updatedAt: string;
};

type KpiCardData = {
  label: string;
  value: string;
  helper: string;
  icon: any;
  accent: string;
  progress: number | null;
  progressLabel: string;
};

const initialSummary: Summary = {
  totalLeads: 0,
  surveysCount: 0,
  leadsWithPhone: 0,
  salesCount: 0,
  conversionSalesCount: 0,
  conversionRate: 0,
  response: { eligible_conversations: 0, measured_conversations: 0, unanswered_conversations: 0, coverage_percent: 0, average_minutes: null, median_minutes: null, p90_minutes: null },
  totalRevenue: 0,
  financedBanksCount: 0,
  financedSalesCount: 0,
  directedToStore: 0,
  startedCount: 0,
  totalCarsInEvent: 0
};

const initialGoal: GoalSummary = {
  sponsorship: 0,
  goal: 0,
  done: 0,
  progress: 0,
  label: 'Todos os eventos'
};

const panelClass = 'rounded-[22px] border border-white/[0.08] bg-[#0A1424] shadow-[0_18px_55px_rgba(0,0,0,0.22)]';

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatResponseMinutes(value: number | null) {
  if (value === null) return '—';
  if (value < 1) return '< 1 min';
  if (value < 60) return `${Math.round(value)} min`;
  if (value < 1440) return `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
  return `${Math.floor(value / 1440)}d ${Math.round((value % 1440) / 60)}h`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatPercent(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  const decimals = safe > 0 && safe < 1 ? 2 : safe % 1 === 0 ? 0 : 2;
  return `${safe.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: 2 })}%`;
}

function getProgress(value: number, total: number) {
  return total > 0 ? Math.min(100, (value / total) * 100) : 0;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(Number(value || 0), 100));
}

export function MasterRealDashboardPolished() {
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [goal, setGoal] = useState<GoalSummary>(initialGoal);
  const [events, setEvents] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [selectedStoreId, setSelectedStoreId] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [funnel, setFunnel] = useState<FunnelItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [heatmap, setHeatmap] = useState<HourItem[]>([]);
  const [heatmapSource, setHeatmapSource] = useState('Atividades registradas');
  const [rankings, setRankings] = useState<DashboardPayload['rankings']>({ stores: [], sellers: [], preSales: [], prospectors: [] });
  const [updatedAt, setUpdatedAt] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setMessage('');

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || '';
      const query = new URLSearchParams({
        event_id: selectedEventId,
        store_id: selectedStoreId,
        date_from: dateFrom,
        date_to: dateTo
      });

      const response = await fetch(`/api/master/dashboard-real?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o dashboard.');

      const result = payload as DashboardPayload;
      setEvents(result.events || []);
      setStores(result.stores || []);
      setSummary(result.summary || initialSummary);
      setGoal(result.goal || initialGoal);
      setFunnel(result.funnel || []);
      setCategories(result.categories || []);
      setHeatmap(result.heatmap || []);
      setHeatmapSource(result.heatmapSource || 'Atividades registradas');
      setRankings(result.rankings || { stores: [], sellers: [], preSales: [], prospectors: [] });
      setUpdatedAt(result.updatedAt || '');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar os indicadores reais.');
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedEventId, selectedStoreId, dateFrom, dateTo]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    setSelectedStoreId('all');
  }, [selectedEventId]);

  const primaryCards = useMemo<KpiCardData[]>(() => [
    {
      label: 'Leads captados',
      value: formatNumber(summary.totalLeads),
      helper: 'Entradas reais no sistema',
      icon: Users,
      accent: '#64748B',
      progress: null,
      progressLabel: ''
    },
    {
      label: 'Pesquisas realizadas',
      value: formatNumber(summary.surveysCount),
      helper: 'Registros em pesquisas de rua',
      icon: Sparkles,
      accent: '#38BDF8',
      progress: getProgress(summary.surveysCount, summary.totalLeads),
      progressLabel: 'dos leads'
    },
    {
      label: 'Telefone preenchido',
      value: formatNumber(summary.leadsWithPhone),
      helper: 'Leads com contato informado',
      icon: Inbox,
      accent: '#10B981',
      progress: getProgress(summary.leadsWithPhone, summary.totalLeads),
      progressLabel: 'da base'
    },
    {
      label: 'Vendas confirmadas',
      value: formatNumber(summary.salesCount),
      helper: 'Registros oficiais de vendas',
      icon: Wallet,
      accent: '#F97316',
      progress: getProgress(summary.salesCount, summary.leadsWithPhone),
      progressLabel: 'dos contatos'
    },
    {
      label: 'Taxa de conversão',
      value: formatPercent(summary.conversionRate),
      helper: `${formatNumber(summary.conversionSalesCount)} lead(s) convertido(s) ÷ leads da coorte`,
      icon: Activity,
      accent: '#C084FC',
      progress: summary.conversionRate,
      progressLabel: 'conversão'
    }
  ], [summary]);

  const secondaryCards = useMemo<KpiCardData[]>(() => [
    {
      label: 'Resposta humana',
      value: formatResponseMinutes(summary.response.median_minutes),
      helper: `${formatNumber(summary.response.measured_conversations)}/${formatNumber(summary.response.eligible_conversations)} conversas medidas · mediana`,
      icon: Clock3,
      accent: '#0EA5E9',
      progress: summary.response.coverage_percent,
      progressLabel: 'respondidas'
    },
    {
      label: 'Bancos financiadores',
      value: formatNumber(summary.financedBanksCount),
      helper: `${formatNumber(summary.financedSalesCount)} venda(s) financiada(s)`,
      icon: Landmark,
      accent: '#F59E0B',
      progress: getProgress(summary.financedSalesCount, summary.salesCount),
      progressLabel: 'das vendas'
    },
    {
      label: 'Faturamento registrado',
      value: formatMoney(summary.totalRevenue),
      helper: 'Soma dos valores gravados',
      icon: Wallet,
      accent: '#22C55E',
      progress: goal.goal > 0 ? getProgress(summary.totalRevenue, goal.goal) : null,
      progressLabel: 'da meta'
    },
    {
      label: 'Direcionados à loja',
      value: formatNumber(summary.directedToStore),
      helper: 'Leads com loja definida',
      icon: ArrowRightLeft,
      accent: '#EF4444',
      progress: getProgress(summary.directedToStore, summary.totalLeads),
      progressLabel: 'dos leads'
    },
    {
      label: 'Atendimentos iniciados',
      value: formatNumber(summary.startedCount),
      helper: 'Leads com evidência de contato',
      icon: UserCheck,
      accent: '#06B6D4',
      progress: getProgress(summary.startedCount, summary.totalLeads),
      progressLabel: 'dos leads'
    },
    {
      label: 'Veículos disponíveis',
      value: formatNumber(summary.totalCarsInEvent),
      helper: 'Estoque publicado e ativo',
      icon: Car,
      accent: '#6366F1',
      progress: null,
      progressLabel: ''
    }
  ], [summary, goal.goal]);

  const executiveItems = useMemo(() => [
    { label: 'Eventos disponíveis', value: formatNumber(events.length), icon: CalendarDays, accent: '#EF4444' },
    { label: 'Lojas conectadas', value: formatNumber(stores.length), icon: Store, accent: '#38BDF8' },
    { label: 'Leads no período', value: formatNumber(summary.totalLeads), icon: Users, accent: '#10B981' },
    { label: 'Progresso da meta', value: formatPercent(goal.progress), icon: Target, accent: '#F59E0B' }
  ], [events.length, stores.length, summary.totalLeads, goal.progress]);

  const auraInsights = useMemo(() => {
    const insights: string[] = [];
    const phoneCoverage = getProgress(summary.leadsWithPhone, summary.totalLeads);
    const serviceCoverage = getProgress(summary.startedCount, summary.totalLeads);

    if (summary.totalLeads === 0) {
      insights.push('O filtro atual ainda não possui leads suficientes para uma leitura operacional.');
    } else {
      insights.push(`${formatPercent(phoneCoverage)} dos leads possuem telefone preenchido.`);
      insights.push(`${formatPercent(serviceCoverage)} dos leads apresentam evidência de atendimento iniciado.`);
    }

    if (summary.salesCount > 0) {
      insights.push(`A conversão real do período está em ${formatPercent(summary.conversionRate)}, com ${formatNumber(summary.salesCount)} venda(s) confirmada(s).`);
    } else if (summary.totalLeads > 0) {
      insights.push('Ainda não há vendas confirmadas no filtro atual; o principal ponto de atenção é o avanço do atendimento para fechamento.');
    }

    if (goal.goal > 0) {
      insights.push(`O realizado representa ${formatPercent(goal.progress)} da meta financeira configurada.`);
    }

    return insights.slice(0, 4);
  }, [summary, goal]);

  return (
    <main className="min-h-screen bg-[#020711] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1920px]">
        <MasterSidebar active="Dashboard" />

        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 xl:px-10">
          <header className="flex flex-col gap-5 border-b border-white/[0.06] pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.34em] text-red-500">Gestão Master</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl xl:text-[42px]">Dashboard de Dados Reais</h1>
              <p className="mt-2 text-sm font-medium text-slate-500">
                {updatedAt ? `Atualizado em ${new Date(updatedAt).toLocaleString('pt-BR')}` : 'Aguardando atualização dos dados'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadSummary()}
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-black text-slate-200 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Atualizando...' : 'Atualizar dashboard'}
            </button>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-5 py-4 text-sm font-bold text-amber-200">{message}</div> : null}

          <section className={`${panelClass} mt-6 grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4`}>
            {executiveItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className={`flex items-center gap-4 px-5 py-4 ${index ? 'border-t border-white/[0.06] sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-l-0 xl:border-l' : ''}`}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ color: item.accent, backgroundColor: `${item.accent}18` }}><Icon size={18} /></div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                    <strong className="mt-1 block truncate text-xl font-black text-white">{item.value}</strong>
                  </div>
                </div>
              );
            })}
          </section>

          <GoalPanel goal={goal} />

          <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_1fr]">
            <FilterCard label="Evento">
              <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)} className="w-full bg-transparent text-sm font-black text-white outline-none [color-scheme:dark]">
                <option value="all">Todos os eventos</option>
                {events.map((event) => <option key={event.id} value={event.id}>{event.event_name}</option>)}
              </select>
            </FilterCard>
            <FilterCard label="Loja">
              <select value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)} className="w-full bg-transparent text-sm font-black text-white outline-none [color-scheme:dark]">
                <option value="all">Todas as lojas</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
              </select>
            </FilterCard>
            <FilterCard label="Data inicial">
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-full bg-transparent text-sm font-black text-white outline-none [color-scheme:dark]" />
            </FilterCard>
            <FilterCard label="Data final">
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-full bg-transparent text-sm font-black text-white outline-none [color-scheme:dark]" />
            </FilterCard>
          </section>

          <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {primaryCards.map((card) => <ExecutiveKpiCard key={card.label} {...card} />)}
            {secondaryCards.map((card) => <ExecutiveKpiCard key={card.label} {...card} />)}
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-[1.25fr_0.9fr_1fr]">
            <FunnelPanel items={funnel} />
            <CategoryPanel items={categories} />
            <HeatmapPanel items={heatmap} source={heatmapSource} />
          </section>

          <AuraPanel insights={auraInsights} />

          <section className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <RankingPanel title="Lojas" items={rankings.stores} icon={<Store size={17} />} empty="Sem lojas com vendas no período." />
            <RankingPanel title="Vendedores" items={rankings.sellers} icon={<UserCheck size={17} />} empty="Sem vendedores com vendas no período." />
            <RankingPanel title="Pré-vendas / SDR" items={rankings.preSales} icon={<Users size={17} />} empty="Sem dados de pré-vendas no período." />
            <RankingPanel title="Prospectadores" items={rankings.prospectors} icon={<Users size={17} />} empty="Sem prospectadores com vendas no período." />
          </section>
        </div>
      </div>
    </main>
  );
}

function GoalPanel({ goal }: { goal: GoalSummary }) {
  const progress = clampPercent(goal.progress);

  return (
    <section className={`${panelClass} mt-4 p-5 lg:p-6`}>
      <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-red-500">Meta do evento</p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-white">{goal.label}</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <GoalMetric label="Patrocínio" value={formatMoney(goal.sponsorship)} />
          <GoalMetric label="Meta" value={formatMoney(goal.goal)} />
          <GoalMetric label="Realizado" value={formatMoney(goal.done)} />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/[0.06] bg-[#050D19] px-4 py-4">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          <span>Progresso financeiro</span>
          <span className="text-slate-300">{formatPercent(progress)}</span>
        </div>
        <div className="relative mt-3 h-8 rounded-full border border-white/10 bg-white/[0.04] p-1.5">
          <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 opacity-90" />
          <div className="absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[#0A1424] bg-red-500 text-white shadow-[0_8px_24px_rgba(239,68,68,0.45)] transition-all" style={{ left: `${Math.max(2, Math.min(progress, 98))}%` }}>
            <Car size={16} />
          </div>
        </div>
      </div>
    </section>
  );
}

function GoalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</p>
      <strong className="mt-1 block truncate text-xs font-black text-white sm:text-sm">{value}</strong>
    </div>
  );
}

function FilterCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="rounded-xl border border-white/[0.08] bg-[#091321] px-4 py-3 transition focus-within:border-red-500/50 focus-within:bg-[#0B1728]">
      <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ExecutiveKpiCard({ label, value, helper, icon: Icon, accent, progress, progressLabel }: KpiCardData) {
  const safeProgress = progress === null ? null : clampPercent(progress);

  return (
    <article className="relative min-h-[154px] overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#0A1424] p-4 shadow-[0_12px_35px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-white/[0.13]">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: accent }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="min-h-8 text-[11px] font-black uppercase leading-4 tracking-[0.08em] text-slate-400">{label}</p>
          <strong className="mt-1 block truncate text-2xl font-black tracking-[-0.04em] text-white">{value}</strong>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{helper}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ color: accent, backgroundColor: `${accent}18` }}><Icon size={18} /></div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.09em] text-slate-600">
          <span>Dados atuais</span>
          {safeProgress !== null ? <span className="text-right text-slate-500">{formatPercent(safeProgress)} {progressLabel}</span> : null}
        </div>
        {safeProgress !== null ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${safeProgress}%`, backgroundColor: accent }} /></div> : null}
      </div>
    </article>
  );
}

function PanelHeader({ title, subtitle, icon, accent = '#EF4444' }: { title: string; subtitle: string; icon: ReactNode; accent?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-base font-black text-white">{title}</h3>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{subtitle}</p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ color: accent, backgroundColor: `${accent}18` }}>{icon}</span>
    </div>
  );
}

function FunnelPanel({ items }: { items: FunnelItem[] }) {
  return (
    <section className={`${panelClass} p-5`}>
      <PanelHeader title="Funil comercial real" subtitle="Avanço das etapas sobre a base filtrada." icon={<BarChart3 size={17} />} />
      <div className="mt-5 space-y-3">
        {items.map((item) => {
          const width = clampPercent(item.percent);
          return (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
                <span className="font-bold text-slate-300">{item.label}</span>
                <span className="font-black text-slate-500">{formatNumber(item.count)} · {formatPercent(item.percent)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full transition-all" style={{ width: `${width}%`, background: item.color }} /></div>
            </div>
          );
        })}
        {!items.length ? <EmptyState text="Nenhum lead encontrado no filtro atual." /> : null}
      </div>
    </section>
  );
}

function CategoryPanel({ items }: { items: CategoryItem[] }) {
  const maxLeads = Math.max(...items.map((item) => item.leads), 1);

  return (
    <section className={`${panelClass} p-5`}>
      <PanelHeader title="Conversão por categoria" subtitle="Leads, vendas e eficiência por segmento." icon={<Sparkles size={17} />} accent="#C084FC" />
      <div className="mt-5 space-y-3">
        {items.slice(0, 7).map((item) => (
          <div key={item.label} className="rounded-xl border border-white/[0.05] bg-white/[0.025] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-black text-slate-300">{item.label}</span>
              <span className="text-[10px] font-black text-purple-300">{formatPercent(item.conversion)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-purple-400" style={{ width: `${(item.leads / maxLeads) * 100}%` }} /></div>
            <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-600">{item.leads} leads · {item.sales} vendas</p>
          </div>
        ))}
        {!items.length ? <EmptyState text="Nenhuma categoria válida no período." /> : null}
      </div>
    </section>
  );
}

function HeatmapPanel({ items, source }: { items: HourItem[]; source: string }) {
  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <section className={`${panelClass} p-5`}>
      <PanelHeader title="Horários de pico" subtitle={`Fonte: ${source}`} icon={<Clock3 size={17} />} accent="#38BDF8" />
      <div className="mt-5 grid grid-cols-6 gap-2">
        {items.map((item) => (
          <div key={item.hour} className="text-center">
            <div className="flex h-9 items-center justify-center rounded-lg border border-sky-400/10 bg-sky-400 text-[10px] font-black text-white" style={{ opacity: item.count === 0 ? 0.09 : Math.max(0.22, item.count / max) }} title={`${item.hour}h: ${item.count} registros`}>{item.count}</div>
            <span className="mt-1 block text-[8px] font-black text-slate-600">{String(item.hour).padStart(2, '0')}h</span>
          </div>
        ))}
      </div>
      {items.length > 0 && items.every((item) => item.count === 0) ? <p className="mt-4 text-[11px] font-bold text-slate-500">Nenhuma atividade encontrada no período.</p> : null}
      {!items.length ? <EmptyState text="Sem registros de horário no filtro atual." /> : null}
    </section>
  );
}

function AuraPanel({ insights }: { insights: string[] }) {
  return (
    <section className="mt-5 overflow-hidden rounded-[22px] border border-red-500/15 bg-[linear-gradient(120deg,#0A1424_0%,#10162A_55%,#190D19_100%)] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.22)] lg:p-6">
      <div className="grid gap-5 lg:grid-cols-[260px_1fr] lg:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 text-red-400 shadow-[0_0_30px_rgba(239,68,68,0.12)]"><BrainCircuit size={25} /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-400">Leitura operacional</p>
            <h3 className="mt-1 text-xl font-black text-white">Insights da AURA</h3>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {insights.map((insight, index) => (
            <div key={`${insight}-${index}`} className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/15 px-4 py-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-400" />
              <p className="text-[11px] font-medium leading-5 text-slate-300">{insight}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RankingPanel({ title, items, icon, empty }: { title: string; items: string[]; icon: ReactNode; empty: string }) {
  return (
    <section className={`${panelClass} p-5`}>
      <PanelHeader title={`Ranking de ${title}`} subtitle="Desempenho no período selecionado." icon={icon} accent="#F59E0B" />
      <div className="mt-4 space-y-2">
        {items.slice(0, 5).map((item, index) => (
          <div key={`${item}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-[10px] font-black text-amber-300">{index + 1}</span>
              <strong className="truncate text-[11px] text-slate-300">{item}</strong>
            </div>
            <Trophy size={14} className={index === 0 ? 'shrink-0 text-amber-400' : 'shrink-0 text-slate-700'} />
          </div>
        ))}
        {!items.length ? <EmptyState text={empty} /> : null}
      </div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-[11px] font-bold text-slate-500">{text}</div>;
}
