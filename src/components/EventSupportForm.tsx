'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

const valueOptions = [5000, 10000, 15000, 20000, 25000, 30000, 50000, 75000, 100000];
const categories = ['Patrocínio', 'Imposto', 'Fornecedor', 'Marketing', 'Estrutura', 'Comissão', 'Outros'];
const banks = ['Bradesco', 'Itaú', 'Santander', 'Banco do Brasil', 'Caixa', 'Outro'];

function currencyLabel(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

export function EventSupportForm({ eventId, defaultEventName, onSaved }: { eventId: string; defaultEventName: string; onSaved?: () => void }) {
  const supabase = createClient();
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    movementType: 'income',
    bank: 'Bradesco',
    eventName: defaultEventName,
    entryName: 'Patrocínio Bradesco',
    amount: '10000',
    paymentDate: '',
    discount: '0',
    category: 'Patrocínio',
    supplierName: 'Bradesco',
    notes: ''
  });

  useEffect(() => {
    setForm((current) => ({ ...current, eventName: defaultEventName }));
  }, [defaultEventName]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.amount || 0);
    const discount = Number(form.discount || 0);

    const { error } = await supabase.from('financial_entries').insert({
      event_id: eventId || null,
      event_name: form.eventName,
      movement_type: form.movementType,
      source_type: form.movementType === 'income' && form.category === 'Patrocínio' ? 'bank_sponsorship' : 'manual',
      sponsor_bank: form.movementType === 'income' && form.category === 'Patrocínio' ? form.bank : null,
      supplier_name: form.supplierName || null,
      category: form.category,
      amount,
      discount,
      payment_date: form.paymentDate || null,
      notes: form.entryName || form.notes ? `${form.entryName}${form.notes ? ` - ${form.notes}` : ''}` : null,
      status: 'paid'
    });

    if (error) {
      setMessage('Não foi possível salvar. Confirme se o SQL financeiro foi executado.');
      return;
    }

    setMessage(form.movementType === 'income' ? 'Entrada registrada com sucesso.' : 'Saída registrada com sucesso.');
    setForm({
      movementType: 'income',
      bank: 'Bradesco',
      eventName: defaultEventName,
      entryName: 'Patrocínio Bradesco',
      amount: '10000',
      paymentDate: '',
      discount: '0',
      category: 'Patrocínio',
      supplierName: 'Bradesco',
      notes: ''
    });
    onSaved?.();
  }

  return (
    <form onSubmit={save} className="premium-card p-6">
      <h2 className="text-2xl font-black text-zinc-950">Lançamento financeiro</h2>
      <p className="premium-muted mt-2 text-sm">Cadastre entradas, saídas, patrocínios, impostos, fornecedores e demais custos do evento.</p>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Tipo
          <select className="premium-input mt-1" value={form.movementType} onChange={(e) => setForm({ ...form, movementType: e.target.value })}>
            <option value="income">Entrada</option>
            <option value="expense">Saída</option>
          </select>
        </label>

        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Nome
          <input className="premium-input mt-1" placeholder="Ex: Patrocínio Bradesco" value={form.entryName} onChange={(e) => setForm({ ...form, entryName: e.target.value })} required />
        </label>

        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Categoria
          <select className="premium-input mt-1" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>

        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Valor
          <select className="premium-input mt-1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}>
            {valueOptions.map((value) => <option key={value} value={value}>{currencyLabel(value)}</option>)}
          </select>
        </label>

        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Data
          <input className="premium-input mt-1" type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
        </label>

        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Fornecedor / Banco
          <input className="premium-input mt-1" placeholder="Ex: Bradesco, fornecedor, prestador" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
        </label>

        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Banco patrocinador
          <select className="premium-input mt-1" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}>
            {banks.map((bank) => <option key={bank}>{bank}</option>)}
          </select>
        </label>

        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Desconto
          <select className="premium-input mt-1" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })}>
            <option value="0">R$ 0</option>
            <option value="500">R$ 500</option>
            <option value="1000">R$ 1.000</option>
            <option value="2500">R$ 2.500</option>
            <option value="5000">R$ 5.000</option>
          </select>
        </label>

        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Nome do evento
          <input className="premium-input mt-1" value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} required />
        </label>
      </div>

      <textarea className="premium-input mt-3 min-h-24" placeholder="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <button className="premium-button-primary mt-5 w-full" type="submit">Salvar lançamento</button>
      {message ? <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p> : null}
    </form>
  );
}
