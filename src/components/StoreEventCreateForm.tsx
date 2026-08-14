'use client';

import { useEffect, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { EventSelectField } from '@/components/EventSelectField';

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'loja';
}

function portalLink(slug?: string) {
  if (!slug) return '';
  const redirectedFrom = encodeURIComponent(`/loja/${slug}`);
  if (typeof window === 'undefined') return `/login?redirectedFrom=${redirectedFrom}`;
  return `${window.location.origin}/login?redirectedFrom=${redirectedFrom}`;
}

function registrationPublicLink(token?: string) {
  if (!token) return '';
  if (typeof window === 'undefined') return `/cadastro-loja/${token}`;
  return `${window.location.origin}/cadastro-loja/${token}`;
}

function generatePublicToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  return `${Date.now()}${Math.random()}`.replace(/\D/g, '');
}

type StoreEventCreateFormProps = {
  onSaved?: () => void;
  mode?: 'portal' | 'event' | 'link';
  eventId?: string;
  onEventChange?: (eventId: string) => void;
};

const emptyForm = { selectedStoreId: '', storeName: '', responsibleName: '', phone: '', email: '' };

export function StoreEventCreateForm({ onSaved, mode = 'portal', eventId: controlledEventId = '', onEventChange }: StoreEventCreateFormProps) {
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [internalEventId, setInternalEventId] = useState('');
  const [registrationLink, setRegistrationLink] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [lastStore, setLastStore] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);

  const eventId = controlledEventId || internalEventId;

  function selectEvent(nextEventId: string) {
    setInternalEventId(nextEventId);
    onEventChange?.(nextEventId);
  }

  async function loadData() {
    const [{ data: eventRows }, { data: storeRows }] = await Promise.all([
      supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false }),
      supabase.from('stores').select('*').neq('status', 'deleted').order('store_name')
    ]);

    const nextEvents = eventRows || [];
    setEvents(nextEvents);
    setStores(storeRows || []);
    if (!eventId && nextEvents[0]?.id) selectEvent(nextEvents[0].id);
  }

  async function loadRegistrationLink(currentEventId: string) {
    if (!currentEventId || mode !== 'link') { setRegistrationLink(null); return; }
    setRegistrationLink(null);

    const { data } = await supabase.from('store_registration_links').select('*').eq('event_id', currentEventId).maybeSingle();
    if (data) { setRegistrationLink(data); return; }

    const { data: created } = await supabase.from('store_registration_links').insert({ event_id: currentEventId, public_token: generatePublicToken() }).select('*').single();
    setRegistrationLink(created || null);
  }

  useEffect(() => { loadData().catch(() => null); }, []);
  useEffect(() => { loadRegistrationLink(eventId).catch(() => setRegistrationLink(null)); }, [eventId, mode]);

  async function buildUniqueSlug(storeName: string) {
    const base = slugify(storeName);
    const { data } = await supabase.from('stores').select('slug').ilike('slug', `${base}%`);
    const used = new Set((data || []).map((item: any) => item.slug));
    if (!used.has(base)) return base;
    let count = 2;
    while (used.has(`${base}-${count}`)) count += 1;
    return `${base}-${count}`;
  }

  function chooseStore(storeId: string) {
    const store = stores.find((item) => item.id === storeId);
    if (!store) { setForm(emptyForm); return; }
    setForm({ selectedStoreId: store.id, storeName: store.store_name || '', responsibleName: store.responsible_name || '', phone: store.responsible_phone || '', email: store.responsible_email || '' });
  }

  async function copyLastLink() {
    const link = portalLink(lastStore?.slug);
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setMessage('Link de login da loja copiado.');
  }

  async function copyRegistrationLink() {
    const link = registrationPublicLink(registrationLink?.public_token);
    if (!link) { setMessage('Este evento ainda não possui link de cadastro.'); return; }
    await navigator.clipboard.writeText(link);
    setMessage('Link de cadastro do evento copiado.');
  }

  async function findExistingStore() {
    if (form.selectedStoreId) return stores.find((item) => item.id === form.selectedStoreId) || null;
    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedName = form.storeName.trim().toLowerCase();
    return stores.find((item) => {
      const sameEmail = normalizedEmail && String(item.responsible_email || '').trim().toLowerCase() === normalizedEmail;
      const sameName = normalizedName && String(item.store_name || '').trim().toLowerCase() === normalizedName;
      return sameEmail || sameName;
    }) || null;
  }

  async function savePermanentStore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Salvando loja permanente...');

    const existingStore = await findExistingStore();
    let store = existingStore;

    if (existingStore) {
      const { data, error } = await supabase.from('stores').update({
        store_name: form.storeName,
        responsible_name: form.responsibleName,
        responsible_phone: form.phone || null,
        responsible_email: form.email.trim().toLowerCase(),
        portal_enabled: true,
        status: 'active',
        updated_at: new Date().toISOString()
      }).eq('id', existingStore.id).select('*').single();
      if (error) { setMessage(error.message || 'Erro ao atualizar loja permanente.'); return; }
      store = data;
    } else {
      const slug = await buildUniqueSlug(form.storeName);
      const { data, error } = await supabase.from('stores').insert({
        event_id: null,
        store_name: form.storeName,
        slug,
        portal_enabled: true,
        responsible_name: form.responsibleName,
        responsible_phone: form.phone || null,
        responsible_email: form.email.trim().toLowerCase(),
        registration_source: 'master_portal',
        status: 'active'
      }).select('*').single();
      if (error) { setMessage(error.message || 'Erro ao criar loja permanente.'); return; }
      store = data;
    }

    setLastStore(store);
    setMessage(existingStore ? 'Loja permanente atualizada. Nenhum evento foi alterado.' : 'Loja permanente criada no Portal sem vínculo obrigatório com evento.');
    setForm(emptyForm);
    await loadData();
    onSaved?.();
  }

  async function linkStoreToEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedEvent = events.find((item) => item.id === eventId);
    if (!selectedEvent) { setMessage('Selecione o evento.'); return; }
    if (!form.selectedStoreId) { setMessage('Selecione uma loja já cadastrada no Portal.'); return; }

    const store = stores.find((item) => item.id === form.selectedStoreId);
    if (!store) { setMessage('Loja não encontrada.'); return; }

    const { data: currentParticipation } = await supabase
      .from('store_event_participations')
      .select('id,status')
      .eq('store_id', store.id)
      .eq('event_id', selectedEvent.id)
      .maybeSingle();

    if (currentParticipation?.status === 'active') {
      setMessage('Esta loja já participa deste evento. Nenhuma duplicidade foi criada.');
      return;
    }

    const { error } = await supabase.from('store_event_participations').upsert({
      store_id: store.id,
      event_id: selectedEvent.id,
      status: 'active',
      source: 'master',
      joined_at: new Date().toISOString(),
      ended_at: null,
      event_name_snapshot: selectedEvent.event_name || null,
      event_start_date_snapshot: selectedEvent.start_date || null,
      event_end_date_snapshot: selectedEvent.end_date || null,
      event_state_snapshot: selectedEvent.state || null,
      event_city_snapshot: selectedEvent.city || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'store_id,event_id' });

    if (error) { setMessage(error.message || 'Não foi possível vincular a loja ao evento.'); return; }

    setMessage(`${store.store_name} vinculada ao evento ${selectedEvent.event_name} sem duplicar o cadastro permanente.`);
    onSaved?.();
  }

  const lastLink = portalLink(lastStore?.slug);
  const publicRegistrationLink = registrationPublicLink(registrationLink?.public_token);

  if (mode === 'link') {
    return (
      <section className="premium-card p-6">
        <h2 className="text-2xl font-black text-zinc-950">Link para cadastro no evento</h2>
        <p className="mt-1 text-sm text-zinc-500">A revenda abre o link deste evento. Se já possuir cadastro, usa o acesso existente e o sistema adiciona somente a participação. Se for nova, cria a loja permanente e a participação no mesmo fluxo.</p>
        <div className="mt-5"><EventSelectField events={events} value={eventId} onChange={selectEvent} label="Evento do convite" /></div>
        <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Link público de participação</p>
          <p className="mt-2 break-all text-sm font-black text-zinc-800">{publicRegistrationLink || 'Gerando ou localizando o link deste evento...'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="premium-button-secondary text-xs" type="button" onClick={copyRegistrationLink}><Copy size={14} /> Copiar link</button>
            {publicRegistrationLink ? <a className="premium-button-secondary text-xs" href={publicRegistrationLink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir cadastro</a> : null}
          </div>
        </div>
        {message ? <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p> : null}
      </section>
    );
  }

  if (mode === 'event') {
    return (
      <form onSubmit={linkStoreToEvent} className="premium-card p-6">
        <h2 className="text-2xl font-black text-zinc-950">Vincular loja existente a evento</h2>
        <p className="mt-1 text-sm text-zinc-500">A loja continua única e permanente no Portal. Aqui você cria somente uma participação no evento selecionado.</p>
        <div className="mt-5 grid gap-3">
          <EventSelectField events={events} value={eventId} onChange={selectEvent} label="Evento da participação" />
          <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Loja permanente
            <select className="premium-input mt-1" value={form.selectedStoreId} onChange={(event) => chooseStore(event.target.value)} required>
              <option value="">Selecione uma loja cadastrada</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
            </select>
          </label>
          {form.selectedStoreId ? <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-sm font-bold text-zinc-600"><strong className="text-zinc-950">{form.storeName}</strong><br />{form.email || 'Sem e-mail informado'}<br />{form.phone || 'Sem telefone informado'}</div> : null}
        </div>
        <button className="premium-button-primary mt-5 w-full" type="submit">Vincular loja ao evento</button>
        {message ? <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p> : null}
      </form>
    );
  }

  return (
    <form onSubmit={savePermanentStore} className="premium-card p-6">
      <h2 className="text-2xl font-black text-zinc-950">Cadastrar loja permanente no Portal</h2>
      <p className="mt-1 text-sm text-zinc-500">Este cadastro não exige evento. A loja poderá usar o Portal, estoque, equipe, Pipeline e demais recursos e ser vinculada a eventos depois.</p>
      <div className="mt-5 grid gap-3">
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Loja já cadastrada
          <select className="premium-input mt-1" value={form.selectedStoreId} onChange={(event) => chooseStore(event.target.value)}>
            <option value="">Criar uma nova loja permanente</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
          </select>
        </label>
        <input className="premium-input" placeholder="Nome da loja" value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} required />
        <input className="premium-input" placeholder="Nome do responsável" value={form.responsibleName} onChange={(event) => setForm({ ...form, responsibleName: event.target.value })} required />
        <input className="premium-input" placeholder="Telefone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <input className="premium-input" type="email" placeholder="E-mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
      </div>
      <button className="premium-button-primary mt-5 w-full" type="submit">{form.selectedStoreId ? 'Atualizar loja permanente' : 'Criar loja permanente'}</button>
      {lastStore?.slug ? <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-zinc-400">Acesso permanente da loja</p><p className="mt-2 break-all text-sm font-black text-zinc-800">{lastLink}</p><div className="mt-3 flex flex-wrap gap-2"><button className="premium-button-secondary text-xs" type="button" onClick={copyLastLink}><Copy size={14} /> Copiar link</button><a className="premium-button-secondary text-xs" href={lastLink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir login</a></div></div> : null}
      {message ? <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p> : null}
    </form>
  );
}
