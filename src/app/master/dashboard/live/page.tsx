'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft,
  BarChart3,
  CalendarDays,
  Car,
  FileText,
  Inbox,
  Landmark,
  LayoutDashboard,
  RefreshCcw,
  Sparkles,
  Store,
  Trophy,
  Users,
  Wallet
} from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Summary = {
  totalLeads: number;
  leadsWithPhone: number;
  surveysWithoutPhone: number;
  salesCount: number;
  lossesCount: number;
  conversionRate: number;
  averageTicket: number;
  totalRevenue: number;
  financedBanksCount: number;
  directedToStore: number;
  receivedLeads: number;
  totalCarsInEvent: number;
};

const funnel = [
  { label: 'Abordagem', left: '100%', right: '100%', width: '100%', color: '#0B84F3' },
  { label: 'Pesquisa', left: '79%', right: '79%', width: '88%', color: '#415F86' },
  { label: 'Lead com Telefone', left: '67%', right: '67%', width: '76%', color: '#FF941A' },
  { label: 'Direcionado', left: '95%', right: '95%', width: '66%', color: '#EE2737' },
  { label: 'Atendimento Iniciado', left: '88%', right: '88%', width: '56%', color: '#168AE5' },
  { label: 'Agendamento', left: '62%', right: '62%', width: '46%', color: '#15A85A' },
  { label: 'Comparecimento', left: '80%', right: '80%', width: '36%', color: '#00A86B' },
  { label: 'Venda', left: '', right: '65%', width: '26%', color: '#E30613' }
];

const categories = [
  { label: 'SUV', value: 18 },
  { label: 'Hatch', value: 10 },
  { label: 'Sedan', value: 12 },
  { label: 'Picape', value: 6 },
  { label: 'Moto', value: 4 },
  { label: 'Outros', value: 8 }
];

const heatmap = [
  [15, 25, 40, 55, 70],
  [18, 35, 60, 86, 78],
  [22, 48, 76, 100, 84],
  [16, 38, 72, 90, 68],
  [10, 28, 52, 64, 42],
  [8, 18, 36, 46, 28]
];

const storeRanking = ['AutoPrime', 'FlexCar', 'MegaVeiculos', 'Drive Motors', 'Prime Select'];
const prospectorRanking = ['Ana Silva', 'Joao Pereira', 'Carlos Souza', 'Fernanda Lima', 'Ricardo Alves'];

