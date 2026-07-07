'use client';

import { useEffect, useMemo, useState } from 'react';
import { Car, Play } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

export function EventGoalSelector({ refreshKey = 0 }: { refreshKey?: number }) {
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);

  async function loadData() {
    const [{ data: eventRows }, { data: entryRows }, { data: saleRows }] = await Promise.all([
      supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false }),
      supabase.from('financial_entries').select('*').neq('status', 'deleted'),
      supabase.from('sales').select('*')
    ]);
    const list = eventRows || [];
    setEvents(list);
    if (!selectedId && list[0]?.id) setSelectedId(list[0].id);
    setEntries(entryRows || []);
    setSales(saleRows || []);
  }

  useEffect(() => { loadData().catch(() => null); }, [refreshKey]);

  const selectedEvent = events.find((item) => item.id === selectedId);

  const goal = useMemo(() => {
    const support = entries.filter((item) => item.event_id === selectedId && item.movement_type !== 'expense' && String(item.sponsor_bank || '').toLowerCase() === 'bradesco').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const target = Math.floor(support / 10000) * 1000000;
    const done = sales.filter((sale) => sale.event_id === selectedId && String(sale.financing_bank || '').toLowerCase() === 'bradesco').reduce((sum, sale) => sum + Number(sale.sale_value || 0), 0);
    const progress = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
    return { support, target, done, progress };
  }, [entries, sales, selectedId]);

  return (
    <section className="premium-card p-6">
      <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-end">
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Evento selecionado
          <select className="premium-input mt-1" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {events.map((item) => <option key={item.id} value={item.id}>{item.event_name}</option>)}
          </select>
        </label>
        {selectedEvent?.live_url ? <a className="premium-button-primary" href={selectedEvent.live_url} target="_blank" rel="noreferrer"><Play size={18} /> Assistir Evento</a> : <button className="premium-button-secondary" type="button"><Play size={18} /> Assistir Evento</button>}
      </div>

      <div className="mt-6 rounded-[28px] border border-zinc-200 bg-zinc-50 p-6">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-zinc-400"><span>Meta Bradesco do evento</span><span>{goal.progress}%</span></div>
        <div className="relative mt-5 h-16 rounded-full border-4 border-zinc-300 bg-white shadow-inner">
          <div className="absolute left-5 right-5 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-red-600 via-amber-400 to-emerald-500" />
          <div className="absolute top-1/2 -translate-y-1/2 transition-all duration-700" style={{ left: `calc(${goal.progress}% - 18px)` }}>
            <div className="flex h-10 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg"><Car size={18} /></div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3"><Mini label="Patrocínio" value={money(goal.support)} /><Mini label="Meta" value={money(goal.target)} /><Mini label="Realizado" value={money(goal.done)} /></div>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-zinc-100 bg-white p-3"><p className="text-xs font-bold text-zinc-400">{label}</p><strong className="mt-1 block text-sm text-zinc-950">{value}</strong></div>;
}
