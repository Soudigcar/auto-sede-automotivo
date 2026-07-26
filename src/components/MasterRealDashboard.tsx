'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRightLeft,
  BarChart3,
  Car,
  Clock3,
  Inbox,
  Landmark,
  RefreshCcw,
  Sparkles,
  Store,
  Trophy,
  UserCheck,
  Users,
  Wallet
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { MasterSidebar } from '@/components/MasterSidebar';
import { DashboardGoalBar } from '@/components/DashboardGoalBar';
import { DashboardFilterCard } from '@/components/DashboardFilterCard';

type Summary = {
  totalLeads: number;
  surveysCount: number;
  leadsWithPhone: number;
  salesCount: number;
  conversionRate: number;
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

const initialSummary: Summary = {
  totalLeads: 0,
  surveysCount: 0,
  leadsWithPhone: 0,
  salesCount: 0,
  conversionRate: 0,
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

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function formatPercent(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  const decimals = safe > 0 && safe < 1 ? 2 : safe % 1 === 0 ? 0 : 2;
  return `${safe.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: 2 })}%`;
}

function getProgress(value: number, total: number) {
  return total > 0 ? Math.min(100, (value / total) * 100) : 0;
}

export function MasterRealDashboard() {
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
    setMessage('Calculando indicadores reais...');

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
      setMessage('');
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

  const primaryCards = useMemo(() => [
    {
      label: 'Leads Captados',
      value: formatNumber(summary.totalLeads),
      helper: 'Total real de entradas no sistema',
      icon: Users,
      accent: 'from-slate-700 to-slate-950',
      progress: null as number | null,
      progressLabel: ''
    },
    {
      label: 'Pesquisas Realizadas',
      value: formatNumber(summary.surveysCount),
      helper: 'Registros reais em pesquisas de rua',
      icon: Sparkles,
      accent: 'from-sky-500 to-sky-700',
      progress: getProgress(summary.surveysCount, summary.totalLeads),
      progressLabel: 'Pesquisas / leads'
    },
    {
      label: 'Telefone Preenchido',
      value: formatNumber(summary.leadsWithPhone),
      helper: 'Leads com telefone informado',
      icon: Inbox,
      accent: 'from-emerald-500 to-emerald-700',
      progress: getProgress(summary.leadsWithPhone, summary.totalLeads),
      progressLabel: 'Cobertura da base'
    },
    {
      label: 'Vendas Confirmadas',
      value: formatNumber(summary.salesCount),
      helper: 'Registros oficiais na tabela de vendas',
      icon: Wallet,
      accent: 'from-zinc-800 to-black',
      progress: getProgress(summary.salesCount, summary.leadsWithPhone),
      progressLabel: 'Vendas / leads com telefone'
    },
    {
      label: 'Taxa de Conversão',
      value: formatPercent(summary.conversionRate),
      helper: 'Vendas confirmadas / leads com telefone',
      icon: Sparkles,
      accent: 'from-violet-500 to-fuchsia-600',
      progress: summary.conversionRate,
      progressLabel: 'Conversão real'
    }
  ], [summary]);

  const secondaryCards = useMemo(() => [
    {
      label: 'Bancos Financiadores',
      value: formatNumber(summary.financedBanksCount),
      helper: `${formatNumber(summary.financedSalesCount)} venda(s) financiada(s)`,
      icon: Landmark,
      accent: 'from-amber-500 to-orange-600',
      progress: getProgress(summary.financedSalesCount, summary.salesCount),
      progressLabel: 'Financiadas / vendas'
    },
    {
      label: 'Faturamento Registrado',
      value: formatMoney(summary.totalRevenue),
      helper: 'Soma dos valores gravados nas vendas',
      icon: Wallet,
      accent: 'from-emerald-500 to-green-700',
      progress: goal.goal > 0 ? getProgress(summary.totalRevenue, goal.goal) : null,
      progressLabel: goal.goal > 0 ? 'Faturamento / meta' : ''
    },
    {
      label: 'Direcionados para Loja',
      value: formatNumber(summary.directedToStore),
      helper: 'Leads com loja válida definida',
      icon: ArrowRightLeft,
      accent: 'from-red-500 to-rose-600',
      progress: getProgress(summary.directedToStore, summary.totalLeads),
      progressLabel: 'Direcionados / leads'
    },
    {
      label: 'Atendimentos Iniciados',
      value: formatNumber(summary.startedCount),
      helper: 'Leads com evidência real de atendimento',
      icon: UserCheck,
      accent: 'from-cyan-500 to-blue-700',
      progress: getProgress(summary.startedCount, summary.totalLeads),
      progressLabel: 'Atendidos / leads'
    },
    {
      label: 'Veículos Disponíveis',
      value: formatNumber(summary.totalCarsInEvent),
      helper: 'Estoque publicado e não excluído',
      icon: Car,
      accent: 'from-indigo-500 to-blue-700',
      progress: null,
      progressLabel: ''
    }
  ], [summary, goal.goal]);

  return (
    <main className="min-h-screen bg-[#05070D] p-3 text-zinc-950 md:p-6">
      <section className="mx-auto flex max-w-[1600px] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-black/50">
        <MasterSidebar active="Dashboard" />
        <div className="min-w-0 flex-1 bg-[#F4F6FA] p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-600">Gestão Master</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-[#101828] md:text-4xl">Dashboard de Dados Reais</h1>
              <p className="mt-2 text-sm text-zinc-500">
                {updatedAt ? `Atualizado em ${new Date(updatedAt).toLocaleString('pt-BR')}` : 'Aguardando atualização'}
              </p>
            </div>
            <button onClick={() => void loadSummary()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-bold text-zinc-700 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:text-red-600 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60">
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Atualizando...' : 'Atualizar dashboard'}
            </button>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">{message}</div> : null}

          <DashboardGoalBar sponsorship={goal.sponsorship} goal={goal.goal} done={goal.done} progress={goal.progress} eventLabel={goal.label} />

          <section className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr_1fr]">
            <DashboardFilterCard label="Evento">
              <select className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none" value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
                <option value="all">Todos os eventos</option>
                {events.map((event) => <option key={event.id} value={event.id}>{event.event_name}</option>)}
              </select>
            </DashboardFilterCard>
            <DashboardFilterCard label="Loja">
              <select className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none" value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)}>
                <option value="all">Todas</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
              </select>
            </DashboardFilterCard>
            <DashboardFilterCard label="Data inicial">
              <input className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </DashboardFilterCard>
            <DashboardFilterCard label="Data final">
              <input className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </DashboardFilterCard>
          </section>

          <section className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{primaryCards.map((card) => <RealKpiCard key={card.label} {...card} />)}</div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{secondaryCards.map((card) => <RealKpiCard key={card.label} {...card} />)}</div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            <RealFunnel items={funnel} />
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
              <RealCategoryChart items={categories} />
              <RealHeatmap items={heatmap} source={heatmapSource} />
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            <RankingCard title="Ranking de Lojas" items={rankings.stores} icon={<Store size={18} />} empty="Sem lojas com vendas no período." />
            <RankingCard title="Ranking de Vendedores" items={rankings.sellers} icon={<UserCheck size={18} />} empty="Sem vendas atribuídas a vendedores no período." />
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            <RankingCard title="Ranking de Pré-vendas / SDR" items={rankings.preSales} icon={<Users size={18} />} empty="Sem vendas atribuídas a Pré-vendas no período." />
            <RankingCard title="Ranking de Prospectadores" items={rankings.prospectors} icon={<Users size={18} />} empty="Sem vendas atribuídas a prospectadores no período." />
          </section>
        </div>
      </section>
    </main>
  );
}

function RealKpiCard({
  label,
  value,
  helper,
  icon: Icon,
  accent,
  progress,
  progressLabel
}: {
  label: string;
  value: string;
  helper: string;
  icon: any;
  accent: string;
  progress: number | null;
  progressLabel: string;
}) {
  const safeProgress = progress === null ? null : Math.max(0, Math.min(progress, 100));

  return (
    <div className="group relative overflow-hidden rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-zinc-500">{label}</p>
          <strong className="mt-3 block break-words text-3xl font-black text-zinc-950 2xl:text-4xl">{value}</strong>
          <span className="mt-2 block text-xs text-zinc-400">{helper}</span>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}><Icon size={20} /></div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Dados atuais</span>
        {safeProgress !== null ? <span className="text-right text-xs font-bold text-zinc-400">{progressLabel}: {formatPercent(safeProgress)}</span> : null}
      </div>
      {safeProgress !== null ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
          <div className={`h-full rounded-full bg-gradient-to-r ${accent} transition-all duration-500`} style={{ width: `${safeProgress}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function RealFunnel({ items }: { items: FunnelItem[] }) {
  return (
    <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm md:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-zinc-950">Funil comercial real</h2>
          <p className="mt-1 text-sm text-zinc-500">Percentuais calculados sobre os leads do filtro atual.</p>
        </div>
        <BarChart3 className="text-red-600" />
      </div>
      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-black text-zinc-700">{item.label}</span>
              <span className="font-bold text-zinc-500">{formatNumber(item.count)} · {formatPercent(item.percent)}</span>
            </div>
            <div className="h-9 overflow-hidden rounded-xl bg-zinc-100">
              <div className="flex h-full items-center px-3 text-xs font-black text-white transition-all" style={{ width: `${Math.max(0, Math.min(item.percent, 100))}%`, background: item.color }}>
                {item.percent >= 14 ? item.label : ''}
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 ? <EmptyState text="Nenhum lead encontrado no filtro atual." /> : null}
      </div>
    </div>
  );
}

function RealCategoryChart({ items }: { items: CategoryItem[] }) {
  const maxLeads = Math.max(...items.map((item) => item.leads), 1);

  return (
    <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="font-black text-zinc-950">Conversão por Categoria</h3>
      <p className="mt-1 text-xs text-zinc-400">Vendas divididas pelos leads com categoria preenchida.</p>
      {items.length ? (
        <div className="mt-5 space-y-3">
          {items.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-black text-zinc-700">{item.label}</span>
                <span className="font-bold text-zinc-500">{item.leads} leads · {item.sales} vendas · {formatPercent(item.conversion)}</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-sky-600" style={{ width: `${(item.leads / maxLeads) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="Dados insuficientes: nenhum lead possui categoria válida preenchida." />
      )}
    </div>
  );
}

function RealHeatmap({ items, source }: { items: HourItem[]; source: string }) {
  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="font-black text-zinc-950">Horários de Pico</h3><p className="mt-1 text-xs text-zinc-400">Fonte: {source}</p></div>
        <Clock3 size={18} className="text-sky-600" />
      </div>
      <div className="mt-5 grid grid-cols-6 gap-2 sm:grid-cols-12">
        {items.map((item) => (
          <div key={item.hour} className="text-center">
            <div className="flex h-12 items-center justify-center rounded-lg bg-sky-600 text-xs font-black text-white" style={{ opacity: item.count === 0 ? 0.12 : Math.max(0.22, item.count / max) }} title={`${item.hour}h: ${item.count} registros`}>
              {item.count}
            </div>
            <span className="mt-1 block text-[9px] font-bold text-zinc-400">{String(item.hour).padStart(2, '0')}h</span>
          </div>
        ))}
      </div>
      {items.every((item) => item.count === 0) ? <p className="mt-4 text-xs font-bold text-zinc-400">Nenhuma atividade encontrada no período.</p> : null}
    </div>
  );
}

function RankingCard({ title, items, icon, empty }: { title: string; items: string[]; icon: ReactNode; empty: string }) {
  return (
    <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h3 className="font-black text-zinc-950">{title}</h3><span className="text-red-600">{icon}</span></div>
      {items.length ? (
        <div className="mt-5 space-y-3">
          {items.map((item, index) => (
            <div key={`${item}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-black text-zinc-950">{index + 1}</span>
                <strong className="min-w-0 break-words text-sm text-zinc-900">{item}</strong>
              </div>
              <Trophy size={16} className={index === 0 ? 'shrink-0 text-amber-500' : 'shrink-0 text-zinc-300'} />
            </div>
          ))}
        </div>
      ) : <EmptyState text={empty} />}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-center text-sm font-bold text-zinc-500">{text}</div>;
}
