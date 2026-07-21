'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  Car,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LogOut,
  Package,
  PhoneCall,
  Store,
  Trophy,
  UserCheck,
  Users,
  XCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

const flowSteps = [
  {
    key: 'new_lead',
    title: 'Lead recebido',
    description: 'Leads novos que ainda precisam iniciar atendimento.',
    icon: Users
  },
  {
    key: 'in_service',
    title: 'Atendimento iniciado',
    description: 'Leads em conversa ativa com a loja.',
    icon: PhoneCall
  },
  {
    key: 'scheduled',
    title: 'Agendamento',
    description: 'Clientes com visita ou atendimento agendado.',
    icon: CalendarCheck
  },
  {
    key: 'showed_up',
    title: 'Comparecimento',
    description: 'Clientes que compareceram ou avançaram na negociação.',
    icon: UserCheck
  },
  {
    key: 'finalized',
    title: 'Venda ou perda registrada',
    description: 'Leads encerrados como venda confirmada ou perda.',
    icon: Trophy
  }
];

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value)}%`;
}

export default function StoreSlugHomePage() {
  const supabase = createClient();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [store, setStore] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [message, setMessage] = useState('Validando acesso da loja...');

  async function loadDashboard() {
    const context = await getStorePortalContext(slug);

    if (context.status === 'unauthenticated') {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      return;
    }

    if (context.status !== 'ok') {
      setMessage('Acesso bloqueado. Este usuario nao tem permissao para acessar esta loja.');
      return;
    }

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('assigned_store_id', context.store.id)
      .order('created_at', { ascending: false });

    if (error) {
      setStore(context.store);
      setLeads([]);
      setMessage('Nao foi possivel carregar os dados do dashboard.');
      return;
    }

    setStore(context.store);
    setLeads(data || []);
    setMessage('');
  }

  useEffect(() => {
    loadDashboard().catch(() => setMessage('Nao foi possivel validar o acesso.'));
  }, [slug]);

  const metrics = useMemo(() => {
    const total = leads.length;
    const newLeads = leads.filter((lead) => lead.status === 'new_lead').length;
    const inService = leads.filter((lead) => lead.status === 'in_service').length;
    const scheduled = leads.filter((lead) => lead.status === 'scheduled').length;
    const showedUp = leads.filter((lead) => lead.status === 'showed_up').length;
    const sold = leads.filter((lead) => lead.status === 'sale_confirmed').length;
    const lost = leads.filter((lead) => lead.status === 'lost').length;
    const noShow = leads.filter((lead) => lead.status === 'no_show').length;
    const finalized = sold + lost;
    const active = total - finalized;
    const conversionRate = total > 0 ? (sold / total) * 100 : 0;
    const attendanceRate = scheduled > 0 ? (showedUp / scheduled) * 100 : 0;

    return {
      total,
      newLeads,
      inService,
      scheduled,
      showedUp,
      sold,
      lost,
      noShow,
      finalized,
      active,
      conversionRate,
      attendanceRate
    };
  }, [leads]);

  const stepValues: Record<string, number> = {
    new_lead: metrics.newLeads,
    in_service: metrics.inService,
    scheduled: metrics.scheduled,
    showed_up: metrics.showedUp,
    finalized: metrics.finalized
  };

  const recentLeads = leads.slice(0, 6);

  if (message && !store) {
    return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{message}</main>;
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            <div>
              <p className="text-sm font-black tracking-wide">AUTO CONTROLE</p>
              <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500">Area operacional</p>
            <p className="mt-1 font-bold">{store?.store_name}</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span>
          </div>

          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><BarChart3 size={18} /> Dashboard</Link>
            <Link href={`/loja/${slug}/minha-loja`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Minha Loja</Link>
            <Link href={`/loja/${slug}/estoque`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Package size={18} /> Estoque</Link>
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/operacao`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><ClipboardList size={18} /> Operacao</Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Loja Participante</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Dashboard da Loja</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Visao operacional da loja {store?.store_name}: leads recebidos, atendimento, agendamentos, comparecimentos, vendas e perdas.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="premium-button-secondary" type="button" onClick={loadDashboard}>
                <BarChart3 size={18} /> Atualizar
              </button>

              <Link href={`/loja/${slug}/pipeline`} className="premium-button-primary">
                <ArrowRight size={18} /> Abrir Pipeline
              </Link>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm font-medium text-zinc-600">{message}</div> : null}

          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total de leads" value={metrics.total} description="Todos os leads recebidos pela loja." icon={Users} />
            <KpiCard label="Leads ativos" value={metrics.active} description="Ainda em atendimento ou negociação." icon={Clock3} />
            <KpiCard label="Vendas" value={metrics.sold} description={`Conversao: ${formatPercent(metrics.conversionRate)}`} icon={CheckCircle2} tone="emerald" />
            <KpiCard label="Perdas" value={metrics.lost} description="Leads encerrados como perda." icon={XCircle} tone="red" />
          </section>

          <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Novos" value={metrics.newLeads} />
            <MiniMetric label="Em atendimento" value={metrics.inService} />
            <MiniMetric label="Agendados" value={metrics.scheduled} />
            <MiniMetric label="Compareceram" value={metrics.showedUp} />
          </section>

          <section className="mt-7 grid gap-5 xl:grid-cols-[1fr_380px]">
            <div className="premium-card p-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-zinc-950">Fluxo operacional da loja</h2>
                  <p className="mt-1 text-sm font-medium text-zinc-500">Agora este fluxo mostra numeros reais do pipeline.</p>
                </div>

                <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm">
                  <span className="font-bold text-zinc-500">Comparecimento: </span>
                  <strong className="text-zinc-950">{formatPercent(metrics.attendanceRate)}</strong>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-5">
                {flowSteps.map((step, index) => {
                  const Icon = step.icon;
                  const value = stepValues[step.key] || 0;
                  const percent = metrics.total > 0 ? (value / metrics.total) * 100 : 0;

                  return (
                    <div key={step.key} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex items-center justify-between">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-sm font-black text-white">{index + 1}</span>
                        <Icon className="text-zinc-400" size={20} />
                      </div>

                      <p className="mt-4 text-sm font-black text-zinc-900">{step.title}</p>
                      <strong className="mt-3 block text-4xl font-black text-zinc-950">{value}</strong>
                      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">{formatPercent(percent)} dos leads</p>

                      <div className="mt-4 h-2 rounded-full bg-white">
                        <div className="h-2 rounded-full bg-red-600" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
                      </div>

                      <p className="mt-3 text-xs leading-relaxed text-zinc-500">{step.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="premium-card p-6">
              <h2 className="text-2xl font-black text-zinc-950">Resumo comercial</h2>

              <div className="mt-5 grid gap-3">
                <SummaryRow label="Leads recebidos" value={metrics.total} />
                <SummaryRow label="Em atendimento" value={metrics.inService} />
                <SummaryRow label="Agendamentos" value={metrics.scheduled} />
                <SummaryRow label="Nao compareceu" value={metrics.noShow} />
                <SummaryRow label="Vendas confirmadas" value={metrics.sold} strong />
                <SummaryRow label="Perdas registradas" value={metrics.lost} />
              </div>

              <Link href={`/loja/${slug}/pipeline`} className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-4 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-red-600/20">
                Ver leads no pipeline <ArrowRight size={16} />
              </Link>
            </div>
          </section>

          <section className="premium-card mt-5 p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-black text-zinc-950">Ultimos leads recebidos</h2>
                <p className="mt-1 text-sm text-zinc-500">Lista rapida para a loja acompanhar os contatos mais recentes.</p>
              </div>

              <Link href={`/loja/${slug}/pipeline`} className="text-sm font-black uppercase tracking-wide text-red-600">
                Abrir todos
              </Link>
            </div>

            <div className="mt-5 grid gap-3">
              {recentLeads.map((lead) => (
                <div key={lead.id} className="grid gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 md:grid-cols-[1.2fr_1fr_150px] md:items-center">
                  <div>
                    <p className="font-black text-zinc-950">{lead.customer_name || 'Cliente sem nome'}</p>
                    <p className="mt-1 text-xs text-zinc-500">{lead.customer_phone || 'Sem telefone'}</p>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Interesse</p>
                    <p className="mt-1 text-sm font-bold text-zinc-700">{lead.interested_vehicle || 'Nao informado'}</p>
                  </div>

                  <StatusBadge status={lead.status} />
                </div>
              ))}

              {recentLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm font-medium text-zinc-400">
                  Nenhum lead recebido por esta loja ainda.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function KpiCard({
  label,
  value,
  description,
  icon: Icon,
  tone = 'zinc'
}: {
  label: string;
  value: number;
  description: string;
  icon: any;
  tone?: 'zinc' | 'emerald' | 'red';
}) {
  const toneClass = tone === 'emerald' ? 'text-emerald-600 bg-emerald-50' : tone === 'red' ? 'text-red-600 bg-red-50' : 'text-zinc-700 bg-zinc-100';

  return (
    <div className="premium-card premium-card-hover p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-zinc-500">{label}</p>
          <strong className="mt-3 block text-4xl font-black text-zinc-950">{value}</strong>
          <p className="mt-2 text-xs text-zinc-400">{description}</p>
        </div>

        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${toneClass}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <strong className="mt-2 block text-3xl font-black text-zinc-950">{value}</strong>
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? 'flex items-center justify-between rounded-2xl bg-emerald-50 p-4 text-emerald-800' : 'flex items-center justify-between rounded-2xl bg-zinc-50 p-4 text-zinc-700'}>
      <span className="text-sm font-bold">{label}</span>
      <strong className="text-lg font-black">{value}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    new_lead: 'Novo lead',
    in_service: 'Em atendimento',
    scheduled: 'Agendado',
    showed_up: 'Compareceu',
    sale_confirmed: 'Venda',
    lost: 'Perda',
    no_show: 'Nao compareceu'
  };

  const classes: Record<string, string> = {
    new_lead: 'bg-red-50 text-red-700',
    in_service: 'bg-sky-50 text-sky-700',
    scheduled: 'bg-amber-50 text-amber-700',
    showed_up: 'bg-violet-50 text-violet-700',
    sale_confirmed: 'bg-emerald-50 text-emerald-700',
    lost: 'bg-zinc-200 text-zinc-700',
    no_show: 'bg-orange-50 text-orange-700'
  };

  return (
    <span className={`inline-flex justify-center rounded-full px-3 py-2 text-xs font-black uppercase tracking-wide ${classes[status] || 'bg-zinc-100 text-zinc-600'}`}>
      {labels[status] || status || 'Sem status'}
    </span>
  );
}
