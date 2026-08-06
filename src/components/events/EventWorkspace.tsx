'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Car,
  CheckCircle2,
  ExternalLink,
  FileClock,
  FileSpreadsheet,
  Globe2,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Store,
  Users,
  Wrench
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { OlxVehicleImportModal, type OlxImportInitial } from '@/components/marketplace/OlxVehicleImportModal';
import { SiteVehicleImportModal, type SiteImportInitial } from '@/components/marketplace/SiteVehicleImportModal';
import { StorePendingReviewDrawer } from '@/components/events/StorePendingReviewDrawer';

type TabKey = 'overview' | 'vehicles' | 'pending' | 'problems' | 'stores' | 'leads';

type WorkspaceData = {
  generated_at: string;
  event: any;
  summary: {
    stores: number;
    stores_portal: number;
    stores_event_only: number;
    vehicles: number;
    vehicles_portal: number;
    pending: number;
    problems: number;
    leads: number;
    sales: number;
  };
  vehicles: any[];
  pending: any[];
  problems: any[];
  stores: any[];
  leads: any[];
  diagnostics: Record<string, boolean>;
};

const emptyData: WorkspaceData = {
  generated_at: '',
  event: null,
  summary: {
    stores: 0,
    stores_portal: 0,
    stores_event_only: 0,
    vehicles: 0,
    vehicles_portal: 0,
    pending: 0,
    problems: 0,
    leads: 0,
    sales: 0
  },
  vehicles: [],
  pending: [],
  problems: [],
  stores: [],
  leads: [],
  diagnostics: {}
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'vehicles', label: 'Veículos' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'problems', label: 'Problemas' },
  { key: 'stores', label: 'Lojas' },
  { key: 'leads', label: 'Leads' }
];

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  pending: 'Pendente',
  reviewing: 'Em conferência',
  imported: 'Importado',
  processing: 'Processando',
  published: 'Publicado',
  rejected: 'Rejeitado',
  duplicate: 'Duplicado',
  error: 'Erro',
  disponivel: 'Disponível',
  vendido: 'Vendido',
  oculto: 'Oculto',
  new_lead: 'Novo lead',
  in_service: 'Em atendimento',
  scheduled: 'Agendado',
  showed_up: 'Compareceu',
  sale_confirmed: 'Venda confirmada',
  lost: 'Perdido'
};

