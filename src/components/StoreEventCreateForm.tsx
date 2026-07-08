'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { EventSelectField } from '@/components/EventSelectField';

export function StoreEventCreateForm({ onSaved }: { onSaved?: () => void }) {
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [eventId, setEventId] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ storeName: '', responsibleName: '', phone: '', email: '' });

  async function loadEvents() {
    const { data } = await supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false });
    const rows = data || [];
    setEvents(rows);
    if (!eventId && rows[0]?.id) setEventId(rows[0].id);
  }

  useEffect(() => { loadEvents().catch(() => null); }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
const selectedEvent = events.find((item) => item.id === eventId);

    if (!selectedEvent) {
      setMessage('Selecione o evento.');
      return;
    }

    const { error } = await supabase.from('stores').insert({
      event_id: eventId,
      store_name: form.storeName,
      responsible_name: form.responsibleName,
      responsible_phone: form.phone,
      responsible_email: form.email,
      event_name_snapshot: selectedEvent.event_name || null,
      event_start_date_snapshot: selectedEvent.start_date || null,
      event_end_date_snapshot: selectedEvent.end_date || null,
      event_state_snapshot: selectedEvent.state || null,
      event_city_snapshot: selectedEvent.city || null,
      status: 'active'
    });

if (error) {
      setMessage('Erro ao cadastrar loja no evento. Rode o SQL de histórico de lojas no Supabase.');
      return;
    }

    setMessage('Loja cadastrada e vinculada ao evento.');
    setForm({ storeName: '', responsibleName: '', phone: '', email: '' });
    onSaved?.();
  }

  return (
    <form onSubmit={save} className="premium-card p-6">
      <h2 className="text-2xl font-black text-zinc-950">Cadastrar loja no evento</h2>

      <div className="mt-5 grid gap-3">
        <EventSelectField events={events} value={eventId} onChange={setEventId} label="Evento da loja" />

        <input
          className="premium-input"
          placeholder="Nome da loja"
          value={form.storeName}
          onChange={(e) => setForm({ ...form, storeName: e.target.value })}
          required
        />

        <input
          className="premium-input"
          placeholder="Nome do responsável"
          value={form.responsibleName}
          onChange={(e) => setForm({ ...form, responsibleName: e.target.value })}
          required
        />

        <input
          className="premium-input"
          placeholder="Telefone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <input
          className="premium-input"
          placeholder="E-mail"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
      </div>

      <button className="premium-button-primary mt-5 w-full" type="submit">
        Vincular loja ao evento
      </button>

      {message ? (
        <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p>
      ) : null}
    </form>
  );
}
