'use client';

import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function dateText(value?: string) {
  return value ? value.split('-').reverse().join('/') : '-';
}

export function EventListManager({ refreshKey = 0 }: { refreshKey?: number }) {
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState({
    eventName: '',
    startDate: '',
    endDate: '',
    state: '',
    city: '',
    location: '',
    sponsorBank: '',
    liveUrl: ''
  });

  async function loadData() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .neq('status', 'deleted')
      .order('created_at', { ascending: false });

    setEvents(data || []);
  }

  useEffect(() => {
    loadData().catch(() => null);
  }, [refreshKey]);

  function startEdit(item: any) {
    setEditingId(item.id);
    setForm({
      eventName: item.event_name || '',
      startDate: item.start_date || '',
      endDate: item.end_date || '',
      state: item.state || '',
      city: item.city || '',
      location: item.location || '',
      sponsorBank: item.sponsor_bank || 'Bradesco',
      liveUrl: item.live_url || ''
    });
  }

  async function saveEdit() {
    const { error } = await supabase
      .from('events')
      .update({
        event_name: form.eventName,
        start_date: form.startDate || null,
        end_date: form.endDate || form.startDate || null,
        state: form.state || null,
        city: form.city || null,
        location: form.location || null,
        sponsor_bank: form.sponsorBank || null,
        live_url: form.liveUrl || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingId);

    if (error) {
      setMessage('Erro ao editar evento.');
      return;
    }

    setEditingId('');
    setMessage('Evento editado com sucesso.');
    await loadData();
  }

  async function removeEvent(item: any) {
    const confirmation = window.prompt(
      `Excluir o evento ${item.event_name}? Todos os dados vinculados serão apagados. Digite EXCLUIR para confirmar.`
    );

    if (confirmation !== 'EXCLUIR') return;

    const response = await fetch('/api/master/events/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: item.id, confirmation })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(result.error || 'Erro ao excluir evento.');
      return;
    }

    setMessage('Evento e dados vinculados excluídos.');
    await loadData();
  }

  return (
    <section className="premium-card p-6">
      <h2 className="text-2xl font-black text-zinc-950">Eventos cadastrados</h2>
      <p className="mt-1 text-sm text-zinc-500">Listagem operacional com edição e exclusão definitiva.</p>

      <div className="mt-5 space-y-3">
        {events.map((item) => (
          <div key={item.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            {editingId === item.id ? (
              <div className="grid gap-3 md:grid-cols-2">
                <input className="premium-input md:col-span-2" value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} />

                <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                  Data inicial
                  <input className="premium-input mt-1" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </label>

                <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                  Data final
                  <input className="premium-input mt-1" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </label>

                <input className="premium-input" placeholder="Estado" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                <input className="premium-input" placeholder="Cidade" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <input className="premium-input md:col-span-2" placeholder="Local do evento" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />

                <select className="premium-input" value={form.sponsorBank} onChange={(e) => setForm({ ...form, sponsorBank: e.target.value })}>
                  <option>Bradesco</option>
                  <option>Itaú</option>
                  <option>Santander</option>
                  <option>Banco do Brasil</option>
                  <option>Outro</option>
                </select>

                <input className="premium-input" placeholder="Link" value={form.liveUrl} onChange={(e) => setForm({ ...form, liveUrl: e.target.value })} />

                <button className="premium-button-primary" type="button" onClick={saveEdit}>Salvar edição</button>
                <button className="premium-button-secondary" type="button" onClick={() => setEditingId('')}>Cancelar</button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h3 className="font-black text-zinc-950">{item.event_name}</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      {item.state || '-'} | {item.city || '-'} | {dateText(item.start_date)} até {dateText(item.end_date)}
                    </p>
                    <p className="mt-1 text-xs font-bold text-zinc-400">
                      Banco: {item.sponsor_bank || '-'} | Local: {item.location || '-'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="premium-button-secondary text-xs" type="button" onClick={() => startEdit(item)}>
                    <Pencil size={14} /> Editar
                  </button>

                  <button className="premium-button-secondary text-xs" type="button" onClick={() => removeEvent(item)}>
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {events.length === 0 ? <p className="text-sm text-zinc-500">Nenhum evento cadastrado.</p> : null}
      </div>

      {message ? (
        <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p>
      ) : null}
    </section>
  );
}
