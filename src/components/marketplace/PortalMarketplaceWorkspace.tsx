'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  Car,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  FileClock,
  FileSpreadsheet,
  Globe2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Users
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { SiteVehicleImportModal, type SiteImportInitial } from '@/components/marketplace/SiteVehicleImportModal';

type TabKey = 'overview' | 'vehicles' | 'pending' | 'problems' | 'stores' | 'leads';

type PortalData = {
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
    portal_only_stores: number;
    event_portal_stores: number;
  };
  vehicles: any[];
  pending: any[];
  problems: any[];
  stores: any[];
  leads: any[];
  diagnostics: Record<string, any>;
};

const emptyData: PortalData = {
  generated_at: '',
  summary: {
    total_vehicles: 0,
    published_vehicles: 0,
    sold_vehicles: 0,
    pending_items: 0,
    problems: 0,
    active_stores: 0,
    marketplace_leads: 0,
    confirmed_sales: 0,
    portal_only_stores: 0,
    event_portal_stores: 0
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
  disponivel: 'Disponível',
  vendido: 'Vendido',
  oculto: 'Oculto',
  pending: 'Pendente',
  reviewing: 'Em conferência',
  imported: 'Importado',
  processing: 'Processando',
  error: 'Erro',
  rejected: 'Rejeitado',
  duplicate: 'Duplicado',
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

function dateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function StatusBadge({ value }: { value: unknown }) {
  const status = normalized(value);
  const tone = ['active', 'disponivel', 'sale_confirmed'].includes(status)
    ? 'bg-emerald-50 text-emerald-700'
    : ['error', 'rejected', 'duplicate', 'lost'].includes(status)
      ? 'bg-red-50 text-red-700'
      : status === 'vendido'
        ? 'bg-blue-50 text-blue-700'
        : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${tone}`}>{statusLabels[status] || status || 'Sem status'}</span>;
}

function OriginBadge({ source, label }: { source: string; label: string }) {
  const tones: Record<string, string> = {
    website: 'bg-blue-50 text-blue-700',
    olx: 'bg-violet-50 text-violet-700',
    file: 'bg-amber-50 text-amber-700',
    marketplace: 'bg-red-50 text-red-700',
    site: 'bg-cyan-50 text-cyan-700',
    landing: 'bg-indigo-50 text-indigo-700',
    simulator: 'bg-fuchsia-50 text-fuchsia-700'
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

export function PortalMarketplaceWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<PortalData>(emptyData);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [pendingFilter, setPendingFilter] = useState('all');
  const [leadFilter, setLeadFilter] = useState('all');
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [siteInitial, setSiteInitial] = useState<SiteImportInitial | null>(null);

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
      const response = await fetch('/api/master/portal-workspace', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error || 'Não foi possível carregar o Portal Oficial.');
        return;
      }
      setData(result);
    } catch {
      setMessage('Falha de comunicação ao carregar o Portal Oficial.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void loadData(); }, [loadData]);

  const query = normalized(search);
  const filteredVehicles = data.vehicles.filter((item) => !query || [item.name, item.store?.name].some((value) => normalized(value).includes(query)));
  const filteredPending = data.pending.filter((item) => {
    const sourceMatches = pendingFilter === 'all' || item.source === pendingFilter;
    const searchMatches = !query || [item.title, item.store?.name].some((value) => normalized(value).includes(query));
    return sourceMatches && searchMatches;
  });
  const filteredProblems = data.problems.filter((item) => !query || [item.title, item.description, item.store?.name, item.vehicle?.name].some((value) => normalized(value).includes(query)));
  const filteredStores = data.stores.filter((item) => {
    const filterMatches = storeFilter === 'all' || item.presence === storeFilter || (storeFilter === 'problems' && item.pending > 0);
    const searchMatches = !query || [item.name, item.responsible_name, ...(item.event_names || [])].some((value) => normalized(value).includes(query));
    return filterMatches && searchMatches;
  });
  const filteredLeads = data.leads.filter((item) => {
    const originMatches = leadFilter === 'all' || item.origin === leadFilter;
    const searchMatches = !query || [item.customer_name, item.interested_vehicle, item.store?.name].some((value) => normalized(value).includes(query));
    return originMatches && searchMatches;
  });

  function openSiteReview(item: any) {
    setSiteInitial({ submissionId: item.id, storeId: item.store?.id || '', url: item.url || '' });
    setSiteModalOpen(true);
  }

  if (loading && !data.generated_at) {
    return <div className="flex min-h-[70vh] items-center justify-center"><div className="text-center"><Loader2 className="mx-auto animate-spin text-red-600" size={38} /><p className="mt-4 font-black text-zinc-700">Carregando Portal Oficial...</p></div></div>;
  }

  return <>
    <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <p className="premium-eyebrow">Gestão do Portal Oficial</p>
        <h1 className="premium-title mt-2 text-4xl md:text-5xl">Marketplace</h1>
        <p className="premium-muted mt-3 max-w-4xl text-sm">
          Esta tela mostra somente lojas, veículos, pendências e leads do Portal Oficial. As operações de cada evento ficam dentro do respectivo evento cadastrado.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="premium-button-secondary" href="/master/marketplace/catalog"><ExternalLink size={17} /> Gerenciar catálogo</Link>
        <button type="button" onClick={() => void loadData()} className="premium-button-primary" disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} size={17} /> Atualizar painel</button>
      </div>
    </header>

    <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50 p-5 text-sm font-bold text-blue-800">
      <strong>Escopo atual: Portal Oficial.</strong> Lojas que também participam de eventos aparecem identificadas como <strong>Evento + Portal</strong>, mas os dados específicos do evento não entram nos totais desta tela.
    </div>

    {message ? <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{message}</div> : null}

    <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={<Car size={20} />} label="Veículos cadastrados" value={data.summary.total_vehicles} detail="Estoque das lojas publicadas no Portal" onClick={() => setActiveTab('vehicles')} />
      <MetricCard icon={<ShieldCheck size={20} />} label="Publicados" value={data.summary.published_vehicles} detail="Disponíveis e visíveis no Portal Oficial" onClick={() => setActiveTab('vehicles')} />
      <MetricCard icon={<FileClock size={20} />} label="Pendências do Portal" value={data.summary.pending_items} detail="Não inclui filas vinculadas a eventos" onClick={() => setActiveTab('pending')} />
      <MetricCard icon={<AlertTriangle size={20} />} label="Problemas do Portal" value={data.summary.problems} detail="Inconsistências sem vínculo de evento" onClick={() => setActiveTab('problems')} />
      <MetricCard icon={<Store size={20} />} label="Lojas ativas" value={data.summary.active_stores} detail="Ativas e habilitadas no Portal" onClick={() => setActiveTab('stores')} />
      <MetricCard icon={<Users size={20} />} label="Leads do Portal" value={data.summary.marketplace_leads} detail="Landing, site e simulador sem evento" onClick={() => setActiveTab('leads')} />
      <MetricCard icon={<Building2 size={20} />} label="Somente Portal" value={data.summary.portal_only_stores} detail="Lojas sem participação em eventos" onClick={() => { setStoreFilter('portal_only'); setActiveTab('stores'); }} />
      <MetricCard icon={<Globe2 size={20} />} label="Evento + Portal" value={data.summary.event_portal_stores} detail="Lojas do Portal que também participam de eventos" onClick={() => { setStoreFilter('event_portal'); setActiveTab('stores'); }} />
    </section>

    <div className="mt-7 flex gap-2 overflow-x-auto pb-2">
      {tabs.map((tab) => <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`shrink-0 rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === tab.key ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950'}`}>{tab.label}</button>)}
    </div>

    {activeTab !== 'overview' ? (
      <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-4 md:flex-row md:items-center">
        <div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={17} /><input className="premium-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no Portal Oficial..." /></div>
        {activeTab === 'stores' ? <select className="premium-input md:max-w-56" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}><option value="all">Todas as lojas</option><option value="portal_only">Somente Portal</option><option value="event_portal">Evento + Portal</option><option value="problems">Com pendências</option></select> : null}
        {activeTab === 'pending' ? <select className="premium-input md:max-w-56" value={pendingFilter} onChange={(event) => setPendingFilter(event.target.value)}><option value="all">Todas as origens</option><option value="website">Sites das lojas</option><option value="olx">OLX</option><option value="file">Arquivos</option></select> : null}
        {activeTab === 'leads' ? <select className="premium-input md:max-w-56" value={leadFilter} onChange={(event) => setLeadFilter(event.target.value)}><option value="all">Todas as origens</option><option value="marketplace">Marketplace</option><option value="site">Portal Oficial</option><option value="landing">Landing</option><option value="simulator">Simulador</option></select> : null}
      </div>
    ) : null}

    <section className="mt-6">
      {activeTab === 'overview' ? <Overview data={data} onTab={setActiveTab} /> : null}
      {activeTab === 'vehicles' ? <Vehicles items={filteredVehicles} /> : null}
      {activeTab === 'pending' ? <Pending items={filteredPending} onSiteReview={openSiteReview} /> : null}
      {activeTab === 'problems' ? <Problems items={filteredProblems} /> : null}
      {activeTab === 'stores' ? <Stores items={filteredStores} /> : null}
      {activeTab === 'leads' ? <Leads items={filteredLeads} /> : null}
    </section>

    <SiteVehicleImportModal
      open={siteModalOpen}
      stores={data.stores.map((store) => ({ id: store.id, name: store.name }))}
      initial={siteInitial}
      onClose={() => setSiteModalOpen(false)}
      onComplete={() => { setSiteModalOpen(false); void loadData(); }}
    />
  </>;
}

function Overview({ data, onTab }: { data: PortalData; onTab: (tab: TabKey) => void }) {
  return <div className="grid gap-6 xl:grid-cols-2">
    <article className="premium-card p-6"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black text-zinc-950">Lojas do Portal</h2><p className="mt-1 text-sm font-bold text-zinc-500">Origem e participação claramente separadas.</p></div><button type="button" className="premium-button-secondary text-xs" onClick={() => onTab('stores')}>Ver todas</button></div><div className="mt-5 space-y-3">{data.stores.slice(0, 6).map((store) => <div key={store.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-zinc-950">{store.name}</p><span className={`rounded-full px-3 py-1 text-[10px] font-black ${store.presence === 'event_portal' ? 'bg-blue-50 text-blue-700' : 'bg-zinc-200 text-zinc-700'}`}>{store.presence_label.toUpperCase()}</span></div><p className="mt-2 text-xs font-bold text-zinc-500">{store.registration_source_label}{store.event_names?.length ? ` • Eventos: ${store.event_names.join(', ')}` : ''}</p></div>)}{!data.stores.length ? <EmptyState>Nenhuma loja publicada no Portal.</EmptyState> : null}</div></article>
    <article className="premium-card p-6"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black text-zinc-950">Leads recentes do Portal</h2><p className="mt-1 text-sm font-bold text-zinc-500">Eventos não entram nesta listagem.</p></div><button type="button" className="premium-button-secondary text-xs" onClick={() => onTab('leads')}>Ver todos</button></div><div className="mt-5 space-y-3">{data.leads.slice(0, 6).map((lead) => <div key={lead.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-zinc-950">{lead.customer_name}</p><OriginBadge source={lead.origin} label={lead.origin_label} /><StatusBadge value={lead.status} /></div><p className="mt-2 text-sm font-bold text-zinc-600">{lead.interested_vehicle}</p><p className="mt-1 text-xs font-bold text-zinc-400">{lead.store?.name || 'Não direcionado'} • {dateTime(lead.created_at)}</p></div>)}{!data.leads.length ? <EmptyState>Nenhum lead do Portal encontrado.</EmptyState> : null}</div></article>
  </div>;
}

