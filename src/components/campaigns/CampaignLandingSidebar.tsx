'use client';

import { Palette, RefreshCw, Sparkles, Store } from 'lucide-react';
import { CampaignVisualDraftThumbnail } from './CampaignVisualDraftThumbnail';

function dateTimeLabel(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

type Props = {
  form: any;
  selectedEvent: any;
  campaigns: any[];
  assignments: any[];
  previewVehicles: any[];
  previewStores: any[];
  syncing: boolean;
  onSync: () => void;
  onSelectCampaign: (campaign: any) => void;
};

export function CampaignLandingSidebar({
  form,
  selectedEvent,
  campaigns,
  assignments,
  previewVehicles,
  previewStores,
  syncing,
  onSync,
  onSelectCampaign
}: Props) {
  const hasDraft = Boolean(form.editor_draft);
  const hasPublishedLayout = Boolean(form.published_layout);
  const draftTime = form.draft_updated_at ? new Date(form.draft_updated_at).getTime() : 0;
  const publishedTime = form.published_at ? new Date(form.published_at).getTime() : 0;
  const hasUnpublishedChanges = hasDraft && draftTime > publishedTime;

  return (
    <aside className="space-y-5">
      {form.id ? (
        <CampaignVisualDraftThumbnail
          campaign={form}
          eventInfo={selectedEvent || form.event}
          vehicles={previewVehicles}
          stores={previewStores}
        />
      ) : (
        <section className="rounded-[30px] border border-dashed border-zinc-300 bg-white p-8 text-center shadow-sm">
          <Palette className="mx-auto text-zinc-300" size={38} />
          <h3 className="mt-4 text-lg font-black">Design ainda não iniciado</h3>
          <p className="mt-2 text-sm font-semibold text-zinc-500">Salve a landing para liberar o editor visual e a prévia real do rascunho.</p>
        </section>
      )}

      <section className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Estado do design</p>
        <div className="mt-4 grid gap-3">
          <div className={`rounded-2xl p-4 ${hasDraft ? 'bg-sky-50 text-sky-900' : 'bg-zinc-50 text-zinc-600'}`}>
            <strong className="text-sm">{hasDraft ? 'Rascunho salvo no editor' : 'Sem rascunho salvo'}</strong>
            <p className="mt-1 text-xs opacity-70">Última edição: {dateTimeLabel(form.draft_updated_at)}</p>
          </div>
          <div className={`rounded-2xl p-4 ${hasPublishedLayout ? 'bg-emerald-50 text-emerald-900' : 'bg-zinc-50 text-zinc-600'}`}>
            <strong className="text-sm">{hasPublishedLayout ? 'Layout publicado' : 'Sem layout publicado'}</strong>
            <p className="mt-1 text-xs opacity-70">Última publicação: {dateTimeLabel(form.published_at)}</p>
          </div>
          {hasUnpublishedChanges ? <div className="rounded-2xl bg-amber-50 p-4 text-sm font-black text-amber-900">Existem alterações de design ainda não publicadas.</div> : null}
        </div>
      </section>

      <section className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Sincronização</p>
            <h3 className="mt-1 text-xl font-black">Lojas e estoque</h3>
          </div>
          <button type="button" onClick={onSync} disabled={!form.event_id || syncing} className="premium-button-secondary text-xs">
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> Sincronizar
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-zinc-50 p-4">
            <Store size={18} className="text-red-600" />
            <strong className="mt-2 block text-2xl">{campaigns.find((item) => item.id === form.id)?.store_count || 0}</strong>
            <p className="text-xs text-zinc-500">lojas participantes</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4">
            <Sparkles size={18} className="text-red-600" />
            <strong className="mt-2 block text-2xl">{assignments.length}</strong>
            <p className="text-xs text-zinc-500">veículos vinculados</p>
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Landings cadastradas</p>
        <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              type="button"
              onClick={() => onSelectCampaign(campaign)}
              className={`w-full rounded-2xl border p-4 text-left ${form.id === campaign.id ? 'border-red-300 bg-red-50' : 'border-zinc-200 bg-white'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${campaign.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {campaign.is_active ? 'PUBLICADA' : 'INATIVA'}
                </span>
                <span className="text-xs text-zinc-400">{campaign.vehicle_count || 0} veículos</span>
              </div>
              <strong className="mt-3 block text-sm text-zinc-950">{campaign.name}</strong>
              <p className="mt-1 text-xs text-zinc-500">{campaign.event?.location || campaign.event?.city || 'Evento não vinculado'}</p>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