function normalized(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function dateText(value: unknown) {
  if (!value) return '—';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.split('-').reverse().join('/');
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function StatusBadge({ value }: { value: unknown }) {
  const status = normalized(value);
  const tone = ['active', 'published', 'disponivel', 'sale_confirmed'].includes(status)
    ? 'bg-emerald-50 text-emerald-700'
    : ['error', 'rejected', 'duplicate', 'lost'].includes(status)
      ? 'bg-red-50 text-red-700'
      : status === 'inactive'
        ? 'bg-zinc-100 text-zinc-600'
        : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${tone}`}>{statusLabels[status] || status || 'Sem status'}</span>;
}

function OriginBadge({ source, label }: { source: string; label: string }) {
  const tones: Record<string, string> = {
    olx: 'bg-violet-50 text-violet-700',
    website: 'bg-blue-50 text-blue-700',
    file: 'bg-amber-50 text-amber-700',
    event: 'bg-red-50 text-red-700',
    landing: 'bg-cyan-50 text-cyan-700',
    simulator: 'bg-indigo-50 text-indigo-700',
    whatsapp: 'bg-emerald-50 text-emerald-700',
    manual: 'bg-zinc-100 text-zinc-700'
  };
  return <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${tones[source] || 'bg-zinc-100 text-zinc-700'}`}>{label}</span>;
}

function MetricCard({ icon, label, value, detail, onClick }: { icon: ReactNode; label: string; value: number; detail: string; onClick?: () => void }) {
  const content = <>
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">{icon}</div>
    <p className="mt-5 text-xs font-black uppercase tracking-[0.17em] text-zinc-400">{label}</p>
    <strong className="mt-2 block text-3xl font-black text-zinc-950">{Number(value || 0).toLocaleString('pt-BR')}</strong>
    <p className="mt-2 text-xs font-bold text-zinc-500">{detail}</p>
  </>;
  return onClick
    ? <button type="button" onClick={onClick} className="premium-card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-xl">{content}</button>
    : <article className="premium-card p-5">{content}</article>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 p-9 text-center text-sm font-bold text-zinc-500">{children}</div>;
}

export function EventWorkspace({ eventId }: { eventId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [leadFilter, setLeadFilter] = useState('all');
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [siteInitial, setSiteInitial] = useState<SiteImportInitial | null>(null);
  const [olxModalOpen, setOlxModalOpen] = useState(false);
  const [olxInitial, setOlxInitial] = useState<OlxImportInitial | null>(null);
  const [reviewStore, setReviewStore] = useState<any | null>(null);
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
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
      const response = await fetch(`/api/master/events/workspace?event_id=${encodeURIComponent(eventId)}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error || 'Não foi possível carregar o evento.');
        return;
      }
      setData(result);
    } catch {
      setMessage('Falha de comunicação ao carregar o painel do evento.');
    } finally {
      setLoading(false);
    }
  }, [eventId, supabase]);

  useEffect(() => { void loadData(); }, [loadData]);

  const query = normalized(search);
  const filteredVehicles = data.vehicles.filter((item) => !query || [item.name, item.store?.name].some((value) => normalized(value).includes(query)));
  const filteredPending = data.pending.filter((item) => {
    const matchesSource = sourceFilter === 'all' || item.source === sourceFilter;
    const matchesSearch = !query || [item.title, item.store?.name, item.submitter].some((value) => normalized(value).includes(query));
    return matchesSource && matchesSearch;
  });
  const filteredProblems = data.problems.filter((item) => !query || [item.title, item.description, item.store?.name, item.vehicle?.name].some((value) => normalized(value).includes(query)));
  const filteredStores = data.stores.filter((item) => {
    const matchesSearch = !query || [item.name, item.responsible_name].some((value) => normalized(value).includes(query));
    const matchesFilter = storeFilter === 'all'
      || (storeFilter === 'event_portal' && item.presence === 'event_portal')
      || (storeFilter === 'event_only' && item.presence === 'event_only')
      || (storeFilter === 'problems' && item.problems > 0)
      || (storeFilter === 'pending' && item.pending > 0)
      || (storeFilter === 'active' && item.status === 'active');
    return matchesSearch && matchesFilter;
  });
  const filteredLeads = data.leads.filter((item) => {
    const matchesOrigin = leadFilter === 'all' || item.origin === leadFilter;
    const matchesSearch = !query || [item.customer_name, item.interested_vehicle, item.store?.name, item.responsible?.name].some((value) => normalized(value).includes(query));
    return matchesOrigin && matchesSearch;
  });

  function openStoreReview(item: any) {
    if (!item.store?.id) {
      setMessage('Esta pendência ainda não está vinculada a uma loja.');
      return;
    }
    setReviewStore(item.store);
    setReviewDrawerOpen(true);
  }

  function openPendingEditor(item: any) {
    if (item.source === 'olx') {
      setOlxInitial({ submissionId: item.id, storeId: item.store?.id || '', url: item.url || '' });
      setOlxModalOpen(true);
      return;
    }
    if (item.source === 'website') {
      setSiteInitial({ submissionId: item.id, storeId: item.store?.id || '', url: item.url || '' });
      setSiteModalOpen(true);
      return;
    }
    if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
  }

  function completeReview() {
    setSiteModalOpen(false);
    setOlxModalOpen(false);
    setReviewDrawerOpen(false);
    void loadData();
  }

  if (loading && !data.event) {
    return <div className="flex min-h-[70vh] items-center justify-center"><div className="text-center"><Loader2 className="mx-auto animate-spin text-red-600" size={38} /><p className="mt-4 font-black text-zinc-700">Carregando evento...</p></div></div>;
  }

  if (!data.event) {
    return <div className="premium-card p-8 text-center"><AlertTriangle className="mx-auto text-red-600" size={40} /><p className="mt-4 font-black text-zinc-900">{message || 'Evento indisponível.'}</p><Link href="/master/events/manage" className="premium-button-secondary mt-5"><ArrowLeft size={16} /> Voltar aos eventos</Link></div>;
  }

  const event = data.event;
  const canOperate = !event.historical_mode;
  const importStores = data.stores.map((store) => ({ id: store.id, name: store.name }));

  return <>
    <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <Link href="/master/events/manage" className="inline-flex items-center gap-2 text-sm font-black text-zinc-500 hover:text-zinc-950"><ArrowLeft size={17} /> Eventos cadastrados</Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="premium-title text-3xl md:text-5xl">{event.name}</h1>
          <StatusBadge value={event.status} />
        </div>
        <p className="premium-muted mt-3 max-w-4xl text-sm">
          {event.state || '—'} | {event.city || '—'} | {dateText(event.start_date)} até {dateText(event.end_date)}
        </p>
        <p className="mt-1 text-sm font-bold text-zinc-400">Banco: {event.sponsor_bank || '—'} | Local: {event.location || '—'}</p>
      </div>
      <button type="button" onClick={() => void loadData()} className="premium-button-primary" disabled={loading}>
        <RefreshCw className={loading ? 'animate-spin' : ''} size={17} /> Atualizar painel
      </button>
    </header>

    {event.historical_mode ? (
      <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-800">
        Este evento está inativo. O painel permanece disponível em modo histórico, mas novas importações e publicações estão bloqueadas.
      </div>
    ) : null}

    {message ? <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{message}</div> : null}

    <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={<Store size={20} />} label="Lojas participantes" value={data.summary.stores} detail={`${data.summary.stores_portal} também estão no Portal`} onClick={() => setActiveTab('stores')} />
      <MetricCard icon={<Car size={20} />} label="Veículos no evento" value={data.summary.vehicles} detail={`${data.summary.vehicles_portal} também visíveis no Portal`} onClick={() => setActiveTab('vehicles')} />
      <MetricCard icon={<FileClock size={20} />} label="Pendentes" value={data.summary.pending} detail="Sites, OLX e arquivos aguardando tratamento" onClick={() => setActiveTab('pending')} />
      <MetricCard icon={<ShieldAlert size={20} />} label="Problemas" value={data.summary.problems} detail="Inconsistências específicas deste evento" onClick={() => setActiveTab('problems')} />
      <MetricCard icon={<Users size={20} />} label="Leads do evento" value={data.summary.leads} detail="Somente captações vinculadas a este evento" onClick={() => setActiveTab('leads')} />
      <MetricCard icon={<CheckCircle2 size={20} />} label="Vendas confirmadas" value={data.summary.sales} detail="Conversões registradas neste evento" />
      <MetricCard icon={<Globe2 size={20} />} label="Evento + Portal" value={data.summary.stores_portal} detail="Lojas participantes publicadas no Portal" onClick={() => { setStoreFilter('event_portal'); setActiveTab('stores'); }} />
      <MetricCard icon={<Building2 size={20} />} label="Somente evento" value={data.summary.stores_event_only} detail="Lojas sem publicação ativa no Portal" onClick={() => { setStoreFilter('event_only'); setActiveTab('stores'); }} />
    </section>

    <div className="mt-7 flex flex-wrap gap-2">
      {tabs.map((tab) => <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === tab.key ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950'}`}>{tab.label}</button>)}
    </div>

    {activeTab !== 'overview' ? (
      <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-4 md:flex-row md:items-center">
        <div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={17} /><input className="premium-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar neste evento..." /></div>
        {activeTab === 'pending' ? <select className="premium-input md:max-w-56" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">Todas as origens</option><option value="website">Sites das lojas</option><option value="olx">OLX</option><option value="file">Arquivos e planilhas</option></select> : null}
        {activeTab === 'stores' ? <select className="premium-input md:max-w-56" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}><option value="all">Todas as lojas</option><option value="event_portal">Evento + Portal</option><option value="event_only">Somente evento</option><option value="active">Ativas</option><option value="pending">Com pendências</option><option value="problems">Com problemas</option></select> : null}
        {activeTab === 'leads' ? <select className="premium-input md:max-w-56" value={leadFilter} onChange={(event) => setLeadFilter(event.target.value)}><option value="all">Todas as origens</option><option value="event">Evento</option><option value="landing">Landing do evento</option><option value="simulator">Simulador</option><option value="whatsapp">WhatsApp</option><option value="manual">Manual</option></select> : null}
      </div>
    ) : null}

    <section className="mt-6">
      {activeTab === 'overview' ? <Overview data={data} onTab={setActiveTab} /> : null}
      {activeTab === 'vehicles' ? <Vehicles items={filteredVehicles} /> : null}
      {activeTab === 'pending' ? <Pending items={filteredPending} canOperate={canOperate} onConferir={openStoreReview} /> : null}
      {activeTab === 'problems' ? <Problems items={filteredProblems} /> : null}
      {activeTab === 'stores' ? <Stores items={filteredStores} /> : null}
      {activeTab === 'leads' ? <Leads items={filteredLeads} eventName={event.name} /> : null}
    </section>

    <StorePendingReviewDrawer
      open={reviewDrawerOpen}
      store={reviewStore}
      pending={data.pending}
      vehicles={data.vehicles}
      canOperate={canOperate}
      onClose={() => setReviewDrawerOpen(false)}
      onReview={openPendingEditor}
    />

    <SiteVehicleImportModal
      open={siteModalOpen}
      eventId={event.id}
      eventName={event.name}
      stores={importStores}
      initial={siteInitial}
      onClose={() => setSiteModalOpen(false)}
      onComplete={completeReview}
    />

    <OlxVehicleImportModal
      open={olxModalOpen}
      stores={importStores}
      initial={olxInitial}
      onClose={() => setOlxModalOpen(false)}
      onComplete={completeReview}
    />
  </>;
}

