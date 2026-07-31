'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarCheck2,
  CalendarX2,
  Copy,
  ExternalLink,
  KeyRound,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { EventSelectField } from '@/components/EventSelectField';
import { StoreParticipationHistory } from '@/components/StoreParticipationHistory';

function dateText(value?: string) {
  return value ? value.split('-').reverse().join('/') : '-';
}

function eventLabel(store: any, eventNameById: Record<string, string>) {
  return eventNameById[store.event_id] || store.event_name_snapshot || 'Evento removido';
}

function portalLink(slug?: string) {
  if (!slug) return '';
  if (typeof window === 'undefined') return `/loja/${slug}`;
  return `${window.location.origin}/loja/${slug}`;
}

function storeIdentity(store: any) {
  const eventId = String(store.event_id || 'sem-evento').trim().toLowerCase();
  const email = String(store.responsible_email || '').trim().toLowerCase();
  const name = String(store.store_name || '').trim().toLowerCase();

  return `${eventId}|${email || name || store.id}`;
}

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeEventKey(value: any) {
  return normalizeText(value);
}

function normalizeStoreName(value: any) {
  return normalizeText(value);
}

function isValidStore(store: any) {
  const status = String(store.status || '').toLowerCase();
  return status !== 'deleted' && status !== 'excluido';
}

function isStoreActive(store: any) {
  const status = normalizeText(store?.status);
  return !['inactive', 'inativo', 'disabled', 'desativado'].includes(status);
}

function isEventActive(event: any) {
  const status = normalizeText(event?.status);

  if (['inactive', 'inativo', 'closed', 'encerrado', 'finished', 'finalizado'].includes(status)) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (event?.end_date && String(event.end_date) < today) return false;

  return true;
}

function eventMatchesPeriod(event: any, startDate: string, endDate: string) {
  const eventStart = String(event?.start_date || event?.end_date || '');
  const eventEnd = String(event?.end_date || event?.start_date || '');

  if (startDate && eventEnd && eventEnd < startDate) return false;
  if (endDate && eventStart && eventStart > endDate) return false;

  return true;
}

function isValidPublishedLink(item: any) {
  const status = String(item?.status || '').toLowerCase();
  const metadata = item?.metadata || {};

  if (metadata.store_removed === true) return false;
  if (['rejected', 'duplicate', 'deleted', 'excluido'].includes(status)) return false;

  return status === 'published' || Boolean(item?.imported_vehicle_id);
}

function isValidPublishedVehicle(item: any) {
  const status = String(item?.status || '').toLowerCase();

  if (item?.show_on_landing === false) return false;
  if (['oculto', 'deleted', 'excluido', 'rejected', 'duplicate'].includes(status)) return false;

  return true;
}

type StoresByEventListProps = {
  refreshKey?: number;
  eventId?: string;
  onEventChange?: (eventId: string) => void;
};

