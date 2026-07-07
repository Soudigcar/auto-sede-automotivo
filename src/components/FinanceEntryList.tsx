'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

export function FinanceEntryList({ refreshKey = 0 }: { refreshKey?: number }) {
  const supabase = createClient();
  const [entries, setEntries] = useState<any[]>([]);

  async function loadData() {
    const { data } = await supabase.from('financial_entries').select('*').order('created_at', { ascending: false });
    setEntries(data || []);
  }

  useEffect(() => { loadData().catch(() => null); }, [refreshKey]);

  const summary = useMemo(() => {
    const income = entries.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const discount = entries.reduce((sum, item) => sum + Number(item.discount || 0), 0);
    const suppliers = new Set(entries.map((item) => item.supplier_name).filter(Boolean)).size;
    const categories = new Set(entries.map((item) => item.category).filter(Boolean)).size;
    return { income, discount, suppliers, categories };
  }, [entries]);

  return (
    <section className="premium-card p-6">
      <h2 className="text-2xl font-black text-zinc-950">Relatório financeiro</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <Mini label="Entradas" value={money(summary.income)} />
        <Mini label="Descontos" value={money(summary.discount)} />
        <Mini label="Categorias" value={String(summary.categories)} />
        <Mini label="Fornecedores" value={String(summary.suppliers)} />
      </div>
      <div className="mt-5 space-y-3">
        {entries.map((item) => (
          <div key={item.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <strong className="text-zinc-950">{item.sponsor_bank || 'Entrada'} - {money(item.amount)}</strong>
              <span className="text-xs font-black uppercase tracking-wide text-zinc-400">{item.payment_date || 'sem data'}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">{item.event_name} | {item.category} | desconto: {money(item.discount)}</p>
          </div>
        ))}
        {entries.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma entrada registrada.</p> : null}
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3"><p className="text-xs font-bold text-zinc-400">{label}</p><strong className="mt-1 block text-sm text-zinc-950">{value}</strong></div>;
}
