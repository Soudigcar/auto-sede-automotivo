'use client';

import { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

function dateText(value?: string) {
  return value ? value.split('-').reverse().join('/') : '-';
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

  useEffect(() => {
    loadData().catch(() => null);
  }, [refreshKey]);

  const selectedEvent = events.find((item) => item.id === selectedId);

  const goal = useMemo(() => {
    const sponsorship = entries
      .filter((item) => item.event_id === selectedId && item.movement_type !== 'expense' && String(item.sponsor_bank || '').toLowerCase() === 'bradesco')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const target = Math.floor(sponsorship / 10000) * 1000000;

    const done = sales
      .filter((sale) => sale.event_id === selectedId && String(sale.financing_bank || '').toLowerCase() === 'bradesco')
      .reduce((sum, sale) => sum + Number(sale.sale_value || 0), 0);

    const progress = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;

    return { sponsorship, target, done, progress };
  }, [entries, sales, selectedId]);

  return (
    <section className="premium-card p-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_340px] xl:items-start">
        <div>
          <label className="text-xs font-black uppercase tracking-wide text-zinc-400">
            Evento selecionado
            <select className="premium-input mt-1" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {events.map((item) => (
                <option key={item.id} value={item.id}>{item.event_name}</option>
              ))}
            </select>
          </label>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Mini label="Período" value={`${dateText(selectedEvent?.start_date)} até ${dateText(selectedEvent?.end_date)}`} />
            <Mini label="Estado" value={selectedEvent?.state || '-'} />
            <Mini label="Cidade" value={selectedEvent?.city || '-'} />
            <Mini label="Banco" value={selectedEvent?.sponsor_bank || '-'} />
          </div>

          <div className="mt-4">
            {selectedEvent?.live_url ? (
              <a className="premium-button-primary" href={selectedEvent.live_url} target="_blank" rel="noreferrer">
                <Play size={18} /> Assistir Evento
              </a>
            ) : (
              <button className="premium-button-secondary" type="button">
                <Play size={18} /> Sem transmissão cadastrada
              </button>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5 text-center">
          <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Velocímetro da meta</p>

          <div className="relative mx-auto mt-4 h-36 w-72 overflow-hidden">
            <div className="absolute left-0 top-0 h-72 w-72 rounded-full bg-gradient-to-r from-red-600 via-amber-400 to-emerald-500" />
            <div className="absolute left-8 top-8 h-56 w-56 rounded-full bg-zinc-50" />
            <div
              className="absolute bottom-0 left-1/2 h-2 w-24 origin-left rounded-full bg-zinc-950 transition-transform duration-700"
              style={{ transform: `rotate(${-90 + goal.progress * 1.8}deg)` }}
            />
            <div className="absolute bottom-[-8px] left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-red-600" />
          </div>

          <strong className="mt-1 block text-4xl font-black text-zinc-950">{goal.progress}%</strong>

          <div className="mt-4 grid gap-2 text-left">
            <Mini label="Patrocínio" value={money(goal.sponsorship)} />
            <Mini label="Meta" value={money(goal.target)} />
            <Mini label="Realizado" value={money(goal.done)} />
          </div>
        </div>
      </div>
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
