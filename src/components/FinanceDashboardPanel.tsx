'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Banknote, Landmark, ReceiptText, TrendingUp, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

function shortMoney(value: number) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}K`;
  return n.toLocaleString('pt-BR');
}

function rowDate(row: any) {
  return new Date(`${row.payment_date || row.created_at || new Date().toISOString()}${row.payment_date ? 'T00:00:00' : ''}`);
}

function groupBy(rows: any[], field: string) {
  const map = new Map<string, number>();

  rows.forEach((row) => {
    const label = row[field] || row.supplier_name || 'Sem categoria';
    map.set(label, (map.get(label) || 0) + Number(row.amount || 0));
  });

  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function FinanceDashboardPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const supabase = createClient();
  const [entries, setEntries] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [eventId, setEventId] = useState('all');
  const [bank, setBank] = useState('all');
  const [category, setCategory] = useState('all');

  async function loadData() {
    const [{ data: entryRows }, { data: eventRows }, { data: saleRows }] = await Promise.all([
      supabase.from('financial_entries').select('*').neq('status', 'deleted'),
      supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false }),
      supabase.from('sales').select('*')
    ]);

    setEntries(entryRows || []);
    setEvents(eventRows || []);
    setSales(saleRows || []);
  }

  useEffect(() => {
    loadData().catch(() => null);
  }, [refreshKey]);

  const banks = useMemo(
    () => Array.from(new Set(entries.map((item) => item.sponsor_bank || item.supplier_name).filter(Boolean))).sort(),
    [entries]
  );

  const categories = useMemo(
    () => Array.from(new Set(entries.map((item) => item.category).filter(Boolean))).sort(),
    [entries]
  );

  const filtered = useMemo(() => entries.filter((item) => {
    if (eventId !== 'all' && item.event_id !== eventId) return false;
    if (bank !== 'all' && (item.sponsor_bank || item.supplier_name) !== bank) return false;
    if (category !== 'all' && item.category !== category) return false;
    return true;
  }), [entries, eventId, bank, category]);

  const summary = useMemo(() => {
    const paidRows = filtered.filter((item) => (item.status || 'paid') === 'paid');
    const pendingRows = filtered.filter((item) => item.status === 'pending');

    const incomePaid = paidRows
      .filter((item) => item.movement_type !== 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const incomePending = pendingRows
      .filter((item) => item.movement_type !== 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expensePaid = paidRows
      .filter((item) => item.movement_type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expensePending = pendingRows
      .filter((item) => item.movement_type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const discountPaid = paidRows.reduce((sum, item) => sum + Number(item.discount || 0), 0);
    const discountTotal = filtered.reduce((sum, item) => sum + Number(item.discount || 0), 0);

    const cash = incomePaid - expensePaid - discountPaid;
    const projectedCash = incomePaid + incomePending - expensePaid - expensePending - discountTotal;

    const bradescoSupport = paidRows
      .filter((item) => String(item.sponsor_bank || '').toLowerCase() === 'bradesco' && item.movement_type !== 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const bradescoGoal = Math.floor(bradescoSupport / 10000) * 1000000;

    const bradescoDone = sales
      .filter((sale) => (eventId === 'all' || sale.event_id === eventId) && String(sale.financing_bank || '').toLowerCase() === 'bradesco')
      .reduce((sum, sale) => sum + Number(sale.sale_value || 0), 0);

    const goalPercent = bradescoGoal > 0 ? Math.min(100, Math.round((bradescoDone / bradescoGoal) * 100)) : 0;

    return { incomePaid, incomePending, expensePaid, expensePending, discountPaid, discountTotal, cash, projectedCash, bradescoSupport, bradescoGoal, bradescoDone, goalPercent };
  }, [filtered, sales, eventId]);

  const monthly = useMemo(() => monthIndexes.map((index) => {
    const rows = filtered.filter((item) => rowDate(item).getMonth() === index);

    const paidRows = rows.filter((item) => (item.status || 'paid') === 'paid');

    const income = paidRows
      .filter((item) => item.movement_type !== 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expense = paidRows
      .filter((item) => item.movement_type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return { label: months[index], income, expense, balance: income - expense };
  }), [filtered]);

  const maxMonth = Math.max(...monthly.flatMap((item) => [item.income, item.expense]), 1);
  const paidFiltered = filtered.filter((item) => (item.status || 'paid') === 'paid');
  const pendingFiltered = filtered.filter((item) => item.status === 'pending');
  const revenueRows = groupBy(paidFiltered.filter((item) => item.movement_type !== 'expense'), 'category').slice(0, 7);
  const expenseRows = groupBy(paidFiltered.filter((item) => item.movement_type === 'expense'), 'category').slice(0, 10);
  const pendingRows = groupBy(pendingFiltered, 'category').slice(0, 10);
  const bankRows = groupBy(filtered, 'sponsor_bank').slice(0, 7);

  return (
    <section className="mt-7 overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-xl shadow-zinc-200/60">
      <div className="bg-[#071020] px-6 py-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-red-500">Financeiro</p>
            <h2 className="mt-1 text-xl font-black text-white">Dashboard Gerencial</h2>
          </div>
          <p className="text-sm font-bold text-zinc-400">Análise de entradas, saídas, caixa e meta Bradesco</p>
        </div>
      </div>

      <div className="space-y-5 p-4 md:p-6">
        <div className="grid gap-3 lg:grid-cols-3">
          <Select label="Evento" value={eventId} onChange={setEventId}>
            <option value="all">Todos os eventos</option>
            {events.map((item) => <option key={item.id} value={item.id}>{item.event_name}</option>)}
          </Select>

          <Select label="Banco / Fornecedor" value={bank} onChange={setBank}>
            <option value="all">Todos</option>
            {banks.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>

          <Select label="Categoria" value={category} onChange={setCategory}>
            <option value="all">Todas</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric title="Recebido" value={shortMoney(summary.incomePaid)} detail={money(summary.incomePaid)} icon={Banknote} tone="text-emerald-600" />
          <Metric title="A receber" value={shortMoney(summary.incomePending)} detail={money(summary.incomePending)} icon={ReceiptText} tone="text-red-600" />
          <Metric title="Saídas pagas" value={shortMoney(summary.expensePaid)} detail={money(summary.expensePaid)} icon={WalletCards} tone="text-red-600" />
          <Metric title="A pagar" value={shortMoney(summary.expensePending)} detail={money(summary.expensePending)} icon={TrendingUp} tone="text-red-600" />
          <Metric title="Caixa real" value={shortMoney(summary.cash)} detail={money(summary.cash)} icon={Landmark} tone={summary.cash >= 0 ? 'text-emerald-600' : 'text-red-600'} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
          <Card title="Entradas x Saídas por mês" action={<Legend />}>
            <div className="overflow-x-auto">
              <div className="flex h-64 min-w-[560px] items-end gap-3 border-b border-zinc-100 px-2 pb-2">
                {monthly.map((item) => (
                  <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-2" title={`Entradas: ${money(item.income)} | Saídas: ${money(item.expense)}`}>
                    <div className="flex h-48 w-full items-end justify-center gap-1">
                      <div className="w-4 rounded-t-xl bg-emerald-500 transition-all hover:bg-emerald-600" style={{ height: `${item.income > 0 ? Math.max(8, (item.income / maxMonth) * 180) : 4}px` }} />
                      <div className="w-4 rounded-t-xl bg-red-500 transition-all hover:bg-red-600" style={{ height: `${item.expense > 0 ? Math.max(8, (item.expense / maxMonth) * 180) : 4}px` }} />
                    </div>
                    <span className="text-xs font-black uppercase text-zinc-500">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Resumo Meta Bradesco">
            <div className="grid gap-3">
              <Mini label="Patrocínio" value={money(summary.bradescoSupport)} />
              <Mini label="Meta calculada" value={money(summary.bradescoGoal)} />
              <Mini label="Realizado" value={money(summary.bradescoDone)} />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wide text-zinc-400">
                <span>Progresso</span>
                <span>{summary.goalPercent}%</span>
              </div>
              <div className="h-5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-600 via-amber-400 to-emerald-500 transition-all"
                  style={{ width: `${Math.max(3, summary.goalPercent)}%` }}
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <Card title="Top receitas">
            <BarList rows={revenueRows} tone="bg-emerald-500" />
          </Card>

          <Card title="Top despesas pagas">
            <BarList rows={expenseRows} tone="bg-red-500" />
          </Card>

          <Card title="Pendências">
            <BarList rows={pendingRows} tone="bg-red-500" />
          </Card>

          <Card title="Bancos e fornecedores">
            <BarList rows={bankRows} tone="bg-zinc-950" />
          </Card>
        </div>
      </div>
    </section>
  );
}
function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
      <span className="text-xs font-black uppercase tracking-wide text-zinc-500">{label}</span>
      <select
        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-950 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function Metric({ title, value, detail, icon: Icon, tone }: { title: string; value: string; detail: string; icon: any; tone: string }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-zinc-200/80">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{title}</p>
          <strong className={`mt-1 block truncate text-2xl font-black ${tone}`}>{value}</strong>
          <span className="mt-1 block truncate text-xs font-bold text-zinc-400">{detail}</span>
        </div>
      </div>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-black text-zinc-950">{title}</h3>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-3 text-xs font-black">
      <span className="inline-flex items-center gap-1 text-emerald-600"><ArrowUpRight size={14} /> Entradas</span>
      <span className="inline-flex items-center gap-1 text-red-600"><ArrowDownRight size={14} /> Saídas</span>
    </div>
  );
}

function BarList({ rows, tone }: { rows: { label: string; value: number }[]; tone: string }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  if (!rows.length) {
    return <p className="rounded-2xl bg-zinc-50 py-8 text-center text-sm font-bold text-zinc-400">Sem dados para exibir.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(90px,140px)_1fr_64px] items-center gap-3 text-xs">
          <span className="truncate font-bold text-zinc-700">{row.label}</span>
          <div className="h-5 overflow-hidden rounded-full bg-zinc-100">
            <div className={`h-5 rounded-full ${tone}`} style={{ width: `${Math.max(5, (row.value / max) * 100)}%` }} />
          </div>
          <span className="text-right font-black text-zinc-950">{shortMoney(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
      <p className="text-xs font-bold text-zinc-400">{label}</p>
      <strong className="mt-1 block text-sm text-zinc-950">{value}</strong>
    </div>
  );
}
