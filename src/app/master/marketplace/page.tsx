'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  FileClock,
  Filter,
  Gauge,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Store,
  Users,
  Wrench,
  XCircle
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type TabKey = 'overview' | 'vehicles' | 'pending' | 'problems' | 'stores' | 'leads';
type MessageTone = 'error' | 'success' | 'info';

type MarketplaceData = {
  generated_at: string;
  summary: {
    total_vehicles: number;
    published_vehicles: number;
    sold_vehicles: number;
    pending_items: number;
    problems: number;
    active_stores: number;
    marketplace_leads: number;
    confirmed_sales: number;
  };
  filters: {
    stores: Array<{ id: string; name: string }>;
    vehicle_statuses: string[];
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  vehicles: any[];
  pending: any[];
  problems: any[];
  stores: any[];
  leads: any[];
  diagnostics: Record<string, any>;
};

const emptyData: MarketplaceData = {
  generated_at: '',
  summary: {
    total_vehicles: 0,
    published_vehicles: 0,
    sold_vehicles: 0,
    pending_items: 0,
    problems: 0,
    active_stores: 0,
    marketplace_leads: 0,
    confirmed_sales: 0
  },
  filters: { stores: [], vehicle_statuses: [] },
  pagination: { page: 1, limit: 20, total: 0, total_pages: 1 },
  vehicles: [],
  pending: [],
  problems: [],
  stores: [],
  leads: [],
  diagnostics: {}
};

const tabOptions: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'vehicles', label: 'Veículos' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'problems', label: 'Problemas' },
  { key: 'stores', label: 'Lojas' },
  { key: 'leads', label: 'Leads' }
];

const statusLabels: Record<string, string> = {
  disponivel: 'Disponível',
  vendido: 'Vendido',
  oculto: 'Oculto',
  pending: 'Pendente',
  reviewing: 'Em conferência',
  imported: 'Importado',
  processed: 'Processado',
  rejected: 'Rejeitado',
  duplicate: 'Duplicado',
  error: 'Erro',
  new_lead: 'Novo lead',
  in_service: 'Em atendimento',
  scheduled: 'Agendado',
  appointment_cancelled: 'Agendamento cancelado',
  no_show: 'Não compareceu',
  showed_up: 'Compareceu',
  sale_confirmed: 'Venda confirmada',
  lost: 'Perdido',
  confirmed: 'Confirmada'
};

function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function dateTime(value: unknown) {
  if (!value) return 'Sem data';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function text(value: unknown, fallback = '—') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function StatusBadge({ value }: { value: unknown }) {
  const status = String(value || '').toLowerCase();
  const tone = status === 'vendido' || status === 'sale_confirmed' || status === 'confirmed' || status === 'processed'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'disponivel' || status === 'published'
      ? 'bg-blue-50 text-blue-700'
      : status === 'error' || status === 'rejected' || status === 'lost' || status === 'duplicate'
        ? 'bg-red-50 text-red-700'
        : 'bg-amber-50 text-amber-700';

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${tone}`}>
      {statusLabels[status] || text(status, 'Sem status')}
    </span>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center text-sm font-bold text-zinc-500">
      {children}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = 'zinc',
  onClick
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
  tone?: 'zinc' | 'red' | 'amber' | 'emerald' | 'blue';
  onClick?: () => void;
}) {
  const tones = {
    zinc: 'bg-zinc-100 text-zinc-700',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700'
  };

  const content = (
    <>
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone]}`}>{icon}</div>
      <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <strong className="mt-2 block text-3xl font-black text-zinc-950">{Number(value || 0).toLocaleString('pt-BR')}</strong>
      <p className="mt-2 text-xs font-bold text-zinc-500">{detail}</p>
    </>
  );

  if (!onClick) return <article className="premium-card p-5">{content}</article>;

  return (
    <button className="premium-card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-xl" type="button" onClick={onClick}>
      {content}
    </button>
  );
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <h2 className="text-2xl font-black text-zinc-950">{title}</h2>
        <p className="mt-1 text-sm font-bold text-zinc-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

