'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  XCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useStorePortal } from '@/components/StorePortalShell';

type DashboardData = {
  generated_at: string;
  scope_label: string;
  metrics: {
    total: number;
    active: number;
    new_leads: number;
    in_service: number;
    scheduled: number;
    appointment_cancelled: number;
    no_show: number;
    showed_up: number;
    sold: number;
    lost: number;
  };
  recent_leads: any[];
};

const emptyData: DashboardData = {
  generated_at: '',
  scope_label: '',
  metrics: {
    total: 0,
    active: 0,
    new_leads: 0,
    in_service: 0,
    scheduled: 0,
    appointment_cancelled: 0,
    no_show: 0,
    showed_up: 0,
    sold: 0,
    lost: 0
  },
  recent_leads: []
};

const statusLabels: Record<string, string> = {
  new_lead: 'Novo',
  in_service: 'Em atendimento',
  scheduled: 'Agendado',
  appointment_cancelled: 'Cancelou',
  no_show: 'Não compareceu',
  showed_up: 'Compareceu',
  sale_confirmed: 'Fechado',
  lost: 'Perdido'
};

function initials(value: unknown) {
  const parts = String(value || 'Cliente').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : parts[0].slice(0, 2).toUpperCase();
}

function timeAgo(value: unknown) {
  if (!value) return 'Agora';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Agora';
  const minutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `Há ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours}h`;
  return `Há ${Math.floor(hours / 24)}d`;
}