const initialSummary: Summary = {
  totalLeads: 0,
  leadsWithPhone: 0,
  surveysWithoutPhone: 0,
  salesCount: 0,
  lossesCount: 0,
  conversionRate: 0,
  averageTicket: 0,
  totalRevenue: 0,
  financedBanksCount: 0,
  directedToStore: 0,
  receivedLeads: 0,
  totalCarsInEvent: 0
};

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatMoney(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

function getProgress(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export default function MasterLiveDashboardPage() {
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [message, setMessage] = useState('');

  async function loadSummary() {
    setMessage('Carregando indicadores...');
    try {
      const supabase = createClient();
      const [{ data: leads, error: leadsError }, { data: sales, error: salesError }, { data: inventory, error: inventoryError }] = await Promise.all([
        supabase.from('leads').select('*'),
        supabase.from('sales').select('*'),
        supabase.from('inventory').select('*')
      ]);

      if (leadsError) throw leadsError;
      if (salesError) throw salesError;
      if (inventoryError) throw inventoryError;

      const leadRows = leads || [];
      const saleRows = sales || [];
      const inventoryRows = inventory || [];

      const totalLeads = leadRows.length;
      const leadsWithPhone = leadRows.filter((lead: any) => Boolean(lead.customer_phone)).length;
      const surveysWithoutPhone = leadRows.filter((lead: any) => lead.status === 'survey_without_phone').length;
      const directedToStore = leadRows.filter((lead: any) => Boolean(lead.assigned_store_id)).length;
      const salesCount = saleRows.length;
      const lossesCount = leadRows.filter((lead: any) => lead.status === 'lost').length;
      const conversionRate = leadsWithPhone > 0 ? Math.round((salesCount / leadsWithPhone) * 100) : 0;
      const totalRevenue = saleRows.reduce((sum: number, sale: any) => {
        const inventoryItem = inventoryRows.find((item: any) => item.id === sale.vehicle_id);
        return sum + Number(sale.sale_value || inventoryItem?.price || 0);
      }, 0);
      const averageTicket = salesCount > 0 ? Math.round(totalRevenue / salesCount) : 0;
      const financedBanksCount = new Set(saleRows.map((sale: any) => sale.financing_bank).filter(Boolean)).size;

      setSummary({
        totalLeads,
        leadsWithPhone,
        surveysWithoutPhone,
        salesCount,
        lossesCount,
        conversionRate,
        averageTicket,
        totalRevenue,
        financedBanksCount,
        directedToStore,
        receivedLeads: totalLeads,
        totalCarsInEvent: inventoryRows.length
      });
      setMessage('');
    } catch {
      setMessage('Nao foi possivel carregar indicadores. Verifique Supabase Auth, tabelas e politicas.');
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const primaryCards = useMemo(() => {
    const surveys = Math.max(summary.totalLeads - summary.surveysWithoutPhone, 0);
    return [
      { label: 'Pessoas Abordadas', value: formatNumber(summary.totalLeads), helper: 'Volume total captado', icon: Users, accent: 'from-slate-700 to-slate-950', progress: Math.min(summary.totalLeads * 10, 100) },
      { label: 'Pesquisas Realizadas', value: formatNumber(surveys), helper: 'Pesquisas de rua', icon: Sparkles, accent: 'from-sky-500 to-sky-700', progress: getProgress(surveys, Math.max(summary.totalLeads, 1)) },
      { label: 'Leads com Telefone', value: formatNumber(summary.leadsWithPhone), helper: 'Base valida', icon: Inbox, accent: 'from-emerald-500 to-emerald-700', progress: getProgress(summary.leadsWithPhone, Math.max(summary.totalLeads, 1)) },
      { label: 'Vendas Confirmadas', value: formatNumber(summary.salesCount), helper: 'Unidades vendidas', icon: Wallet, accent: 'from-zinc-800 to-black', progress: getProgress(summary.salesCount, Math.max(summary.leadsWithPhone, 1)) },
      { label: 'Taxa de Conversao Geral', value: `${summary.conversionRate}%`, helper: 'Vendas / leads', icon: Sparkles, accent: 'from-violet-500 to-fuchsia-600', progress: summary.conversionRate }
    ];
  }, [summary]);

  const secondaryCards = useMemo(() => [
    { label: 'Bancos Financiados', value: formatNumber(summary.financedBanksCount), helper: 'Bancos usados nas vendas', icon: Landmark, accent: 'from-amber-500 to-orange-600', progress: Math.min(summary.financedBanksCount * 14, 100) },
    { label: 'Faturamento Total', value: formatMoney(summary.totalRevenue), helper: 'Valor dos carros vendidos', icon: Wallet, accent: 'from-emerald-500 to-green-700', progress: summary.salesCount > 0 ? 85 : 8 },
    { label: 'Direcionados para Loja', value: formatNumber(summary.directedToStore), helper: 'Leads com loja definida', icon: ArrowRightLeft, accent: 'from-red-500 to-rose-600', progress: getProgress(summary.directedToStore, Math.max(summary.totalLeads, 1)) },
    { label: 'Leads Recebidos', value: formatNumber(summary.receivedLeads), helper: 'Entradas no sistema', icon: Inbox, accent: 'from-cyan-500 to-blue-700', progress: Math.min(summary.receivedLeads * 10, 100) },
    { label: 'Total de Carros no Evento', value: formatNumber(summary.totalCarsInEvent), helper: 'Estoque geral cadastrado', icon: Car, accent: 'from-indigo-500 to-blue-700', progress: Math.min(summary.totalCarsInEvent * 5, 100) }
  ], [summary]);

  return (
    <main className="min-h-screen bg-[#05070D] p-3 text-zinc-950 md:p-6">
      <section className="mx-auto flex max-w-[1600px] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-black/50">
        <aside className="hidden min-h-screen w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            <div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div>
          </div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-500">Logado como</p><p className="mt-1 font-bold">Gestao Master</p><span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Master</span></div>
          <nav className="mt-8 space-y-3 text-sm">
            <Link href="/master/dashboard/live" className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><LayoutDashboard size={18} /> Dashboard</Link>
            <Link href="/master/stores" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><CalendarDays size={18} /> Eventos</Link>
            <Link href="/master/stores" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Lojas & Estoque</Link>
            <Link href="/routes" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><FileText size={18} /> Relatorios</Link>
          </nav>
        </aside>

        <div className="min-w-0 flex-1 bg-[#F4F6FA] p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.25em] text-red-600">Gestao Master</p><h1 className="mt-2 text-3xl font-black tracking-tight text-[#101828] md:text-4xl">Master Executive Dashboard</h1></div>
            <button onClick={loadSummary} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-bold text-zinc-700 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:text-red-600 hover:shadow-lg"><RefreshCcw size={16} /> Atualizar dashboard</button>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">{message}</div> : null}

          <section className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{primaryCards.map((card) => <InteractiveKpiCard key={card.label} {...card} />)}</div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{secondaryCards.map((card) => <InteractiveKpiCard key={card.label} {...card} />)}</div>
          </section>

          <section className="mt-5 grid gap-4 lg:grid-cols-3">
            <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold text-zinc-500 shadow-sm">Evento<select className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none"><option>Bradesco Auto Show</option></select></label>
            <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold text-zinc-500 shadow-sm">Loja<select className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none"><option>Todas</option></select></label>
            <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold text-zinc-500 shadow-sm">Periodo<select className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none"><option>Ultima Semana</option></select></label>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm md:p-7">
              <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-black text-zinc-950">Funil comercial do evento</h2><p className="mt-1 text-sm text-zinc-500">Da abordagem inicial ate a venda final.</p></div><BarChart3 className="text-red-600" /></div>
              <div className="mt-7 space-y-2">{funnel.map((item) => <div key={item.label} className="grid grid-cols-[48px_1fr_48px] items-center gap-3 text-sm font-black text-zinc-700"><span className="text-right">{item.left}</span><div className="flex justify-center"><div className="flex h-10 items-center justify-center text-sm font-black text-white shadow-sm" style={{ width: item.width, background: item.color, clipPath: 'polygon(7% 0, 93% 0, 85% 100%, 15% 100%)' }}>{item.label}</div></div><span>{item.right}</span></div>)}</div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm"><h3 className="font-black text-zinc-950">Conversao por Categoria</h3><div className="mt-5 flex h-44 items-end gap-3 border-b border-l border-zinc-200 px-2 pb-2">{categories.map((item) => <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-2"><span className="text-xs font-bold text-zinc-600">{item.value}%</span><div className="w-full max-w-8 rounded-t-lg bg-sky-600" style={{ height: `${item.value * 7}px` }} /><span className="text-[10px] font-bold text-zinc-400">{item.label}</span></div>)}</div></div>
              <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm"><h3 className="font-black text-zinc-950">Horarios de Pico</h3><div className="mt-5 grid grid-cols-5 gap-1">{heatmap.flat().map((value, index) => <div key={index} className="h-8 rounded" style={{ backgroundColor: `rgba(2, 132, 199, ${value / 100})` }} />)}</div><div className="mt-3 flex justify-between text-[10px] font-bold text-zinc-400"><span>10h</span><span>12h</span><span>14h</span><span>16h</span><span>18h</span></div></div>
            </div>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-2"><RankingCard title="Ranking de Lojas" items={storeRanking} icon={<Store size={18} />} /><RankingCard title="Ranking de Prospectores" items={prospectorRanking} icon={<Users size={18} />} /></section>
        </div>
      </section>
    </main>
  );
}

function InteractiveKpiCard({ label, value, helper, icon: Icon, accent, progress }: { label: string; value: string; helper: string; icon: any; accent: string; progress: number }) {
  return (
    <div className="group relative overflow-hidden rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br from-zinc-100 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold leading-tight text-zinc-500">{label}</p><strong className="mt-3 block break-words text-3xl font-black text-zinc-950 2xl:text-4xl">{value}</strong><span className="mt-2 block text-xs text-zinc-400">{helper}</span></div><div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}><Icon size={20} /></div></div>
      <div className="mt-5 flex items-center justify-between"><span className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-zinc-500">Ao vivo</span><span className="text-xs font-bold text-zinc-400">{Math.max(0, Math.min(progress, 100))}%</span></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full bg-gradient-to-r ${accent} transition-all duration-500 group-hover:brightness-110`} style={{ width: `${Math.max(6, Math.min(progress, 100))}%` }} /></div>
    </div>
  );
}

function RankingCard({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h3 className="font-black text-zinc-950">{title}</h3><span className="text-red-600">{icon}</span></div>
      <div className="mt-5 space-y-3">{items.map((item, index) => <div key={item} className="flex items-center justify-between rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-sm font-black text-zinc-950">{index + 1}</span><strong className="text-sm text-zinc-900">{item}</strong></div><Trophy size={16} className={index === 0 ? 'text-amber-500' : 'text-zinc-300'} /></div>)}</div>
    </div>
  );
}
