'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3 } from 'lucide-react';
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
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(eventId);

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
    notes: '',
    paymentStatus: 'paid'
  });

  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const minDate = selectedEvent?.start_date || '2024-01-01';
  const maxDate = selectedEvent?.end_date || '2035-12-31';

  async function loadEvents() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .neq('status', 'deleted')
      .order('created_at', { ascending: false });

    const rows = data || [];
    setEvents(rows);

    if (!selectedEventId && rows[0]?.id) {
      setSelectedEventId(rows[0].id);
      setForm((current) => ({
        ...current,
        eventName: rows[0].event_name,
        bank: rows[0].sponsor_bank || current.bank,
        supplierName: rows[0].sponsor_bank || current.supplierName
      }));
    }
  }

  useEffect(() => {
    loadEvents().catch(() => null);
  }, []);

  useEffect(() => {
    if (eventId) setSelectedEventId(eventId);
    setForm((current) => ({ ...current, eventName: defaultEventName }));
  }, [eventId, defaultEventName]);

  function changeSelectedEvent(id: string) {
    const item = events.find((event) => event.id === id);
    setSelectedEventId(id);

    if (item) {
      setForm({
        ...form,
        eventName: item.event_name,
        bank: item.sponsor_bank || form.bank,
        supplierName: item.sponsor_bank || form.supplierName,
        paymentDate: ''
      });
    }
  }

  function validateDate() {
    if (!form.paymentDate) {
      setMessage('Informe a data do lançamento.');
      return false;
    }

    const year = Number(form.paymentDate.slice(0, 4));

    if (!year || year < 2024 || year > 2035) {
      setMessage('Data inválida. Use uma data entre 2024 e 2035.');
      return false;
    }

    if (selectedEvent?.start_date && form.paymentDate < selectedEvent.start_date) {
      setMessage(`A data não pode ser anterior ao início do evento: ${selectedEvent.start_date}.`);
      return false;
    }

    if (selectedEvent?.end_date && form.paymentDate > selectedEvent.end_date) {
      setMessage(`A data não pode ser posterior ao fim do evento: ${selectedEvent.end_date}.`);
      return false;
    }

    return true;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateDate()) return;

    const amount = Number(form.amount || 0);
    const discount = Number(form.discount || 0);

    const { error } = await supabase.from('financial_entries').insert({
      event_id: selectedEventId || eventId || null,
      event_name: form.eventName,
      movement_type: form.movementType,
      source_type: form.movementType === 'income' && form.category === 'Patrocínio' ? 'bank_sponsorship' : 'manual',
      sponsor_bank: form.movementType === 'income' && form.category === 'Patrocínio' ? form.bank : null,
      supplier_name: form.supplierName || null,
      category: form.category,
      amount,
      discount,
      payment_date: form.paymentDate,
      notes: form.entryName || form.notes ? `${form.entryName}${form.notes ? ` - ${form.notes}` : ''}` : null,
      status: form.paymentStatus
    });

    if (error) {
      setMessage('Não foi possível salvar. Confirme se o SQL financeiro foi executado.');
      return;
    }

    setMessage(form.paymentStatus === 'paid' ? 'Lançamento salvo como pago e entrou no caixa realizado.' : 'Lançamento salvo como pendente e ficou somente como previsão.');

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
      notes: '',
      paymentStatus: 'paid'
    });

    await loadEvents();
    onSaved?.();
  }

  return (
    <form onSubmit={save} className="premium-card p-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-2xl font-black text-zinc-950">Lançamento financeiro</h2>
          <p className="premium-muted mt-2 text-sm">Pago entra no caixa realizado. Pendente entra somente como previsão.</p>
        </div>

        <div className="flex rounded-2xl border border-zinc-200 bg-zinc-50 p-1">
          <button type="button" onClick={() => setForm({ ...form, paymentStatus: 'paid' })} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${form.paymentStatus === 'paid' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-zinc-500 hover:bg-white'}`}>
            <CheckCircle2 size={18} /> Pago
          </button>
          <button type="button" onClick={() => setForm({ ...form, paymentStatus: 'pending' })} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${form.paymentStatus === 'pending' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-zinc-500 hover:bg-white'}`}>
            <Clock3 size={18} /> Pendente
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Evento
          <select className="premium-input mt-1" value={selectedEventId} onChange={(e) => changeSelectedEvent(e.target.value)}>
            {events.map((item) => <option key={item.id} value={item.id}>{item.event_name}</option>)}
          </select>
        </label>

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
          <input className="premium-input mt-1" type="date" min={minDate} max={maxDate} value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
        </label>

        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Fornecedor / Banco
          <input className="premium-input mt-1" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
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
      </div>

      <textarea className="premium-input mt-3 min-h-24" placeholder="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

      <button className="premium-button-primary mt-5 w-full" type="submit">Salvar lançamento</button>
      {message ? <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p> : null}
    </form>
  );
}
