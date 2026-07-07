'use client';

import { useEffect, useMemo, useState } from 'react';
import { Car, Store, Users, Wallet } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

export function EventDashboardSummary() {
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [eventId, setEventId] = useState('all');
  const [storeId, setStoreId] = useState('all');

  async function loadData() {
    const [{ data: eventRows }, { data: storeRows }, { data: leadRows }, { data: saleRows }, { data: inventoryRows }] = await Promise.all([
      supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false }),
      supabase.from('stores').select('*').eq('status', 'active').order('store_name'),
      supabase.from('leads').select('*'),
      supabase.from('sales').select('*'),
      supabase.from('inventory').select('*')
    ]);
    setEvents(eventRows || []);
    setStores(storeRows || []);
    setLeads(leadRows || []);
    setSales(saleRows || []);
    setInventory(inventoryRows || []);
  }

  useEffect(() => { loadData().catch(() => null); }, []);
  useEffect(() => { setStoreId('all'); }, [eventId]);

  const filteredStores = stores.filter((store) => eventId === 'all' || store.event_id === eventId);

  const data = useMemo(() => {
    let leadRows = leads.filter((item) => eventId === 'all' || item.event_id === eventId);
    let saleRows = sales.filter((item) => eventId === 'all' || item.event_id === eventId);
    let inventoryRows = inventory.filter((item) => eventId === 'all' || item.event_id === eventId);
    if (storeId !== 'all') {
      leadRows = leadRows.filter((item) => item.assigned_store_id === storeId);
      saleRows = saleRows.filter((item) => item.store_id === storeId);
      inventoryRows = inventoryRows.filter((item) => item.store_id === storeId);
    }
    const revenue = saleRows.reduce((sum, item) => sum + Number(item.sale_value || 0), 0);
    return { leads: leadRows.length, sales: saleRows.length, inventory: inventoryRows.length, revenue };
  }, [eventId, storeId, leads, sales, inventory]);

  return (
    <section className="mt-7 grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold text-zinc-500 shadow-sm">Evento
          <select className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="all">Todos os eventos</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.event_name}</option>)}
          </select>
        </label>
        <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold text-zinc-500 shadow-sm">Loja
          <select className="mt-1 w-full bg-transparent text-base font-black text-zinc-950 outline-none" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="all">Todas as lojas</option>
            {filteredStores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi title="Leads" value={String(data.leads)} icon={Users} />
        <Kpi title="Vendas" value={String(data.sales)} icon={Wallet} />
        <Kpi title="Estoque" value={String(data.inventory)} icon={Car} />
        <Kpi title="Faturamento" value={money(data.revenue)} icon={Store} />
      </div>
    </section>
  );
}

function Kpi({ title, value, icon: Icon }: { title: string; value: string; icon: any }) {
  return <div className="premium-card premium-card-hover p-5"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Icon size={22} /></div><p className="mt-5 text-sm font-bold text-zinc-500">{title}</p><strong className="mt-2 block text-3xl font-black text-zinc-950">{value}</strong></div>;
}
