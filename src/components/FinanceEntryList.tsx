'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { FinanceDashboardPanel } from '@/components/FinanceDashboardPanel';

function money(value: number) { return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`; }

const categories = ['Patrocínio', 'Imposto', 'Fornecedor', 'Marketing', 'Estrutura', 'Comissão', 'Outros'];
const valueOptions = [5000, 10000, 15000, 20000, 25000, 30000, 50000, 75000, 100000];

export function FinanceEntryList({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const supabase = createClient();
  const [entries, setEntries] = useState<any[]>([]);
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({ eventName: '', sponsorBank: '', supplierName: '', category: 'Patrocínio', amount: '10000', discount: '0', paymentDate: '', movementType: 'income' });

  async function loadData() {
    const { data } = await supabase.from('financial_entries').select('*').neq('status', 'deleted').order('created_at', { ascending: false });
    setEntries(data || []);
  }

  useEffect(() => { loadData().catch(() => null); }, [refreshKey]);

  const summary = useMemo(() => {
    const income = entries.filter((item) => item.movement_type !== 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expense = entries.filter((item) => item.movement_type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const discount = entries.reduce((sum, item) => sum + Number(item.discount || 0), 0);
    const suppliers = new Set(entries.map((item) => item.supplier_name).filter(Boolean)).size;
    const categoriesCount = new Set(entries.map((item) => item.category).filter(Boolean)).size;
    return { income, expense, discount, balance: income - expense - discount, suppliers, categoriesCount };
  }, [entries]);

  function startEdit(item: any) {
    setEditingId(item.id);
    setEditForm({ eventName: item.event_name || '', sponsorBank: item.sponsor_bank || 'Bradesco', supplierName: item.supplier_name || '', category: item.category || 'Patrocínio', amount: String(Number(item.amount || 0)), discount: String(Number(item.discount || 0)), paymentDate: item.payment_date || '', movementType: item.movement_type || 'income' });
  }

  async function saveEdit() {
    const { error } = await supabase.from('financial_entries').update({ event_name: editForm.eventName, sponsor_bank: editForm.movementType === 'income' && editForm.category === 'Patrocínio' ? editForm.sponsorBank : null, supplier_name: editForm.supplierName || null, category: editForm.category, amount: Number(editForm.amount || 0), discount: Number(editForm.discount || 0), payment_date: editForm.paymentDate || null, movement_type: editForm.movementType, updated_at: new Date().toISOString() }).eq('id', editingId);
    if (error) return;
    setEditingId('');
    await loadData();
    onChanged?.();
  }

  async function removeItem(item: any) {
    const confirmed = window.confirm(`Excluir lançamento de ${money(item.amount)}?`);
    if (!confirmed) return;
    await supabase.from('financial_entries').update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('id', item.id);
    await loadData();
    onChanged?.();
  }

  return (
    <>
      <FinanceDashboardPanel refreshKey={refreshKey} />
      <section className="premium-card p-6">
        <h2 className="text-2xl font-black text-zinc-950">Relatório financeiro</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-6"><Mini label="Entradas" value={money(summary.income)} tone="text-emerald-600" /><Mini label="Saídas" value={money(summary.expense)} tone="text-red-600" /><Mini label="Descontos" value={money(summary.discount)} tone="text-amber-600" /><Mini label="Saldo" value={money(summary.balance)} tone="text-zinc-950" /><Mini label="Categorias" value={String(summary.categoriesCount)} tone="text-sky-600" /><Mini label="Fornecedores" value={String(summary.suppliers)} tone="text-violet-600" /></div>
        <div className="mt-5 space-y-3">
          {entries.map((item) => (
            <div key={item.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
              {editingId === item.id ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <select className="premium-input" value={editForm.movementType} onChange={(e) => setEditForm({ ...editForm, movementType: e.target.value })}><option value="income">Entrada</option><option value="expense">Saída</option></select>
                  <input className="premium-input" value={editForm.eventName} onChange={(e) => setEditForm({ ...editForm, eventName: e.target.value })} />
                  <input className="premium-input" value={editForm.supplierName} onChange={(e) => setEditForm({ ...editForm, supplierName: e.target.value })} placeholder="Fornecedor" />
                  <select className="premium-input" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select>
                  <select className="premium-input" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}>{valueOptions.map((value) => <option key={value} value={value}>{money(value)}</option>)}</select>
                  <input className="premium-input" type="date" value={editForm.paymentDate} onChange={(e) => setEditForm({ ...editForm, paymentDate: e.target.value })} />
                  <select className="premium-input" value={editForm.discount} onChange={(e) => setEditForm({ ...editForm, discount: e.target.value })}><option value="0">R$ 0</option><option value="500">R$ 500</option><option value="1000">R$ 1.000</option><option value="2500">R$ 2.500</option><option value="5000">R$ 5.000</option></select>
                  <input className="premium-input" value={editForm.sponsorBank} onChange={(e) => setEditForm({ ...editForm, sponsorBank: e.target.value })} placeholder="Banco" />
                  <div className="flex gap-2"><button className="premium-button-primary" type="button" onClick={saveEdit}>Salvar</button><button className="premium-button-secondary" type="button" onClick={() => setEditingId('')}>Cancelar</button></div>
                </div>
              ) : (
                <><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><strong className={item.movement_type === 'expense' ? 'text-red-600' : 'text-emerald-600'}>{item.movement_type === 'expense' ? 'Saída' : 'Entrada'} - {item.sponsor_bank || item.supplier_name || 'Lançamento'} - {money(item.amount)}</strong><span className="text-xs font-black uppercase tracking-wide text-zinc-400">{item.payment_date || 'sem data'}</span></div><p className="mt-1 text-sm text-zinc-500">{item.event_name} | {item.category} | fornecedor: {item.supplier_name || '-'} | desconto: {money(item.discount)}</p><div className="mt-4 flex flex-wrap gap-2"><button className="premium-button-secondary text-xs" type="button" onClick={() => startEdit(item)}><Pencil size={14} /> Editar</button><button className="premium-button-secondary text-xs" type="button" onClick={() => removeItem(item)}><Trash2 size={14} /> Excluir</button></div></>
              )}
            </div>
          ))}
          {entries.length === 0 ? <p className="text-sm text-zinc-500">Nenhum lançamento registrado.</p> : null}
        </div>
      </section>
    </>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3"><p className="text-xs font-bold text-zinc-400">{label}</p><strong className={`mt-1 block text-sm ${tone}`}>{value}</strong></div>; }
