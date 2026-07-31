'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarRange, Car, Mail, Phone, Search, Trash2, UserCheck } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
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

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

function formatCpf(value?: string) {
  if (!value) return '-';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  return value;
}

function assignedStoreName(lead: any) {
  return lead.assigned_store_name || lead.metadata?.routing?.assigned_store_name || '';
}

function eventPeriod(event: any) {
  const date = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '';
  return [date(event?.start_date), date(event?.end_date)].filter(Boolean).join(' a ');
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
  const [message, setMessage] = useState('Carregando base...');
  const [busyLeadId, setBusyLeadId] = useState('');

  async function loadLeads() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token || '';

    const [leadResult, directStoreResult, eventResult, participationResult] = await Promise.all([
      supabase.from('leads_base').select('*').order('created_at', { ascending: false }),
      supabase.from('stores').select('id,store_name,status,portal_enabled,slug').order('store_name', { ascending: true }),
      supabase.from('events').select('id,event_name,status,start_date,end_date,state,city,location,created_at').neq('status', 'deleted').order('start_date', { ascending: false, nullsFirst: false }),
      supabase.from('store_event_participations').select('event_id,store_id,status')
    ]);

    const { data: leadRows, error: leadError } = leadResult;

    if (leadError || eventResult.error || participationResult.error) {
      setMessage('Não foi possível carregar a Base por evento. Atualize a página e tente novamente.');
      return;
    }

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

    setLeads(leadRows || []);
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

  const eventScopedLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (eventFilter === 'all') return true;
      if (eventFilter === 'active') return Boolean(lead.event_id && activeEventIds.has(lead.event_id));
      if (eventFilter === 'unassigned') return !lead.event_id;
      return lead.event_id === eventFilter;
    });
  }, [activeEventIds, eventFilter, leads]);

  const sources = useMemo(() => {
    return Array.from(new Set(eventScopedLeads.map((lead) => lead.source).filter(Boolean))).sort();
  }, [eventScopedLeads]);

  const assignedStores = useMemo(() => {
    return Array.from(new Set(eventScopedLeads.map((lead) => assignedStoreName(lead)).filter(Boolean))).sort();
  }, [eventScopedLeads]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();

    return eventScopedLeads.filter((lead) => {
      if (status !== 'all' && lead.status !== status) return false;
      if (source !== 'all' && lead.source !== source) return false;
      if (storeFilter !== 'all' && assignedStoreName(lead) !== storeFilter) return false;
      if (!term) return true;

      const eventName = lead.event_id ? eventMap.get(lead.event_id)?.event_name : 'Sem evento';
      return [
        lead.name, lead.phone, lead.cpf, lead.email, lead.campaign_name,
        lead.vehicle_name, lead.source, assignedStoreName(lead), eventName
      ].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [eventMap, eventScopedLeads, query, source, status, storeFilter]);

  const summary = useMemo(() => ({
    total: eventScopedLeads.length,
    novos: eventScopedLeads.filter((lead) => lead.status === 'Novo lead').length,
    atendimento: eventScopedLeads.filter((lead) => lead.status === 'Em atendimento').length,
    aprovados: eventScopedLeads.filter((lead) => lead.status === 'Aprovado').length,
    vendidos: eventScopedLeads.filter((lead) => lead.status === 'Venda concluída').length,
    perdidos: eventScopedLeads.filter((lead) => lead.status === 'Perdido').length
  }), [eventScopedLeads]);

  const selectedEvent = events.find((event) => event.id === eventFilter) || null;
  const historicalScope = Boolean(selectedEvent && selectedEvent.status !== 'active');
  const scopeTitle = eventScopeLabel(events, eventFilter);

  function storesForLead(lead: any) {
    if (!lead.event_id) return stores;

    const allowedIds = new Set(
      participations
        .filter((item) => item.event_id === lead.event_id && ['active', 'inactive'].includes(item.status))
        .map((item) => item.store_id)
    );

    if (lead.assigned_store_id) allowedIds.add(lead.assigned_store_id);
    return stores.filter((store) => allowedIds.has(store.id));
  }

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function updateLeadStatus(id: string, nextStatus: string) {
    const { error } = await supabase
      .from('leads_base')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      setMessage('Erro ao atualizar status.');
      return;
    }

    await loadLeads();
  }

  async function reassignLeadToStore(lead: any, storeId: string) {
    if (!storeId || storeId === lead.assigned_store_id) return;

    const selectedStore = stores.find((store) => store.id === storeId);
    const confirmation = window.confirm(`Redirecionar este lead para ${selectedStore?.store_name || 'a loja selecionada'}?`);
    if (!confirmation) return;

    const token = await getAuthToken();
    if (!token) {
      setMessage('Sessão expirada. Faça login novamente.');
      return;
    }

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
    }

    setBusyLeadId('');
  }

  async function deleteLead(lead: any) {
    const confirmation = window.prompt(`Excluir o lead de ${lead.name}? Digite EXCLUIR para confirmar.`);
    if (confirmation !== 'EXCLUIR') return;

    const token = await getAuthToken();
    if (!token) {
      setMessage('Sessão expirada. Faça login novamente.');
      return;
    }

    setBusyLeadId(lead.id);
    setMessage('Excluindo lead...');

    try {
      const response = await fetch('/api/base-lead-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lead_id: lead.id })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o lead.');

      setMessage('Lead excluído com sucesso.');
      await loadLeads();
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao excluir lead.');
    }

    setBusyLeadId('');
  }

  function changeEventScope(value: string) {
    setEventFilter(value);
    setStoreFilter('all');
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Base" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header>
            <p className="premium-eyebrow">Central comercial</p>
            <h1 className="premium-title mt-2 text-4xl md:text-5xl">Base de Leads</h1>
            <p className="premium-muted mt-3 max-w-3xl text-sm">
              Todos os leads permanecem nesta base geral, com visão consolidada ou separada por evento, origem e loja.
            </p>
          </header>

          {message ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">{message}</div>
          ) : null}

          <div className={`mt-5 rounded-3xl border p-4 ${historicalScope ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
            <div className="flex items-start gap-3">
              <CalendarRange className="mt-0.5 shrink-0" size={20} />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em]">Indicadores do escopo</p>
                <strong className="mt-1 block text-base">{scopeTitle}</strong>
                {selectedEvent ? <span className="text-xs font-bold opacity-70">{eventPeriod(selectedEvent)} · {[selectedEvent.city, selectedEvent.state].filter(Boolean).join(' / ')} · {historicalScope ? 'Evento encerrado' : 'Evento ativo'}</span> : null}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Mini label="Total" value={summary.total} />
            <Mini label="Novos" value={summary.novos} />
            <Mini label="Em atendimento" value={summary.atendimento} />
            <Mini label="Aprovados" value={summary.aprovados} />
            <Mini label="Vendas" value={summary.vendidos} />
            <Mini label="Perdidos" value={summary.perdidos} />
          </div>

          <section className="premium-card mt-6 p-5">
            <div className="grid gap-3 2xl:grid-cols-[1.25fr_1fr_0.75fr_0.75fr_0.75fr]">
              <label className="relative min-w-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input className="premium-input pl-11" placeholder="Buscar nome, telefone, CPF, evento, campanha, veículo ou loja" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>

              <EventScopeSelect events={events} value={eventFilter} onChange={changeEventScope} allLabel="Todos os leads" />

              <select className="premium-input" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">Todos os status</option>
                {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>

              <select className="premium-input" value={source} onChange={(event) => setSource(event.target.value)}>
                <option value="all">Todas as origens</option>
                {sources.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>

              <select className="premium-input" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
                <option value="all">Todas as lojas do escopo</option>
                {assignedStores.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </section>

          <section className="mt-5 space-y-4">
            {filtered.map((lead) => {
              const storeName = assignedStoreName(lead);
              const leadEvent = lead.event_id ? eventMap.get(lead.event_id) : null;
              const eligibleStores = storesForLead(lead);

              return (
                <div key={lead.id} className="premium-card overflow-hidden p-5">
                  <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="max-w-full break-words text-lg font-black text-zinc-950">{lead.name}</h2>
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">{lead.status}</span>
                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-500">{lead.source}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${leadEvent ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>
                          Evento: {leadEvent?.event_name || 'Sem evento / campanha geral'}
                        </span>
                        {storeName ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Enviado para: {storeName}</span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">Sem loja atribuída</span>
                        )}
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-zinc-600 md:grid-cols-2 xl:grid-cols-3">
                        <ContactItem icon={<Phone size={15} />} value={lead.phone || '-'} />
                        <ContactItem icon={<Mail size={15} />} value={lead.email || '-'} />
                        <ContactItem icon={<UserCheck size={15} />} value={`CPF: ${formatCpf(lead.cpf)}`} />
                        <ContactItem icon={<Car size={15} />} value={lead.vehicle_name || '-'} />
                        <ContactItem icon={<Building2 size={15} />} value={storeName || 'Não enviado'} />
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <Info label="Evento" value={leadEvent?.event_name || 'Sem evento / campanha geral'} />
                        <Info label="Campanha" value={lead.campaign_name || '-'} />
                        <Info label="CPF completo" value={formatCpf(lead.cpf)} />
                        <Info label="Loja enviada" value={storeName || 'Não enviado'} />
                        <Info label="Valor veículo" value={money(lead.vehicle_price)} />
                        <Info label="Entrada" value={money(lead.down_payment)} />
                        <Info label="Parcela estimada" value={`${lead.installments || '-'}x de ${money(lead.estimated_installment)}`} />
                      </div>

                      {lead.assigned_at ? (
                        <p className="mt-4 text-xs font-bold text-zinc-400">
                          Distribuído automaticamente em {new Date(lead.assigned_at).toLocaleString('pt-BR')} via {lead.routing_strategy || 'round_robin'}.
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-3xl border border-zinc-100 bg-zinc-50 p-4">
                      <label className="text-xs font-black uppercase tracking-wide text-zinc-400">Status do lead</label>
                      <select className="premium-input mt-1 bg-white" value={lead.status} disabled={busyLeadId === lead.id} onChange={(event) => updateLeadStatus(lead.id, event.target.value)}>
                        {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>

                      <label className="mt-4 block text-xs font-black uppercase tracking-wide text-zinc-400">Redirecionar para loja</label>
                      <select className="premium-input mt-1 bg-white" value={lead.assigned_store_id || ''} disabled={busyLeadId === lead.id} onChange={(event) => reassignLeadToStore(lead, event.target.value)}>
                        <option value="">Selecionar loja</option>
                        {eligibleStores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
                      </select>
                      {lead.event_id ? <p className="mt-2 text-xs font-bold text-zinc-400">Somente lojas participantes deste evento podem receber o lead.</p> : null}

                      <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-black text-red-600 transition hover:bg-red-50" type="button" disabled={busyLeadId === lead.id} onClick={() => deleteLead(lead)}>
                        <Trash2 size={16} /> Excluir lead
                      </button>

                      <p className="mt-3 text-xs font-bold text-zinc-400">Criado em {new Date(lead.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            {!filtered.length && !message ? (
              <div className="premium-card p-8 text-center text-sm font-bold text-zinc-500">Nenhum lead encontrado neste escopo.</div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="premium-card p-4">
      <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <strong className="mt-1 block text-2xl font-black text-zinc-950">{value}</strong>
    </div>
  );
}

function ContactItem({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="flex min-w-0 items-start gap-2 rounded-2xl bg-zinc-50 p-3 font-bold">
      <span className="mt-0.5 shrink-0 text-zinc-400">{icon}</span>
      <span className="min-w-0 break-words">{value}</span>
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <strong className="mt-1 block break-words text-sm text-zinc-800">{value}</strong>
    </div>
  );
}