export function StoresByEventList({
  refreshKey = 0,
  eventId: controlledEventId = '',
  onEventChange
}: StoresByEventListProps) {
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [siteVehicles, setSiteVehicles] = useState<any[]>([]);
  const [vehicleSubmissions, setVehicleSubmissions] = useState<any[]>([]);
  const [internalEventId, setInternalEventId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [eventStatusFilter, setEventStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [storeStatusFilter, setStoreStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [message, setMessage] = useState('');
  const [passwordLoadingId, setPasswordLoadingId] = useState('');
  const [passwordResult, setPasswordResult] = useState<any>(null);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState({
    storeName: '',
    responsibleName: '',
    phone: '',
    email: '',
    eventId: ''
  });

  const eventId = controlledEventId || internalEventId;

  function selectEvent(nextEventId: string) {
    setInternalEventId(nextEventId);
    onEventChange?.(nextEventId);
  }

  async function loadData() {
    const [
      { data: eventRows },
      { data: storeRows },
      { data: saleRows },
      { data: siteVehicleRows },
      { data: vehicleSubmissionRows }
    ] = await Promise.all([
      supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false }),
      supabase.from('stores').select('*').order('store_name'),
      supabase.from('sales').select('*'),
      supabase.from('site_vehicles').select('*'),
      supabase.from('store_vehicle_link_submissions').select('*')
    ]);

    const eventList = eventRows || [];
    const storeList = (storeRows || []).filter(isValidStore);

    setEvents(eventList);
    setStores(storeList);
    setSales(saleRows || []);
    setSiteVehicles(siteVehicleRows || []);
    setVehicleSubmissions(vehicleSubmissionRows || []);

    const currentEventExists = eventList.some((item) => item.id === eventId);
    if ((!eventId || !currentEventExists) && eventList[0]?.id) selectEvent(eventList[0].id);
  }

  useEffect(() => {
    loadData().catch(() => setMessage('Não foi possível carregar os eventos e lojas.'));
  }, [refreshKey]);

  useEffect(() => {
    if (controlledEventId) setInternalEventId(controlledEventId);
  }, [controlledEventId]);

  const eventNameById = useMemo(
    () => Object.fromEntries(events.map((item) => [item.id, item.event_name])),
    [events]
  );

  const eventById = useMemo(
    () => new Map(events.map((item) => [item.id, item])),
    [events]
  );

  const dedupedStores = useMemo(() => {
    const map = new Map<string, any>();

    stores.filter(isValidStore).forEach((store) => {
      const key = storeIdentity(store);
      if (!map.has(key)) map.set(key, store);
    });

    return Array.from(map.values());
  }, [stores]);

  const activeEventCount = useMemo(
    () => events.filter(isEventActive).length,
    [events]
  );

  const inactiveEventCount = events.length - activeEventCount;
  const normalizedSearch = normalizeText(searchTerm);

  function eventMatchesStatus(event: any) {
    if (eventStatusFilter === 'all') return true;
    return eventStatusFilter === 'active' ? isEventActive(event) : !isEventActive(event);
  }

  function storeMatchesStatus(store: any) {
    if (storeStatusFilter === 'all') return true;
    return storeStatusFilter === 'active' ? isStoreActive(store) : !isStoreActive(store);
  }

  function storeSearchText(store: any) {
    return normalizeText([
      store.store_name,
      store.responsible_name,
      store.responsible_phone,
      store.responsible_email,
      eventLabel(store, eventNameById),
      store.event_state_snapshot,
      store.event_city_snapshot
    ].join(' '));
  }

  function eventSearchText(event: any) {
    return normalizeText([
      event.event_name,
      event.state,
      event.city,
      event.location,
      event.sponsor_bank
    ].join(' '));
  }

  function storeBelongsToEvent(store: any, event: any) {
    if (!event) return false;
    if (store.event_id === event.id) return true;

    const storeEventKey = normalizeEventKey(store.event_name_snapshot);
    const eventKey = normalizeEventKey(event.event_name);
    return Boolean(storeEventKey && eventKey && storeEventKey === eventKey);
  }

  function eventHasSearchMatch(event: any) {
    if (!normalizedSearch) return true;
    if (eventSearchText(event).includes(normalizedSearch)) return true;

    return dedupedStores.some((store) => (
      storeBelongsToEvent(store, event) && storeSearchText(store).includes(normalizedSearch)
    ));
  }

  const filteredEvents = useMemo(() => events.filter((event) => (
    eventMatchesStatus(event)
    && eventMatchesPeriod(event, startDateFilter, endDateFilter)
    && eventHasSearchMatch(event)
  )), [
    events,
    dedupedStores,
    eventStatusFilter,
    startDateFilter,
    endDateFilter,
    normalizedSearch,
    eventNameById
  ]);

  const selectedEvent = events.find((event) => event.id === eventId);

  const selectableEvents = useMemo(() => {
    if (!selectedEvent || filteredEvents.some((event) => event.id === selectedEvent.id)) {
      return filteredEvents;
    }

    return [selectedEvent, ...filteredEvents];
  }, [filteredEvents, selectedEvent]);

  const selectedStoresBase = useMemo(() => (
    selectedEvent
      ? dedupedStores.filter((store) => storeBelongsToEvent(store, selectedEvent))
      : []
  ), [dedupedStores, selectedEvent]);

  const selectedStoreIds = useMemo(
    () => new Set(selectedStoresBase.map((store) => store.id)),
    [selectedStoresBase]
  );

  function eventPassesVisibleFilters(event: any) {
    if (!event) return false;
    return eventMatchesStatus(event) && eventMatchesPeriod(event, startDateFilter, endDateFilter);
  }

  function storePassesSearch(store: any, event: any) {
    if (!normalizedSearch) return true;
    return storeSearchText(store).includes(normalizedSearch) || eventSearchText(event).includes(normalizedSearch);
  }

  const selectedStores = useMemo(() => {
    if (!selectedEvent || !eventPassesVisibleFilters(selectedEvent)) return [];

    return selectedStoresBase.filter((store) => (
      storeMatchesStatus(store) && storePassesSearch(store, selectedEvent)
    ));
  }, [
    selectedEvent,
    selectedStoresBase,
    storeStatusFilter,
    eventStatusFilter,
    startDateFilter,
    endDateFilter,
    normalizedSearch,
    eventNameById
  ]);

  const generalStores = useMemo(() => dedupedStores.filter((store) => {
    if (selectedStoreIds.has(store.id)) return false;
    if (!storeMatchesStatus(store)) return false;

    const event = eventById.get(store.event_id) || {
      event_name: store.event_name_snapshot,
      start_date: store.event_start_date_snapshot,
      end_date: store.event_end_date_snapshot,
      state: store.event_state_snapshot,
      city: store.event_city_snapshot,
      status: store.status
    };

    if (!eventPassesVisibleFilters(event)) return false;
    return storePassesSearch(store, event);
  }), [
    dedupedStores,
    selectedStoreIds,
    eventById,
    storeStatusFilter,
    eventStatusFilter,
    startDateFilter,
    endDateFilter,
    normalizedSearch,
    eventNameById
  ]);

  const realStockRows = useMemo(() => {
    const storeById = new Map(dedupedStores.map((store) => [store.id, store]));
    const storeByName = new Map(dedupedStores.map((store) => [normalizeStoreName(store.store_name), store]));
    const rows: any[] = [];

    vehicleSubmissions
      .filter(isValidPublishedLink)
      .forEach((link) => {
        const store = storeById.get(link.store_id);
        if (!store) return;

        rows.push({
          id: link.imported_vehicle_id || link.id,
          store_id: store.id,
          event_id: store.event_id,
          source: 'store_vehicle_link_submissions'
        });
      });

    const linkedIds = new Set(rows.map((item) => item.id).filter(Boolean));

    siteVehicles
      .filter(isValidPublishedVehicle)
      .filter((vehicle) => !linkedIds.has(vehicle.id))
      .forEach((vehicle) => {
        const store = storeByName.get(normalizeStoreName(vehicle.store_name));
        if (!store) return;

        rows.push({
          id: vehicle.id,
          store_id: store.id,
          event_id: store.event_id,
          source: 'site_vehicles'
        });
      });

    const unique = new Map<string, any>();

    rows.forEach((item) => {
      const key = `${item.store_id}:${item.id}`;
      if (!unique.has(key)) unique.set(key, item);
    });

    return Array.from(unique.values());
  }, [dedupedStores, siteVehicles, vehicleSubmissions]);

  function clearFilters() {
    setSearchTerm('');
    setEventStatusFilter('all');
    setStoreStatusFilter('all');
    setStartDateFilter('');
    setEndDateFilter('');
  }

  function startEdit(store: any) {
    setEditingId(store.id);
    setForm({
      storeName: store.store_name || '',
      responsibleName: store.responsible_name || '',
      phone: store.responsible_phone || '',
      email: store.responsible_email || '',
      eventId: store.event_id || ''
    });
  }

  async function saveEdit(store: any) {
    const nextEvent = events.find((event) => event.id === form.eventId);

    const payload: any = {
      store_name: form.storeName,
      responsible_name: form.responsibleName,
      responsible_phone: form.phone || null,
      responsible_email: form.email || null,
      updated_at: new Date().toISOString()
    };

    if (nextEvent) {
      payload.event_id = nextEvent.id;
      payload.event_name_snapshot = nextEvent.event_name || null;
      payload.event_start_date_snapshot = nextEvent.start_date || null;
      payload.event_end_date_snapshot = nextEvent.end_date || null;
      payload.event_state_snapshot = nextEvent.state || null;
      payload.event_city_snapshot = nextEvent.city || null;
    }

    const { error } = await supabase.from('stores').update(payload).eq('id', store.id);

    if (error) {
      setMessage('Erro ao editar loja.');
      return;
    }

    setEditingId('');
    setMessage('Loja editada com sucesso.');
    await loadData();
  }

  async function removeStore(store: any) {
    const confirmation = window.prompt(`Excluir a loja ${store.store_name}? Digite EXCLUIR para confirmar.`);
    if (confirmation !== 'EXCLUIR') return;

    const { error } = await supabase
      .from('stores')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', store.id);

    if (error) {
      setMessage('Erro ao excluir loja.');
      return;
    }

    setMessage('Loja removida da listagem ativa.');
    await loadData();
  }

  async function copyStoreLink(store: any) {
    const link = portalLink(store.slug);

    if (!link) {
      setMessage('Esta loja ainda não possui slug/link de portal.');
      return;
    }

    await navigator.clipboard.writeText(link);
    setMessage(`Link do portal da loja ${store.store_name} copiado.`);
  }

  async function generateStorePassword(store: any) {
    if (!store.responsible_email) {
      setMessage('Esta loja precisa ter e-mail cadastrado antes de gerar senha.');
      return;
    }

    const confirmation = window.confirm(`Gerar nova senha para ${store.store_name}? O login será ${store.responsible_email}.`);
    if (!confirmation) return;

    setPasswordLoadingId(store.id);
    setMessage('Gerando nova senha da loja...');

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setPasswordLoadingId('');
        return;
      }

      const response = await fetch('/api/master/store-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ store_id: store.id })
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Erro ao gerar senha.');
        setPasswordLoadingId('');
        return;
      }

      if (!result.password) {
        setMessage('A senha foi atualizada, mas o servidor não devolveu a senha para exibir. Faça o redeploy e tente novamente.');
        setPasswordLoadingId('');
        return;
      }

      setPasswordResult(result);
      setMessage('Senha gerada com sucesso. Copie e envie para a loja.');
      await loadData();
    } catch {
      setMessage('Erro ao gerar senha da loja.');
    }

    setPasswordLoadingId('');
  }

  async function copyGeneratedPassword() {
    if (!passwordResult?.password) return;

    await navigator.clipboard.writeText(
      `Login: ${passwordResult.email}\nSenha: ${passwordResult.password}\nPortal: ${window.location.origin}${passwordResult.portal_path}`
    );
    setMessage('Login, senha e portal copiados.');
  }

  function renderStoreCard(store: any, showHistory = true) {
    const stock = realStockRows.filter((item: any) => item.store_id === store.id && item.event_id === store.event_id).length;
    const sold = sales.filter((sale) => sale.store_id === store.id && sale.event_id === store.event_id).length;
    const linkedEvent = eventById.get(store.event_id);
    const eventActive = linkedEvent ? isEventActive(linkedEvent) : true;
    const storeActive = isStoreActive(store);

    return (
      <div key={store.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
        {editingId === store.id ? (
          <div className="grid gap-3 md:grid-cols-2">
            <input className="premium-input md:col-span-2" value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} />
            <input className="premium-input" placeholder="Responsável" value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} />
            <input className="premium-input" placeholder="Telefone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="premium-input md:col-span-2" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

            <select className="premium-input md:col-span-2" value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })}>
              <option value="">Manter histórico sem evento ativo</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>{event.event_name}</option>
              ))}
            </select>

            <button className="premium-button-primary" type="button" onClick={() => saveEdit(store)}>Salvar edição</button>
            <button className="premium-button-secondary" type="button" onClick={() => setEditingId('')}>Cancelar</button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-black text-zinc-950">{store.store_name}</h3>
                <p className="mt-1 text-sm text-zinc-500">Evento: {eventLabel(store, eventNameById)}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusBadge active={eventActive} activeLabel="Evento ativo" inactiveLabel="Evento inativo" />
                <StatusBadge active={storeActive} activeLabel="Loja ativa" inactiveLabel="Loja inativa" />
              </div>
            </div>

            <p className="mt-2 text-sm text-zinc-500">
              Responsável: {store.responsible_name || '-'} | Telefone: {store.responsible_phone || '-'}
            </p>

            <p className="mt-1 text-sm text-zinc-500">E-mail: {store.responsible_email || '-'}</p>

            <div className="mt-3 rounded-2xl border border-zinc-100 bg-white p-3">
              <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Portal da loja</p>
              <p className="mt-1 break-all text-xs font-bold text-zinc-600">
                {store.slug ? portalLink(store.slug) : 'Link ainda não gerado'}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="premium-button-secondary text-xs" type="button" onClick={() => copyStoreLink(store)}>
                  <Copy size={14} /> Copiar link
                </button>

                {store.slug ? (
                  <a className="premium-button-secondary text-xs" href={portalLink(store.slug)} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> Abrir portal
                  </a>
                ) : null}
              </div>
            </div>

            <p className="mt-2 text-xs font-bold text-zinc-400">
              Histórico: {store.event_state_snapshot || '-'} | {store.event_city_snapshot || '-'} | {dateText(store.event_start_date_snapshot)} até {dateText(store.event_end_date_snapshot)}
            </p>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Mini label="Carros vendidos" value={String(sold)} />
              <Mini label="Carros no estoque" value={String(stock)} />
            </div>

            {showHistory ? (
              <StoreParticipationHistory
                store={store}
                events={events}
                stores={dedupedStores}
                sales={sales}
                inventory={realStockRows as any[]}
              />
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="premium-button-secondary text-xs" type="button" onClick={() => startEdit(store)}>
                <Pencil size={14} /> Editar
              </button>

              <button
                className="premium-button-secondary text-xs"
                type="button"
                onClick={() => generateStorePassword(store)}
                disabled={passwordLoadingId === store.id}
              >
                <KeyRound size={14} /> {passwordLoadingId === store.id ? 'Gerando...' : 'Gerar nova senha'}
              </button>

              <button className="premium-button-secondary text-xs" type="button" onClick={() => removeStore(store)}>
                <Trash2 size={14} /> Excluir
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={CalendarCheck2} label="Eventos ativos" value={String(activeEventCount)} />
        <SummaryCard icon={CalendarX2} label="Eventos inativos" value={String(inactiveEventCount)} />
        <SummaryCard icon={Building2} label="Lojas no evento" value={String(selectedStores.length)} />
        <SummaryCard icon={Building2} label="Outras lojas" value={String(generalStores.length)} />
      </div>

      <div className="premium-card p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-2xl font-black text-zinc-950">Filtros de eventos e lojas</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Pesquise por evento, loja, responsável, cidade, telefone ou e-mail e combine com período e status.
            </p>
          </div>

          <button className="premium-button-secondary text-xs" type="button" onClick={clearFilters}>
            <RotateCcw size={14} /> Limpar filtros
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <label className="relative lg:col-span-2 xl:col-span-3">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              className="premium-input pl-11"
              placeholder="Pesquisar evento, loja, responsável, cidade, telefone ou e-mail"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <EventSelectField events={selectableEvents} value={eventId} onChange={selectEvent} label="Evento selecionado" />

          <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Status do evento
            <select
              className="premium-input mt-1"
              value={eventStatusFilter}
              onChange={(event) => setEventStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">Todos os eventos</option>
              <option value="active">Eventos ativos</option>
              <option value="inactive">Eventos inativos</option>
            </select>
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Status da loja
            <select
              className="premium-input mt-1"
              value={storeStatusFilter}
              onChange={(event) => setStoreStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">Todas as lojas</option>
              <option value="active">Lojas ativas</option>
              <option value="inactive">Lojas inativas</option>
            </select>
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Período a partir de
            <input className="premium-input mt-1" type="date" value={startDateFilter} onChange={(event) => setStartDateFilter(event.target.value)} />
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Período até
            <input className="premium-input mt-1" type="date" value={endDateFilter} onChange={(event) => setEndDateFilter(event.target.value)} />
          </label>
        </div>

        <p className="mt-4 text-xs font-bold text-zinc-400">
          {filteredEvents.length} evento(s) e {selectedStores.length + generalStores.length} loja(s) correspondem aos filtros atuais.
        </p>
      </div>

      <div className="premium-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-black text-zinc-950">Lojas por evento</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {selectedEvent
                ? `${selectedEvent.event_name} · ${dateText(selectedEvent.start_date)} até ${dateText(selectedEvent.end_date)}`
                : 'Selecione um evento para consultar as lojas vinculadas.'}
            </p>
          </div>

          {selectedEvent ? (
            <StatusBadge
              active={isEventActive(selectedEvent)}
              activeLabel="Evento ativo"
              inactiveLabel="Evento inativo"
            />
          ) : null}
        </div>

        <p className="mt-3 text-sm text-zinc-500">Total exibido no evento selecionado: {selectedStores.length}</p>

        <div className="mt-5 space-y-3">
          {selectedStores.map((store) => renderStoreCard(store))}
          {selectedStores.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma loja corresponde ao evento e aos filtros selecionados.</p>
          ) : null}
        </div>
      </div>

      <div className="premium-card p-6">
        <h2 className="text-2xl font-black text-zinc-950">Outras lojas cadastradas</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Histórico geral sem repetir as lojas já exibidas no evento selecionado. Os mesmos filtros permanecem aplicados.
        </p>

        <div className="mt-5 space-y-3">
          {generalStores.map((store) => renderStoreCard(store, false))}
          {generalStores.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma outra loja corresponde aos filtros selecionados.</p>
          ) : null}
        </div>
      </div>

      {passwordResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-3xl rounded-[34px] bg-white p-6 shadow-2xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Senha gerada com sucesso</p>
                <h3 className="mt-2 text-3xl font-black text-zinc-950">{passwordResult.store_name}</h3>
                <p className="mt-2 text-sm font-bold text-zinc-500">
                  Copie este acesso e envie para a loja. A senha aparece somente agora.
                </p>
              </div>

              <button
                className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-zinc-600"
                type="button"
                onClick={() => setPasswordResult(null)}
              >
                <X size={16} /> Fechar
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="rounded-[24px] border border-zinc-100 bg-zinc-50 p-5">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Login da loja</p>
                <p className="mt-2 break-all text-xl font-black text-zinc-950">{passwordResult.email}</p>
              </div>

              <div className="rounded-[24px] border-2 border-red-200 bg-red-50 p-5">
                <p className="text-xs font-black uppercase tracking-wide text-red-600">Nova senha</p>
                <p className="mt-2 select-all break-all text-4xl font-black text-red-600">{passwordResult.password}</p>
              </div>

              <div className="rounded-[24px] border border-zinc-100 bg-zinc-50 p-5">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Portal da loja</p>
                <p className="mt-2 break-all text-sm font-black text-zinc-950">
                  {typeof window !== 'undefined'
                    ? `${window.location.origin}${passwordResult.portal_path}`
                    : passwordResult.portal_path}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <button className="premium-button-primary justify-center" type="button" onClick={copyGeneratedPassword}>
                <Copy size={16} /> Copiar acesso completo
              </button>

              <button className="premium-button-secondary justify-center" type="button" onClick={() => setPasswordResult(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-2xl bg-white p-3 text-sm font-bold text-zinc-600">{message}</p>
      ) : null}
    </section>
  );
}

function StatusBadge({ active, activeLabel, inactiveLabel }: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span className={`inline-flex w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function SummaryCard({ icon: Icon, label, value }: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="premium-card flex items-center gap-4 p-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
        <strong className="mt-1 block text-2xl font-black text-zinc-950">{value}</strong>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-3">
      <p className="text-xs font-bold text-zinc-400">{label}</p>
      <strong className="mt-1 block text-sm text-zinc-950">{value}</strong>
    </div>
  );
}
