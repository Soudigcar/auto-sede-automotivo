'use client';

import { CheckCircle2, ExternalLink, LockKeyhole, Palette, Save, XCircle } from 'lucide-react';

function eventPeriod(event: any) {
  const date = (value?: string) => value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
    : '';
  return [date(event?.start_date), date(event?.end_date)].filter(Boolean).join(' a ') || 'Datas não informadas';
}

type Props = {
  form: any;
  events: any[];
  selectedEvent: any;
  usedEventIds: Set<string>;
  saving: boolean;
  setForm: (next: any) => void;
  onSelectEvent: (eventId: string) => void;
  onOpenEditor: () => void;
  onSave: () => void;
};

export function CampaignLandingAdminForm({
  form,
  events,
  selectedEvent,
  usedEventIds,
  saving,
  setForm,
  onSelectEvent,
  onOpenEditor,
  onSave
}: Props) {
  const published = Boolean(form.published_at || form.published_layout);
  const eventReady = selectedEvent?.status === 'active';
  const storesReady = Number(form.store_count || 0) > 0;
  const vehiclesReady = Number(form.vehicle_count || 0) > 0;
  const publicationReady = Boolean(form.id && eventReady && storesReady && vehiclesReady);

  return (
    <section className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">Configuração administrativa</p>
          <h2 className="mt-1 text-2xl font-black">{form.id ? 'Editar landing' : 'Criar landing do evento'}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {form.id ? (
            <button type="button" onClick={onOpenEditor} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-black text-white">
              <Palette size={16} /> Editar design da landing
            </button>
          ) : null}
          {form.id && form.slug ? (
            <a href={`/campanha/simulador?campanha=${encodeURIComponent(form.slug)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-xs font-black">
              Ver página <ExternalLink size={15} />
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-900">
        Título, descrição, botões, cores, logomarcas, fundos e posicionamento são controlados somente pelo editor visual. Salvar esta tela não modifica o design publicado.
      </div>

      {form.id ? (
        <div className={`mt-4 rounded-2xl border p-4 ${publicationReady ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-600">Prontidão para publicar</p>
              <strong className={`mt-1 block text-sm ${publicationReady ? 'text-emerald-900' : 'text-amber-900'}`}>
                {publicationReady ? 'Landing pronta para publicação' : 'Publicação bloqueada até concluir os itens abaixo'}
              </strong>
            </div>
            {publicationReady ? <CheckCircle2 className="text-emerald-600" size={24} /> : <XCircle className="text-amber-600" size={24} />}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className={`rounded-xl bg-white p-3 text-xs font-black ${eventReady ? 'text-emerald-700' : 'text-red-700'}`}>
              {eventReady ? '✓' : '✕'} Evento {eventReady ? 'ativo' : 'inativo'}
            </div>
            <div className={`rounded-xl bg-white p-3 text-xs font-black ${storesReady ? 'text-emerald-700' : 'text-red-700'}`}>
              {storesReady ? '✓' : '✕'} {Number(form.store_count || 0)} loja(s) ativa(s)
            </div>
            <div className={`rounded-xl bg-white p-3 text-xs font-black ${vehiclesReady ? 'text-emerald-700' : 'text-red-700'}`}>
              {vehiclesReady ? '✓' : '✕'} {Number(form.vehicle_count || 0)} veículo(s) visível(is)
            </div>
          </div>
          {!publicationReady ? <p className="mt-3 text-xs font-semibold text-amber-800">O editor continua disponível para você montar e salvar o rascunho. O botão Publicar só terá efeito quando evento, loja e estoque estiverem prontos.</p> : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-black text-zinc-600 md:col-span-2">
          Evento vinculado
          <select
            className="premium-input mt-2 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
            value={form.event_id}
            disabled={published}
            onChange={(event) => onSelectEvent(event.target.value)}
          >
            <option value="">Selecione o evento</option>
            {events.map((event) => (
              <option key={event.id} value={event.id} disabled={usedEventIds.has(event.id)}>
                {event.event_name} — {event.city || event.location || 'Local não informado'}
                {usedEventIds.has(event.id) ? ' (já possui landing)' : ''}
              </option>
            ))}
          </select>
          {published ? (
            <span className="mt-2 flex items-center gap-1 text-[10px] font-bold text-zinc-500"><LockKeyhole size={11} /> Evento protegido após a primeira publicação. Para outro evento, use “Nova landing”.</span>
          ) : null}
        </label>

        {selectedEvent ? (
          <div className="md:col-span-2 rounded-2xl bg-zinc-50 p-4 text-sm font-semibold text-zinc-600">
            <strong className="block text-zinc-950">{selectedEvent.event_name}</strong>
            <span>{eventPeriod(selectedEvent)} • {[selectedEvent.location, selectedEvent.city, selectedEvent.state].filter(Boolean).join(' • ')}</span>
          </div>
        ) : null}

        <label className="text-xs font-black text-zinc-600">
          Nome interno
          <input className="premium-input mt-2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label className="text-xs font-black text-zinc-600">
          Slug público
          <input
            className="premium-input mt-2 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
            value={form.slug}
            disabled={published}
            onChange={(event) => setForm({ ...form, slug: event.target.value })}
          />
          <span className="mt-2 block text-[10px] font-bold text-zinc-400">
            {published
              ? form.legacy_slug
                ? `Endereço oficial atual: ${form.slug}. O endereço antigo “${form.legacy_slug}” permanece como alias de compatibilidade.`
                : 'Endereço protegido após a publicação para preservar anúncios, Pixel e links compartilhados.'
              : 'O endereço ficará protegido depois que a landing for publicada.'}
          </span>
        </label>
        <label className="text-xs font-black text-zinc-600">
          Taxa mensal (%)
          <input className="premium-input mt-2" type="number" min="0" step="0.01" value={form.interest_rate} onChange={(event) => setForm({ ...form, interest_rate: event.target.value })} />
        </label>
        <label className="text-xs font-black text-zinc-600">
          WhatsApp
          <input className="premium-input mt-2" value={form.whatsapp_number || ''} onChange={(event) => setForm({ ...form, whatsapp_number: event.target.value })} />
        </label>
      </div>

      <div className="mt-7 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <label className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-black">
          <input type="checkbox" checked={form.auto_sync_inventory !== false} onChange={(event) => setForm({ ...form, auto_sync_inventory: event.target.checked })} />
          Sincronizar estoque automaticamente
        </label>
        <div className={`rounded-2xl p-4 text-sm font-black ${form.is_active ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}>
          Status público: {form.is_active ? 'LANDING ATIVA' : 'LANDING INATIVA'}
          <p className="mt-1 text-[10px] font-semibold opacity-70">Publicação controlada dentro do editor visual.</p>
        </div>
        <button type="button" onClick={onSave} disabled={saving} className="premium-button-primary justify-center px-7">
          <Save size={17} /> {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>
    </section>
  );
}
