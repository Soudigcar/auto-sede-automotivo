'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase';

export function EventCreateForm({ onSaved }: { onSaved?: () => void }) {
  const supabase = createClient();
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ eventName: '', startDate: '', endDate: '', state: '', city: '', location: '', sponsorBank: 'Bradesco', liveUrl: '' });

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { error } = await supabase.from('events').insert({
      event_name: form.eventName,
      start_date: form.startDate || null,
      end_date: form.endDate || form.startDate || null,
      state: form.state || null,
      city: form.city || null,
      location: form.location || null,
      sponsor_bank: form.sponsorBank || null,
      live_url: form.liveUrl || null,
      status: 'active'
    });

    if (error) {
      setMessage('Erro ao cadastrar evento. Rode o SQL events-location-fields no Supabase.');
      return;
    }

    setMessage('Evento cadastrado com período, estado e cidade.');
    setForm({ eventName: '', startDate: '', endDate: '', state: '', city: '', location: '', sponsorBank: 'Bradesco', liveUrl: '' });
    onSaved?.();
  }

  return (
    <form onSubmit={save} className="premium-card p-6">
      <div className="flex items-center gap-3"><Plus className="text-red-600" /><h2 className="text-2xl font-black text-zinc-950">Cadastrar evento</h2></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <input className="premium-input" placeholder="Nome do evento" value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} required />
        <select className="premium-input" value={form.sponsorBank} onChange={(e) => setForm({ ...form, sponsorBank: e.target.value })}>
          <option>Bradesco</option><option>Itaú</option><option>Santander</option><option>Banco do Brasil</option><option>Outro</option>
        </select>
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Data inicial<input className="premium-input mt-1" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Data final<input className="premium-input mt-1" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
        <input className="premium-input" placeholder="Estado" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
        <input className="premium-input" placeholder="Cidade" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <input className="premium-input md:col-span-2" placeholder="Local do evento" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <input className="premium-input md:col-span-2" placeholder="Link do YouTube ou transmissão" value={form.liveUrl} onChange={(e) => setForm({ ...form, liveUrl: e.target.value })} />
      </div>
      <button className="premium-button-primary mt-5 w-full" type="submit">Cadastrar evento</button>
      {message ? <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p> : null}
    </form>
  );
}
