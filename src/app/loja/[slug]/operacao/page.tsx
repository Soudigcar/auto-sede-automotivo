'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Banknote,
  Building2,
  CarFront,
  CircleDollarSign,
  CreditCard,
  Loader2,
  RefreshCw,
  TrendingDown,
  Trophy,
  UserRoundCheck,
  XCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase';

type RankedItem = { label: string; value: number };
type OperationPayload = {
  store: { id: string; store_name: string; slug: string };
  generated_at: string;
  metrics: {
    active_leads: number;
    confirmed_sales: number;
    cancelled_sales: number;
    losses: number;
    revenue: number;
    average_ticket: number;
    available_vehicles: number;
    published_vehicles: number;
  };
  breakdowns: {
    payment_types: RankedItem[];
    banks: RankedItem[];
    sellers: RankedItem[];
    loss_reasons: RankedItem[];
  };
  recent_sales: Array<{
    id: string;
    status: string;
    customer_name: string;
    vehicle_name: string;
    seller_name: string;
    financing_bank: string | null;
    payment_type: string;
    sale_value: number | null;
    confirmed_at: string;
    cancelled_at: string | null;
    cancellation_reason: string | null;
  }>;
  recent_losses: Array<{
    id: string;
    customer_name: string;
    vehicle_name: string;
    reason: string;
    description: string | null;
    lost_stage: string | null;
    registered_at: string;
  }>;
};

