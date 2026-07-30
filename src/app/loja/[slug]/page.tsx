'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
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
  new_lead: 'Novo lead',
  in_service: 'Em atendimento',
  scheduled: 'Agendado',
  appointment_cancelled: 'Cancelou',
  no_show: 'Não compareceu',
  showed_up: 'Compareceu',
  sale_confirmed: 'Venda confirmada',
  lost: 'Perdido'
};

function formatDateTime(value: unknown) {
  if (!value) return 'Sem data';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function StatusBadge({ value }: { value: unknown }) {
  const status = String(value || '');
  const tone = status === 'sale_confirmed'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'lost' || status === 'appointment_cancelled'
      ? 'bg-red-50 text-red-700'
      : status === 'scheduled' || status === 'no_show'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-blue-50 text-blue-700';

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${tone}`}>{statusLabels[status] || status || 'Sem status'}</span>;
}

export default function StoreSlugHomePage() {
  const portal = useStorePortal();
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

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

      if (!response.ok) {
        setMessage(payload.error || 'Não foi possível carregar o Dashboard da Loja.');
        return;
      }

      setData(payload);
    } catch {
      setMessage('Falha de comunicação ao carregar o Dashboard da Loja.');
    } finally {
      setLoading(false);
    }
  }, [portal.store.slug, supabase]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const canManageTeam = portal.permissions.includes('manage_team');

  return (
    <>
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="premium-eyebrow">Portal seguro da loja</p>
          <h1 className="premium-title mt-2 text-4xl md:text-5xl">Dashboard da Loja</h1>
          <p className="premium-muted mt-3 max-w-3xl text-sm">
            Visão operacional da {portal.store.store_name}, filtrada de acordo com o acesso de {portal.profile.role_label.toLowerCase()}.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
            <ShieldCheck size={15} /> {data.scope_label || portal.scope_label}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button className="premium-button-secondary" type="button" onClick={() => void loadDashboard()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} size={18} /> Atualizar
          </button>
          <Link href={`/loja/${portal.store.slug}/pipeline`} className="premium-button-primary"><ArrowRight size={18} /> Abrir Pipeline</Link>
        </div>
      </header>

      {message ? <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{message}</div> : null}

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total no seu escopo" value={data.metrics.total} icon={<Users size={22} />} />
        <Kpi label="Leads ativos" value={data.metrics.active} icon={<Clock3 size={22} />} />
        <Kpi label="Vendas" value={data.metrics.sold} icon={<CheckCircle2 size={22} />} tone="emerald" />
        <Kpi label="Perdas" value={data.metrics.lost} icon={<XCircle size={22} />} tone="red" />
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Mini label="Novos" value={data.metrics.new_leads} />
        <Mini label="Em atendimento" value={data.metrics.in_service} />
        <Mini label="Agendados" value={data.metrics.scheduled} />
        <Mini label="Compareceram" value={data.metrics.showed_up} />
      </section>

      {canManageTeam ? (
        <section className="premium-card mt-6 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">Gestão da equipe</p><h2 className="mt-2 text-2xl font-black text-zinc-950">Equipe e distribuição de leads</h2><p className="mt-2 text-sm font-bold text-zinc-500">Gerencie acessos, ordem de roteamento e capacidade dos colaboradores da loja.</p></div>
            <Link href={`/loja/${portal.store.slug}/equipe`} className="premium-button-primary"><Users size={18} /> Abrir Equipe</Link>
          </div>
        </section>
      ) : null}

      <section className="premium-card mt-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-2xl font-black text-zinc-950">Leads recentes</h2><p className="mt-1 text-sm font-bold text-zinc-500">Somente registros permitidos para o usuário conectado.</p></div>
          <Link href={`/loja/${portal.store.slug}/pipeline`} className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-wide text-red-600"><BarChart3 size={16} /> Abrir todos</Link>
        </div>

        <div className="mt-5 grid gap-3">
          {data.recent_leads.map((lead) => (
            <div key={lead.id} className="grid gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 md:grid-cols-[1.15fr_1fr_170px_150px] md:items-center">
              <div><p className="font-black text-zinc-950">{lead.customer_name || 'Cliente sem nome'}</p><p className="mt-1 text-xs font-bold text-zinc-500">{lead.customer_phone || 'Sem telefone'}</p></div>
              <p className="text-sm font-bold text-zinc-700">{lead.interested_vehicle || 'Interesse não informado'}</p>
              <StatusBadge value={lead.status} />
              <p className="text-xs font-black text-zinc-400">{formatDateTime(lead.created_at)}</p>
            </div>
          ))}

          {!loading && !data.recent_leads.length ? <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm font-bold text-zinc-500">Nenhum lead disponível dentro do seu escopo.</div> : null}
          {loading && !data.generated_at ? <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm font-bold text-zinc-500">Carregando indicadores autorizados...</div> : null}
        </div>
      </section>

      {data.generated_at ? <footer className="mt-6 text-right text-xs font-black text-zinc-400">Atualizado em {formatDateTime(data.generated_at)}</footer> : null}
    </>
  );
}

function Kpi({ label, value, icon, tone = 'zinc' }: { label: string; value: number; icon: ReactNode; tone?: 'zinc' | 'emerald' | 'red' }) {
  const toneClass = tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-700';
  return <article className="premium-card p-5"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClass}`}>{icon}</div><p className="mt-5 text-sm font-bold text-zinc-500">{label}</p><p className="mt-1 text-4xl font-black text-zinc-950">{Number(value || 0).toLocaleString('pt-BR')}</p></article>;
}

function Mini({ label, value }: { label: string; value: number }) {
  return <article className="premium-card p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">{label}</p><p className="mt-2 text-3xl font-black text-zinc-950">{Number(value || 0).toLocaleString('pt-BR')}</p></article>;
}