function Vehicles({ items }: { items: any[] }) {
  if (!items.length) return <EmptyState>Nenhum veículo encontrado no Portal Oficial.</EmptyState>;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <article key={item.id} className="premium-card overflow-hidden"><div className="aspect-[16/9] bg-zinc-100">{item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-zinc-400"><Car size={38} /></div>}</div><div className="p-5"><div className="flex flex-wrap gap-2"><StatusBadge value={item.status} /><span className={`rounded-full px-3 py-1 text-[11px] font-black ${item.show_on_landing ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-600'}`}>{item.show_on_landing ? 'VISÍVEL NO PORTAL' : 'OCULTO'}</span></div><h3 className="mt-4 text-lg font-black text-zinc-950">{item.name}</h3><p className="mt-1 text-sm font-bold text-zinc-500">{item.store?.name || 'Loja não identificada'}</p><strong className="mt-4 block text-xl font-black text-zinc-950">{money(item.price)}</strong>{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-black text-red-600">Abrir origem <ExternalLink size={13} /></a> : null}</div></article>)}</div>;
}

function Pending({ items, onSiteReview }: { items: any[]; onSiteReview: (item: any) => void }) {
  if (!items.length) return <EmptyState>Nenhuma pendência exclusiva do Portal.</EmptyState>;
  return <div className="space-y-4">{items.map((item) => <article key={`${item.kind}-${item.id}`} className="premium-card p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><OriginBadge source={item.source} label={item.source_label} /><StatusBadge value={item.status} /></div><h3 className="mt-3 break-words text-lg font-black text-zinc-950">{item.title}</h3><p className="mt-2 text-xs font-bold text-zinc-500">{item.store?.name || 'Loja não identificada'} • {dateTime(item.created_at)} • {item.photos || 0} fotos</p>{item.missing_fields?.length ? <p className="mt-2 text-xs font-bold text-amber-700">Faltando: {item.missing_fields.join(', ')}</p> : null}</div><div className="flex flex-wrap gap-2">{item.source === 'website' ? <button type="button" className="premium-button-primary text-xs" onClick={() => onSiteReview(item)}><Globe2 size={15} /> Conferir site</button> : null}{item.source === 'olx' && item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="premium-button-primary text-xs"><ExternalLink size={15} /> Abrir na OLX</a> : null}{item.source === 'file' && item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="premium-button-secondary text-xs"><FileSpreadsheet size={15} /> Abrir arquivo</a> : null}</div></div></article>)}</div>;
}

function Problems({ items }: { items: any[] }) {
  if (!items.length) return <EmptyState>Nenhum problema exclusivo do Portal foi detectado.</EmptyState>;
  return <div className="space-y-4">{items.map((item) => <article key={item.id} className="premium-card p-5"><div className="flex items-start gap-4"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.severity === 'critical' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}><AlertTriangle size={21} /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black text-zinc-950">{item.title}</h3><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${item.severity === 'critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{item.severity === 'critical' ? 'Crítico' : 'Atenção'}</span></div><p className="mt-2 text-sm font-semibold text-zinc-600">{item.description}</p><p className="mt-2 text-xs font-bold text-zinc-400">{item.store?.name || item.vehicle?.name || 'Portal Oficial'} • {dateTime(item.created_at)}</p></div></div></article>)}</div>;
}

function Stores({ items }: { items: any[] }) {
  if (!items.length) return <EmptyState>Nenhuma loja encontrada com esses filtros.</EmptyState>;
  return <div className="grid gap-4 xl:grid-cols-2">{items.map((item) => <article key={item.id} className="premium-card p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-black text-zinc-950">{item.name}</h3><StatusBadge value={item.status} /></div><div className="mt-3 flex flex-wrap gap-2"><span className={`rounded-full px-3 py-1 text-[11px] font-black ${item.presence === 'event_portal' ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-700'}`}>{item.presence_label.toUpperCase()}</span><span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-black text-red-700">{item.registration_source_label.toUpperCase()}</span></div>{item.event_names?.length ? <p className="mt-3 text-xs font-bold text-blue-700">Eventos: {item.event_names.join(', ')}</p> : <p className="mt-3 text-xs font-bold text-zinc-400">Nenhuma participação em evento</p>}<p className="mt-3 text-sm font-bold text-zinc-500">Responsável: {item.responsible_name || 'Não informado'}</p></div>{item.slug ? <Link href={`/loja/${item.slug}`} className="premium-button-secondary text-xs"><ExternalLink size={14} /> Abrir loja</Link> : null}</div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><MiniMetric label="Veículos" value={item.vehicles} /><MiniMetric label="Publicados" value={item.published} /><MiniMetric label="Pendentes" value={item.pending} /><MiniMetric label="Leads" value={item.leads} /></div></article>)}</div>;
}

function Leads({ items }: { items: any[] }) {
  if (!items.length) return <EmptyState>Nenhum lead exclusivo do Portal encontrado.</EmptyState>;
  return <div className="space-y-4">{items.map((item) => <article key={item.id} className="premium-card p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black text-zinc-950">{item.customer_name}</h3><OriginBadge source={item.origin} label={item.origin_label} /><StatusBadge value={item.status} /></div><p className="mt-3 text-sm font-bold text-zinc-600">Interesse: {item.interested_vehicle}</p><p className="mt-2 text-xs font-bold text-zinc-400">Origem: {item.origin_label} • Loja: {item.store?.name || 'Não direcionado'} • {dateTime(item.created_at)}</p></div>{item.customer_phone ? <a href={`https://wa.me/55${String(item.customer_phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="premium-button-primary text-xs">Abrir WhatsApp</a> : null}</div></article>)}</div>;
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-zinc-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{label}</p><strong className="mt-1 block text-xl font-black text-zinc-950">{Number(value || 0).toLocaleString('pt-BR')}</strong></div>;
}