function money(value: unknown) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateTime(value: unknown) {
  if (!value) return 'Data não informada';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return 'Data não informada';
  return parsed.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function paymentLabel(value: string) {
  if (value === 'cash') return 'À vista';
  if (value === 'financed') return 'Financiado';
  if (value === 'consortium') return 'Consórcio';
  if (value === 'other') return 'Outro';
  return value || 'Não informado';
}

export default function StoreSlugOperationPage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [payload, setPayload] = useState<OperationPayload | null>(null);
  const [message, setMessage] = useState('Carregando operação gerencial...');
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
        return;
      }

      const response = await fetch(`/api/store/portal/operation?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const body = await response.json();
      if (response.status === 401) {
        router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
        return;
      }
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar a operação.');
      setPayload(body);
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar a operação.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [slug]);

  if (!payload && loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6 text-center">
        <div>
          <Loader2 className="mx-auto animate-spin text-red-600" size={34} />
          <p className="mt-4 text-sm font-bold text-zinc-500">{message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="premium-page">
      <div className="premium-canvas min-w-0 p-4 md:p-7">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="premium-eyebrow">Gestão comercial</p>
            <h1 className="premium-title mt-2 text-4xl md:text-5xl">Operação da Loja</h1>
            <p className="premium-muted mt-3 max-w-3xl text-sm">
              Indicadores consolidados de vendas, perdas, estoque publicado e desempenho da equipe. Fechamentos e perdas são executados exclusivamente pelo Pipeline seguro.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void loadData()} disabled={loading} className="premium-button-secondary">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />} Atualizar
            </button>
            <Link href={`/loja/${slug}/pipeline`} className="premium-button-primary"><BarChart3 size={18} /> Abrir Pipeline</Link>
          </div>
        </header>

        {message ? <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{message}</div> : null}

        {payload ? (
          <>
            <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={<CircleDollarSign size={22} />} label="Valor vendido" value={money(payload.metrics.revenue)} helper={`${payload.metrics.confirmed_sales} venda(s) ativa(s)`} />
              <MetricCard icon={<Trophy size={22} />} label="Ticket médio" value={money(payload.metrics.average_ticket)} helper="Média das vendas confirmadas" />
              <MetricCard icon={<TrendingDown size={22} />} label="Perdas registradas" value={String(payload.metrics.losses)} helper={`${payload.metrics.cancelled_sales} venda(s) cancelada(s)`} />
              <MetricCard icon={<CarFront size={22} />} label="Estoque disponível" value={String(payload.metrics.available_vehicles)} helper={`${payload.metrics.published_vehicles} publicado(s)`} />
            </section>

            <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MiniMetric label="Leads ativos" value={payload.metrics.active_leads} />
              <MiniMetric label="Vendas confirmadas" value={payload.metrics.confirmed_sales} />
              <MiniMetric label="Vendas canceladas" value={payload.metrics.cancelled_sales} />
              <MiniMetric label="Última atualização" value={dateTime(payload.generated_at)} compact />
            </section>

            <section className="mt-6 grid gap-5 xl:grid-cols-2">
              <RankingCard title="Vendas por vendedor" icon={<UserRoundCheck size={20} />} items={payload.breakdowns.sellers} />
              <RankingCard title="Formas de pagamento" icon={<CreditCard size={20} />} items={payload.breakdowns.payment_types.map((item) => ({ ...item, label: paymentLabel(item.label) }))} />
              <RankingCard title="Bancos e instituições" icon={<Building2 size={20} />} items={payload.breakdowns.banks} />
              <RankingCard title="Motivos de perda" icon={<XCircle size={20} />} items={payload.breakdowns.loss_reasons} />
            </section>

            <section className="mt-6 grid gap-5 2xl:grid-cols-2">
              <div className="premium-card overflow-hidden">
                <div className="border-b border-zinc-100 p-5">
                  <h2 className="flex items-center gap-2 text-xl font-black text-zinc-950"><Banknote size={20} className="text-emerald-600" /> Vendas recentes</h2>
                  <p className="mt-1 text-sm text-zinc-500">Inclui vendas ativas e canceladas para conferência gerencial.</p>
                </div>
                <div className="divide-y divide-zinc-100">
                  {payload.recent_sales.length ? payload.recent_sales.map((sale) => (
                    <article key={sale.id} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="text-base text-zinc-950">{sale.customer_name}</strong>
                          <p className="mt-1 text-sm text-zinc-600">{sale.vehicle_name}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${sale.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {sale.status === 'confirmed' ? 'Confirmada' : 'Cancelada'}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-1 text-xs text-zinc-500 sm:grid-cols-2">
                        <p>Vendedor: <b className="text-zinc-700">{sale.seller_name || 'Não informado'}</b></p>
                        <p>Pagamento: <b className="text-zinc-700">{paymentLabel(sale.payment_type)}</b></p>
                        <p>Banco: <b className="text-zinc-700">{sale.financing_bank || 'Não informado'}</b></p>
                        <p>Valor: <b className="text-zinc-700">{money(sale.sale_value)}</b></p>
                        <p className="sm:col-span-2">Confirmada em {dateTime(sale.confirmed_at)}</p>
                        {sale.cancellation_reason ? <p className="sm:col-span-2 text-red-600">Cancelamento: {sale.cancellation_reason}</p> : null}
                      </div>
                    </article>
                  )) : <EmptyState text="Nenhuma venda registrada." />}
                </div>
              </div>

              <div className="premium-card overflow-hidden">
                <div className="border-b border-zinc-100 p-5">
                  <h2 className="flex items-center gap-2 text-xl font-black text-zinc-950"><TrendingDown size={20} className="text-red-600" /> Perdas recentes</h2>
                  <p className="mt-1 text-sm text-zinc-500">Histórico estruturado das perdas registradas no Pipeline.</p>
                </div>
                <div className="divide-y divide-zinc-100">
                  {payload.recent_losses.length ? payload.recent_losses.map((loss) => (
                    <article key={loss.id} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="text-base text-zinc-950">{loss.customer_name}</strong>
                          <p className="mt-1 text-sm text-zinc-600">{loss.vehicle_name}</p>
                        </div>
                        <span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-red-700">{loss.reason || 'Outro'}</span>
                      </div>
                      <p className="mt-3 text-sm text-zinc-600">{loss.description || 'Sem descrição adicional.'}</p>
                      <p className="mt-2 text-xs text-zinc-400">Etapa anterior: {loss.lost_stage || 'Não informada'} · {dateTime(loss.registered_at)}</p>
                    </article>
                  )) : <EmptyState text="Nenhuma perda estruturada registrada." />}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function MetricCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string; helper: string }) {
  return (
    <div className="premium-card p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600">{icon}</div>
      <p className="mt-4 text-sm font-bold text-zinc-500">{label}</p>
      <strong className="mt-2 block truncate text-3xl font-black text-zinc-950">{value}</strong>
      <p className="mt-2 text-xs text-zinc-400">{helper}</p>
    </div>
  );
}

function MiniMetric({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{label}</p>
      <strong className={`mt-2 block font-black text-zinc-900 ${compact ? 'text-sm' : 'text-2xl'}`}>{value}</strong>
    </div>
  );
}

function RankingCard({ title, icon, items }: { title: string; icon: React.ReactNode; items: RankedItem[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="premium-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-black text-zinc-950">{icon}{title}</h2>
      <div className="mt-5 space-y-4">
        {items.length ? items.slice(0, 8).map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-bold text-zinc-700">{item.label}</span>
              <span className="font-black text-zinc-950">{item.value}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-red-600" style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }} />
            </div>
          </div>
        )) : <p className="text-sm text-zinc-500">Sem dados suficientes.</p>}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm text-zinc-500">{text}</div>;
}