export default function MasterMarketplacePage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<MarketplaceData>(emptyData);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('info');
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState('');
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('all');
  const [days, setDays] = useState('30');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionKey, setActionKey] = useState('');
  const [storeSelections, setStoreSelections] = useState<Record<string, string>>({});

  const loadData = useCallback(async (preserveMessage = false) => {
    setLoading(true);
    if (!preserveMessage) setMessage('');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessageTone('error');
      setMessage('Sua sessão expirou. Entre novamente para acessar o painel.');
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      days,
      status
    });

    if (query) params.set('q', query);
    if (storeId) params.set('store_id', storeId);

    try {
      const response = await fetch(`/api/master/marketplace?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const result = await response.json();

      if (!response.ok) {
        setMessageTone('error');
        setMessage(result.error || 'Não foi possível carregar o painel.');
        setLoading(false);
        return;
      }

      setData(result);
    } catch {
      setMessageTone('error');
      setMessage('Falha de comunicação ao carregar o marketplace.');
    } finally {
      setLoading(false);
    }
  }, [days, page, query, refreshKey, status, storeId, supabase]);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  async function accessToken() {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token || '';
  }

  async function executeAction(
    key: string,
    payload: Record<string, unknown>,
    confirmation?: { prompt: string; code: string },
    reasonPrompt?: string
  ) {
    if (confirmation) {
      const typed = window.prompt(`${confirmation.prompt}\nDigite ${confirmation.code} para confirmar.`);
      if (typed !== confirmation.code) return;
    }

    let reason = '';
    if (reasonPrompt) {
      reason = window.prompt(reasonPrompt) || '';
      if (reason.trim().length < 3) {
        setMessageTone('error');
        setMessage('Informe um motivo com pelo menos 3 caracteres.');
        return;
      }
    }

    const token = await accessToken();
    if (!token) {
      setMessageTone('error');
      setMessage('Sua sessão expirou. Entre novamente.');
      return;
    }

    setActionKey(key);
    setMessageTone('info');
    setMessage('Executando ação administrativa...');

    try {
      const response = await fetch('/api/master/marketplace/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ...payload, reason })
      });
      const result = await response.json();

      if (!response.ok) {
        setMessageTone('error');
        setMessage(result.error || 'Não foi possível executar a ação.');
        return;
      }

      await loadData(true);
      setMessageTone('success');
      setMessage(result.message || 'Ação concluída com sucesso.');
    } catch {
      setMessageTone('error');
      setMessage('Falha de comunicação ao executar a ação.');
    } finally {
      setActionKey('');
    }
  }

  async function publishSubmission(item: any) {
    const typed = window.prompt(`Publicar o link enviado por ${item.store?.name || 'esta loja'}?\nDigite PUBLICAR para confirmar.`);
    if (typed !== 'PUBLICAR') return;

    const token = await accessToken();
    if (!token) {
      setMessageTone('error');
      setMessage('Sua sessão expirou. Entre novamente.');
      return;
    }

    const key = `publish-${item.id}`;
    setActionKey(key);
    setMessageTone('info');
    setMessage('Importando e publicando o veículo...');

    try {
      const response = await fetch('/api/site-bulk-publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ submission_ids: [item.id] })
      });
      const result = await response.json();
      const first = Array.isArray(result.results) ? result.results[0] : null;

      if (!response.ok || !first?.success) {
        setMessageTone('error');
        setMessage(first?.error || result.error || 'Não foi possível publicar este link.');
        return;
      }

      await loadData(true);
      setMessageTone('success');
      setMessage(`Veículo publicado: ${first.vehicle_name || 'cadastro concluído'}.`);
    } catch {
      setMessageTone('error');
      setMessage('Falha de comunicação ao publicar o link.');
    } finally {
      setActionKey('');
    }
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(searchDraft.trim());
  }

  function clearFilters() {
    setSearchDraft('');
    setQuery('');
    setStoreId('');
    setStatus('all');
    setDays('30');
    setPage(1);
  }

  const featuredProblems = data.problems.slice(0, 6);
  const recentLeads = data.leads.slice(0, 6);
  const activeFilters = [query, storeId, status !== 'all' ? status : '', days !== '30' ? days : ''].filter(Boolean).length;
  const activeStores = useMemo(
    () => data.stores.filter((store) => store.status === 'active' && store.portal_enabled),
    [data.stores]
  );

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="/master/marketplace" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="premium-eyebrow">Gestão centralizada</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Marketplace</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Monitore e administre veículos, proprietários, pendências e inconsistências com ações protegidas no servidor.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link className="premium-button-secondary" href="/master/marketplace/catalog">
                <ExternalLink size={18} /> Gerenciar catálogo
              </Link>
              <button className="premium-button-primary" type="button" onClick={() => setRefreshKey((current) => current + 1)} disabled={loading || Boolean(actionKey)}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                Atualizar painel
              </button>
            </div>
          </header>

          {message ? (
            <div className={`mt-5 rounded-2xl border p-4 text-sm font-bold ${
              messageTone === 'success'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : messageTone === 'error'
                  ? 'border-red-100 bg-red-50 text-red-700'
                  : 'border-blue-100 bg-blue-50 text-blue-700'
            }`}>
              {message}
            </div>
          ) : null}

          <section className="premium-card mt-6 p-5">
            <form className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_240px_180px_150px_auto_auto]" onSubmit={applySearch}>
              <label className="relative min-w-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input className="premium-input pl-11" placeholder="Buscar veículo, ano ou loja" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} />
              </label>

              <select className="premium-input" value={storeId} onChange={(event) => { setStoreId(event.target.value); setPage(1); }}>
                <option value="">Todas as lojas</option>
                {data.filters.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>

              <select className="premium-input" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="all">Todos os status</option>
                <option value="disponivel">Disponível</option>
                <option value="vendido">Vendido</option>
                <option value="oculto">Oculto</option>
              </select>

              <select className="premium-input" value={days} onChange={(event) => { setDays(event.target.value); setPage(1); }}>
                <option value="7">7 dias</option>
                <option value="30">30 dias</option>
                <option value="90">90 dias</option>
                <option value="365">12 meses</option>
                <option value="0">Todo período</option>
              </select>

              <button className="premium-button-primary justify-center" type="submit"><Filter size={17} /> Filtrar</button>
              <button className="premium-button-secondary justify-center" type="button" onClick={clearFilters}>Limpar {activeFilters ? `(${activeFilters})` : ''}</button>
            </form>
          </section>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
            {tabOptions.map((tab) => (
              <button
                key={tab.key}
                className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-black transition ${activeTab === tab.key ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-950'}`}
                type="button"
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading && !data.generated_at ? (
            <div className="premium-card mt-6 flex min-h-80 items-center justify-center p-8 text-zinc-500">
              <div className="text-center">
                <Loader2 className="mx-auto animate-spin text-red-600" size={34} />
                <p className="mt-4 text-sm font-black">Carregando indicadores do marketplace...</p>
              </div>
            </div>
          ) : null}

          {data.generated_at && activeTab === 'overview' ? (
            <>
              <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={<Car size={21} />} label="Veículos cadastrados" value={data.summary.total_vehicles} detail="Estoque dentro do período selecionado" tone="blue" onClick={() => setActiveTab('vehicles')} />
                <MetricCard icon={<ShieldCheck size={21} />} label="Publicados" value={data.summary.published_vehicles} detail="Disponíveis e visíveis no Portal Oficial" tone="emerald" onClick={() => setActiveTab('vehicles')} />
                <MetricCard icon={<FileClock size={21} />} label="Pendências" value={data.summary.pending_items} detail="Links e arquivos aguardando tratamento" tone="amber" onClick={() => setActiveTab('pending')} />
                <MetricCard icon={<AlertTriangle size={21} />} label="Problemas" value={data.summary.problems} detail="Inconsistências operacionais detectadas" tone="red" onClick={() => setActiveTab('problems')} />
                <MetricCard icon={<Store size={21} />} label="Lojas ativas" value={data.summary.active_stores} detail="Ativas e habilitadas no portal" onClick={() => setActiveTab('stores')} />
                <MetricCard icon={<Users size={21} />} label="Leads do site" value={data.summary.marketplace_leads} detail="Identificados no período selecionado" tone="blue" onClick={() => setActiveTab('leads')} />
                <MetricCard icon={<CircleDollarSign size={21} />} label="Vendas confirmadas" value={data.summary.confirmed_sales} detail="Leads do marketplace com venda confirmada" tone="emerald" onClick={() => setActiveTab('leads')} />
                <MetricCard icon={<Gauge size={21} />} label="Veículos vendidos" value={data.summary.sold_vehicles} detail="Itens marcados pelo fluxo comercial" tone="zinc" onClick={() => setActiveTab('vehicles')} />
              </section>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <section className="premium-card p-5">
                  <SectionHeader title="Alertas prioritários" description="Itens críticos e avisos que merecem conferência." action={<button className="premium-button-secondary text-xs" type="button" onClick={() => setActiveTab('problems')}>Ver todos</button>} />
                  <div className="mt-5 grid gap-3">
                    {featuredProblems.map((problem) => (
                      <div key={problem.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-black text-zinc-950">{problem.title}</p>
                            <p className="mt-1 text-sm font-bold text-zinc-500">{problem.description}</p>
                            <p className="mt-2 text-xs font-black text-zinc-400">{problem.store?.name || problem.vehicle?.name || 'Marketplace'} • {dateTime(problem.created_at)}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${problem.severity === 'critical' ? 'bg-red-50 text-red-700' : problem.severity === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                            {problem.severity === 'critical' ? 'Crítico' : problem.severity === 'warning' ? 'Atenção' : 'Informativo'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {!featuredProblems.length ? <EmptyState>Nenhuma inconsistência detectada no período.</EmptyState> : null}
                  </div>
                </section>

                <section className="premium-card p-5">
                  <SectionHeader title="Leads recentes" description="Últimos interessados identificados como origem marketplace." action={<button className="premium-button-secondary text-xs" type="button" onClick={() => setActiveTab('leads')}>Ver todos</button>} />
                  <div className="mt-5 grid gap-3">
                    {recentLeads.map((lead) => (
                      <div key={lead.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate font-black text-zinc-950">{lead.customer_name}</p>
                            <p className="mt-1 truncate text-sm font-bold text-zinc-500">{lead.interested_vehicle}</p>
                            <p className="mt-2 text-xs font-black text-zinc-400">{lead.store?.name || 'Loja não identificada'} • {dateTime(lead.created_at)}</p>
                          </div>
                          <StatusBadge value={lead.status} />
                        </div>
                      </div>
                    ))}
                    {!recentLeads.length ? <EmptyState>Nenhum lead do marketplace foi identificado no período.</EmptyState> : null}
                  </div>
                </section>
              </div>
            </>
          ) : null}

          {data.generated_at && activeTab === 'vehicles' ? (
            <section className="premium-card mt-6 overflow-hidden p-5">
              <SectionHeader title="Veículos publicados e cadastrados" description={`${data.pagination.total.toLocaleString('pt-BR')} registro(s) encontrados com os filtros atuais.`} action={<span className="rounded-full bg-zinc-100 px-4 py-2 text-xs font-black text-zinc-600">Página {data.pagination.page} de {data.pagination.total_pages}</span>} />

              <div className="mt-5 overflow-x-auto">
                <table className="min-w-[1500px] w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs font-black uppercase tracking-wider text-zinc-400">
                      <th className="px-3 py-4">Veículo</th>
                      <th className="px-3 py-4">Loja proprietária</th>
                      <th className="px-3 py-4">Valor</th>
                      <th className="px-3 py-4">Status</th>
                      <th className="px-3 py-4">Publicação</th>
                      <th className="px-3 py-4">Propriedade</th>
                      <th className="px-3 py-4">Origem</th>
                      <th className="px-3 py-4">Cadastro</th>
                      <th className="px-3 py-4">Ações Master</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.vehicles.map((vehicle) => {
                      const locked = vehicle.status === 'vendido';
                      const selectedStore = storeSelections[vehicle.id] ?? vehicle.store?.id ?? '';
                      return (
                        <tr key={vehicle.id} className="border-b border-zinc-100 align-top">
                          <td className="px-3 py-4">
                            <div className="flex min-w-64 items-center gap-3">
                              {vehicle.image_url ? <img className="h-14 w-20 rounded-xl object-cover" src={vehicle.image_url} alt={vehicle.name} /> : <div className="flex h-14 w-20 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400"><Car size={20} /></div>}
                              <div>
                                <p className="font-black text-zinc-950">{vehicle.name}</p>
                                <p className="mt-1 text-xs font-bold text-zinc-400">{text(vehicle.mileage, 'KM não informada')}</p>
                                {vehicle.missing_fields?.length ? <p className="mt-1 text-xs font-black text-amber-600">Faltando: {vehicle.missing_fields.join(', ')}</p> : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <p className="font-black text-zinc-800">{vehicle.store?.name || 'Não resolvida'}</p>
                            {vehicle.store && (!vehicle.store.portal_enabled || vehicle.store.status !== 'active') ? <p className="mt-1 text-xs font-black text-red-600">Loja indisponível</p> : null}
                          </td>
                          <td className="px-3 py-4 font-black text-zinc-950">{money(vehicle.price)}</td>
                          <td className="px-3 py-4"><StatusBadge value={vehicle.status} /></td>
                          <td className="px-3 py-4">
                            <span className={`font-black ${vehicle.show_on_landing ? 'text-emerald-700' : 'text-zinc-400'}`}>{vehicle.show_on_landing ? 'Visível' : 'Oculto'}</span>
                            {vehicle.is_featured ? <p className="mt-1 text-xs font-black text-red-600">Destaque</p> : null}
                          </td>
                          <td className="px-3 py-4">
                            <span className={`font-black ${vehicle.ownership === 'direct' ? 'text-emerald-700' : vehicle.ownership === 'legacy' ? 'text-amber-700' : 'text-red-700'}`}>
                              {vehicle.ownership === 'direct' ? 'Direta' : vehicle.ownership === 'legacy' ? 'Legada' : 'Não resolvida'}
                            </span>
                          </td>
                          <td className="px-3 py-4">{vehicle.source_url ? <a className="inline-flex items-center gap-1 font-black text-red-600 hover:underline" href={vehicle.source_url} target="_blank" rel="noreferrer">Abrir <ExternalLink size={13} /></a> : <span className="font-bold text-zinc-400">Sem link</span>}</td>
                          <td className="px-3 py-4 font-bold text-zinc-500">{dateTime(vehicle.created_at)}</td>
                          <td className="px-3 py-4">
                            <div className="grid min-w-72 gap-2">
                              {locked ? <p className="rounded-xl bg-zinc-100 p-3 text-xs font-black text-zinc-500">Bloqueado: use o fluxo da venda.</p> : (
                                <>
                                  <div className="flex flex-wrap gap-2">
                                    <button className="premium-button-secondary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`visibility-${vehicle.id}`, { action: 'vehicle_visibility', vehicle_id: vehicle.id, visible: !vehicle.show_on_landing }, vehicle.show_on_landing ? { prompt: 'Ocultar este veículo do Portal Oficial?', code: 'RETIRAR' } : { prompt: 'Publicar este veículo no Portal Oficial?', code: 'PUBLICAR' })}>
                                      {vehicle.show_on_landing ? <EyeOff size={14} /> : <Eye size={14} />} {vehicle.show_on_landing ? 'Retirar' : 'Publicar'}
                                    </button>
                                    <button className="premium-button-secondary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`featured-${vehicle.id}`, { action: 'vehicle_featured', vehicle_id: vehicle.id, featured: !vehicle.is_featured })}>
                                      <Star size={14} /> {vehicle.is_featured ? 'Remover destaque' : 'Destacar'}
                                    </button>
                                    <button className="premium-button-secondary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`status-${vehicle.id}`, { action: 'vehicle_status', vehicle_id: vehicle.id, status: vehicle.status === 'oculto' ? 'disponivel' : 'oculto' })}>
                                      <Wrench size={14} /> {vehicle.status === 'oculto' ? 'Marcar disponível' : 'Marcar oculto'}
                                    </button>
                                  </div>

                                  {vehicle.ownership === 'legacy' ? (
                                    <button className="premium-button-secondary justify-center px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`legacy-${vehicle.id}`, { action: 'vehicle_migrate_legacy_owner', vehicle_id: vehicle.id }, { prompt: 'Consolidar o proprietário legado em store_id?', code: 'CONSOLIDAR' })}>
                                      <CheckCircle2 size={14} /> Consolidar propriedade legada
                                    </button>
                                  ) : null}

                                  <div className="grid grid-cols-[1fr_auto] gap-2">
                                    <select className="premium-input py-2 text-xs" value={selectedStore} onChange={(event) => setStoreSelections((current) => ({ ...current, [vehicle.id]: event.target.value }))}>
                                      <option value="">Selecione a loja</option>
                                      {activeStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                                    </select>
                                    <button className="premium-button-primary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey) || !selectedStore} onClick={() => void executeAction(`store-${vehicle.id}`, { action: 'vehicle_assign_store', vehicle_id: vehicle.id, store_id: selectedStore }, { prompt: 'Alterar a loja proprietária deste veículo?', code: 'ATRIBUIR' })}>
                                      Atribuir
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!data.vehicles.length ? <div className="mt-5"><EmptyState>Nenhum veículo encontrado para os filtros selecionados.</EmptyState></div> : null}

              <div className="mt-5 flex items-center justify-between gap-3">
                <button className="premium-button-secondary" type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={18} /> Anterior</button>
                <p className="text-xs font-black text-zinc-400">{data.pagination.total.toLocaleString('pt-BR')} veículo(s)</p>
                <button className="premium-button-secondary" type="button" disabled={page >= data.pagination.total_pages || loading} onClick={() => setPage((current) => current + 1)}>Próxima <ChevronRight size={18} /></button>
              </div>
            </section>
          ) : null}

          {data.generated_at && activeTab === 'pending' ? (
            <section className="premium-card mt-6 p-5">
              <SectionHeader title="Fila de pendências" description="Links e arquivos enviados pelas lojas que ainda precisam de tratamento." />
              <div className="mt-5 grid gap-3">
                {data.pending.map((item) => (
                  <div key={`${item.kind}-${item.id}`} className="rounded-3xl border border-zinc-100 bg-zinc-50 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {item.kind === 'file' ? <FileClock className="text-amber-600" size={18} /> : <ExternalLink className="text-blue-600" size={18} />}
                          <p className="font-black text-zinc-950">{item.kind === 'file' ? 'Arquivo de estoque' : 'Link de veículo'}</p>
                        </div>
                        {item.kind === 'link' ? <a className="mt-2 block break-all text-sm font-bold text-red-600 hover:underline" href={item.title} target="_blank" rel="noreferrer">{item.title}</a> : <p className="mt-2 break-all text-sm font-bold text-zinc-600">{item.title}</p>}
                        <p className="mt-2 text-xs font-black text-zinc-400">{item.store?.name || 'Loja não encontrada'} • {dateTime(item.created_at)}</p>
                      </div>
                      <div className="flex flex-col gap-2 xl:items-end">
                        <StatusBadge value={item.status} />
                        <div className="flex flex-wrap gap-2">
                          {item.kind === 'link' ? (
                            <>
                              <button className="premium-button-secondary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`review-${item.id}`, { action: 'submission_status', submission_id: item.id, status: 'reviewing' })}>Conferir</button>
                              <button className="premium-button-primary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void publishSubmission(item)}>Publicar</button>
                              <button className="premium-button-secondary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`duplicate-${item.id}`, { action: 'submission_status', submission_id: item.id, status: 'duplicate' }, { prompt: 'Marcar este link como duplicado?', code: 'DUPLICADO' }, 'Informe o motivo da duplicidade:')}>Duplicado</button>
                              <button className="premium-button-secondary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`reject-${item.id}`, { action: 'submission_status', submission_id: item.id, status: 'rejected' }, { prompt: 'Rejeitar este link?', code: 'REJEITAR' }, 'Informe o motivo da rejeição:')}><XCircle size={14} /> Rejeitar</button>
                            </>
                          ) : (
                            <>
                              <button className="premium-button-secondary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`file-review-${item.id}`, { action: 'stock_import_status', import_id: item.id, status: 'reviewing' })}>Em análise</button>
                              <button className="premium-button-primary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`file-process-${item.id}`, { action: 'stock_import_status', import_id: item.id, status: 'processed' }, { prompt: 'Marcar este arquivo como processado?', code: 'PROCESSADO' })}>Processado</button>
                              <button className="premium-button-secondary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`file-reject-${item.id}`, { action: 'stock_import_status', import_id: item.id, status: 'rejected' }, { prompt: 'Rejeitar este arquivo?', code: 'REJEITAR' })}><XCircle size={14} /> Rejeitar</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {!data.pending.length ? <EmptyState>Não existem pendências para o período selecionado.</EmptyState> : null}
              </div>
            </section>
          ) : null}

          {data.generated_at && activeTab === 'problems' ? (
            <section className="premium-card mt-6 p-5">
              <SectionHeader title="Problemas detectados" description="Inconsistências de propriedade, disponibilidade, cadastro e processamento." />
              <div className="mt-5 grid gap-3">
                {data.problems.map((problem) => (
                  <div key={problem.id} className={`rounded-3xl border p-4 ${problem.severity === 'critical' ? 'border-red-100 bg-red-50/50' : problem.severity === 'warning' ? 'border-amber-100 bg-amber-50/50' : 'border-blue-100 bg-blue-50/50'}`}>
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className={problem.severity === 'critical' ? 'text-red-600' : problem.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'} size={19} />
                          <p className="font-black text-zinc-950">{problem.title}</p>
                        </div>
                        <p className="mt-2 text-sm font-bold text-zinc-600">{problem.description}</p>
                        <p className="mt-2 text-xs font-black text-zinc-400">{[problem.store?.name, problem.vehicle?.name, dateTime(problem.created_at)].filter(Boolean).join(' • ')}</p>
                      </div>
                      <div className="flex flex-col gap-2 xl:items-end">
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${problem.severity === 'critical' ? 'bg-red-100 text-red-700' : problem.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {problem.severity === 'critical' ? 'Crítico' : problem.severity === 'warning' ? 'Atenção' : 'Informativo'}
                        </span>
                        {problem.vehicle?.id && problem.type === 'legacy_owner' ? (
                          <button className="premium-button-secondary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`problem-legacy-${problem.vehicle.id}`, { action: 'vehicle_migrate_legacy_owner', vehicle_id: problem.vehicle.id }, { prompt: 'Consolidar a propriedade legada deste veículo?', code: 'CONSOLIDAR' })}><CheckCircle2 size={14} /> Consolidar propriedade</button>
                        ) : null}
                        {problem.vehicle?.id && problem.severity !== 'info' ? (
                          <button className="premium-button-secondary px-3 py-2 text-xs" type="button" disabled={Boolean(actionKey)} onClick={() => void executeAction(`problem-hide-${problem.vehicle.id}`, { action: 'vehicle_hide_problem', vehicle_id: problem.vehicle.id }, { prompt: 'Ocultar preventivamente este veículo?', code: 'OCULTAR' })}><EyeOff size={14} /> Ocultar preventivamente</button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                {!data.problems.length ? <EmptyState>Nenhum problema foi detectado no período selecionado.</EmptyState> : null}
              </div>
            </section>
          ) : null}

          {data.generated_at && activeTab === 'stores' ? (
            <section className="premium-card mt-6 overflow-hidden p-5">
              <SectionHeader title="Lojas participantes" description="Situação do portal e desempenho operacional por loja." />
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs font-black uppercase tracking-wider text-zinc-400">
                      <th className="px-3 py-4">Loja</th><th className="px-3 py-4">Portal</th><th className="px-3 py-4">Veículos</th><th className="px-3 py-4">Publicados</th><th className="px-3 py-4">Pendentes</th><th className="px-3 py-4">Leads</th><th className="px-3 py-4">Responsável</th><th className="px-3 py-4">Site</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stores.map((store) => (
                      <tr key={store.id} className="border-b border-zinc-100">
                        <td className="px-3 py-4"><p className="font-black text-zinc-950">{store.name}</p><p className="mt-1 text-xs font-bold text-zinc-400">{text(store.slug)}</p></td>
                        <td className="px-3 py-4"><span className={`inline-flex items-center gap-2 font-black ${store.status === 'active' && store.portal_enabled ? 'text-emerald-700' : 'text-red-700'}`}>{store.status === 'active' && store.portal_enabled ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{store.status === 'active' && store.portal_enabled ? 'Ativo' : 'Indisponível'}</span></td>
                        <td className="px-3 py-4 font-black text-zinc-800">{store.vehicles}</td><td className="px-3 py-4 font-black text-emerald-700">{store.published}</td><td className="px-3 py-4 font-black text-amber-700">{store.pending}</td><td className="px-3 py-4 font-black text-blue-700">{store.leads}</td>
                        <td className="px-3 py-4"><p className="font-black text-zinc-700">{text(store.responsible_name)}</p><p className="mt-1 text-xs font-bold text-zinc-400">{text(store.responsible_email)}</p></td>
                        <td className="px-3 py-4">{store.website_url ? <a className="inline-flex items-center gap-1 font-black text-red-600 hover:underline" href={store.website_url} target="_blank" rel="noreferrer">Abrir <ExternalLink size={13} /></a> : <span className="font-bold text-zinc-400">Não informado</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.stores.length ? <div className="mt-5"><EmptyState>Nenhuma loja encontrada.</EmptyState></div> : null}
            </section>
          ) : null}

          {data.generated_at && activeTab === 'leads' ? (
            <section className="premium-card mt-6 overflow-hidden p-5">
              <SectionHeader title="Leads do marketplace" description="Interessados cuja origem foi identificada como site, landing ou marketplace." />
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-[1100px] w-full text-left text-sm">
                  <thead><tr className="border-b border-zinc-200 text-xs font-black uppercase tracking-wider text-zinc-400"><th className="px-3 py-4">Cliente</th><th className="px-3 py-4">Veículo</th><th className="px-3 py-4">Loja</th><th className="px-3 py-4">Etapa</th><th className="px-3 py-4">Responsável</th><th className="px-3 py-4">Venda</th><th className="px-3 py-4">Origem</th><th className="px-3 py-4">Entrada</th></tr></thead>
                  <tbody>
                    {data.leads.map((lead) => (
                      <tr key={lead.id} className="border-b border-zinc-100 align-top">
                        <td className="px-3 py-4"><p className="font-black text-zinc-950">{lead.customer_name}</p><p className="mt-1 text-xs font-bold text-zinc-400">{text(lead.customer_phone)}</p></td>
                        <td className="px-3 py-4 font-black text-zinc-700">{lead.interested_vehicle}</td><td className="px-3 py-4 font-black text-zinc-700">{lead.store?.name || 'Não direcionado'}</td><td className="px-3 py-4"><StatusBadge value={lead.status} /></td>
                        <td className="px-3 py-4"><p className="font-black text-zinc-700">{lead.responsible?.name || 'Sem responsável'}</p><p className="mt-1 text-xs font-bold text-zinc-400">{text(lead.responsible?.role)}</p></td>
                        <td className="px-3 py-4">{lead.sale ? <><StatusBadge value={lead.sale.status} />{lead.sale.value > 0 ? <p className="mt-2 font-black text-emerald-700">{money(lead.sale.value)}</p> : null}</> : <span className="font-bold text-zinc-400">Não confirmada</span>}</td>
                        <td className="px-3 py-4 font-bold text-zinc-500">{text(lead.origin)}</td><td className="px-3 py-4 font-bold text-zinc-500">{dateTime(lead.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.leads.length ? <div className="mt-5"><EmptyState>Nenhum lead do marketplace foi identificado no período.</EmptyState></div> : null}
            </section>
          ) : null}

          {data.generated_at ? (
            <footer className="mt-6 flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 text-xs font-bold text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
              <span>Atualizado em {dateTime(data.generated_at)}</span>
              <span className="inline-flex items-center gap-2"><Building2 size={14} /> Gestão administrativa protegida no servidor</span>
            </footer>
          ) : null}
        </div>
      </section>
    </main>
  );
}
