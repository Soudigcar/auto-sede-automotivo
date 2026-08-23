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
  Mail,
  MapPin,
  Pencil,
  Phone,
  Search,
  Trash2,
  UserCheck
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { MasterLeadImportModal } from '@/components/MasterLeadImportModal';
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
  const [participations, setParticipations] = useState<any[]>([]);
  const [eventFilter, setEventFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [birthDateFilter, setBirthDateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [message, setMessage] = useState('Carregando base...');
  const [busyLeadId, setBusyLeadId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [editingCell, setEditingCell] = useState('');
  const [editValue, setEditValue] = useState('');

  async function loadLeads() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token || '';

    const [leadResult, commercialResult, directStoreResult, eventResult, participationResult] = await Promise.all([
      supabase.from('leads_base').select('*').order('created_at', { ascending: false }),
      supabase.from('lead_commercial_details').select('lead_id,birth_date,cpf'),
      supabase.from('stores').select('id,store_name,status,portal_enabled,slug').order('store_name', { ascending: true }),
      supabase.from('events').select('id,event_name,status,start_date,end_date,state,city,location,created_at').neq('status', 'deleted').order('start_date', { ascending: false, nullsFirst: false }),
      supabase.from('store_event_participations').select('event_id,store_id,status')
    ]);

    const { data: leadRows, error: leadError } = leadResult;
    if (leadError || eventResult.error || participationResult.error) {
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

    setLeads(enrichedLeads);
    setStores(storeRows || []);
    setEvents(eventResult.data || []);
    setParticipations(participationResult.data || []);
    setMessage('');
  }

  useEffect(() => {
    loadLeads().catch(() => setMessage('Erro ao carregar a Base.'));
  }, []);

  const eventMap = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const activeEventIds = useMemo(() => new Set(events.filter((event) => event.status === 'active').map((event) => event.id)), [events]);

  const eventScopedLeads = useMemo(() => leads.filter((lead) => {
    if (eventFilter === 'all') return true;
    if (eventFilter === 'active') return Boolean(lead.event_id && activeEventIds.has(lead.event_id));
    if (eventFilter === 'unassigned') return !lead.event_id;
    return lead.event_id === eventFilter;
  }), [activeEventIds, eventFilter, leads]);

  const sources = useMemo(() => Array.from(new Set(eventScopedLeads.map((lead) => lead.source).filter(Boolean))).sort(), [eventScopedLeads]);
  const assignedStores = useMemo(() => Array.from(new Set(eventScopedLeads.map((lead) => assignedStoreName(lead)).filter(Boolean))).sort(), [eventScopedLeads]);
  const cities = useMemo(() => Array.from(new Set(eventScopedLeads.map((lead) => leadCity(lead)).filter(Boolean))).sort(), [eventScopedLeads]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    return eventScopedLeads.filter((lead) => {
      if (status !== 'all' && lead.status !== status) return false;
      if (source !== 'all' && lead.source !== source) return false;
      if (storeFilter !== 'all' && assignedStoreName(lead) !== storeFilter) return false;
      if (cityFilter !== 'all' && leadCity(lead) !== cityFilter) return false;
      if (birthDateFilter && birthDateValue(lead) !== birthDateFilter) return false;
      if (!term) return true;

      const eventName = lead.event_id ? eventMap.get(lead.event_id)?.event_name : 'Sem evento';
      return [lead.id, lead.name, lead.phone, leadCpf(lead), lead.email, lead.campaign_name, lead.vehicle_name, lead.source, assignedStoreName(lead), eventName, leadCity(lead), birthDateValue(lead)]
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

  function storesForLead(lead: any) {
    if (!lead.event_id) return stores;
    const allowedIds = new Set(participations.filter((item) => item.event_id === lead.event_id && ['active', 'inactive'].includes(item.status)).map((item) => item.store_id));
    if (lead.assigned_store_id) allowedIds.add(lead.assigned_store_id);
    return stores.filter((store) => allowedIds.has(store.id));
  }

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function updateLeadStatus(id: string, nextStatus: string) {
    setBusyLeadId(id);
    const { error } = await supabase.from('leads_base').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) setMessage('Erro ao atualizar status.');
    else await loadLeads();
    setBusyLeadId('');
  }

  async function updateEditableField(lead: any, field: EditableField, value: string) {
    setBusyLeadId(lead.id);
    setMessage('Salvando alteração...');
    try {
      if (field === 'birth_date') {
        if (lead.routed_lead_id) {
          const { error } = await supabase.from('lead_commercial_details').upsert({ lead_id: lead.routed_lead_id, birth_date: value || null }, { onConflict: 'lead_id' });
          if (error) throw error;
        } else {
          const metadata = { ...(lead.metadata || {}), birth_date: value || null };
          const { error } = await supabase.from('leads_base').update({ metadata, updated_at: new Date().toISOString() }).eq('id', lead.id);
          if (error) throw error;
        }
      } else if (field === 'city') {
        const metadata = { ...(lead.metadata || {}), city: value };
        const { error } = await supabase.from('leads_base').update({ metadata, updated_at: new Date().toISOString() }).eq('id', lead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('leads_base').update({ [field]: value || null, updated_at: new Date().toISOString() }).eq('id', lead.id);
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

  async function reassignLeadToStore(lead: any, storeId: string) {
    if (!storeId || storeId === lead.assigned_store_id) return;
    const selectedStore = stores.find((store) => store.id === storeId);
    if (!window.confirm(`Redirecionar este lead para ${selectedStore?.store_name || 'a loja selecionada'}?`)) return;

    const token = await getAuthToken();
    if (!token) return setMessage('Sessão expirada. Faça login novamente.');
    setBusyLeadId(lead.id);
    setMessage('Redirecionando lead para outra loja...');
    try {
      const response = await fetch('/api/base-lead-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lead_id: lead.id, store_id: storeId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível redirecionar o lead.');
      setMessage(`Lead redirecionado para ${result.assigned_store_name}.`);
      await loadLeads();
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao redirecionar lead.');
    } finally {
      setBusyLeadId('');
    }
  }

  async function deleteLead(lead: any) {
    if (window.prompt(`Excluir o lead de ${lead.name}? Digite EXCLUIR para confirmar.`) !== 'EXCLUIR') return;
    const token = await getAuthToken();
    if (!token) return setMessage('Sessão expirada. Faça login novamente.');
    setBusyLeadId(lead.id);
    try {
      const response = await fetch('/api/base-lead-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lead_id: lead.id })
      });
      if (!response.ok) throw new Error('Não foi possível excluir o lead.');
      await loadLeads();
    } catch {
      setMessage('Erro ao excluir lead.');
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
        Evento: lead.event_id ? eventMap.get(lead.event_id)?.event_name || '' : '',
        Loja: assignedStoreName(lead),
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

          {message ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{message}</div> : null}

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
              <div className="flex items-center gap-2"><div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"><button type="button" onClick={() => setViewMode('cards')} className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[9px] font-black uppercase ${viewMode === 'cards' ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500'}`}><LayoutGrid size={12} /> Cards</button><button type="button" onClick={() => setViewMode('list')} className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[9px] font-black uppercase ${viewMode === 'list' ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500'}`}><List size={12} /> Listagem</button></div><MasterLeadImportModal onImported={loadLeads} /><button type="button" onClick={() => void exportExcel()} disabled={exporting || !filtered.length} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[9px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"><FileSpreadsheet size={13} /> {exporting ? 'Exportando...' : 'Exportar Excel'}</button></div>
            </div>
          </section>

          {viewMode === 'list' ? (
            <section className="premium-card mt-4 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-[1700px] w-full border-collapse text-left text-[11px]">
                  <thead className="bg-zinc-50 text-[9px] font-black uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-2.5">ID do lead</th><th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">Telefone</th><th className="px-3 py-2.5">CPF</th><th className="px-3 py-2.5">Nascimento</th><th className="px-3 py-2.5">Cidade</th><th className="px-3 py-2.5">Origem</th><th className="px-3 py-2.5">Campanha</th><th className="px-3 py-2.5">Veículo</th><th className="px-3 py-2.5">Status do lead</th><th className="px-3 py-2.5">Redirecionar para loja</th></tr></thead>
                  <tbody>{filtered.map((lead) => {
                    const editable = [
                      ['name', lead.name || '-'], ['phone', lead.phone || '-'], ['cpf', formatCpf(leadCpf(lead))], ['birth_date', formatBirthDate(birthDateValue(lead))], ['city', leadCity(lead) || '-'], ['source', lead.source || '-'], ['campaign_name', lead.campaign_name || '-'], ['vehicle_name', lead.vehicle_name || '-']
                    ] as [EditableField, string][];
                    return <tr key={lead.id} className="border-t border-zinc-100 bg-white hover:bg-zinc-50/60"><td className="max-w-[210px] break-all px-3 py-2.5 font-mono text-[9px] text-zinc-500">{lead.id}</td>{editable.map(([field, value]) => <td key={field} className="px-3 py-2.5"><EditableCell lead={lead} field={field} value={value} rawValue={field === 'birth_date' ? birthDateValue(lead) : field === 'city' ? leadCity(lead) : field === 'cpf' ? leadCpf(lead) : String(lead[field] || '')} editingCell={editingCell} editValue={editValue} busy={busyLeadId === lead.id} onStart={(raw) => { setEditingCell(`${lead.id}:${field}`); setEditValue(raw); }} onChange={setEditValue} onSave={() => void updateEditableField(lead, field, editValue)} onCancel={() => setEditingCell('')} /></td>)}<td className="px-3 py-2.5"><select className="h-8 min-w-[150px] rounded-lg border border-zinc-200 bg-white px-2 text-[10px] font-bold" value={lead.status || ''} disabled={busyLeadId === lead.id} onChange={(event) => void updateLeadStatus(lead.id, event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></td><td className="px-3 py-2.5"><select className="h-8 min-w-[170px] rounded-lg border border-zinc-200 bg-white px-2 text-[10px] font-bold" value={lead.assigned_store_id || ''} disabled={busyLeadId === lead.id} onChange={(event) => void reassignLeadToStore(lead, event.target.value)}><option value="">Selecionar loja</option>{storesForLead(lead).map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select></td></tr>;
                  })}</tbody>
                </table>
              </div>
              {!filtered.length && !message ? <div className="p-8 text-center text-sm font-bold text-zinc-500">Nenhum lead encontrado neste escopo.</div> : null}
            </section>
          ) : (
            <section className="mt-4 space-y-3">{filtered.map((lead) => {
              const storeName = assignedStoreName(lead);
              const leadEvent = lead.event_id ? eventMap.get(lead.event_id) : null;
              return <div key={lead.id} className="premium-card overflow-hidden p-4"><div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-black text-zinc-950">{lead.name}</h2><span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-600">{lead.status}</span><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-bold text-zinc-500">{lead.source}</span>{storeName ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">{storeName}</span> : null}</div><div className="mt-3 grid gap-2 text-xs text-zinc-600 md:grid-cols-3"><ContactItem icon={<Phone size={14} />} value={lead.phone || '-'} /><ContactItem icon={<Mail size={14} />} value={lead.email || '-'} /><ContactItem icon={<UserCheck size={14} />} value={`CPF: ${formatCpf(leadCpf(lead))}`} /><ContactItem icon={<Car size={14} />} value={lead.vehicle_name || '-'} /><ContactItem icon={<Building2 size={14} />} value={storeName || 'Não enviado'} /><ContactItem icon={<MapPin size={14} />} value={leadCity(lead) || 'Cidade não informada'} /></div><div className="mt-3 grid gap-2 md:grid-cols-3"><Info label="ID do lead" value={lead.id} /><Info label="Evento" value={leadEvent?.event_name || 'Sem evento'} /><Info label="Nascimento" value={formatBirthDate(birthDateValue(lead))} /></div></div><div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3"><label className="text-[10px] font-black uppercase text-zinc-400">Status do lead</label><select className="premium-input mt-1 h-9 min-h-9 bg-white text-xs" value={lead.status} onChange={(event) => void updateLeadStatus(lead.id, event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select><label className="mt-3 block text-[10px] font-black uppercase text-zinc-400">Redirecionar para loja</label><select className="premium-input mt-1 h-9 min-h-9 bg-white text-xs" value={lead.assigned_store_id || ''} onChange={(event) => void reassignLeadToStore(lead, event.target.value)}><option value="">Selecionar loja</option>{storesForLead(lead).map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select><button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50" type="button" onClick={() => void deleteLead(lead)}><Trash2 size={14} /> Excluir lead</button></div></div></div>;
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

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-zinc-100 bg-zinc-50 p-2.5"><p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">{label}</p><strong className="mt-1 block break-words text-xs text-zinc-800">{value}</strong></div>;
}
