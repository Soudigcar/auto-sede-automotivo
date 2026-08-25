'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarRange,
  Car,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Search,
  UserCheck
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { MasterLeadImportModal } from '@/components/MasterLeadImportModal';
import { MasterBulkLeadDistribution } from '@/components/MasterBulkLeadDistribution';
import { EventScopeSelect, eventScopeLabel } from '@/components/EventScopeSelect';
import { createClient } from '@/lib/supabase';

const statuses = [
  'Novo lead',
  'Em atendimento',
  'Simulação enviada',
  'Documentação solicitada',
  'Aprovado',
  'Reprovado',
  'Venda concluída',
  'Perdido'
];

const BASE_PAGE_SIZE = 200;
const BASE_LEAD_SELECT = 'id,name,phone,cpf,email,campaign_id,campaign_name,vehicle_name,source,assigned_store_id,assigned_store_name,assigned_consultant_id,routed_lead_id,event_id,status,metadata,created_at,updated_at';

type ViewMode = 'cards' | 'list';
type EditableField = 'name' | 'phone' | 'cpf' | 'birth_date' | 'city' | 'source' | 'campaign_name' | 'vehicle_name';

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

function formatCpf(value?: string) {
  if (!value) return '-';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  return value;
}

function birthDateValue(lead: any) {
  return String(lead?._birth_date || lead?.metadata?.birth_date || '').slice(0, 10);
}

function formatBirthDate(value?: unknown) {
  if (typeof value !== 'string') return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) return '-';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function leadCity(lead: any) {
  return String(
    lead?.metadata?.city
      || lead?.metadata?.cidade
      || lead?.metadata?.address?.city
      || lead?.metadata?.raw_meta_lead?.city
      || ''
  ).trim();
}

function leadCpf(lead: any) {
  return String(lead?.cpf || lead?._commercial_cpf || '').trim();
}

function assignedStoreName(lead: any) {
  return lead.assigned_store_name || lead.metadata?.routing?.assigned_store_name || '';
}

function linkedStoreNames(lead: any) {
  const names = Array.isArray(lead?._linked_store_names) ? lead._linked_store_names : [];
  if (names.length) return names as string[];
  const direct = assignedStoreName(lead);
  return direct ? [direct] : [];
}

function normalizedDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizedLeadPhone(value: unknown) {
  const digits = normalizedDigits(value);
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
}

