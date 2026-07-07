'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

export function BradescoGoalTrack() {
  const supabase = createClient();
  const [entries, setEntries] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);

  async function loadData() {
    const [{ data: entryRows }, { data: saleRows }] = await Promise.all([
      supabase.from('financial_entries').select('*'),
      supabase.from('sales').select('*')
    ]);
    setEntries(entryRows || []);
    setSales(saleRows || []);
  }

  useEffect(() => { loadData().catch(() => null); }, []);

  const data = useMemo(() => {
    const support = entries.filter((item) => String(item.sponsor_bank || '').toLowerCase() === 'bradesco').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const goal = Math.floor(support / 10000) * 1000000;
    const done = sales.filter((sale) => String(sale.financing_bank || '').toLowerCase() === 'bradesco').reduce((sum, sale) => sum + Number(sale.sale_value || 0), 0);
    const progress = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
    return { support, goal, done, progress };
  }, [entries, sales]);

  return (
    <section className="premium-card p-6">
      <h2 className="text-2xl font-black text-zinc-950">Meta Bradesco do evento</h2>
      <p className="premium-muted mt-2 text-sm">A cada R$ 10.000 de patrocínio, a meta de financiamento Bradesco é R$ 1.000.000.</p>
      <div className="mt-6 rounded-[28px] border border-zinc-200 bg-zinc-50 p-6">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-zinc-400"><span>Progresso da pista</span><span>{data.progress}%</span></div>
        <div className="relative mt-5 h-16 rounded-full border-4 border-zinc-300 bg-white shadow-inner">
          <div className="absolute left-5 right-5 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-red-600 via-amber-400 to-emerald-500" />
          <div className="absolute top-1/2 -translate-y-1/2 transition-all duration-700" style={{ left: `calc(${data.progress}% - 18px)` }}>
            <div className="flex h-9 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg">🚗</div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Mini label="Patrocínio" value={money(data.support)} />
          <Mini label="Meta" value={money(data.goal)} />
          <Mini label="Realizado" value={money(data.done)} />
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-zinc-100 bg-white p-3"><p className="text-xs font-bold text-zinc-400">{label}</p><strong className="mt-1 block text-sm text-zinc-950">{value}</strong></div>;
}