function Overview({ data, onTab }: { data: WorkspaceData; onTab: (tab: TabKey) => void }) {
  const recentPending = data.pending.slice(0, 5);
  const priorityProblems = data.problems.slice(0, 5);
  return <div className="grid gap-6 xl:grid-cols-2">
    <article className="premium-card p-6"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black text-zinc-950">Pendências recentes</h2><p className="mt-1 text-sm font-bold text-zinc-500">Sites, OLX e arquivos do evento.</p></div><button type="button" className="premium-button-secondary text-xs" onClick={() => onTab('pending')}>Ver todas</button></div><div className="mt-5 space-y-3">{recentPending.map((item) => <div key={`${item.kind}-${item.id}`} className="rounded-2xl bg-zinc-50 p-4"><div className="flex flex-wrap items-center gap-2"><OriginBadge source={item.source} label={item.source_label} /><StatusBadge value={item.status} /></div><p className="mt-3 line-clamp-2 font-black text-zinc-900">{item.title}</p><p className="mt-1 text-xs font-bold text-zinc-500">{item.store?.name || 'Loja não identificada'} • {dateText(item.created_at)}</p></div>)}{recentPending.length === 0 ? <EmptyState>Nenhuma pendência neste evento.</EmptyState> : null}</div></article>
    <article className="premium-card p-6"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black text-zinc-950">Alertas prioritários</h2><p className="mt-1 text-sm font-bold text-zinc-500">Inconsistências exclusivas do evento.</p></div><button type="button" className="premium-button-secondary text-xs" onClick={() => onTab('problems')}>Ver todos</button></div><div className="mt-5 space-y-3">{priorityProblems.map((item) => <div key={item.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-zinc-900">{item.title}</p><p className="mt-1 text-sm font-semibold text-zinc-500">{item.description}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${item.severity === 'critical' ? 'bg-red-50 text-red-700' : item.severity === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{item.severity === 'critical' ? 'Crítico' : item.severity === 'warning' ? 'Atenção' : 'Info'}</span></div></div>)}{priorityProblems.length === 0 ? <EmptyState>Nenhum problema detectado.</EmptyState> : null}</div></article>
  </div>;
}

