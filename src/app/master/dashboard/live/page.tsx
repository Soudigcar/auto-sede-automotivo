'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, CalendarDays, Car, FileText, LayoutDashboard, RefreshCcw, Store, Trophy, Users } from 'lucide-react';
import { getDashboardSummary } from '@/lib/database';

type Summary = {
  totalLeads: number;
  leadsWithPhone: number;
  surveysWithoutPhone: number;
  salesCount: number;
  lossesCount: number;
  conversionRate: number;
  averageTicket: number;
};

const demo = {
  people: 5200,
  surveys: 4100,
  phoneLeads: 3500,
  sales: 450,
  conversion: 12.8
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

function formatNumber(value: number) {
  return value.toLocaleString('pt-BR');
}

export default function MasterLiveDashboardPage() {
  const [summary, setSummary] = useState<Summary>({
    totalLeads: 0,
    leadsWithPhone: 0,
    surveysWithoutPhone: 0,
    salesCount: 0,
    lossesCount: 0,
    conversionRate: 0,
    averageTicket: 0
  });
  const [message, setMessage] = useState('');

  async function loadSummary() {
    setMessage('Carregando indicadores...');
    try {
      const data = await getDashboardSummary();
      setSummary(data);
      setMessage('');
    } catch {
      setMessage('Nao foi possivel carregar indicadores. Verifique Supabase Auth, tabelas e politicas.');
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const metrics = useMemo(() => {
    const hasRealData = summary.totalLeads > 0 || summary.salesCount > 0;
    const people = hasRealData ? summary.totalLeads : demo.people;
    const phoneLeads = hasRealData ? summary.leadsWithPhone : demo.phoneLeads;
    const sales = hasRealData ? summary.salesCount : demo.sales;
    const conversion = hasRealData ? summary.conversionRate : demo.conversion;
    const surveys = hasRealData ? Math.max(summary.totalLeads - summary.surveysWithoutPhone, 0) : demo.surveys;

    return [
      { label: 'Pessoas Abordadas', value: formatNumber(people), accent: 'text-zinc-950', helper: 'Volume total captado' },
      { label: 'Pesquisas Realizadas', value: formatNumber(surveys), accent: 'text-sky-600', helper: 'Pesquisas de rua' },
      { label: 'Leads com Telefone', value: formatNumber(phoneLeads), accent: 'text-emerald-600', helper: 'Base valida' },
      { label: 'Vendas Confirmadas', value: formatNumber(sales), accent: 'text-zinc-950', helper: 'Fechamentos' },
      { label: 'Taxa de Conversao Geral', value: `${String(conversion).replace('.', ',')}%`, accent: 'text-purple-600', helper: 'Vendas / leads' }
    ];
  }, [summary]);

  return (
    <main className="min-h-screen bg-[#05070D] p-3 text-zinc-950 md:p-6">
      <section className="mx-auto flex max-w-[1600px] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-black/50">
        <aside className="hidden min-h-screen w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500">
              <Car size={22} />
            </div>
            <div>
              <p className="text-sm font-black tracking-wide">AUTO CONTROLE</p>
              <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500">Logado como</p>
            <p className="mt-1 font-bold">Gestao Master</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Master</span>
          </div>

          <nav className="mt-8 space-y-3 text-sm">
            <Link href="/master/dashboard/live" className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20">
              <LayoutDashboard size={18} /> Dashboard
            </Link>
            <Link href="/master/stores" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white">
              <CalendarDays size={18} /> Eventos
            </Link>
            <Link href="/master/stores" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white">
              <Store size={18} /> Lojas & Estoque
            </Link>
            <Link href="/routes" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white">
              <FileText size={18} /> Relatorios
            </Link>
          </nav>
        </aside>

        <div className="min-w-0 flex-1 bg-[#F4F6FA] p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-600">Gestao Master</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-[#101828] md:text-4xl">Master Executive Dashboard</h1>
            </div>
            <button onClick={loadSummary} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-bold text-zinc-700 shadow-sm hover:border-red-200 hover:text-red-600">
              <RefreshCcw size={16} /> Atualizar dashboard
            </button>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">{message}</div> : null}

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium leading-tight text-zinc-500">{metric.label}</p>
                <strong className={`mt-3 block text-3xl font-black ${metric.accent}`}>{metric.value}</strong>
                <span className="mt-2 block text-xs text-zinc-400">{metric.helper}</span>
              </div>
            ))}
          </section>

          <section className="mt-5 grid gap-4 lg:grid-cols-3">
            <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold text-zinc-500 shadow-sm">Evento
              <select className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none">
                <option>Bradesco Auto Show</option>
              </select>
            </label>
            <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold text-zinc-500 shadow-sm">Loja
              <select className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none">
                <option>Todas</option>
              </select>
            </label>
            <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold text-zinc-500 shadow-sm">Periodo
              <select className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none">
                <option>Ultima Semana</option>
              </select>
            </label>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm md:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-zinc-950">Funil comercial do evento</h2>
                  <p className="mt-1 text-sm text-zinc-500">Da abordagem inicial ate a venda final.</p>
                </div>
                <BarChart3 className="text-red-600" />
              </div>

              <div className="mt-7 space-y-2">
                {funnel.map((item) => (
                  <div key={item.label} className="grid grid-cols-[48px_1fr_48px] items-center gap-3 text-sm font-black text-zinc-700">
                    <span className="text-right">{item.left}</span>
                    <div className="flex justify-center">
                      <div
                        className="flex h-10 items-center justify-center text-sm font-black text-white shadow-sm"
                        style={{
                          width: item.width,
                          background: item.color,
                          clipPath: 'polygon(7% 0, 93% 0, 85% 100%, 15% 100%)'
                        }}
                      >
                        {item.label}
                      </div>
                    </div>
                    <span>{item.right}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="font-black text-zinc-950">Conversao por Categoria</h3>
                <div className="mt-5 flex h-44 items-end gap-3 border-b border-l border-zinc-200 px-2 pb-2">
                  {categories.map((item) => (
                    <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-xs font-bold text-zinc-600">{item.value}%</span>
                      <div className="w-full max-w-8 rounded-t-lg bg-sky-600" style={{ height: `${item.value * 7}px` }} />
                      <span className="text-[10px] font-bold text-zinc-400">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="font-black text-zinc-950">Horarios de Pico</h3>
                <div className="mt-5 grid grid-cols-5 gap-1">
                  {heatmap.flat().map((value, index) => (
                    <div key={index} className="h-8 rounded" style={{ backgroundColor: `rgba(2, 132, 199, ${value / 100})` }} />
                  ))}
                </div>
                <div className="mt-3 flex justify-between text-[10px] font-bold text-zinc-400">
                  <span>10h</span><span>12h</span><span>14h</span><span>16h</span><span>18h</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <RankingCard title="Ranking de Lojas" items={storeRanking} icon={<Store size={18} />} />
            <RankingCard title="Ranking de Prospectores" items={prospectorRanking} icon={<Users size={18} />} />
          </section>
        </div>
      </section>
    </main>
  );
}

function RankingCard({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-zinc-950">{title}</h3>
        <span className="text-red-600">{icon}</span>
      </div>
      <div className="mt-5 space-y-3">
        {items.map((item, index) => (
          <div key={item} className="flex items-center justify-between rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-sm font-black text-zinc-950">{index + 1}</span>
              <strong className="text-sm text-zinc-900">{item}</strong>
            </div>
            <Trophy size={16} className={index === 0 ? 'text-amber-500' : 'text-zinc-300'} />
          </div>
        ))}
      </div>
    </div>
  );
}