function masterIdentityKey(lead: any) {
  const cpf = normalizedDigits(leadCpf(lead));
  if (cpf.length === 11) return `cpf:${cpf}`;
  const phone = normalizedLeadPhone(lead.phone);
  const name = String(lead.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (/^[1-9][0-9]{9,10}$/.test(phone)) return `phone:${phone}:name:${name || 'semnome'}`;
  const email = String(lead.email || '').trim().toLowerCase();
  if (email.includes('@')) return `email:${email}`;
  if (lead.canonical_lead_id) return `canonical:${lead.canonical_lead_id}`;
  return `base:${lead.id}`;
}

function consolidateMasterBaseLeads(rows: any[], instancesByBaseLead: Record<string, any> = {}) {
  const groups = new Map<string, any[]>();
  for (const lead of rows) {
    const key = masterIdentityKey(lead);
    const group = groups.get(key) || [];
    group.push(lead);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((records) => {
    const primary = records.slice().sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))[0];
    const storesById = new Map<string, { id: string; name: string }>();
    for (const record of records) {
      const directName = assignedStoreName(record);
      if (record.assigned_store_id && directName) {
        storesById.set(String(record.assigned_store_id), { id: String(record.assigned_store_id), name: directName });
      }
      const coverage = instancesByBaseLead[String(record.id)];
      for (const instance of coverage?.instances || []) {
        if (instance.store_id) storesById.set(String(instance.store_id), {
          id: String(instance.store_id),
          name: String(instance.store_name || 'Loja')
        });
      }
    }
    const linkedStores = Array.from(storesById.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return {
      ...primary,
      _base_records: records,
      _base_record_ids: records.map((record) => String(record.id)),
      _event_ids: Array.from(new Set(records.map((record) => record.event_id).filter(Boolean))),
      _sources: Array.from(new Set(records.map((record) => record.source).filter(Boolean))),
      _linked_stores: linkedStores,
      _linked_store_names: linkedStores.map((store) => store.name)
    };
  }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function eventPeriod(event: any) {
  const date = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '';
  return [date(event?.start_date), date(event?.end_date)].filter(Boolean).join(' a ');
}

function sourceBucket(lead: any) {
  const source = String(lead?.source || '').toLowerCase();
  const metadata = lead?.metadata || {};
  const text = [source, metadata?.source, metadata?.channel, metadata?.page].filter(Boolean).join(' ').toLowerCase();

  if (text.includes('instagram')) return 'Instagram';
  if (text.includes('facebook') || text.includes('meta lead')) return 'Facebook';
  if (text.includes('whatsapp') || text.includes('wati') || text.includes('evolution') || text.includes('umbler')) return 'WhatsApp';
  if (text.includes('simulador') || text.includes('simulation') || text.includes('landing page')) return 'Simulador';
  if (text.includes('marketplace') || text.includes('portal')) return 'Portal';
  if (text.includes('manual')) return 'Manual';
  if (text.includes('form') || metadata?.meta_form_id || metadata?.form_mapping_name) return 'Formulário';
  return 'Outros';
}

export default function MasterBasePage() {
  const supabase = useMemo(() => createClient(), []);
  const [leads, setLeads] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [eventFilter, setEventFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [birthDateFilter, setBirthDateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [message, setMessage] = useState('Carregando base...');
  const [loading, setLoading] = useState(true);
  const [busyLeadId, setBusyLeadId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [editingCell, setEditingCell] = useState('');
  const [editValue, setEditValue] = useState('');

  async function loadBasePages() {
    const rows: any[] = [];
    for (let offset = 0; ; offset += BASE_PAGE_SIZE) {
      const pageResult = await supabase
        .from('leads_base')
        .select(BASE_LEAD_SELECT)
        .order('created_at', { ascending: false })
        .range(offset, offset + BASE_PAGE_SIZE - 1);
      if (pageResult.error) throw pageResult.error;
      const page = pageResult.data || [];
      rows.push(...page);
      if (page.length < BASE_PAGE_SIZE) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return rows;
  }

  async function loadLeads() {
    setLoading(true);
    setMessage('Carregando base...');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || '';

      const baseRowsPromise = loadBasePages();
      const [commercialResult, directStoreResult, eventResult, leadRows] = await Promise.all([
        supabase.from('lead_commercial_details').select('lead_id,birth_date,cpf'),
        supabase.from('stores').select('id,store_name,status,portal_enabled,slug').order('store_name', { ascending: true }),
        supabase.from('events').select('id,event_name,status,start_date,end_date,state,city,location,created_at').neq('status', 'deleted').order('start_date', { ascending: false, nullsFirst: false }),
        baseRowsPromise
      ]);

      if (eventResult.error) {
        setMessage('Não foi possível carregar a Base por evento. Atualize a página e tente novamente.');
        return;
      }

      const commercialMap = new Map((commercialResult.data || []).map((item: any) => [String(item.lead_id), item]));
      const enrichedLeads = (leadRows || []).map((lead: any) => {
        const commercial = lead.routed_lead_id ? commercialMap.get(String(lead.routed_lead_id)) : null;
        return {
          ...lead,
          _birth_date: commercial?.birth_date || lead.metadata?.birth_date || null,
          _commercial_cpf: commercial?.cpf || null
        };
      });

      let storeRows = (directStoreResult.data || []).filter((store: any) => {
        const storeStatus = String(store.status || '').toLowerCase();
        return storeStatus !== 'deleted' && storeStatus !== 'excluido';
      });

      if (!storeRows.length) {
        try {
          const storeResponse = await fetch('/api/base-stores', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          if (storeResponse.ok) {
            const storeResult = await storeResponse.json();
            storeRows = storeResult.stores || [];
          }
        } catch {
          storeRows = [];
        }
      }

      const instancesByBaseLead: Record<string, any> = {};
      if (token) {
        for (let offset = 0; offset < enrichedLeads.length; offset += 500) {
          const ids = enrichedLeads.slice(offset, offset + 500).map((lead: any) => lead.id).join(',');
          const response = await fetch(`/api/master/base-lead-store-instances?base_lead_ids=${encodeURIComponent(ids)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.ok) {
            const result = await response.json();
            Object.assign(instancesByBaseLead, result.instances_by_base_lead || {});
          }
        }
      }

      setLeads(consolidateMasterBaseLeads(enrichedLeads, instancesByBaseLead));
      setStores(storeRows || []);
      setEvents(eventResult.data || []);
      setMessage('');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeads().catch(() => {
      setLoading(false);
      setMessage('Erro ao carregar a Base.');
    });
  }, []);

  const eventMap = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const activeEventIds = useMemo(() => new Set(events.filter((event) => event.status === 'active').map((event) => event.id)), [events]);

  const eventScopedLeads = useMemo(() => leads.filter((lead) => {
    const eventIds = Array.isArray(lead._event_ids) ? lead._event_ids : (lead.event_id ? [lead.event_id] : []);
    if (eventFilter === 'all') return true;
    if (eventFilter === 'active') return eventIds.some((id: string) => activeEventIds.has(id));
    if (eventFilter === 'unassigned') return !eventIds.length;
    return eventIds.includes(eventFilter);
  }), [activeEventIds, eventFilter, leads]);

  const sources = useMemo(() => Array.from(new Set(eventScopedLeads.flatMap((lead) => lead._sources || (lead.source ? [lead.source] : [])))).sort(), [eventScopedLeads]);
  const assignedStores = useMemo(() => Array.from(new Set(eventScopedLeads.flatMap((lead) => linkedStoreNames(lead)))).sort(), [eventScopedLeads]);
  const cities = useMemo(() => Array.from(new Set(eventScopedLeads.map((lead) => leadCity(lead)).filter(Boolean))).sort(), [eventScopedLeads]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    return eventScopedLeads.filter((lead) => {
      if (status !== 'all' && lead.status !== status) return false;
      if (source !== 'all' && !(lead._sources || [lead.source]).includes(source)) return false;
      if (storeFilter !== 'all' && !linkedStoreNames(lead).includes(storeFilter)) return false;
      if (cityFilter !== 'all' && leadCity(lead) !== cityFilter) return false;
      if (birthDateFilter && birthDateValue(lead) !== birthDateFilter) return false;
      if (!term) return true;

      const eventNames = (lead._event_ids || [lead.event_id]).filter(Boolean).map((id: string) => eventMap.get(id)?.event_name).filter(Boolean).join(' ');
      return [lead.id, lead.name, lead.phone, leadCpf(lead), lead.email, lead.campaign_name, lead.vehicle_name, (lead._sources || [lead.source]).join(' '), linkedStoreNames(lead).join(' '), eventNames || 'Sem evento', leadCity(lead), birthDateValue(lead)]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [birthDateFilter, cityFilter, eventMap, eventScopedLeads, query, source, status, storeFilter]);

  const summary = useMemo(() => ({
    total: filtered.length,
    novos: filtered.filter((lead) => lead.status === 'Novo lead').length,
    atendimento: filtered.filter((lead) => lead.status === 'Em atendimento').length,
    aprovados: filtered.filter((lead) => lead.status === 'Aprovado').length,
    vendidos: filtered.filter((lead) => lead.status === 'Venda concluída').length,
    perdidos: filtered.filter((lead) => lead.status === 'Perdido').length
  }), [filtered]);

  const sourceSummary = useMemo(() => ({
    formulario: filtered.filter((lead) => sourceBucket(lead) === 'Formulário').length,
    whatsapp: filtered.filter((lead) => sourceBucket(lead) === 'WhatsApp').length,
    simulador: filtered.filter((lead) => sourceBucket(lead) === 'Simulador').length,
    portal: filtered.filter((lead) => sourceBucket(lead) === 'Portal').length,
    facebook: filtered.filter((lead) => sourceBucket(lead) === 'Facebook').length,
    instagram: filtered.filter((lead) => sourceBucket(lead) === 'Instagram').length,
    manual: filtered.filter((lead) => sourceBucket(lead) === 'Manual').length,
    cpf: filtered.filter((lead) => Boolean(leadCpf(lead))).length
  }), [filtered]);

  const selectedEvent = events.find((event) => event.id === eventFilter) || null;
  const historicalScope = Boolean(selectedEvent && selectedEvent.status !== 'active');
  const scopeTitle = eventScopeLabel(events, eventFilter);

  async function updateLeadStatus(lead: any, nextStatus: string) {
    const recordIds = lead._base_record_ids || [lead.id];
    setBusyLeadId(lead.id);
    const { error } = await supabase.from('leads_base').update({ status: nextStatus, updated_at: new Date().toISOString() }).in('id', recordIds);
    if (error) setMessage('Erro ao atualizar status.');
    else await loadLeads();
    setBusyLeadId('');
  }

  async function updateEditableField(lead: any, field: EditableField, value: string) {
    setBusyLeadId(lead.id);
    setMessage('Salvando alteração...');
    try {
      const records = lead._base_records || [lead];
      const recordIds = records.map((record: any) => record.id);
      if (field === 'birth_date') {
        const routedIds = Array.from(new Set(records.map((record: any) => record.routed_lead_id).filter(Boolean)));
        if (routedIds.length) {
          const { error } = await supabase.from('lead_commercial_details').upsert(routedIds.map((leadId) => ({ lead_id: leadId, birth_date: value || null })), { onConflict: 'lead_id' });
          if (error) throw error;
        }
        for (const record of records.filter((item: any) => !item.routed_lead_id)) {
          const metadata = { ...(record.metadata || {}), birth_date: value || null };
          const { error } = await supabase.from('leads_base').update({ metadata, updated_at: new Date().toISOString() }).eq('id', record.id);
          if (error) throw error;
        }
      } else if (field === 'city') {
        for (const record of records) {
          const metadata = { ...(record.metadata || {}), city: value };
          const { error } = await supabase.from('leads_base').update({ metadata, updated_at: new Date().toISOString() }).eq('id', record.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from('leads_base').update({ [field]: value || null, updated_at: new Date().toISOString() }).in('id', recordIds);
        if (error) throw error;
      }
      setEditingCell('');
      setMessage('Alteração salva.');
      await loadLeads();
    } catch {
      setMessage('Não foi possível salvar a alteração.');
    } finally {
      setBusyLeadId('');
    }
  }

  function changeEventScope(value: string) {
    setEventFilter(value);
    setStoreFilter('all');
  }

  function applyStatusMetric(nextStatus: string) {
    setStatus((current) => current === nextStatus ? 'all' : nextStatus);
  }

  function applySourceMetric(bucket: string) {
    const match = sources.find((item) => eventScopedLeads.some((lead) => lead.source === item && sourceBucket(lead) === bucket));
    if (match) setSource((current) => current === match ? 'all' : match);
  }

  async function exportExcel() {
    if (!filtered.length) return setMessage('Não há leads no filtro atual para exportar.');
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const rows = filtered.map((lead) => ({
        'ID do lead': lead.id,
        Nome: lead.name || '',
        Telefone: lead.phone || '',
        CPF: leadCpf(lead),
        'Data de nascimento': formatBirthDate(birthDateValue(lead)),
        Cidade: leadCity(lead),
        Email: lead.email || '',
        Origem: lead.source || '',
        'Categoria de origem': sourceBucket(lead),
        Campanha: lead.campaign_name || '',
        Eventos: (lead._event_ids || [lead.event_id]).filter(Boolean).map((id: string) => eventMap.get(id)?.event_name).filter(Boolean).join(', '),
        Lojas: linkedStoreNames(lead).join(', '),
        Status: lead.status || '',
        Veículo: lead.vehicle_name || '',
        'Criado em': lead.created_at ? new Date(lead.created_at).toLocaleString('pt-BR') : ''
      }));
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Leads');
      worksheet.columns = Object.keys(rows[0]).map((header, index) => ({
        header,
        key: header,
        width: [38, 28, 18, 16, 18, 22, 30, 24, 20, 28, 26, 26, 20, 32, 20][index] || 20
      }));
      worksheet.addRows(rows);
      const output = await workbook.xlsx.writeBuffer();
      const blob = new Blob([new Uint8Array(output)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `base-leads-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(href);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível exportar o Excel.');
    } finally {
      setExporting(false);
    }
  }

  const primaryMetrics = [
    { label: 'Total', value: summary.total, active: status === 'all', onClick: () => setStatus('all') },
    { label: 'Novos', value: summary.novos, active: status === 'Novo lead', onClick: () => applyStatusMetric('Novo lead') },
    { label: 'Em atendimento', value: summary.atendimento, active: status === 'Em atendimento', onClick: () => applyStatusMetric('Em atendimento') },
    { label: 'Aprovados', value: summary.aprovados, active: status === 'Aprovado', onClick: () => applyStatusMetric('Aprovado') },
    { label: 'Vendas', value: summary.vendidos, active: status === 'Venda concluída', onClick: () => applyStatusMetric('Venda concluída') },
    { label: 'Perdidos', value: summary.perdidos, active: status === 'Perdido', onClick: () => applyStatusMetric('Perdido') }
  ];

  const sourceMetrics = [
    { label: 'Formulário', value: sourceSummary.formulario },
    { label: 'WhatsApp', value: sourceSummary.whatsapp },
    { label: 'Simulador', value: sourceSummary.simulador },
    { label: 'Portal', value: sourceSummary.portal },
    { label: 'Facebook', value: sourceSummary.facebook },
    { label: 'Instagram', value: sourceSummary.instagram },
    { label: 'Manual', value: sourceSummary.manual },
    { label: 'Leads com CPF', value: sourceSummary.cpf }
  ];

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Base" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header>
            <p className="premium-eyebrow">Central comercial</p>
            <h1 className="premium-title mt-2 text-4xl md:text-5xl">Base de Leads</h1>
            <p className="premium-muted mt-3 max-w-3xl text-sm">Todos os leads permanecem nesta base geral, com visão consolidada ou separada por evento, origem e loja.</p>
          </header>

          {message ? <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{loading ? <Loader2 size={16} className="animate-spin" /> : null}{message}</div> : null}

          <div className={`mt-4 rounded-2xl border px-4 py-3 ${historicalScope ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
            <div className="flex items-start gap-3"><CalendarRange className="mt-0.5 shrink-0" size={18} /><div><p className="text-[10px] font-black uppercase tracking-[0.16em]">Indicadores do escopo</p><strong className="mt-0.5 block text-sm">{scopeTitle}</strong>{selectedEvent ? <span className="text-[11px] font-bold opacity-70">{eventPeriod(selectedEvent)} · {[selectedEvent.city, selectedEvent.state].filter(Boolean).join(' / ')}</span> : null}</div></div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {primaryMetrics.map((item) => <MetricCard key={item.label} {...item} />)}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
            {sourceMetrics.map((item) => <SourceMetricCard key={item.label} label={item.label} value={item.value} onClick={() => item.label === 'Leads com CPF' ? setQuery('') : applySourceMetric(item.label)} />)}
          </div>

          <section className="premium-card mt-4 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-zinc-800"><Filter size={15} className="text-red-600" /> Filtros</div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-7">
              <label className="relative xl:col-span-2"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} /><input className="premium-input h-8 min-h-8 py-1 pl-8 text-[11px]" placeholder="Nome, telefone, CPF..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <div className="min-w-0 [&_select]:h-8 [&_select]:min-h-8 [&_select]:py-1 [&_select]:text-[11px]"><EventScopeSelect events={events} value={eventFilter} onChange={changeEventScope} allLabel="Todos os leads" /></div>
              <select className="premium-input h-8 min-h-8 py-1 text-[11px]" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos os status</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <select className="premium-input h-8 min-h-8 py-1 text-[11px]" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">Todas as origens</option>{sources.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <select className="premium-input h-8 min-h-8 py-1 text-[11px]" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}><option value="all">Todas as lojas</option>{assignedStores.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <input type="date" title="Data de nascimento" className="premium-input h-8 min-h-8 py-1 text-[11px]" value={birthDateFilter} onChange={(event) => setBirthDateFilter(event.target.value)} />
              <select className="premium-input h-8 min-h-8 py-1 text-[11px]" value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}><option value="all">Todas as cidades</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400">{filtered.length} lead(s) encontrados</p>
              <div className="flex items-center gap-2"><div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"><button type="button" onClick={() => setViewMode('cards')} className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[9px] font-black uppercase ${viewMode === 'cards' ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500'}`}><LayoutGrid size={12} /> Cards</button><button type="button" onClick={() => setViewMode('list')} className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[9px] font-black uppercase ${viewMode === 'list' ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500'}`}><List size={12} /> Listagem</button></div><MasterLeadImportModal onImported={loadLeads} /><button type="button" onClick={() => void exportExcel()} disabled={exporting || !filtered.length || loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[9px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"><FileSpreadsheet size={13} /> {exporting ? 'Exportando...' : 'Exportar Excel'}</button><MasterBulkLeadDistribution leads={filtered} stores={stores} onDistributed={loadLeads} /></div>
            </div>
          </section>

          {loading && !leads.length ? <section className="premium-card mt-4 flex min-h-64 items-center justify-center gap-2 text-sm font-bold text-zinc-500"><Loader2 size={20} className="animate-spin" /> Carregando leads da Base...</section> : viewMode === 'list' ? (
            <section className="premium-card mt-4 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-[1700px] w-full border-collapse text-left text-[11px]">
                  <thead className="bg-zinc-50 text-[9px] font-black uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-2.5">ID do lead</th><th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">Telefone</th><th className="px-3 py-2.5">CPF</th><th className="px-3 py-2.5">Nascimento</th><th className="px-3 py-2.5">Cidade</th><th className="px-3 py-2.5">Origem</th><th className="px-3 py-2.5">Campanha</th><th className="px-3 py-2.5">Veículo</th><th className="px-3 py-2.5">Lojas vinculadas</th><th className="px-3 py-2.5">Status do lead</th><th className="px-3 py-2.5">Adicionar em loja</th></tr></thead>
                  <tbody>{filtered.map((lead) => {
                    const editable = [
                      ['name', lead.name || '-'], ['phone', lead.phone || '-'], ['cpf', formatCpf(leadCpf(lead))], ['birth_date', formatBirthDate(birthDateValue(lead))], ['city', leadCity(lead) || '-'], ['source', lead.source || '-'], ['campaign_name', lead.campaign_name || '-'], ['vehicle_name', lead.vehicle_name || '-']
                    ] as [EditableField, string][];
                    return <tr key={lead.id} className="border-t border-zinc-100 bg-white hover:bg-zinc-50/60"><td className="max-w-[210px] break-all px-3 py-2.5 font-mono text-[9px] text-zinc-500">{lead.id}</td>{editable.map(([field, value]) => <td key={field} className="px-3 py-2.5"><EditableCell lead={lead} field={field} value={value} rawValue={field === 'birth_date' ? birthDateValue(lead) : field === 'city' ? leadCity(lead) : field === 'cpf' ? leadCpf(lead) : String(lead[field] || '')} editingCell={editingCell} editValue={editValue} busy={busyLeadId === lead.id} onStart={(raw) => { setEditingCell(`${lead.id}:${field}`); setEditValue(raw); }} onChange={setEditValue} onSave={() => void updateEditableField(lead, field, editValue)} onCancel={() => setEditingCell('')} /></td>)}<td className="px-3 py-2.5"><StoreBadges names={linkedStoreNames(lead)} /></td><td className="px-3 py-2.5"><select className="h-8 min-w-[150px] rounded-lg border border-zinc-200 bg-white px-2 text-[10px] font-bold" value={lead.status || ''} disabled={busyLeadId === lead.id} onChange={(event) => void updateLeadStatus(lead, event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></td><td className="px-3 py-2.5 text-[10px] font-bold text-zinc-500">Use o botão Distribuir para adicionar outra loja.</td></tr>;
                  })}</tbody>
                </table>
              </div>
              {!filtered.length && !message ? <div className="p-8 text-center text-sm font-bold text-zinc-500">Nenhum lead encontrado neste escopo.</div> : null}
            </section>
          ) : (
            <section className="mt-4 space-y-3">{filtered.map((lead) => {
              const storeNames = linkedStoreNames(lead);
              const leadEventNames = (lead._event_ids || [lead.event_id]).filter(Boolean).map((id: string) => eventMap.get(id)?.event_name).filter(Boolean);
              return <div key={lead.id} className="premium-card overflow-hidden p-4"><div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-black text-zinc-950">{lead.name}</h2><span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-600">{lead.status}</span><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-bold text-zinc-500">{lead.source}</span><StoreBadges names={storeNames} /></div><div className="mt-3 grid gap-2 text-xs text-zinc-600 md:grid-cols-3"><ContactItem icon={<Phone size={14} />} value={lead.phone || '-'} /><ContactItem icon={<Mail size={14} />} value={lead.email || '-'} /><ContactItem icon={<UserCheck size={14} />} value={`CPF: ${formatCpf(leadCpf(lead))}`} /><ContactItem icon={<Car size={14} />} value={lead.vehicle_name || '-'} /><ContactItem icon={<Building2 size={14} />} value={storeNames.length ? `${storeNames.length} loja(s) vinculada(s)` : 'Não enviado'} /><ContactItem icon={<MapPin size={14} />} value={leadCity(lead) || 'Cidade não informada'} /></div><div className="mt-3 grid gap-2 md:grid-cols-3"><Info label="ID canônico na Base" value={lead.id} /><Info label="Eventos" value={leadEventNames.join(', ') || 'Sem evento'} /><Info label="Nascimento" value={formatBirthDate(birthDateValue(lead))} /></div></div><div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3"><label className="text-[10px] font-black uppercase text-zinc-400">Status do lead na Base</label><select className="premium-input mt-1 h-9 min-h-9 bg-white text-xs" value={lead.status} onChange={(event) => void updateLeadStatus(lead, event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select><div className="mt-3"><p className="text-[10px] font-black uppercase text-zinc-400">Presente nas lojas</p><div className="mt-2"><StoreBadges names={storeNames} emptyLabel="Ainda não distribuído" /></div></div><p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-blue-800">Cada loja mantém atendimento, responsável e histórico independentes.</p></div></div></div>;
            })}</section>
          )}
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`group flex min-h-[90px] items-center justify-between rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${active ? 'border-red-200 ring-1 ring-red-100' : 'border-zinc-200'}`}><div><p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{label}</p><strong className="mt-1 block text-3xl font-black leading-none text-zinc-950">{value}</strong></div><ChevronRight size={16} className={active ? 'text-red-600' : 'text-zinc-300 group-hover:text-red-500'} /></button>;
}

function SourceMetricCard({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group flex min-h-[70px] items-center justify-between rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"><div><p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">{label}</p><strong className="mt-0.5 block text-xl font-black text-zinc-900">{value}</strong></div><ChevronRight size={14} className="text-zinc-300 group-hover:text-red-500" /></button>;
}

function EditableCell({ lead, field, value, rawValue, editingCell, editValue, busy, onStart, onChange, onSave, onCancel }: { lead: any; field: EditableField; value: string; rawValue: string; editingCell: string; editValue: string; busy: boolean; onStart: (raw: string) => void; onChange: (value: string) => void; onSave: () => void; onCancel: () => void }) {
  const active = editingCell === `${lead.id}:${field}`;
  if (active) return <div className="flex min-w-[130px] items-center gap-1"><input type={field === 'birth_date' ? 'date' : 'text'} autoFocus className="h-8 min-w-0 flex-1 rounded-lg border border-red-200 bg-white px-2 text-[10px] outline-none ring-2 ring-red-50" value={editValue} disabled={busy} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSave(); if (event.key === 'Escape') onCancel(); }} onBlur={onSave} /></div>;
  return <button type="button" disabled={busy} onClick={() => onStart(rawValue)} className="group inline-flex max-w-[180px] items-center gap-1.5 text-left font-bold text-zinc-600 hover:text-red-600"><span className="break-words">{value || '-'}</span><Pencil size={11} className="shrink-0 text-zinc-300 opacity-0 transition group-hover:opacity-100" /></button>;
}

function ContactItem({ icon, value }: { icon: React.ReactNode; value: string }) {
  return <span className="flex min-w-0 items-start gap-2 rounded-xl bg-zinc-50 p-2.5 font-bold"><span className="mt-0.5 shrink-0 text-zinc-400">{icon}</span><span className="min-w-0 break-words">{value}</span></span>;
}

function StoreBadges({ names, emptyLabel = 'Sem loja' }: { names: string[]; emptyLabel?: string }) {
  if (!names.length) return <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-bold text-zinc-500">{emptyLabel}</span>;
  return <span className="flex flex-wrap gap-1.5">{names.map((name) => <span key={name} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">{name}</span>)}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-zinc-100 bg-zinc-50 p-2.5"><p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">{label}</p><strong className="mt-1 block break-words text-xs text-zinc-800">{value}</strong></div>;
}
