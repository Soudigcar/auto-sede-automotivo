'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Eye, EyeOff, KeyRound, Link2, Pencil, Search, Unlink, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { EventSelectField } from '@/components/EventSelectField';

function normalize(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function dateText(value?: string) {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function portalLink(slug?: string) {
  if (!slug) return '';
  const redirectedFrom = encodeURIComponent(`/loja/${slug}`);
  if (typeof window === 'undefined') return `/login?redirectedFrom=${redirectedFrom}`;
  return `${window.location.origin}/login?redirectedFrom=${redirectedFrom}`;
}

function eventIsActive(event: any) {
  const status = normalize(event?.status);
  if (['inactive', 'inativo', 'closed', 'encerrado', 'deleted', 'excluido'].includes(status)) return false;
  if (event?.end_date) {
    const end = new Date(`${event.end_date}T23:59:59`);
    if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) return false;
  }
  return true;
}

function validStore(store: any) {
  return !['deleted', 'excluido'].includes(normalize(store?.status));
}

function validVehicle(vehicle: any) {
  return vehicle?.show_on_landing !== false && !['deleted', 'excluido', 'oculto', 'vendido'].includes(normalize(vehicle?.status));
}

function validSubmission(item: any) {
  if (item?.metadata?.store_removed === true) return false;
  return ['published', 'imported'].includes(normalize(item?.status)) || Boolean(item?.imported_vehicle_id);
}

type Props = { refreshKey?: number; eventId?: string; onEventChange?: (eventId: string) => void };

export function PermanentStoresByEventList({ refreshKey = 0, eventId: controlledEventId = '', onEventChange }: Props) {
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [participations, setParticipations] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [siteVehicles, setSiteVehicles] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [internalEventId, setInternalEventId] = useState('');
  const [search, setSearch] = useState('');
  const [eventStatus, setEventStatus] = useState('all');
  const [storeStatus, setStoreStatus] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState('');
  const [passwordLoadingId, setPasswordLoadingId] = useState('');
  const [passwordResult, setPasswordResult] = useState<any>(null);
  const [form, setForm] = useState({ storeName: '', responsibleName: '', phone: '', email: '', websiteUrl: '', state: '', city: '' });

  const eventId = controlledEventId || internalEventId;

  function selectEvent(next: string) {
    setInternalEventId(next);
    onEventChange?.(next);
  }

  async function loadData() {
    const [eventResult, storeResult, participationResult, saleResult, vehicleResult, submissionResult] = await Promise.all([
      supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false }),
      supabase.from('stores').select('*').order('store_name'),
      supabase.from('store_event_participations').select('*').order('created_at', { ascending: false }),
      supabase.from('sales').select('*'),
      supabase.from('site_vehicles').select('*'),
      supabase.from('store_vehicle_link_submissions').select('*')
    ]);

    const eventRows = eventResult.data || [];
    setEvents(eventRows);
    setStores((storeResult.data || []).filter(validStore));
    setParticipations(participationResult.data || []);
    setSales(saleResult.data || []);
    setSiteVehicles(vehicleResult.data || []);
    setSubmissions(submissionResult.data || []);
    if (!eventId && eventRows[0]?.id) selectEvent(eventRows[0].id);
  }

  useEffect(() => { loadData().catch(() => setMessage('Erro ao carregar lojas e participações.')); }, [refreshKey]);

  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const storesById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const activeEvents = events.filter(eventIsActive).length;
  const inactiveEvents = events.length - activeEvents;

  const selectedParticipationIds = useMemo(() => new Set(
    participations.filter((item) => item.event_id === eventId && !['removed', 'declined'].includes(item.status)).map((item) => item.store_id)
  ), [participations, eventId]);

  function eventPasses(event: any) {
    if (!event) return false;
    if (eventStatus === 'active' && !eventIsActive(event)) return false;
    if (eventStatus === 'inactive' && eventIsActive(event)) return false;
    if (startDate && event.end_date && event.end_date < startDate) return false;
    if (endDate && event.start_date && event.start_date > endDate) return false;
    return true;
  }

  function storePasses(store: any, event?: any) {
    const active = normalize(store.status) === 'active';
    if (storeStatus === 'active' && !active) return false;
    if (storeStatus === 'inactive' && active) return false;
    if (event && !eventPasses(event)) return false;
    const term = normalize(search);
    if (!term) return true;
    const haystack = normalize([store.store_name, store.responsible_name, store.responsible_phone, store.responsible_email, store.city, store.state, event?.event_name, event?.city].filter(Boolean).join(' '));
    return haystack.includes(term);
  }

  const selectedStores = useMemo(() => {
    const event = eventsById.get(eventId);
    if (!event || !eventPasses(event)) return [];
    return stores.filter((store) => selectedParticipationIds.has(store.id) && storePasses(store, event));
  }, [stores, selectedParticipationIds, eventId, eventsById, search, eventStatus, storeStatus, startDate, endDate]);

  const otherStores = useMemo(() => stores.filter((store) => !selectedParticipationIds.has(store.id) && storePasses(store)), [stores, selectedParticipationIds, search, storeStatus]);

  const stockByStore = useMemo(() => {
    const result = new Map<string, Set<string>>();
    siteVehicles.filter(validVehicle).forEach((vehicle) => {
      if (!vehicle.store_id) return;
      if (!result.has(vehicle.store_id)) result.set(vehicle.store_id, new Set());
      result.get(vehicle.store_id)?.add(vehicle.id);
    });
    submissions.filter(validSubmission).forEach((item) => {
      if (!item.store_id) return;
      if (!result.has(item.store_id)) result.set(item.store_id, new Set());
      result.get(item.store_id)?.add(item.imported_vehicle_id || item.id);
    });
    return result;
  }, [siteVehicles, submissions]);

  function startEdit(store: any) {
    setEditingId(store.id);
    setForm({ storeName: store.store_name || '', responsibleName: store.responsible_name || '', phone: store.responsible_phone || '', email: store.responsible_email || '', websiteUrl: store.website_url || '', state: store.state || '', city: store.city || '' });
  }

  async function saveEdit(store: any) {
    const { error } = await supabase.from('stores').update({
      store_name: form.storeName,
      responsible_name: form.responsibleName,
      responsible_phone: form.phone || null,
      responsible_email: form.email.trim().toLowerCase() || null,
      website_url: form.websiteUrl || null,
      state: form.state || null,
      city: form.city || null,
      updated_at: new Date().toISOString()
    }).eq('id', store.id);
    if (error) { setMessage(error.message || 'Erro ao editar loja.'); return; }
    setEditingId('');
    setMessage('Dados permanentes da loja atualizados.');
    await loadData();
  }

  async function linkStore(store: any) {
    const event = eventsById.get(eventId);
    if (!event) { setMessage('Selecione um evento.'); return; }
    const { error } = await supabase.from('store_event_participations').upsert({
      store_id: store.id,
      event_id: event.id,
      status: 'active',
      source: 'master',
      joined_at: new Date().toISOString(),
      ended_at: null,
      event_name_snapshot: event.event_name || null,
      event_start_date_snapshot: event.start_date || null,
      event_end_date_snapshot: event.end_date || null,
      event_state_snapshot: event.state || null,
      event_city_snapshot: event.city || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'store_id,event_id' });
    setMessage(error ? error.message || 'Erro ao vincular loja.' : 'Loja vinculada ao evento sem criar novo cadastro.');
    if (!error) await loadData();
  }

  async function unlinkStore(store: any) {
    const confirmed = window.confirm(`Remover ${store.store_name} apenas deste evento? A loja continuará no portal e o histórico será preservado.`);
    if (!confirmed) return;
    const { error } = await supabase.from('store_event_participations').update({ status: 'removed', ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('store_id', store.id).eq('event_id', eventId);
    setMessage(error ? 'Erro ao remover participação.' : 'Participação encerrada. A loja permanente continua ativa.');
    if (!error) await loadData();
  }

  async function togglePortal(store: any) {
    const enabled = !store.portal_enabled;
    const { error } = await supabase.from('stores').update({ portal_enabled: enabled, updated_at: new Date().toISOString() }).eq('id', store.id);
    setMessage(error ? 'Erro ao alterar visibilidade no portal.' : enabled ? 'Loja publicada no portal.' : 'Loja ocultada do portal, sem perder histórico.');
    if (!error) await loadData();
  }

  async function generatePassword(store: any) {
    setPasswordLoadingId(store.id);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setMessage('Sessão expirada.'); setPasswordLoadingId(''); return; }
    const response = await fetch('/api/master/store-password', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ store_id: store.id }) });
    const result = await response.json().catch(() => ({}));
    setPasswordLoadingId('');
    if (!response.ok) { setMessage(result.error || 'Erro ao gerar senha.'); return; }
    setPasswordResult(result);
    setMessage('Nova senha gerada. Copie antes de fechar.');
  }

  async function copyPortal(store: any) {
    const link = portalLink(store.slug);
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setMessage('Link permanente da loja copiado.');
  }

  async function copyPassword() {
    if (!passwordResult?.password) return;
    await navigator.clipboard.writeText(`Loja: ${passwordResult.store_name}\nLogin: ${passwordResult.email}\nSenha: ${passwordResult.password}\nPortal: ${window.location.origin}${passwordResult.portal_path}`);
    setMessage('Acesso completo copiado.');
  }

  function clearFilters() {
    setSearch(''); setEventStatus('all'); setStoreStatus('all'); setStartDate(''); setEndDate('');
  }

  function renderStore(store: any, selected: boolean) {
    const history = participations.filter((item) => item.store_id === store.id);
    const stock = stockByStore.get(store.id)?.size || 0;
    const sold = sales.filter((sale) => sale.store_id === store.id && (!selected || sale.event_id === eventId) && normalize(sale.status) !== 'cancelled').length;
    const link = portalLink(store.slug);

    return (
      <article key={store.id} className="rounded-[24px] border border-zinc-100 bg-zinc-50 p-5">
        {editingId === store.id ? (
          <div className="grid gap-3 md:grid-cols-2">
            <input className="premium-input md:col-span-2" value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} placeholder="Nome da loja" />
            <input className="premium-input" value={form.responsibleName} onChange={(event) => setForm({ ...form, responsibleName: event.target.value })} placeholder="Responsável" />
            <input className="premium-input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Telefone" />
            <input className="premium-input md:col-span-2" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="E-mail" />
            <input className="premium-input" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} placeholder="Estado" />
            <input className="premium-input" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Cidade" />
            <input className="premium-input md:col-span-2" value={form.websiteUrl} onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })} placeholder="Site" />
            <button className="premium-button-primary" type="button" onClick={() => saveEdit(store)}>Salvar loja</button>
            <button className="premium-button-secondary" type="button" onClick={() => setEditingId('')}>Cancelar</button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-black text-zinc-950">{store.store_name}</h3><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${store.portal_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>{store.portal_enabled ? 'No portal' : 'Oculta'}</span></div>
                <p className="mt-2 text-sm text-zinc-500">{store.responsible_name || '-'} · {store.responsible_phone || '-'} · {store.responsible_email || '-'}</p>
                <p className="mt-1 text-xs font-bold text-zinc-400">{store.city || '-'} / {store.state || '-'} · Cadastro permanente</p>
              </div>
              <div className="grid grid-cols-2 gap-2"><Mini label="Estoque portal" value={String(stock)} /><Mini label={selected ? 'Vendas no evento' : 'Vendas totais'} value={String(sold)} /></div>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-100 bg-white p-3"><p className="text-xs font-black uppercase tracking-wide text-zinc-400">Acesso permanente</p><p className="mt-1 break-all text-xs font-bold text-zinc-600">{link || 'Slug não disponível'}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="premium-button-secondary text-xs" onClick={() => copyPortal(store)}><Copy size={14} /> Copiar</button>{link ? <a href={link} target="_blank" rel="noreferrer" className="premium-button-secondary text-xs"><ExternalLink size={14} /> Abrir</a> : null}</div></div>

            {history.length ? <div className="mt-4 rounded-2xl border border-zinc-100 bg-white p-3"><p className="text-xs font-black uppercase tracking-wide text-zinc-400">Histórico de participação</p><div className="mt-2 space-y-2">{history.map((item) => { const event = eventsById.get(item.event_id); const eventSales = sales.filter((sale) => sale.store_id === store.id && sale.event_id === item.event_id && normalize(sale.status) !== 'cancelled').length; return <p key={item.id} className="text-sm text-zinc-600"><strong>{event?.event_name || item.event_name_snapshot || 'Evento'}</strong> · {dateText(event?.start_date || item.event_start_date_snapshot)} até {dateText(event?.end_date || item.event_end_date_snapshot)} · {eventSales} venda(s) · {item.status}</p>; })}</div></div> : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {!selected ? <button type="button" onClick={() => linkStore(store)} className="premium-button-primary text-xs"><Link2 size={14} /> Vincular ao evento</button> : <button type="button" onClick={() => unlinkStore(store)} className="premium-button-secondary text-xs"><Unlink size={14} /> Remover do evento</button>}
              <button type="button" onClick={() => startEdit(store)} className="premium-button-secondary text-xs"><Pencil size={14} /> Editar loja</button>
              <button type="button" onClick={() => generatePassword(store)} disabled={passwordLoadingId === store.id} className="premium-button-secondary text-xs"><KeyRound size={14} /> {passwordLoadingId === store.id ? 'Gerando...' : 'Gerar senha'}</button>
              <button type="button" onClick={() => togglePortal(store)} className="premium-button-secondary text-xs">{store.portal_enabled ? <EyeOff size={14} /> : <Eye size={14} />} {store.portal_enabled ? 'Ocultar do portal' : 'Publicar no portal'}</button>
            </div>
          </>
        )}
      </article>
    );
  }

  return (
    <section className="space-y-5">
      <div className="premium-card p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><h2 className="text-2xl font-black text-zinc-950">Lojas permanentes e participações</h2><p className="mt-1 text-sm text-zinc-500">O evento filtra participações; a loja e seu acesso continuam após o encerramento.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Mini label="Eventos ativos" value={String(activeEvents)} /><Mini label="Eventos inativos" value={String(inactiveEvents)} /><Mini label="No evento" value={String(selectedStores.length)} /><Mini label="Outras lojas" value={String(otherStores.length)} /></div></div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative xl:col-span-2"><Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" /><input className="premium-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar loja, responsável, cidade, telefone ou e-mail" /></label>
          <EventSelectField events={events} value={eventId} onChange={selectEvent} label="Evento selecionado" />
          <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Status do evento<select className="premium-input mt-1" value={eventStatus} onChange={(event) => setEventStatus(event.target.value)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
          <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Status da loja<select className="premium-input mt-1" value={storeStatus} onChange={(event) => setStoreStatus(event.target.value)}><option value="all">Todas</option><option value="active">Ativas</option><option value="inactive">Inativas</option></select></label>
          <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Período inicial<input className="premium-input mt-1" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">Período final<input className="premium-input mt-1" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <button type="button" onClick={clearFilters} className="premium-button-secondary justify-center self-end"><X size={16} /> Limpar filtros</button>
        </div>
      </div>

      <div className="premium-card p-6"><h2 className="text-2xl font-black text-zinc-950">Lojas participantes do evento</h2><p className="mt-1 text-sm text-zinc-500">Total exibido: {selectedStores.length}</p><div className="mt-5 grid gap-3">{selectedStores.map((store) => renderStore(store, true))}{selectedStores.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma loja encontrada para este evento e filtros.</p> : null}</div></div>

      <div className="premium-card p-6"><h2 className="text-2xl font-black text-zinc-950">Outras lojas permanentes</h2><p className="mt-1 text-sm text-zinc-500">Podem ser vinculadas ao evento atual sem criar outra conta.</p><div className="mt-5 grid gap-3">{otherStores.map((store) => renderStore(store, false))}{otherStores.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma outra loja encontrada.</p> : null}</div></div>

      {message ? <p className="rounded-2xl bg-white p-3 text-sm font-bold text-zinc-600">{message}</p> : null}

      {passwordResult ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur"><div className="w-full max-w-2xl rounded-[32px] bg-white p-7 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">Senha gerada</p><h3 className="mt-2 text-3xl font-black text-zinc-950">{passwordResult.store_name}</h3></div><button type="button" onClick={() => setPasswordResult(null)} className="rounded-xl bg-zinc-100 p-3 text-zinc-600"><X size={18} /></button></div><div className="mt-5 grid gap-3"><Info label="Login" value={passwordResult.email} /><Info label="Nova senha" value={passwordResult.password} important /><Info label="Portal" value={passwordResult.portal_path} /></div><button type="button" onClick={copyPassword} className="premium-button-primary mt-5 w-full justify-center"><Copy size={16} /> Copiar acesso completo</button></div></div> : null}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-zinc-100 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{label}</p><strong className="mt-1 block text-lg text-zinc-950">{value}</strong></div>; }
function Info({ label, value, important = false }: { label: string; value: string; important?: boolean }) { return <div className={`rounded-2xl border p-4 ${important ? 'border-red-200 bg-red-50' : 'border-zinc-100 bg-zinc-50'}`}><p className="text-xs font-black uppercase text-zinc-400">{label}</p><strong className={`mt-1 block break-all ${important ? 'text-3xl text-red-600' : 'text-base text-zinc-950'}`}>{value}</strong></div>; }
