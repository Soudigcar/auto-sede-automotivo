'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'evento';
}

export function EventCreateForm({ onSaved }: { onSaved?: () => void }) {
  const supabase = createClient();
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    eventName: '',
    startDate: '',
    endDate: '',
    state: '',
    city: '',
    location: '',
    sponsorBank: 'Bradesco',
    liveUrl: ''
  });

  async function buildUniqueSlug(eventName: string) {
    const baseSlug = slugify(eventName);
    let candidate = baseSlug;
    let counter = 2;

    while (counter <= 20) {
      const { data, error } = await supabase
        .from('events')
        .select('id')
        .eq('slug', candidate)
        .maybeSingle();

      if (error) {
        return `${baseSlug}-${Date.now().toString(36)}`;
      }

      if (!data) return candidate;

      candidate = `${baseSlug}-${counter}`;
      counter += 1;
    }

    return `${baseSlug}-${Date.now().toString(36)}`;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const eventName = form.eventName.trim();

    if (!eventName) {
      setMessage('Informe o nome do evento.');
      return;
    }

    setIsSaving(true);
    setMessage('Salvando evento...');

    const slug = await buildUniqueSlug(eventName);

    const { error } = await supabase.from('events').insert({
      event_name: eventName,
      slug,
      start_date: form.startDate || null,
      end_date: form.endDate || form.startDate || null,
      state: form.state.trim() || null,
      city: form.city.trim() || null,
      location: form.location.trim() || null,
      sponsor_bank: form.sponsorBank || null,
      live_url: form.liveUrl.trim() || null,
      status: 'active',
      store_registration_enabled: true
    });

    setIsSaving(false);

    if (error) {
      setMessage(`Erro ao cadastrar evento: ${error.message}`);
      return;
    }

    setMessage('Evento cadastrado com sucesso.');
    setForm({
      eventName: '',
      startDate: '',
      endDate: '',
      state: '',
      city: '',
      location: '',
      sponsorBank: 'Bradesco',
      liveUrl: ''
    });

    if (onSaved) onSaved();
    else window.location.reload();
  }

  return (
    <form onSubmit={save} className="premium-card p-6">
      <div className="flex items-center gap-3">
        <Plus className="text-red-600" />
        <div>
          <h2 className="text-2xl font-black text-zinc-950">Cadastrar evento</h2>
          <p className="mt-1 text-sm text-zinc-500">Informe período, estado, cidade, banco e transmissão.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <input
          className="premium-input md:col-span-2"
          placeholder="Nome do evento"
          value={form.eventName}
          onChange={(e) => setForm({ ...form, eventName: e.target.value })}
          required
        />

        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">
          Data inicial
          <input
            className="premium-input mt-1"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
        </label>

        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">
          Data final
          <input
            className="premium-input mt-1"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
          />
        </label>

        <input
          className="premium-input"
          placeholder="Estado"
          value={form.state}
          onChange={(e) => setForm({ ...form, state: e.target.value })}
        />

        <input
          className="premium-input"
          placeholder="Cidade"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />

        <input
          className="premium-input md:col-span-2"
          placeholder="Local do evento"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />

        <select
          className="premium-input"
          value={form.sponsorBank}
          onChange={(e) => setForm({ ...form, sponsorBank: e.target.value })}
        >
          <option>Bradesco</option>
          <option>Itaú</option>
          <option>Santander</option>
          <option>Banco do Brasil</option>
          <option>Outro</option>
        </select>

        <input
          className="premium-input"
          placeholder="Link do YouTube/transmissão"
          value={form.liveUrl}
          onChange={(e) => setForm({ ...form, liveUrl: e.target.value })}
        />
      </div>

      <button className="premium-button-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSaving}>
        {isSaving ? 'Cadastrando...' : 'Cadastrar evento'}
      </button>

      {message ? (
        <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p>
      ) : null}
    </form>
  );
}
