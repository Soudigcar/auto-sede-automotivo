'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';

function parseCurrency(value: string) {
  return Number(String(value || '0').replace(/\./g, '').replace(',', '.')) || 0;
}

export function EventSupportForm({ eventId, defaultEventName, onSaved }: { eventId: string; defaultEventName: string; onSaved?: () => void }) {
  const supabase = createClient();
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ bank: 'Bradesco', eventName: defaultEventName, amount: '', paymentDate: '', discount: '', category: 'Patrocínio' });

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { error } = await supabase.from('financial_entries').insert({
      event_id: eventId || null,
      event_name: form.eventName,
      movement_type: 'income',
      source_type: 'bank_sponsorship',
      sponsor_bank: form.bank,
      category: form.category,
      amount: parseCurrency(form.amount),
      discount: parseCurrency(form.discount),
      payment_date: form.paymentDate || null,
      status: 'paid'
    });
    if (error) {
      setMessage('Não foi possível salvar. Confirme se o SQL financeiro foi executado.');
      return;
    }
    setMessage('Entrada registrada com sucesso.');
    setForm({ bank: 'Bradesco', eventName: defaultEventName, amount: '', paymentDate: '', discount: '', category: 'Patrocínio' });
    onSaved?.();
  }

  return (
    <form onSubmit={save} className="premium-card p-6">
      <h2 className="text-2xl font-black text-zinc-950">Patrocínio do banco</h2>
      <p className="premium-muted mt-2 text-sm">Registre a entrada financeira do evento.</p>
      <div className="mt-5 grid gap-3">
        <select className="premium-input" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}>
          <option>Bradesco</option><option>Itaú</option><option>Santander</option><option>Banco do Brasil</option><option>Outro</option>
        </select>
        <input className="premium-input" placeholder="Nome do evento" value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} required />
        <input className="premium-input" placeholder="Patrocínio" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        <input className="premium-input" type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
        <input className="premium-input" placeholder="Desconto" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
        <select className="premium-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          <option>Patrocínio</option><option>Imposto</option><option>Fornecedor</option><option>Marketing</option><option>Outros</option>
        </select>
      </div>
      <button className="premium-button-primary mt-5 w-full" type="submit">Salvar entrada</button>
      {message ? <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p> : null}
    </form>
  );
}
