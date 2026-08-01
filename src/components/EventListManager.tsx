'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Pencil, PlayCircle, Power, RotateCcw, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function dateText(value?: string) {
  return value ? value.split('-').reverse().join('/') : '-';
}

function statusLabel(status?: string) {
  if (status === 'active') return 'Ativo';
  if (status === 'inactive') return 'Inativo';
  return 'Não ativado';
}

export function EventListManager({ refreshKey = 0 }: { refreshKey?: number }) {
  const router = useRouter();
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState('');
  const [actionId, setActionId] = useState('');
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
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .neq('status', 'deleted')
      .order('created_at', { ascending: false });

    if (error) {
      setMessage(`Erro ao carregar eventos: ${error.message}`);
      return;
    }

    setEvents(data || []);
  }

  useEffect(() => {
    loadData().catch(() => setMessage('Não foi possível carregar os eventos.'));
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
      setMessage(`Erro ao editar evento: ${error.message}`);
      return;
    }

    setEditingId('');
    setMessage('Evento editado com sucesso.');
    await loadData();
  }

  async function changeEventStatus(item: any) {
    const isActive = item.status === 'active';
    const nextStatus = isActive ? 'inactive' : 'active';
    const action = isActive ? 'desativar' : item.status === 'inactive' ? 'reativar' : 'ativar';

    if (!window.confirm(`Confirma ${action} o evento “${item.event_name}”?`)) return;

    setActionId(item.id);
    setMessage(`${action.charAt(0).toUpperCase()}${action.slice(1)}ndo evento...`);

    const { error: eventError } = await supabase
      .from('events')
      .update({
        status: nextStatus,
        store_registration_enabled: nextStatus === 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id);

    if (eventError) {
      setActionId('');
      setMessage(`Erro ao ${action} evento: ${eventError.message}`);
      return;
    }

    if (nextStatus === 'inactive') {
      const { error: campaignError } = await supabase
        .from('site_campaigns')
        .update({
          is_active: false,
          published_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('event_id', item.id);

      if (campaignError) {
        await supabase
          .from('events')
          .update({ status: 'active', store_registration_enabled: true, updated_at: new Date().toISOString() })
          .eq('id', item.id);

        setActionId('');
        setMessage(`A landing não pôde ser desativada; o evento permaneceu ativo. ${campaignError.message}`);
        await loadData();
        return;
      }
    }

    setActionId('');
    setMessage(
      nextStatus === 'active'
        ? 'Evento ativo novamente. A landing permanece sob controle separado e deve ser publicada em Campanhas e Landings.'
        : 'Evento desativado. A landing foi retirada do ar, sem apagar lojas, estoques, leads ou histórico.'
    );
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

  function openEvent(item: any) {
    if (editingId === item.id || actionId === item.id) return;
    router.push(`/master/events/${item.id}`);
  }

  return (
    <section className="premium-card p-6">
      <h2 className="text-2xl font-black text-zinc-950">Eventos cadastrados</h2>
      <p className="mt-1 text-sm text-zinc-500">Clique no card para abrir a operação. Edite, ative, desative ou reative sem excluir o histórico.</p>

      <div className="mt-5 space-y-3">
        {events.map((item) => (
          <article
            key={item.id}
            role={editingId === item.id ? undefined : 'button'}
            tabIndex={editingId === item.id ? -1 : 0}
            onClick={() => openEvent(item)}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && editingId !== item.id) {
                event.preventDefault();
                openEvent(item);
              }
            }}
            className={`rounded-2xl border bg-zinc-50 p-4 transition ${editingId === item.id ? 'border-zinc-200' : 'cursor-pointer border-zinc-100 hover:-translate-y-0.5 hover:border-red-200 hover:bg-white hover:shadow-lg'}`}
          >
            {editingId === item.id ? (
              <div className="grid gap-3 md:grid-cols-2" onClick={(event) => event.stopPropagation()}>
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

                <button className="premium-button-primary" type="button" onClick={() => void saveEdit()}>Salvar edição</button>
                <button className="premium-button-secondary" type="button" onClick={() => setEditingId('')}>Cancelar</button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-zinc-950">{item.event_name}</h3>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${item.status === 'active' ? 'bg-emerald-100 text-emerald-700' : item.status === 'inactive' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-200 text-zinc-600'}`}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {item.state || '-'} | {item.city || '-'} | {dateText(item.start_date)} até {dateText(item.end_date)}
                    </p>
                    <p className="mt-1 text-xs font-bold text-zinc-400">
                      Banco: {item.sponsor_bank || '-'} | Local: {item.location || '-'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-black text-red-600">
                    Abrir painel do evento <ChevronRight size={17} />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                  <button className="premium-button-secondary text-xs" type="button" onClick={() => startEdit(item)}>
                    <Pencil size={14} /> Editar
                  </button>

                  <button
                    className={item.status === 'active' ? 'premium-button-secondary text-xs' : 'premium-button-primary text-xs'}
                    type="button"
                    disabled={actionId === item.id}
                    onClick={() => void changeEventStatus(item)}
                  >
                    {item.status === 'active' ? <Power size={14} /> : item.status === 'inactive' ? <RotateCcw size={14} /> : <PlayCircle size={14} />}
                    {actionId === item.id ? 'Processando...' : item.status === 'active' ? 'Desativar' : item.status === 'inactive' ? 'Reativar' : 'Ativar'}
                  </button>

                  <button className="premium-button-secondary text-xs" type="button" onClick={() => void removeEvent(item)}>
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </>
            )}
          </article>
        ))}

        {events.length === 0 ? <p className="text-sm text-zinc-500">Nenhum evento cadastrado.</p> : null}
      </div>

      {message ? (
        <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p>
      ) : null}
    </section>
  );
}
