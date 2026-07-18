'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Pencil, Trash2 } from 'lucide-react';
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

function isValidStore(store: any) {
  const status = String(store.status || '').toLowerCase();
  return status !== 'deleted' && status !== 'excluido';
}

export function StoresByEventList({ refreshKey = 0 }: { refreshKey?: number }) {
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [eventId, setEventId] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState({
    storeName: '',
    responsibleName: '',
    phone: '',
    email: '',
    eventId: ''
  });

  async function loadData() {
    const [{ data: eventRows }, { data: storeRows }, { data: saleRows }, { data: inventoryRows }] = await Promise.all([
      supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false }),
      supabase.from('stores').select('*').order('store_name'),
      supabase.from('sales').select('*'),
      supabase.from('inventory').select('*')
    ]);

    const eventList = eventRows || [];
    const storeList = (storeRows || []).filter(isValidStore);

    setEvents(eventList);

    if (!eventId && eventList[0]?.id) setEventId(eventList[0].id);

    setStores(storeList);
    setSales(saleRows || []);
    setInventory(inventoryRows || []);
  }

  useEffect(() => { loadData().catch(() => null); }, [refreshKey]);

  const eventNameById = useMemo(() => Object.fromEntries(events.map((item) => [item.id, item.event_name])), [events]);

  const dedupedStores = useMemo(() => {
    const map = new Map<string, any>();

    stores.filter(isValidStore).forEach((store) => {
      const key = storeIdentity(store);

      if (!map.has(key)) {
        map.set(key, store);
      }
    });

    return Array.from(map.values());
  }, [stores]);

  const selectedStores = dedupedStores.filter((store) => store.event_id === eventId);
  const selectedStoreIds = new Set(selectedStores.map((store) => store.id));
  const generalStores = dedupedStores.filter((store) => !selectedStoreIds.has(store.id));

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

  function renderStoreCard(store: any, showHistory = true) {
    const stock = inventory.filter((item) => item.store_id === store.id && item.event_id === store.event_id).length;
    const sold = sales.filter((sale) => sale.store_id === store.id && sale.event_id === store.event_id).length;

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
            <h3 className="font-black text-zinc-950">{store.store_name}</h3>

            <p className="mt-1 text-sm text-zinc-500">
              Evento: {eventLabel(store, eventNameById)}
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Responsável: {store.responsible_name || '-'} | Telefone: {store.responsible_phone || '-'}
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              E-mail: {store.responsible_email || '-'}
            </p>

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
                  <a className="premium-button-secondary text-xs" href={portalLink(store.slug)} target="_blank">
                    <ExternalLink size={14} /> Abrir portal
                  </a>
                ) : null}
              </div>
            </div>

            <p className="mt-1 text-xs font-bold text-zinc-400">
              Histórico: {store.event_state_snapshot || '-'} | {store.event_city_snapshot || '-'} | {dateText(store.event_start_date_snapshot)} até {dateText(store.event_end_date_snapshot)}
            </p>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Mini label="Carros vendidos" value={String(sold)} />
              <Mini label="Carros no estoque" value={String(stock)} />
            </div>

            {showHistory ? <StoreParticipationHistory store={store} events={events} stores={dedupedStores} sales={sales} inventory={inventory} /> : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="premium-button-secondary text-xs" type="button" onClick={() => startEdit(store)}>
                <Pencil size={14} /> Editar
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
      <div className="premium-card p-6">
        <h2 className="text-2xl font-black text-zinc-950">Lojas por evento</h2>

        <div className="mt-5">
          <EventSelectField events={events} value={eventId} onChange={setEventId} label="Filtrar evento" />
        </div>

        <p className="mt-3 text-sm text-zinc-500">Total no evento selecionado: {selectedStores.length}</p>

        <div className="mt-5 space-y-3">
          {selectedStores.map((store) => renderStoreCard(store))}
          {selectedStores.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma loja vinculada a este evento.</p> : null}
        </div>
      </div>

      <div className="premium-card p-6">
        <h2 className="text-2xl font-black text-zinc-950">Outras lojas cadastradas</h2>
        <p className="mt-1 text-sm text-zinc-500">Lista geral sem repetir as lojas já exibidas no evento selecionado.</p>

        <div className="mt-5 space-y-3">
          {generalStores.map((store) => renderStoreCard(store, false))}
          {generalStores.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma outra loja cadastrada.</p> : null}
        </div>
      </div>

      {message ? (
        <p className="rounded-2xl bg-white p-3 text-sm font-bold text-zinc-600">{message}</p>
      ) : null}
    </section>
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
