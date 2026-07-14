'use client';

import { useEffect, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { EventSelectField } from '@/components/EventSelectField';

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'loja';
}

function portalLink(slug?: string) {
  if (!slug) return '';
  if (typeof window === 'undefined') return `/loja/${slug}`;
  return `${window.location.origin}/loja/${slug}`;
}

export function StoreEventCreateForm({ onSaved }: { onSaved?: () => void }) {
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [eventId, setEventId] = useState('');
  const [message, setMessage] = useState('');
  const [lastStore, setLastStore] = useState<any>(null);
  const [form, setForm] = useState({ storeName: '', responsibleName: '', phone: '', email: '' });

  async function loadEvents() {
    const { data } = await supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false });
    const rows = data || [];
    setEvents(rows);
    if (!eventId && rows[0]?.id) setEventId(rows[0].id);
  }

  useEffect(() => { loadEvents().catch(() => null); }, []);

  async function buildUniqueSlug(storeName: string) {
    const base = slugify(storeName);
    const { data } = await supabase
      .from('stores')
      .select('slug')
      .ilike('slug', `${base}%`);

    const used = new Set((data || []).map((item: any) => item.slug));
    if (!used.has(base)) return base;

    let count = 2;
    while (used.has(`${base}-${count}`)) count += 1;

    return `${base}-${count}`;
  }

  async function copyLastLink() {
    const link = portalLink(lastStore?.slug);
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setMessage('Link do portal da loja copiado.');
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const selectedEvent = events.find((item) => item.id === eventId);

    if (!selectedEvent) {
      setMessage('Selecione o evento.');
      return;
    }

    const slug = await buildUniqueSlug(form.storeName);

    const { data, error } = await supabase.from('stores').insert({
      event_id: eventId,
      store_name: form.storeName,
      slug,
      portal_enabled: true,
      responsible_name: form.responsibleName,
      responsible_phone: form.phone,
      responsible_email: form.email,
      event_name_snapshot: selectedEvent.event_name || null,
      event_start_date_snapshot: selectedEvent.start_date || null,
      event_end_date_snapshot: selectedEvent.end_date || null,
      event_state_snapshot: selectedEvent.state || null,
      event_city_snapshot: selectedEvent.city || null,
      status: 'active'
    }).select('*').single();

    if (error) {
      setMessage('Erro ao cadastrar loja no evento. Confirme se o SQL do portal da loja foi executado.');
      return;
    }

    setLastStore(data);
    setMessage('Loja cadastrada e vinculada ao evento. Link do portal gerado abaixo.');
    setForm({ storeName: '', responsibleName: '', phone: '', email: '' });
    onSaved?.();
  }

  const lastLink = portalLink(lastStore?.slug);

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

      {lastStore?.slug ? (
        <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Link do portal da loja</p>
          <p className="mt-2 break-all text-sm font-black text-zinc-800">{lastLink}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="premium-button-secondary text-xs" type="button" onClick={copyLastLink}>
              <Copy size={14} /> Copiar link
            </button>

            <a className="premium-button-secondary text-xs" href={lastLink} target="_blank">
              <ExternalLink size={14} /> Abrir portal
            </a>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p>
      ) : null}
    </form>
  );
}
