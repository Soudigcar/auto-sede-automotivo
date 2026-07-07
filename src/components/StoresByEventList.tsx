'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { EventSelectField } from '@/components/EventSelectField';
import { StoreParticipationHistory } from '@/components/StoreParticipationHistory';

export function StoresByEventList({ refreshKey = 0 }: { refreshKey?: number }) {
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [eventId, setEventId] = useState('');

  async function loadData() {
    const [{ data: eventRows }, { data: storeRows }, { data: saleRows }, { data: inventoryRows }] = await Promise.all([
      supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false }),
      supabase.from('stores').select('*').eq('status', 'active').order('store_name'),
      supabase.from('sales').select('*'),
      supabase.from('inventory').select('*')
    ]);
    const eventList = eventRows || [];
    setEvents(eventList);
    if (!eventId && eventList[0]?.id) setEventId(eventList[0].id);
    setStores(storeRows || []);
    setSales(saleRows || []);
    setInventory(inventoryRows || []);
  }

  useEffect(() => { loadData().catch(() => null); }, [refreshKey]);

  const eventNameById = useMemo(() => Object.fromEntries(events.map((item) => [item.id, item.event_name])), [events]);
  const selectedStores = stores.filter((store) => store.event_id === eventId);

  return (
    <section className="premium-card p-6">
      <h2 className="text-2xl font-black text-zinc-950">Lojas por evento</h2>
      <div className="mt-5"><EventSelectField events={events} value={eventId} onChange={setEventId} label="Filtrar evento" /></div>
      <p className="mt-3 text-sm text-zinc-500">Total no evento selecionado: {selectedStores.length}</p>
      <div className="mt-5 space-y-3">
        {selectedStores.map((store) => {
          const stock = inventory.filter((item) => item.store_id === store.id && item.event_id === store.event_id).length;
          const sold = sales.filter((sale) => sale.store_id === store.id && sale.event_id === store.event_id).length;
          return (
            <div key={store.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
              <h3 className="font-black text-zinc-950">{store.store_name}</h3>
              <p className="mt-1 text-sm text-zinc-500">Evento: {eventNameById[store.event_id] || '-'}</p>
              <p className="mt-1 text-sm text-zinc-500">Responsável: {store.responsible_name}</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2"><Mini label="Carros vendidos" value={String(sold)} /><Mini label="Carros no estoque" value={String(stock)} /></div>
              <StoreParticipationHistory store={store} events={events} stores={stores} sales={sales} inventory={inventory} />
            </div>
          );
        })}
        {selectedStores.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma loja vinculada a este evento.</p> : null}
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-zinc-100 bg-white p-3"><p className="text-xs font-bold text-zinc-400">{label}</p><strong className="mt-1 block text-sm text-zinc-950">{value}</strong></div>;
}