function Vehicles({ items }: { items: any[] }) {
  if (!items.length) return <EmptyState>Nenhum veículo vinculado a este evento.</EmptyState>;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <article key={item.id} className="premium-card overflow-hidden"><div className="aspect-[16/9] bg-zinc-100">{item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-zinc-400"><Car size={38} /></div>}</div><div className="p-5"><div className="flex flex-wrap gap-2"><StatusBadge value={item.status} /><span className={`rounded-full px-3 py-1 text-[11px] font-black ${item.portal_visible ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-600'}`}>{item.portal_visible ? 'EVENTO + PORTAL' : 'SOMENTE EVENTO'}</span></div><h3 className="mt-4 text-lg font-black text-zinc-950">{item.name}</h3><p className="mt-1 text-sm font-bold text-zinc-500">{item.store?.name || 'Loja não identificada'}</p><strong className="mt-4 block text-xl font-black text-zinc-950">{money(item.price)}</strong>{item.missing_fields?.length ? <p className="mt-3 text-xs font-bold text-amber-700">Pendências: {item.missing_fields.join(', ')}</p> : null}</div></article>)}</div>;
}

function Pending({ items, canOperate, onConferir }: { items: any[]; canOperate: boolean; onConferir: (item: any) => void }) {
  if (!items.length) return <EmptyState>Nenhuma pendência encontrada com esses filtros.</EmptyState>;
  return <div className="space-y-4">{items.map((item) => <article key={`${item.kind}-${item.id}`} className="premium-card p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><OriginBadge source={item.source} label={item.source_label} /><StatusBadge value={item.status} /></div><h3 className="mt-3 break-words text-lg font-black text-zinc-950">{item.title}</h3><p className="mt-2 text-sm font-bold text-zinc-500">Loja: {item.store?.name || 'Não identificada'} • Enviado por: {item.submitter || 'Não identificado'} • {dateText(item.created_at)}</p><div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-zinc-500"><span>{item.photos || 0} fotos encontradas</span>{item.missing_fields?.length ? <span className="text-amber-700">Faltando: {item.missing_fields.join(', ')}</span> : null}{item.error ? <span className="text-red-700">Erro: {item.error}</span> : null}</div></div><div className="flex flex-wrap gap-2">{['website', 'olx'].includes(item.source) ? <button type="button" className="premium-button-primary text-xs" disabled={!canOperate || !item.store?.id} onClick={() => onConferir(item)}><FileClock size={15} /> Conferir</button> : null}{item.source === 'olx' && item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="premium-button-secondary text-xs"><ExternalLink size={15} /> Abrir na OLX</a> : null}{item.source === 'file' && item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="premium-button-secondary text-xs"><FileSpreadsheet size={15} /> Abrir arquivo</a> : null}</div></div>{item.source === 'olx' ? <p className="mt-4 rounded-2xl bg-violet-50 p-3 text-xs font-bold text-violet-700">O botão Conferir tenta ler o anúncio e abre a revisão completa. Se a OLX bloquear a leitura pelo servidor, use a extensão do Chrome para trazer dados e fotos.</p> : null}</article>)}</div>;
}

function Problems({ items }: { items: any[] }) {
  if (!items.length) return <EmptyState>Nenhum problema encontrado com esses filtros.</EmptyState>;
  return <div className="space-y-4">{items.map((item) => <article key={item.id} className="premium-card p-5"><div className="flex items-start gap-4"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.severity === 'critical' ? 'bg-red-50 text-red-600' : item.severity === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{item.severity === 'critical' ? <AlertTriangle size={21} /> : <Wrench size={21} />}</div><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black text-zinc-950">{item.title}</h3><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${item.severity === 'critical' ? 'bg-red-50 text-red-700' : item.severity === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{item.severity === 'critical' ? 'Crítico' : item.severity === 'warning' ? 'Atenção' : 'Info'}</span></div><p className="mt-2 text-sm font-semibold text-zinc-600">{item.description}</p><p className="mt-2 text-xs font-bold text-zinc-400">{item.store?.name || 'Sem loja'}{item.vehicle?.name ? ` • ${item.vehicle.name}` : ''} • {dateText(item.created_at)}</p></div></div></article>)}</div>;
}

function Stores({ items }: { items: any[] }) {
  if (!items.length) return <EmptyState>Nenhuma loja encontrada com esses filtros.</EmptyState>;
  return <div className="grid gap-4 xl:grid-cols-2">{items.map((item) => <article key={item.id} className="premium-card p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-black text-zinc-950">{item.name}</h3><StatusBadge value={item.status} /></div><div className="mt-3 flex flex-wrap gap-2"><span className={`rounded-full px-3 py-1 text-[11px] font-black ${item.presence === 'event_portal' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>{item.presence_label.toUpperCase()}</span><span className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-black text-zinc-700">{item.registration_source_label.toUpperCase()}</span></div><p className="mt-4 text-sm font-bold text-zinc-500">Responsável: {item.responsible_name || 'Não informado'} • {item.responsible_phone || 'Sem telefone'}</p></div>{item.slug ? <Link href={`/loja/${item.slug}`} className="premium-button-secondary text-xs"><ExternalLink size={14} /> Abrir loja</Link> : null}</div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><MiniMetric label="Veículos" value={item.vehicles} /><MiniMetric label="Pendentes" value={item.pending} /><MiniMetric label="Problemas" value={item.problems} /><MiniMetric label="Leads" value={item.leads} /></div><p className="mt-4 text-xs font-bold text-zinc-400">Participação desde {dateText(item.joined_at)} • Sincronização automática: {item.auto_sync_inventory ? 'ativa' : 'desativada'}</p></article>)}</div>;
}

function Leads({ items, eventName }: { items: any[]; eventName: string }) {
  if (!items.length) return <EmptyState>Nenhum lead encontrado com esses filtros.</EmptyState>;
  return <div className="space-y-4">{items.map((item) => <article key={`${item.source_table}-${item.id}`} className="premium-card p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black text-zinc-950">{item.customer_name}</h3><OriginBadge source={item.origin} label={item.origin_label} /><StatusBadge value={item.status} /></div><p className="mt-3 text-sm font-bold text-zinc-600">Interesse: {item.interested_vehicle}</p><p className="mt-2 text-xs font-bold text-zinc-400">Origem: {item.origin_label} — {eventName} • Loja: {item.store?.name || 'Não direcionado'} • Responsável: {item.responsible?.name || 'Não atribuído'} • {dateText(item.created_at)}</p></div>{item.customer_phone ? <a href={`https://wa.me/55${String(item.customer_phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="premium-button-primary text-xs">Abrir WhatsApp</a> : null}</div></article>)}</div>;
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-zinc-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{label}</p><strong className="mt-1 block text-xl font-black text-zinc-950">{Number(value || 0).toLocaleString('pt-BR')}</strong></div>;
}