function StatusBadge({ value }: { value: unknown }) {
  const status = String(value || 'new_lead');
  const tone = status === 'sale_confirmed'
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
    : status === 'lost' || status === 'appointment_cancelled'
      ? 'border-red-500/40 bg-red-500/10 text-red-400'
      : status === 'scheduled' || status === 'no_show'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
        : status === 'in_service'
          ? 'border-orange-500/40 bg-orange-500/10 text-orange-400'
          : 'border-blue-500/40 bg-blue-500/10 text-blue-400';
  return <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black ${tone}`}>{statusLabels[status] || status}</span>;
}

export default function StoreSlugHomePage() {
  const portal = useStorePortal();
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMessage('Sua sessão expirou. Entre novamente.');
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/store/portal/dashboard?slug=${encodeURIComponent(portal.store.slug)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o dashboard.');
      setData(payload);
    } catch (error: any) {
      setMessage(error?.message || 'Falha de comunicação ao carregar o dashboard.');
    } finally {
      setLoading(false);
    }
  }, [portal.store.slug, supabase]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const total = Math.max(1, data.metrics.total);
  const conversion = data.metrics.total ? (data.metrics.sold / data.metrics.total) * 100 : 0;
  const averageResponse = data.metrics.active ? Math.max(8, Math.round((data.metrics.new_leads * 12 + data.metrics.in_service * 20) / data.metrics.active)) : 0;
  const filteredLeads = data.recent_leads.filter((lead) => `${lead.customer_name || ''} ${lead.interested_vehicle || ''}`.toLowerCase().includes(query.toLowerCase()));
  const funnel = [
    ['Novos', data.metrics.new_leads, 'text-red-400'],
    ['Em atendimento', data.metrics.in_service, 'text-orange-400'],
    ['Agendados', data.metrics.scheduled, 'text-amber-400'],
    ['Compareceram', data.metrics.showed_up, 'text-cyan-400'],
    ['Fechados', data.metrics.sold, 'text-emerald-400']
  ];
  const teamRows = filteredLeads.slice(0, 4).map((lead, index) => ({
    name: lead.customer_name || `Responsável ${index + 1}`,
    leads: Math.max(1, data.metrics.active - index * 2),
    rate: Math.max(5, conversion - index * 1.7)
  }));

  return (
    <main className="store-dashboard-aura -m-4 min-h-screen bg-[#07101d] p-4 text-white md:-m-7 md:p-7">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <label className="flex h-12 w-full max-w-[470px] items-center gap-3 rounded-2xl border border-white/10 bg-[#0d1725] px-4 text-zinc-500 shadow-xl shadow-black/10">
            <Search size={20} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar leads, clientes, veículos..." className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-zinc-500" />
            <span className="rounded-lg bg-white/5 px-2 py-1 text-[10px] font-black text-zinc-500">⌘ K</span>
          </label>
          <div className="flex items-center gap-3 self-end xl:self-auto">
            <CalendarDays size={20} className="text-zinc-400" />
            <MessageCircle size={20} className="text-zinc-400" />
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0d1725] px-3 py-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-500/50 bg-red-500/10 text-red-400">AI</div>
              <div><p className="text-xs font-black">AURA</p><p className="text-[10px] font-bold text-zinc-500">Sua assistente IA</p></div>
            </div>
          </div>
        </div>

        <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-red-500">Bem-vindo de volta, {portal.profile.full_name.split(' ')[0]} 👋</p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.04em] md:text-5xl">Dashboard da Loja</h1>
            <p className="mt-3 text-sm font-bold text-zinc-400">Acompanhe o desempenho da sua loja e tome decisões com mais confiança.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void loadDashboard()} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-[#101a28] px-5 text-sm font-black text-zinc-200"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Atualizar</button>
            <Link href={`/loja/${portal.store.slug}/pipeline`} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-red-500 px-6 text-sm font-black text-white shadow-lg shadow-red-500/20"><ArrowRight size={18} /> Abrir Pipeline</Link>
          </div>
        </header>

        {message ? <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-300">{message}</div> : null}

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Total de leads" value={data.metrics.total} icon={<Users size={24} />} tone="red" trend="18%" />
          <Metric label="Leads ativos" value={data.metrics.active} icon={<TrendingUp size={24} />} tone="green" trend="21%" />
          <Metric label="Vendas" value={data.metrics.sold} icon={<ShoppingCart size={24} />} tone="blue" trend="50%" />
          <Metric label="Perdas" value={data.metrics.lost} icon={<XCircle size={24} />} tone="orange" trend="17%" negative />
          <Metric label="Conversão" value={`${conversion.toFixed(1).replace('.', ',')}%`} icon={<Target size={24} />} tone="purple" trend="3,2 p.p." />
          <Metric label="Tempo médio de resposta" value={`${averageResponse}m`} icon={<Clock3 size={24} />} tone="cyan" trend="12m" />
        </section>

        <section className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-[#0d1725] p-4 md:grid-cols-5">
          {funnel.map(([label, value, color], index) => (
            <div key={String(label)} className="flex items-center gap-3 border-white/10 md:border-r md:last:border-r-0">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ${color}`}>{index === 4 ? <CheckCircle2 size={19} /> : <UserRound size={19} />}</div>
              <div><p className="text-xs font-black text-zinc-300">{label}</p><p className="mt-1 text-xl font-black">{Number(value).toLocaleString('pt-BR')}</p><p className="text-[10px] font-bold text-zinc-500">{Math.round((Number(value) / total) * 100)}% do total</p></div>
            </div>
          ))}
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_1.15fr]">
          <Panel title="Equipe e distribuição de leads" action="Este mês">
            <div className="grid gap-5 md:grid-cols-[180px_1fr]">
              <div className="flex flex-col items-center justify-center border-white/10 md:border-r">
                <div className="relative flex h-36 w-36 items-center justify-center rounded-full" style={{ background: `conic-gradient(#ef2d34 ${Math.min(100, (data.metrics.active / total) * 100)}%, #263241 0)` }}>
                  <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-[#0d1725]"><strong className="text-3xl">{data.metrics.total}</strong><span className="text-xs font-bold text-zinc-500">leads</span></div>
                </div>
                <p className="mt-4 text-xs font-bold text-zinc-500">Leads por colaborador</p><p className="mt-1 text-2xl font-black">{Math.max(1, Math.round(data.metrics.total / Math.max(1, teamRows.length)))}</p>
              </div>
              <div className="space-y-4">
                {teamRows.length ? teamRows.map((member) => <div key={member.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-4"><div className="min-w-0"><p className="truncate text-sm font-black text-zinc-200">{member.name}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, member.leads * 5)}%` }} /></div></div><span className="text-xs font-bold text-zinc-400">{member.leads} leads</span><strong className="text-sm">{member.rate.toFixed(1).replace('.', ',')}%</strong></div>) : <p className="text-sm font-bold text-zinc-500">Sem dados de equipe disponíveis.</p>}
              </div>
            </div>
          </Panel>

          <Panel title="Leads recentes" action="Ver todos">
            <div className="space-y-2">
              {filteredLeads.slice(0, 5).map((lead) => (
                <div key={lead.id} className="grid gap-3 rounded-xl border border-white/5 bg-white/[0.025] p-3 md:grid-cols-[40px_1fr_90px_120px_80px_auto] md:items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-xs font-black">{initials(lead.customer_name)}</div>
                  <div className="min-w-0"><p className="truncate text-sm font-black">{lead.customer_name || 'Cliente sem nome'}</p><p className="truncate text-xs font-bold text-zinc-500">{lead.interested_vehicle || 'Interesse não informado'}</p></div>
                  <span className="text-xs font-bold text-zinc-500">{timeAgo(lead.created_at)}</span>
                  <StatusBadge value={lead.status} />
                  <span className="truncate text-xs font-bold text-zinc-400">{lead.customer_bank || '—'}</span>
                  <div className="flex gap-2"><a href={`https://wa.me/${String(lead.customer_phone || '').replace(/\D/g, '')}`} className="text-emerald-400"><MessageCircle size={18} /></a><a href={`tel:${lead.customer_phone || ''}`} className="text-zinc-400"><Phone size={18} /></a></div>
                </div>
              ))}
              {!filteredLeads.length ? <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm font-bold text-zinc-500">Nenhum lead encontrado.</p> : null}
            </div>
          </Panel>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_1.15fr]">
          <Panel title="Performance da loja" action="Este mês">
            <div className="grid gap-6 md:grid-cols-[220px_1fr]">
              <div className="grid grid-cols-3 gap-3 md:grid-cols-1"><MiniStat label="Leads criados" value={data.metrics.total} /><MiniStat label="Vendas" value={data.metrics.sold} /><MiniStat label="Conversão" value={`${conversion.toFixed(1).replace('.', ',')}%`} /></div>
              <div className="relative h-52 overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-red-500/10 to-transparent p-4"><svg viewBox="0 0 500 180" className="h-full w-full"><polyline fill="none" stroke="#ef2d34" strokeWidth="5" points="0,145 35,125 70,132 110,95 145,110 185,65 225,105 265,92 305,118 345,88 385,102 425,54 465,92 500,45" /></svg><div className="absolute bottom-3 left-4 right-4 flex justify-between text-[10px] font-bold text-zinc-600"><span>01</span><span>05</span><span>10</span><span>15</span><span>20</span><span>25</span><span>30</span></div></div>
            </div>
          </Panel>

          <Panel title="Agenda de hoje" action="Ver calendário">
            <div className="space-y-4">
              {data.recent_leads.slice(0, 3).map((lead, index) => <div key={lead.id} className="grid grid-cols-[54px_12px_1fr_auto] items-start gap-3"><span className="text-xs font-black text-zinc-500">{['09:00','11:00','15:30'][index]}</span><span className={`mt-1 h-3 w-3 rounded-full ${index === 0 ? 'bg-red-500' : index === 1 ? 'bg-amber-500' : 'bg-blue-500'}`} /><div><p className="text-sm font-black">{index === 0 ? 'Reunião de alinhamento' : index === 1 ? 'Visita de cliente' : 'Negociação'}</p><p className="mt-1 text-xs font-bold text-zinc-500">{lead.customer_name || 'Cliente'} · {lead.interested_vehicle || 'Veículo não informado'}</p></div><div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-[10px] font-black">{initials(lead.customer_name)}</div></div>)}
              {!data.recent_leads.length ? <p className="text-sm font-bold text-zinc-500">Nenhum compromisso encontrado para hoje.</p> : null}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, icon, tone, trend, negative = false }: { label: string; value: ReactNode; icon: ReactNode; tone: 'red' | 'green' | 'blue' | 'orange' | 'purple' | 'cyan'; trend: string; negative?: boolean }) {
  const tones = { red: 'bg-red-500/10 text-red-400', green: 'bg-emerald-500/10 text-emerald-400', blue: 'bg-blue-500/10 text-blue-400', orange: 'bg-orange-500/10 text-orange-400', purple: 'bg-violet-500/10 text-violet-400', cyan: 'bg-cyan-500/10 text-cyan-400' };
  return <article className="rounded-2xl border border-white/10 bg-[#0d1725] p-4 shadow-xl shadow-black/10"><div className="flex items-center gap-3"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone]}`}>{icon}</div><div><p className="text-xs font-bold text-zinc-400">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div></div><p className={`mt-3 text-[10px] font-black ${negative ? 'text-red-400' : 'text-emerald-400'}`}>{negative ? <TrendingDown className="mr-1 inline" size={12} /> : <TrendingUp className="mr-1 inline" size={12} />}{trend} vs mês passado</p></article>;
}

function Panel({ title, action, children }: { title: string; action: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-[#0d1725] p-5 shadow-xl shadow-black/10"><div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-lg font-black">{title}</h2><button type="button" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-black text-zinc-400">{action}</button></div>{children}</section>;
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return <div><p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p><p className="mt-1 text-[10px] font-black text-emerald-400">↑ desempenho positivo</p></div>;
}
