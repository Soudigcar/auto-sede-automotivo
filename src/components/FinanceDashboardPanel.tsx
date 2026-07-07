'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, Landmark, ReceiptText, TrendingUp, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function money(value: number) { return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`; }
function shortMoney(value: number) { const n = Number(value || 0); if (Math.abs(n) >= 1000000) return `${(n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`; if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}K`; return n.toLocaleString('pt-BR'); }
function rowDate(row: any) { return new Date(`${row.payment_date || row.created_at || new Date().toISOString()}${row.payment_date ? 'T00:00:00' : ''}`); }
function groupBy(rows: any[], field: string) { const map = new Map<string, number>(); rows.forEach((row) => { const label = row[field] || row.supplier_name || 'Sem categoria'; map.set(label, (map.get(label) || 0) + Number(row.amount || 0)); }); return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); }

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

  useEffect(() => { loadData().catch(() => null); }, [refreshKey]);

  const banks = useMemo(() => Array.from(new Set(entries.map((item) => item.sponsor_bank || item.supplier_name).filter(Boolean))).sort(), [entries]);
  const categories = useMemo(() => Array.from(new Set(entries.map((item) => item.category).filter(Boolean))).sort(), [entries]);

  const filtered = useMemo(() => entries.filter((item) => {
    if (eventId !== 'all' && item.event_id !== eventId) return false;
    if (bank !== 'all' && (item.sponsor_bank || item.supplier_name) !== bank) return false;
    if (category !== 'all' && item.category !== category) return false;
    return true;
  }), [entries, eventId, bank, category]);

  const summary = useMemo(() => {
    const income = filtered.filter((item) => item.movement_type !== 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expense = filtered.filter((item) => item.movement_type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const discount = filtered.reduce((sum, item) => sum + Number(item.discount || 0), 0);
    const cash = income - expense - discount;
    const bradescoSupport = filtered.filter((item) => String(item.sponsor_bank || '').toLowerCase() === 'bradesco' && item.movement_type !== 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const bradescoGoal = Math.floor(bradescoSupport / 10000) * 1000000;
    const bradescoDone = sales.filter((sale) => (eventId === 'all' || sale.event_id === eventId) && String(sale.financing_bank || '').toLowerCase() === 'bradesco').reduce((sum, sale) => sum + Number(sale.sale_value || 0), 0);
    const goalPercent = bradescoGoal > 0 ? Math.min(100, Math.round((bradescoDone / bradescoGoal) * 100)) : 0;
    return { income, expense, discount, cash, bradescoSupport, bradescoGoal, bradescoDone, goalPercent };
  }, [filtered, sales, eventId]);

  const monthly = useMemo(() => monthIndexes.map((index) => {
    const rows = filtered.filter((item) => rowDate(item).getMonth() === index);
    const income = rows.filter((item) => item.movement_type !== 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expense = rows.filter((item) => item.movement_type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { label: months[index], income, expense, balance: income - expense };
  }), [filtered]);

  const maxMonth = Math.max(...monthly.flatMap((item) => [item.income, item.expense]), 1);
  const revenueRows = groupBy(filtered.filter((item) => item.movement_type !== 'expense'), 'category').slice(0, 7);
  const expenseRows = groupBy(filtered.filter((item) => item.movement_type === 'expense'), 'category').slice(0, 10);
  const bankRows = groupBy(filtered, 'sponsor_bank').slice(0, 7);

  return (
    <section className="mt-7 overflow-hidden rounded-[28px] border border-sky-100 bg-white shadow-2xl shadow-slate-200/70">
      <div className="bg-[#071020] px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-white">Dashboard Gerencial Financeiro</div>
      <div className="grid xl:grid-cols-[155px_1fr]">
        <aside className="space-y-3 border-r border-sky-100 bg-[#EDF7FB] p-3">
          <Select label="Evento" value={eventId} onChange={setEventId}><option value="all">Todos</option>{events.map((item) => <option key={item.id} value={item.id}>{item.event_name}</option>)}</Select>
          <Select label="Banco" value={bank} onChange={setBank}><option value="all">Todos</option>{banks.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
          <Select label="Categoria" value={category} onChange={setCategory}><option value="all">Todas</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
        </aside>
        <div className="bg-[#F6FBFD] p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Metric title="Entradas" value={shortMoney(summary.income)} icon={Banknote} tone="text-emerald-600" /><Metric title="Despesas e Custos" value={shortMoney(summary.expense)} icon={ReceiptText} tone="text-red-600" /><Metric title="Geração de Caixa" value={shortMoney(summary.cash)} icon={WalletCards} tone="text-[#0A6F9E]" /><Metric title="Meta Bradesco" value={`${summary.goalPercent}%`} icon={TrendingUp} tone="text-[#0A6F9E]" /><Metric title="Patrocínios" value={shortMoney(summary.bradescoSupport)} icon={Landmark} tone="text-[#0A6F9E]" /></div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.9fr_0.9fr]"><Card title="Entradas x Saídas"><div className="mb-3 flex gap-4 text-xs font-bold"><span className="text-emerald-600">■ Entradas</span><span className="text-red-500">■ Saídas</span></div><div className="flex h-52 items-end gap-2 border-b border-sky-100 px-2">{monthly.map((item) => <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-1"><div className="flex h-40 w-full items-end justify-center gap-1"><div className="w-3 rounded-t bg-emerald-500" style={{ height: `${Math.max(4, (item.income / maxMonth) * 150)}px` }} /><div className="w-3 rounded-t bg-red-500" style={{ height: `${Math.max(4, (item.expense / maxMonth) * 150)}px` }} /></div><span className="text-[10px] font-bold text-[#0A6F9E]">{item.label}</span></div>)}</div></Card><Card title="Top Receitas"><BarList rows={revenueRows} tone="bg-emerald-500" /></Card><Card title="Top Despesas/Custos"><BarList rows={expenseRows} tone="bg-red-500" /></Card></div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2"><Card title="Bancos e Fornecedores"><BarList rows={bankRows} tone="bg-[#0A6F9E]" /></Card><Card title="Resumo Meta Bradesco"><div className="grid gap-3 md:grid-cols-3"><Mini label="Patrocínio" value={money(summary.bradescoSupport)} /><Mini label="Meta" value={money(summary.bradescoGoal)} /><Mini label="Realizado" value={money(summary.bradescoDone)} /></div><div className="mt-5 h-4 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-gradient-to-r from-red-600 via-amber-400 to-emerald-500" style={{ width: `${Math.max(3, summary.goalPercent)}%` }} /></div></Card></div>
        </div>
      </div>
    </section>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) { return <label className="block text-[11px] font-black text-[#0A6F9E]">{label}<select className="mt-1 w-full rounded-md border border-sky-100 bg-[#0C63A5] px-2 py-2 text-xs font-bold text-white outline-none" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>; }
function Metric({ title, value, icon: Icon, tone }: { title: string; value: string; icon: any; tone: string }) { return <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Icon size={22} /></div><div><p className="text-xs font-black text-zinc-500">{title}</p><strong className={`mt-1 block text-2xl font-black ${tone}`}>{value}</strong></div></div></div>; }
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-2xl bg-white p-4 shadow-sm"><h3 className="text-center text-sm font-black text-[#0A6F9E]">{title}</h3><div className="mt-3">{children}</div></div>; }
function BarList({ rows, tone }: { rows: { label: string; value: number }[]; tone: string }) { const max = Math.max(...rows.map((row) => row.value), 1); if (!rows.length) return <p className="py-6 text-center text-sm font-bold text-zinc-400">Sem dados.</p>; return <div className="space-y-2">{rows.map((row) => <div key={row.label} className="grid grid-cols-[105px_1fr_54px] items-center gap-2 text-[11px]"><span className="truncate font-bold text-[#0A6F9E]">{row.label}</span><div className="h-5 rounded bg-sky-50"><div className={`h-5 rounded ${tone}`} style={{ width: `${Math.max(5, (row.value / max) * 100)}%` }} /></div><span className="font-black text-[#0A6F9E]">{shortMoney(row.value)}</span></div>)}</div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-sky-50 p-3"><p className="text-xs font-bold text-zinc-500">{label}</p><strong className="mt-1 block text-sm text-zinc-950">{value}</strong></div>; }
