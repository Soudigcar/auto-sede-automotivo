'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  X
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type CatalogTab =
  | 'brands'
  | 'models'
  | 'versions'
  | 'configurations'
  | 'fuels'
  | 'transmissions'
  | 'colors'
  | 'aliases'
  | 'suggestions';

type Snapshot = {
  generated_at?: string;
  summary?: Record<string, number>;
  brands: any[];
  models: any[];
  versions: any[];
  configurations: any[];
  fuels: any[];
  transmissions: any[];
  colors: any[];
  aliases: any[];
  suggestions: any[];
  history: any[];
  pagination?: ConfigurationPagination;
};

type ConfigurationPagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  from: number;
  to: number;
  search: string;
  status: 'all' | 'active' | 'inactive';
};

const emptySnapshot: Snapshot = {
  brands: [],
  models: [],
  versions: [],
  configurations: [],
  fuels: [],
  transmissions: [],
  colors: [],
  aliases: [],
  suggestions: [],
  history: []
};

const tabs: { key: CatalogTab; label: string; singular: string }[] = [
  { key: 'brands', label: 'Marcas', singular: 'marca' },
  { key: 'models', label: 'Modelos', singular: 'modelo' },
  { key: 'versions', label: 'Versões', singular: 'versão' },
  { key: 'configurations', label: 'Configurações', singular: 'configuração' },
  { key: 'fuels', label: 'Combustíveis', singular: 'combustível' },
  { key: 'transmissions', label: 'Câmbios', singular: 'câmbio' },
  { key: 'colors', label: 'Cores', singular: 'cor' },
  { key: 'aliases', label: 'Apelidos', singular: 'apelido' },
  { key: 'suggestions', label: 'Sugestões', singular: 'sugestão' }
];

const inputClass =
  'w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50';

function defaultForm(tab: CatalogTab) {
  const common = { is_active: true };
  if (tab === 'brands') return { ...common, name: '', slug: '', country: '' };
  if (tab === 'models') return { ...common, brand_id: '', name: '', category: '', start_year: '', end_year: '' };
  if (tab === 'versions') {
    return {
      ...common,
      model_id: '',
      name: '',
      engine_name: '',
      engine_displacement: '',
      body_type: '',
      doors: '',
      seats: '',
      traction: ''
    };
  }
  if (tab === 'configurations') {
    return {
      ...common,
      version_id: '',
      manufacture_year: '',
      model_year: '',
      fuel_id: '',
      transmission_id: '',
      engine_name: '',
      engine_displacement: '',
      body_type: '',
      traction: '',
      doors: '',
      seats: '',
      notes: ''
    };
  }
  if (tab === 'fuels') return { ...common, name: '', code: '', sort_order: 0 };
  if (tab === 'transmissions') return { ...common, name: '', code: '', gears: '', notes: '', sort_order: 0 };
  if (tab === 'colors') return { ...common, name: '', base_color: '', hex_code: '', sort_order: 0 };
  if (tab === 'aliases') return { ...common, entity_type: 'brand', entity_id: '', alias: '', source: 'master' };
  return {
    proposed_entity_type: 'brand',
    suggested_name: '',
    source_type: 'master',
    status: 'pending',
    matched_entity_type: '',
    matched_entity_id: '',
    review_notes: ''
  };
}

function prettyDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function activeLabel(value: any) {
  return value?.is_active === false ? 'Inativo' : 'Ativo';
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value || 0);
}

export default function MasterVehicleCatalogPage() {
  const supabase = useMemo(() => createClient(), []);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [tab, setTab] = useState<CatalogTab>('brands');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');
  const [configurationPage, setConfigurationPage] = useState(1);
  const [catalogReady, setCatalogReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(defaultForm('brands'));
  const requestSequence = useRef(0);

  const brandById = useMemo(() => new Map(snapshot.brands.map((item) => [String(item.id), item])), [snapshot.brands]);
  const modelById = useMemo(() => new Map(snapshot.models.map((item) => [String(item.id), item])), [snapshot.models]);
  const versionById = useMemo(() => new Map(snapshot.versions.map((item) => [String(item.id), item])), [snapshot.versions]);
  const fuelById = useMemo(() => new Map(snapshot.fuels.map((item) => [String(item.id), item])), [snapshot.fuels]);
  const transmissionById = useMemo(
    () => new Map(snapshot.transmissions.map((item) => [String(item.id), item])),
    [snapshot.transmissions]
  );

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function load(options: {
    partial?: boolean;
    page?: number;
    search?: string;
    status?: 'all' | 'active' | 'inactive' | 'pending';
    clearMessage?: boolean;
  } = {}) {
    const requestId = ++requestSequence.current;
    const requestedPage = options.page || 1;
    const requestedSearch = options.search || '';
    const requestedStatus = ['active', 'inactive'].includes(options.status || '')
      ? options.status as 'active' | 'inactive'
      : 'all';
    const params = new URLSearchParams({
      page: String(requestedPage),
      pageSize: '100',
      search: requestedSearch,
      status: requestedStatus
    });
    if (options.partial) params.set('section', 'configurations');

    setLoading(true);
    if (options.clearMessage !== false) setMessage('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sua sessão expirou.');
      const response = await fetch(`/api/master/vehicle-catalog?${params.toString()}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o catálogo.');
      if (requestId !== requestSequence.current) return false;

      if (options.partial) {
        setSnapshot((current) => ({
          ...current,
          generated_at: payload.generated_at || current.generated_at,
          configurations: payload.configurations || [],
          pagination: payload.pagination || current.pagination
        }));
      } else {
        setSnapshot({ ...emptySnapshot, ...payload });
        setCatalogReady(true);
      }
      return true;
    } catch (error: any) {
      if (requestId === requestSequence.current) {
        setMessage(error?.message || 'Não foi possível carregar o catálogo.');
      }
      return false;
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load({ page: 1, search: '', status: 'all' });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!catalogReady || tab !== 'configurations') return;
    void load({
      partial: true,
      page: configurationPage,
      search: debouncedSearch,
      status: statusFilter
    });
  }, [catalogReady, configurationPage, debouncedSearch, statusFilter, tab]);

  useEffect(() => {
    setEditing(null);
    setForm(defaultForm(tab));
    setStatusFilter(tab === 'suggestions' ? 'pending' : 'all');
    setConfigurationPage(1);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'configurations' || !snapshot.pagination) return;
    if (configurationPage > snapshot.pagination.total_pages) {
      setConfigurationPage(snapshot.pagination.total_pages);
    }
  }, [configurationPage, snapshot.pagination, tab]);

  function openEdit(item: any) {
    setEditing(item);
    setForm({ ...defaultForm(tab), ...item });
  }

  function closeModal() {
    setEditing(null);
    setForm(defaultForm(tab));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sua sessão expirou.');
      const method = editing?.id ? 'PATCH' : 'POST';
      const response = await fetch('/api/master/vehicle-catalog', {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...form, resource: tab, id: editing?.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
      const reloaded = await load({
        page: tab === 'configurations' ? configurationPage : 1,
        search: tab === 'configurations' ? debouncedSearch : '',
        status: tab === 'configurations' ? statusFilter : 'all',
        clearMessage: false
      });
      if (reloaded) setMessage(editing?.id ? 'Cadastro atualizado.' : 'Cadastro criado.');
      closeModal();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function quickPatch(item: any, changes: Record<string, any>) {
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sua sessão expirou.');
      const response = await fetch('/api/master/vehicle-catalog', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...item, ...changes, resource: tab, id: item.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar.');
      const reloaded = await load({
        page: tab === 'configurations' ? configurationPage : 1,
        search: tab === 'configurations' ? debouncedSearch : '',
        status: tab === 'configurations' ? statusFilter : 'all',
        clearMessage: false
      });
      if (reloaded) setMessage('Cadastro atualizado.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível atualizar.');
    } finally {
      setSaving(false);
    }
  }

  const currentItems = snapshot[tab] || [];

  const filteredItems = useMemo(() => {
    if (tab === 'configurations') return currentItems;
    const query = search.trim().toLowerCase();
    return currentItems.filter((item: any) => {
      const searchable = JSON.stringify(item).toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (tab === 'suggestions') {
        if (statusFilter === 'pending' && !['pending', 'reviewing'].includes(item.status)) return false;
        if (statusFilter === 'active' && item.status !== 'approved') return false;
        if (statusFilter === 'inactive' && !['rejected', 'merged'].includes(item.status)) return false;
      } else {
        if (statusFilter === 'active' && item.is_active === false) return false;
        if (statusFilter === 'inactive' && item.is_active !== false) return false;
      }
      return true;
    });
  }, [currentItems, search, statusFilter, tab]);

  function entityOptions(type: string) {
    if (type === 'brand') return snapshot.brands;
    if (type === 'model') return snapshot.models;
    if (type === 'version') return snapshot.versions;
    if (type === 'fuel') return snapshot.fuels;
    if (type === 'transmission') return snapshot.transmissions;
    if (type === 'color') return snapshot.colors;
    if (type === 'configuration') return snapshot.configurations;
    return [];
  }

  function entityName(type: string, id: string) {
    const item = entityOptions(type).find((entry: any) => String(entry.id) === String(id));
    if (!item) return 'Destino não encontrado';
    if (type === 'configuration') {
      const version = versionById.get(String(item.version_id));
      return `${version?.name || 'Versão'} ${item.manufacture_year}/${item.model_year}`;
    }
    return item.name || item.alias || item.suggested_name || 'Sem nome';
  }

  function recordTitle(item: any) {
    if (tab === 'brands') return item.name;
    if (tab === 'models') return `${brandById.get(String(item.brand_id))?.name || 'Marca'} ${item.name}`;
    if (tab === 'versions') {
      const model = modelById.get(String(item.model_id));
      const brand = model ? brandById.get(String(model.brand_id)) : null;
      return `${brand?.name || ''} ${model?.name || ''} ${item.name}`.trim();
    }
    if (tab === 'configurations') {
      const version = versionById.get(String(item.version_id));
      const model = version ? modelById.get(String(version.model_id)) : null;
      const brand = model ? brandById.get(String(model.brand_id)) : null;
      return `${brand?.name || ''} ${model?.name || ''} ${version?.name || ''} ${item.manufacture_year}/${item.model_year}`.trim();
    }
    if (tab === 'aliases') return item.alias;
    if (tab === 'suggestions') return item.suggested_name;
    return item.name;
  }

  function recordMeta(item: any) {
    if (tab === 'brands') return `${item.models_count || 0} modelo(s) • ${item.aliases_count || 0} apelido(s)`;
    if (tab === 'models') return `${item.category || 'Categoria não informada'} • ${item.versions_count || 0} versão(ões)`;
    if (tab === 'versions') {
      return [
        item.engine_name,
        item.engine_displacement ? `${item.engine_displacement} L` : '',
        item.body_type,
        `${item.configurations_count || 0} configuração(ões)`
      ].filter(Boolean).join(' • ');
    }
    if (tab === 'configurations') {
      return [
        fuelById.get(String(item.fuel_id))?.name,
        transmissionById.get(String(item.transmission_id))?.name,
        item.engine_name,
        item.engine_displacement ? `${item.engine_displacement} L` : ''
      ].filter(Boolean).join(' • ') || 'Dados técnicos ainda não informados';
    }
    if (tab === 'fuels' || tab === 'colors') return `${item.code || item.base_color || 'Sem código'} • ${item.aliases_count || 0} apelido(s)`;
    if (tab === 'transmissions') return `${item.gears ? `${item.gears} marchas` : 'Marchas não informadas'} • ${item.aliases_count || 0} apelido(s)`;
    if (tab === 'aliases') return `${item.entity_type} → ${entityName(item.entity_type, item.entity_id)}`;
    if (tab === 'suggestions') return `${item.proposed_entity_type} • origem: ${item.source_type} • ${prettyDate(item.created_at)}`;
    return '';
  }

  const activeTab = tabs.find((item) => item.key === tab)!;
  const modalOpen = editing !== null || Boolean(form.__creating);
  const pagination = snapshot.pagination;

  function createFromButton() {
    setEditing(null);
    setForm({ ...defaultForm(tab), __creating: true });
  }

  function setField(name: string, value: any) {
    setForm((current: any) => ({ ...current, [name]: value }));
  }

  return (
    <main className="min-h-screen bg-[#05070d] text-zinc-950">
      <div className="flex min-h-screen">
        <MasterSidebar active="/master/vehicle-catalog" />

        <section className="min-w-0 flex-1 bg-[#f4f6fa] p-4 md:p-8">
          <div className="mx-auto max-w-[1600px]">
            <header className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm md:p-8">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-red-600">Gestão Master</p>
                  <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">Cadastro de Veículos</h1>
                  <p className="mt-3 max-w-3xl text-sm font-semibold text-zinc-500 md:text-base">
                    Base oficial de marcas, modelos, versões e configurações. Os formulários das lojas ainda não utilizam este catálogo.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-black text-zinc-700 hover:border-red-200"
                    onClick={() => void load({
                      page: tab === 'configurations' ? configurationPage : 1,
                      search: tab === 'configurations' ? debouncedSearch : '',
                      status: tab === 'configurations' ? statusFilter : 'all'
                    })}
                    disabled={loading || saving}
                  >
                    <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
                    Atualizar
                  </button>
                  {tab !== 'suggestions' ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 hover:bg-red-700"
                      onClick={createFromButton}
                    >
                      <Plus size={17} />
                      Nova {activeTab.singular}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {[
                  ['Marcas', snapshot.summary?.brands || 0],
                  ['Modelos', snapshot.summary?.models || 0],
                  ['Versões', snapshot.summary?.versions || 0],
                  ['Configurações', snapshot.summary?.configurations || 0],
                  ['Apelidos', snapshot.summary?.aliases || 0],
                  ['Sugestões pendentes', snapshot.summary?.pending_suggestions || 0]
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                    <p className="text-xs font-black uppercase tracking-wide text-zinc-500">{label}</p>
                    <strong className="mt-1 block text-2xl font-black text-zinc-950">{value}</strong>
                  </div>
                ))}
              </div>
            </header>

            {message ? (
              <div className={`mt-5 rounded-2xl border p-4 text-sm font-bold ${
                /não|erro|inválid|existe/i.test(message)
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}>
                {message}
              </div>
            ) : null}

            <section className="mt-6 rounded-[28px] border border-zinc-200 bg-white p-4 shadow-sm md:p-6">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {tabs.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-black transition ${
                      tab === item.key ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                    onClick={() => setTab(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_220px]">
                <label className="relative block">
                  <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    className={`${inputClass} pl-11`}
                    placeholder={`Buscar em ${activeTab.label.toLowerCase()}...`}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      if (tab === 'configurations') setConfigurationPage(1);
                    }}
                  />
                </label>
                <select
                  className={inputClass}
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as any);
                    if (tab === 'configurations') setConfigurationPage(1);
                  }}
                >
                  <option value="all">Todos</option>
                  {tab === 'suggestions' ? (
                    <>
                      <option value="pending">Pendentes e em análise</option>
                      <option value="active">Aprovadas</option>
                      <option value="inactive">Rejeitadas ou unificadas</option>
                    </>
                  ) : (
                    <>
                      <option value="active">Ativos</option>
                      <option value="inactive">Inativos</option>
                    </>
                  )}
                </select>
              </div>

              {loading ? (
                <div className="flex min-h-72 items-center justify-center">
                  <Loader2 className="animate-spin text-red-600" size={34} />
                </div>
              ) : filteredItems.length ? (
                <div className="mt-5 grid gap-3">
                  {filteredItems.map((item: any) => (
                    <article
                      key={item.id}
                      className="grid gap-4 rounded-3xl border border-zinc-200 bg-white p-5 transition hover:border-red-200 hover:shadow-md xl:grid-cols-[1fr_auto] xl:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${
                            tab === 'suggestions'
                              ? ['approved'].includes(item.status)
                                ? 'bg-emerald-50 text-emerald-700'
                                : ['rejected', 'merged'].includes(item.status)
                                  ? 'bg-zinc-100 text-zinc-600'
                                  : 'bg-amber-50 text-amber-700'
                              : item.is_active === false
                                ? 'bg-zinc-100 text-zinc-600'
                                : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {tab === 'suggestions' ? item.status : activeLabel(item)}
                          </span>
                          {item.normalized_name || item.normalized_alias ? (
                            <span className="truncate rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black text-blue-700">
                              {item.normalized_name || item.normalized_alias}
                            </span>
                          ) : null}
                        </div>
                        <h2 className="mt-3 break-words text-xl font-black text-zinc-950">{recordTitle(item)}</h2>
                        <p className="mt-1 break-words text-sm font-semibold text-zinc-500">{recordMeta(item)}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        {tab === 'suggestions' && ['pending', 'reviewing'].includes(item.status) ? (
                          <>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-700"
                              onClick={() => void quickPatch(item, { status: 'approved' })}
                              disabled={saving}
                            >
                              <CheckCircle2 size={15} /> Aprovar
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black text-red-700"
                              onClick={() => void quickPatch(item, { status: 'rejected' })}
                              disabled={saving}
                            >
                              <X size={15} /> Rejeitar
                            </button>
                          </>
                        ) : null}

                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-xs font-black text-zinc-700 hover:border-red-200"
                          onClick={() => openEdit(item)}
                        >
                          <Edit3 size={15} /> Editar
                        </button>

                        {tab !== 'suggestions' ? (
                          <button
                            type="button"
                            className={`rounded-2xl border px-4 py-3 text-xs font-black ${
                              item.is_active === false
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                            }`}
                            onClick={() => void quickPatch(item, { is_active: item.is_active === false })}
                            disabled={saving}
                          >
                            {item.is_active === false ? 'Ativar' : 'Desativar'}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center">
                  <AlertTriangle className="mx-auto text-zinc-400" size={34} />
                  <h2 className="mt-3 text-xl font-black">Nenhum registro encontrado</h2>
                  <p className="mt-2 text-sm font-semibold text-zinc-500">
                    Ajuste os filtros ou cadastre a primeira informação desta categoria.
                  </p>
                </div>
              )}

              {tab === 'configurations' && pagination && !loading ? (
                <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <p className="text-sm font-bold text-zinc-600">
                    <strong className="text-zinc-950">
                      {formatNumber(pagination.from)}–{formatNumber(pagination.to)}
                    </strong>{' '}
                    de {formatNumber(pagination.total)} configurações
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => setConfigurationPage((current) => Math.max(1, current - 1))}
                      disabled={configurationPage <= 1}
                    >
                      <ChevronLeft size={15} /> Anterior
                    </button>

                    <label className="flex items-center gap-2 text-xs font-black text-zinc-600">
                      Página
                      <select
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-900 outline-none focus:border-red-400"
                        value={configurationPage}
                        onChange={(event) => setConfigurationPage(Number(event.target.value))}
                        aria-label="Selecionar página de configurações"
                      >
                        {Array.from({ length: pagination.total_pages }, (_, index) => index + 1).map((pageNumber) => (
                          <option key={pageNumber} value={pageNumber}>{pageNumber}</option>
                        ))}
                      </select>
                      de {formatNumber(pagination.total_pages)}
                    </label>

                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => setConfigurationPage((current) => Math.min(pagination.total_pages, current + 1))}
                      disabled={configurationPage >= pagination.total_pages}
                    >
                      Próxima <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="mt-6 rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Histórico recente</h2>
              <p className="mt-1 text-sm font-semibold text-zinc-500">
                Alterações realizadas no Cadastro Mestre de Veículos.
              </p>
              <div className="mt-4 grid gap-3">
                {snapshot.history.slice(0, 12).map((item: any) => (
                  <div key={item.id} className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-zinc-900">{item.action_type}</strong>
                      <span className="text-xs font-bold text-zinc-500">{prettyDate(item.created_at)}</span>
                    </div>
                    <p className="mt-1 font-semibold text-zinc-500">{item.entity_type}</p>
                  </div>
                ))}
                {!snapshot.history.length ? (
                  <p className="rounded-2xl bg-zinc-50 p-4 text-sm font-semibold text-zinc-500">
                    O histórico começará a aparecer após o primeiro cadastro ou edição.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-slate-950/75 p-3 md:p-8">
          <form
            onSubmit={save}
            className="my-auto w-full max-w-4xl rounded-[30px] border border-zinc-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-[30px] border-b border-zinc-200 bg-white/95 p-5 backdrop-blur md:p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-red-600">Cadastro Mestre</p>
                <h2 className="mt-1 text-2xl font-black">
                  {editing?.id ? `Editar ${activeTab.singular}` : `Nova ${activeTab.singular}`}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 p-3 text-zinc-500 hover:bg-zinc-100"
                onClick={closeModal}
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
              {tab === 'brands' ? (
                <>
                  <Field label="Nome oficial *">
                    <input className={inputClass} value={form.name || ''} onChange={(e) => setField('name', e.target.value)} required />
                  </Field>
                  <Field label="Slug">
                    <input className={inputClass} value={form.slug || ''} onChange={(e) => setField('slug', e.target.value)} placeholder="gerado pelo nome" />
                  </Field>
                  <Field label="País">
                    <input className={inputClass} value={form.country || ''} onChange={(e) => setField('country', e.target.value)} />
                  </Field>
                </>
              ) : null}

              {tab === 'models' ? (
                <>
                  <Field label="Marca *">
                    <select className={inputClass} value={form.brand_id || ''} onChange={(e) => setField('brand_id', e.target.value)} required>
                      <option value="">Selecione</option>
                      {snapshot.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Modelo oficial *">
                    <input className={inputClass} value={form.name || ''} onChange={(e) => setField('name', e.target.value)} required />
                  </Field>
                  <Field label="Categoria">
                    <input className={inputClass} value={form.category || ''} onChange={(e) => setField('category', e.target.value)} placeholder="SUV, hatch, sedã..." />
                  </Field>
                  <Field label="Início de fabricação">
                    <input type="number" className={inputClass} value={form.start_year || ''} onChange={(e) => setField('start_year', e.target.value)} />
                  </Field>
                  <Field label="Fim de fabricação">
                    <input type="number" className={inputClass} value={form.end_year || ''} onChange={(e) => setField('end_year', e.target.value)} />
                  </Field>
                </>
              ) : null}

              {tab === 'versions' ? (
                <>
                  <Field label="Modelo *">
                    <select className={inputClass} value={form.model_id || ''} onChange={(e) => setField('model_id', e.target.value)} required>
                      <option value="">Selecione</option>
                      {snapshot.models.map((item) => (
                        <option key={item.id} value={item.id}>
                          {brandById.get(String(item.brand_id))?.name} {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Versão oficial *">
                    <input className={inputClass} value={form.name || ''} onChange={(e) => setField('name', e.target.value)} required />
                  </Field>
                  <Field label="Motor">
                    <input className={inputClass} value={form.engine_name || ''} onChange={(e) => setField('engine_name', e.target.value)} placeholder="1.0 TSI, 2.0 Turbo..." />
                  </Field>
                  <Field label="Cilindrada">
                    <input type="number" step="0.1" className={inputClass} value={form.engine_displacement || ''} onChange={(e) => setField('engine_displacement', e.target.value)} />
                  </Field>
                  <Field label="Carroceria">
                    <input className={inputClass} value={form.body_type || ''} onChange={(e) => setField('body_type', e.target.value)} />
                  </Field>
                  <Field label="Tração">
                    <input className={inputClass} value={form.traction || ''} onChange={(e) => setField('traction', e.target.value)} />
                  </Field>
                  <Field label="Portas">
                    <input type="number" className={inputClass} value={form.doors || ''} onChange={(e) => setField('doors', e.target.value)} />
                  </Field>
                  <Field label="Lugares">
                    <input type="number" className={inputClass} value={form.seats || ''} onChange={(e) => setField('seats', e.target.value)} />
                  </Field>
                </>
              ) : null}

              {tab === 'configurations' ? (
                <>
                  <Field label="Versão *" full>
                    <select className={inputClass} value={form.version_id || ''} onChange={(e) => setField('version_id', e.target.value)} required>
                      <option value="">Selecione</option>
                      {snapshot.versions.map((item) => {
                        const model = modelById.get(String(item.model_id));
                        const brand = model ? brandById.get(String(model.brand_id)) : null;
                        return <option key={item.id} value={item.id}>{brand?.name} {model?.name} {item.name}</option>;
                      })}
                    </select>
                  </Field>
                  <Field label="Ano fabricação *">
                    <input type="number" className={inputClass} value={form.manufacture_year || ''} onChange={(e) => setField('manufacture_year', e.target.value)} required />
                  </Field>
                  <Field label="Ano modelo *">
                    <input type="number" className={inputClass} value={form.model_year || ''} onChange={(e) => setField('model_year', e.target.value)} required />
                  </Field>
                  <Field label="Combustível">
                    <select className={inputClass} value={form.fuel_id || ''} onChange={(e) => setField('fuel_id', e.target.value)}>
                      <option value="">Não definido</option>
                      {snapshot.fuels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Câmbio">
                    <select className={inputClass} value={form.transmission_id || ''} onChange={(e) => setField('transmission_id', e.target.value)}>
                      <option value="">Não definido</option>
                      {snapshot.transmissions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Motor">
                    <input className={inputClass} value={form.engine_name || ''} onChange={(e) => setField('engine_name', e.target.value)} />
                  </Field>
                  <Field label="Cilindrada">
                    <input type="number" step="0.1" className={inputClass} value={form.engine_displacement || ''} onChange={(e) => setField('engine_displacement', e.target.value)} />
                  </Field>
                  <Field label="Carroceria">
                    <input className={inputClass} value={form.body_type || ''} onChange={(e) => setField('body_type', e.target.value)} />
                  </Field>
                  <Field label="Tração">
                    <input className={inputClass} value={form.traction || ''} onChange={(e) => setField('traction', e.target.value)} />
                  </Field>
                  <Field label="Portas">
                    <input type="number" className={inputClass} value={form.doors || ''} onChange={(e) => setField('doors', e.target.value)} />
                  </Field>
                  <Field label="Lugares">
                    <input type="number" className={inputClass} value={form.seats || ''} onChange={(e) => setField('seats', e.target.value)} />
                  </Field>
                  <Field label="Observações" full>
                    <textarea className={`${inputClass} min-h-28 resize-y`} value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} />
                  </Field>
                </>
              ) : null}

              {tab === 'fuels' ? (
                <>
                  <Field label="Combustível *">
                    <input className={inputClass} value={form.name || ''} onChange={(e) => setField('name', e.target.value)} required />
                  </Field>
                  <Field label="Código">
                    <input className={inputClass} value={form.code || ''} onChange={(e) => setField('code', e.target.value)} />
                  </Field>
                  <Field label="Ordem">
                    <input type="number" className={inputClass} value={form.sort_order ?? 0} onChange={(e) => setField('sort_order', e.target.value)} />
                  </Field>
                </>
              ) : null}

              {tab === 'transmissions' ? (
                <>
                  <Field label="Câmbio *">
                    <input className={inputClass} value={form.name || ''} onChange={(e) => setField('name', e.target.value)} required />
                  </Field>
                  <Field label="Código">
                    <input className={inputClass} value={form.code || ''} onChange={(e) => setField('code', e.target.value)} />
                  </Field>
                  <Field label="Marchas">
                    <input type="number" className={inputClass} value={form.gears || ''} onChange={(e) => setField('gears', e.target.value)} />
                  </Field>
                  <Field label="Ordem">
                    <input type="number" className={inputClass} value={form.sort_order ?? 0} onChange={(e) => setField('sort_order', e.target.value)} />
                  </Field>
                  <Field label="Observações" full>
                    <textarea className={`${inputClass} min-h-24 resize-y`} value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} />
                  </Field>
                </>
              ) : null}

              {tab === 'colors' ? (
                <>
                  <Field label="Cor oficial *">
                    <input className={inputClass} value={form.name || ''} onChange={(e) => setField('name', e.target.value)} required />
                  </Field>
                  <Field label="Cor base">
                    <input className={inputClass} value={form.base_color || ''} onChange={(e) => setField('base_color', e.target.value)} placeholder="Branco, preto, prata..." />
                  </Field>
                  <Field label="Código hexadecimal">
                    <input className={inputClass} value={form.hex_code || ''} onChange={(e) => setField('hex_code', e.target.value)} placeholder="#FFFFFF" />
                  </Field>
                  <Field label="Ordem">
                    <input type="number" className={inputClass} value={form.sort_order ?? 0} onChange={(e) => setField('sort_order', e.target.value)} />
                  </Field>
                </>
              ) : null}

              {tab === 'aliases' ? (
                <>
                  <Field label="Tipo *">
                    <select
                      className={inputClass}
                      value={form.entity_type || 'brand'}
                      onChange={(e) => setForm((current: any) => ({ ...current, entity_type: e.target.value, entity_id: '' }))}
                    >
                      <option value="brand">Marca</option>
                      <option value="model">Modelo</option>
                      <option value="version">Versão</option>
                      <option value="fuel">Combustível</option>
                      <option value="transmission">Câmbio</option>
                      <option value="color">Cor</option>
                    </select>
                  </Field>
                  <Field label="Cadastro oficial *">
                    <select className={inputClass} value={form.entity_id || ''} onChange={(e) => setField('entity_id', e.target.value)} required>
                      <option value="">Selecione</option>
                      {entityOptions(form.entity_type || 'brand').map((item: any) => (
                        <option key={item.id} value={item.id}>{recordEntityOption(form.entity_type, item, brandById, modelById)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Apelido ou variação *">
                    <input className={inputClass} value={form.alias || ''} onChange={(e) => setField('alias', e.target.value)} required />
                  </Field>
                  <Field label="Origem">
                    <input className={inputClass} value={form.source || 'master'} onChange={(e) => setField('source', e.target.value)} />
                  </Field>
                </>
              ) : null}

              {tab === 'suggestions' ? (
                <>
                  <Field label="Tipo sugerido *">
                    <select className={inputClass} value={form.proposed_entity_type || 'brand'} onChange={(e) => setField('proposed_entity_type', e.target.value)}>
                      <option value="brand">Marca</option>
                      <option value="model">Modelo</option>
                      <option value="version">Versão</option>
                      <option value="configuration">Configuração</option>
                      <option value="fuel">Combustível</option>
                      <option value="transmission">Câmbio</option>
                      <option value="color">Cor</option>
                      <option value="alias">Apelido</option>
                    </select>
                  </Field>
                  <Field label="Nome sugerido *">
                    <input className={inputClass} value={form.suggested_name || ''} onChange={(e) => setField('suggested_name', e.target.value)} required />
                  </Field>
                  <Field label="Status">
                    <select className={inputClass} value={form.status || 'pending'} onChange={(e) => setField('status', e.target.value)}>
                      <option value="pending">Pendente</option>
                      <option value="reviewing">Em análise</option>
                      <option value="approved">Aprovada</option>
                      <option value="rejected">Rejeitada</option>
                      <option value="merged">Unificada</option>
                    </select>
                  </Field>
                  <Field label="Tipo do cadastro relacionado">
                    <select
                      className={inputClass}
                      value={form.matched_entity_type || ''}
                      onChange={(e) => setForm((current: any) => ({ ...current, matched_entity_type: e.target.value, matched_entity_id: '' }))}
                    >
                      <option value="">Nenhum</option>
                      <option value="brand">Marca</option>
                      <option value="model">Modelo</option>
                      <option value="version">Versão</option>
                      <option value="configuration">Configuração</option>
                      <option value="fuel">Combustível</option>
                      <option value="transmission">Câmbio</option>
                      <option value="color">Cor</option>
                      <option value="alias">Apelido</option>
                    </select>
                  </Field>
                  {form.matched_entity_type ? (
                    <Field label="Cadastro relacionado" full>
                      <select className={inputClass} value={form.matched_entity_id || ''} onChange={(e) => setField('matched_entity_id', e.target.value)}>
                        <option value="">Selecione</option>
                        {entityOptions(form.matched_entity_type).map((item: any) => (
                          <option key={item.id} value={item.id}>{recordEntityOption(form.matched_entity_type, item, brandById, modelById)}</option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                  <Field label="Observação da análise" full>
                    <textarea className={`${inputClass} min-h-28 resize-y`} value={form.review_notes || ''} onChange={(e) => setField('review_notes', e.target.value)} />
                  </Field>
                </>
              ) : null}

              {tab !== 'suggestions' ? (
                <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.is_active !== false}
                    onChange={(e) => setField('is_active', e.target.checked)}
                    className="h-5 w-5 accent-red-600"
                  />
                  <span className="text-sm font-black text-zinc-700">Cadastro ativo</span>
                </label>
              ) : null}
            </div>

            <div className="sticky bottom-0 flex flex-col gap-3 rounded-b-[30px] border-t border-zinc-200 bg-white/95 p-5 backdrop-blur md:flex-row md:justify-end md:p-6">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-700"
                onClick={closeModal}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20"
                disabled={saving}
              >
                {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
                Salvar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function Field({ label, full = false, children }: { label: string; full?: boolean; children: ReactNode }) {
  return (
    <label className={`grid gap-2 ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-xs font-black uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function recordEntityOption(type: string, item: any, brandById: Map<string, any>, modelById: Map<string, any>) {
  if (type === 'model') return `${brandById.get(String(item.brand_id))?.name || ''} ${item.name}`.trim();
  if (type === 'version') {
    const model = modelById.get(String(item.model_id));
    return `${model ? brandById.get(String(model.brand_id))?.name || '' : ''} ${model?.name || ''} ${item.name}`.trim();
  }
  if (type === 'configuration') return `${item.manufacture_year}/${item.model_year}`;
  return item.name || item.alias || item.suggested_name || 'Sem nome';
}
