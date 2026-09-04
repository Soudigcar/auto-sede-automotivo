'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink, Globe2, Maximize2, Minimize2, Monitor, RefreshCcw, RotateCcw, Save, Smartphone, Sparkles, Tablet, UploadCloud, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { LayerRow } from './CampaignVisualEditorControls';
import { CampaignVisualEditorInspector } from './CampaignVisualEditorInspector';
import { CampaignVisualEditorPreviewResponsive } from './CampaignVisualEditorPreviewResponsive';
import type { Box, ContentKey, Device, DeviceLayout, Draft, Drag, Layer, Visual } from './CampaignVisualEditorModel';
import { bx, clamp, contentKeys, contentNames, defaults, deviceNames, devices, optimize, safe, storageKey, widths } from './CampaignVisualEditorModel';
import { ensureResponsive, forceResponsiveBoth, markDeviceManual, responsiveSettings, setDeviceLinked, setResponsiveEnabled, synchronizeResponsive, type ResponsiveDraft, type ResponsiveTarget } from './CampaignVisualEditorResponsive';
import { persistCampaignDraftAssets, publicCampaignUrl } from './CampaignVisualEditorPersistence';

function stamp(draft: Draft): ResponsiveDraft {
  return { ...ensureResponsive(draft), updatedAt: new Date().toISOString() };
}

function normalizeLayout(raw: unknown, campaign: any): ResponsiveDraft {
  if (!raw) return forceResponsiveBoth(defaults(campaign));
  const migrated = ensureResponsive(safe(raw, campaign));
  return (raw as any)?.responsive ? migrated : forceResponsiveBoth(migrated);
}

function dateTimeLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function CampaignVisualEditorLauncher() {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<'' | 'save' | 'publish'>('');
  const [dirty, setDirty] = useState(false);
  const [backgroundEditing, setBackgroundEditing] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [device, setDevice] = useState<Device>('desktop');
  const [layer, setLayer] = useState<Layer>('content');
  const [selectedContent, setSelectedContent] = useState<ContentKey>('title');
  const [draft, setDraft] = useState<ResponsiveDraft>(() => forceResponsiveBoth(defaults(null)));
  const [message, setMessage] = useState('');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [zoom, setZoom] = useState(70);

  const heroRef = useRef<HTMLElement | null>(null);
  const backgroundInput = useRef<HTMLInputElement | null>(null);
  const headerInput = useRef<HTMLInputElement | null>(null);
  const logoInput = useRef<HTMLInputElement | null>(null);

  const campaign = campaigns.find((item) => item.id === selectedId) || campaigns[0] || null;
  const eventInfo = events.find((item) => item.id === campaign?.event_id) || campaign?.event || null;
  const layout = draft.devices[device];
  const responsive = responsiveSettings(draft);
  const backgroundMode = draft.backgroundMode[device];
  const originalBackground = device === 'mobile' ? campaign?.mobile_hero_image_url || campaign?.hero_image_url : campaign?.hero_image_url;
  const heroSource = backgroundMode === 'none' ? '' : backgroundMode === 'custom' ? draft.backgroundData[device] : originalBackground || '';
  const publicUrl = campaign?.slug ? publicCampaignUrl(campaign.slug) : '';
  const draftUpdatedAt = campaign?.draft_updated_at ? new Date(campaign.draft_updated_at).getTime() : 0;
  const publishedAt = campaign?.published_at ? new Date(campaign.published_at).getTime() : 0;
  const hasPublishedLayout = Boolean(campaign?.published_layout);
  const hasUnpublishedChanges = dirty || (draftUpdatedAt > publishedAt);
  const publicationLabel = !hasPublishedLayout
    ? 'Ainda não publicada'
    : hasUnpublishedChanges
      ? 'Alterações não publicadas'
      : 'Publicada';
  const requiresEventReadiness = Boolean(campaign?.event_id);
  const eventReady = !requiresEventReadiness || eventInfo?.status === 'active';
  const storesReady = !requiresEventReadiness || Number(campaign?.store_count || 0) > 0;
  const vehiclesReady = !requiresEventReadiness || Number(campaign?.vehicle_count || 0) > 0;
  const publicationReady = Boolean(campaign && eventReady && storesReady && vehiclesReady);
  const publicationBlockReason = [
    !eventReady ? 'Ative o evento.' : '',
    !storesReady ? 'Vincule ao menos uma loja ativa.' : '',
    !vehiclesReady ? 'Vincule ao menos um veículo ativo e visível.' : ''
  ].filter(Boolean).join(' ');

  function updateState(next: Draft, nextMessage?: string) {
    setDraft(stamp(next));
    setDirty(true);
    if (nextMessage) setMessage(nextMessage);
  }

  function manualBase(source: ResponsiveDraft, target: Device) {
    if (target === 'desktop' || !responsiveSettings(source).linked[target]) return source;
    return markDeviceManual(source, target);
  }

  function applyDesktopPolicy(next: Draft): ResponsiveDraft {
    const normalized = ensureResponsive(next);
    return responsiveSettings(normalized).enabled
      ? synchronizeResponsive(normalized, { onlyLinked: true })
      : normalized;
  }

  function commitGlobal(next: Draft, recalculate = false) {
    const normalized = ensureResponsive(next);
    updateState(recalculate && responsiveSettings(normalized).enabled ? synchronizeResponsive(normalized, { onlyLinked: true }) : normalized);
  }

  function patchLayout(patch: Partial<DeviceLayout>) {
    const structural = Object.keys(patch).some((key) => !['backgroundScale', 'backgroundX', 'backgroundY', 'backgroundRotation', 'backgroundFlipX', 'backgroundFlipY', 'cropX', 'cropY', 'cropWidth', 'cropHeight'].includes(key));
    const base = structural ? manualBase(draft, device) : draft;
    const baseLayout = base.devices[device];
    const next = { ...base, devices: { ...base.devices, [device]: { ...baseLayout, ...patch } } };
    updateState(device === 'desktop' && structural ? applyDesktopPolicy(next) : next);
    if (structural && device !== 'desktop' && responsiveSettings(draft).linked[device]) setMessage(`${deviceNames[device]} convertido para MANUAL.`);
  }

  function patchBox(key: 'header' | 'logo' | 'simulator', patch: Partial<Box>) {
    const base = manualBase(draft, device);
    const baseLayout = base.devices[device];
    const next = { ...base, devices: { ...base.devices, [device]: { ...baseLayout, [key]: { ...baseLayout[key], ...patch } } } };
    updateState(device === 'desktop' ? applyDesktopPolicy(next) : next);
    if (device !== 'desktop' && responsiveSettings(draft).linked[device]) setMessage(`${deviceNames[device]} convertido para MANUAL.`);
  }

  function patchContentBox(key: ContentKey, patch: Partial<Box>) {
    const base = manualBase(draft, device);
    const baseLayout = base.devices[device];
    const next = { ...base, devices: { ...base.devices, [device]: { ...baseLayout, content: { ...baseLayout.content, [key]: { ...baseLayout.content[key], ...patch } } } } };
    updateState(device === 'desktop' ? applyDesktopPolicy(next) : next);
    if (device !== 'desktop' && responsiveSettings(draft).linked[device]) setMessage(`${deviceNames[device]} convertido para MANUAL.`);
  }

  function patchVisual(key: ContentKey, patch: Partial<Visual>) {
    commitGlobal({ ...draft, content: { ...draft.content, [key]: { ...draft.content[key], ...patch } } }, true);
  }

  function select(next: Layer) {
    setLayer(next);
    if (next !== 'background') setBackgroundEditing(false);
  }

  function selectText(key: ContentKey) {
    setSelectedContent(key);
    select('content');
  }

  async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    return headers;
  }

  async function load() {
    setLoading(true);
    try {
      const response = await fetch('/api/master/campaigns', { headers: await authHeaders(), cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao carregar.');
      setCampaigns(result.campaigns || []);
      setEvents(result.events || []);
      setSelectedId((current) => current || result.campaigns?.[0]?.id || '');
    } catch (error: any) {
      setMessage(error?.message || 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  }

  function launch() {
    setOpen(true);
    void load();
  }

  useEffect(() => {
    if (!campaign) return;
    try {
      const localRaw = localStorage.getItem(storageKey(campaign));
      const localDraft = localRaw ? JSON.parse(localRaw) : null;
      const source = campaign.editor_draft || campaign.published_layout || localDraft;
      setDraft(normalizeLayout(source, campaign));
      setDirty(false);
      setLayer('content');
      setSelectedContent('title');
      setMessage(
        campaign.editor_draft
          ? 'Rascunho do servidor carregado.'
          : campaign.published_layout
            ? 'Versão publicada carregada para edição.'
            : localDraft
              ? 'Rascunho local recuperado. Salve no servidor para disponibilizá-lo em outros dispositivos.'
              : 'Layout responsivo padrão carregado.'
      );
    } catch {
      setDraft(forceResponsiveBoth(defaults(campaign)));
    }
  }, [campaign?.id]);

  useEffect(() => {
    if (!campaign?.slug) {
      setVehicles([]);
      setStores([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/site-vehicles?slug=${encodeURIComponent(campaign.slug)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error('Estoque indisponível.');
        setVehicles(result.vehicles || []);
        setStores(result.stores || []);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          setVehicles([]);
          setStores([]);
        }
      });
    return () => controller.abort();
  }, [campaign?.slug]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId || !heroRef.current) return;
      event.preventDefault();
      const rect = heroRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const deltaX = ((event.clientX - drag.startX) / rect.width) * 100;
      const deltaY = ((event.clientY - drag.startY) / rect.height) * 100;

      setDraft((current) => {
        const currentLayout = current.devices[drag.device];
        if (drag.kind === 'background') {
          const origin = drag.origin as { x: number; y: number };
          return stamp({ ...current, devices: { ...current.devices, [drag.device]: { ...currentLayout, backgroundX: clamp(origin.x + deltaX, -200, 300), backgroundY: clamp(origin.y + deltaY, -200, 300) } } });
        }
        const origin = drag.origin as Box;
        if (drag.kind === 'content' || drag.kind === 'contentResize') {
          const key = drag.contentKey!;
          const box = currentLayout.content[key];
          const patch = drag.kind === 'contentResize'
            ? { width: clamp(origin.width + deltaX, key === 'title' || key === 'description' ? 12 : 6, 100 - origin.x) }
            : { x: clamp(origin.x + deltaX, 0, 100 - origin.width), y: clamp(origin.y + deltaY, 0, 98) };
          return stamp({ ...current, devices: { ...current.devices, [drag.device]: { ...currentLayout, content: { ...currentLayout.content, [key]: { ...box, ...patch } } } } });
        }
        const key = drag.key!;
        const box = currentLayout[key];
        const minimum = key === 'simulator' ? 44 : 7;
        const patch = drag.kind === 'resize'
          ? { width: clamp(origin.width + deltaX, minimum, 100 - origin.x) }
          : { x: clamp(origin.x + deltaX, 0, 100 - origin.width), y: clamp(origin.y + deltaY, 0, 98) };
        return stamp({ ...current, devices: { ...current.devices, [drag.device]: { ...currentLayout, [key]: { ...box, ...patch } } });
      });
      setDirty(true);
    };

    const finish = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      if (drag.device === 'desktop' && drag.kind !== 'background') {
        setDraft((current) => stamp(applyDesktopPolicy(current)));
      }
      setDrag(null);
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [drag]);

  function startBox(event: React.PointerEvent<HTMLElement>, kind: 'box' | 'resize', key: 'header' | 'logo' | 'simulator') {
    let working = draft;
    if (device !== 'desktop' && responsiveSettings(working).linked[device]) {
      working = markDeviceManual(working, device);
      setDraft(stamp(working));
      setDirty(true);
      setMessage(`${deviceNames[device]} convertido para MANUAL.`);
    }
    const box = working.devices[device][key];
    if (client || box.locked) return;
    event.preventDefault();
    event.stopPropagation();
    select(key);
    setDrag({ pointerId: event.pointerId, kind, key, startX: event.clientX, startY: event.clientY, origin: { ...box }, device });
  }

  function startContent(event: React.PointerEvent<HTMLElement>, kind: 'content' | 'contentResize', key: ContentKey) {
    let working = draft;
    if (device !== 'desktop' && responsiveSettings(working).linked[device]) {
      working = markDeviceManual(working, device);
      setDraft(stamp(working));
      setDirty(true);
      setMessage(`${deviceNames[device]} convertido para MANUAL.`);
    }
    const box = working.devices[device].content[key];
    if (client || box.locked) return;
    event.preventDefault();
    event.stopPropagation();
    selectText(key);
    setDrag({ pointerId: event.pointerId, kind, contentKey: key, startX: event.clientX, startY: event.clientY, origin: { ...box }, device });
  }

  function startBackground(event: React.PointerEvent<HTMLElement>) {
    if (client || !backgroundEditing || !heroSource || (event.target as HTMLElement).closest('[data-editor-element]')) return;
    event.preventDefault();
    select('background');
    setDrag({ pointerId: event.pointerId, kind: 'background', startX: event.clientX, startY: event.clientY, origin: { x: layout.backgroundX, y: layout.backgroundY }, device });
  }

  function wheel(event: React.WheelEvent<HTMLElement>) {
    if (client || !backgroundEditing || !heroSource || (event.target as HTMLElement).closest('[data-editor-element]')) return;
    event.preventDefault();
    const step = Math.max(1, layout.backgroundScale * 0.04);
    patchLayout({ backgroundScale: clamp(layout.backgroundScale + (event.deltaY > 0 ? -step : step), 1, 1000) });
  }

  async function asset(file: File | undefined, type: 'background' | 'header' | 'logo') {
    if (!file) return;
    try {
      setMessage('Otimizando imagem...');
      const data = await optimize(file, type !== 'background');
      if (type === 'background') {
        commitGlobal({ ...draft, backgroundMode: { ...draft.backgroundMode, [device]: 'custom' }, backgroundData: { ...draft.backgroundData, [device]: data }, devices: { ...draft.devices, [device]: { ...layout, backgroundScale: 100, backgroundX: 50, backgroundY: 50 } } });
        setBackgroundEditing(true);
        select('background');
      } else if (type === 'header') {
        commitGlobal({ ...draft, headerLogo: data });
        select('header');
      } else {
        commitGlobal({ ...draft, eventLogo: data });
        select('logo');
      }
      setMessage('Imagem aplicada. Salve o rascunho para enviá-la ao servidor.');
    } catch (error: any) {
      setMessage(error?.message || 'Falha na imagem.');
    }
  }

  function setBackgroundMode(mode: 'original' | 'custom' | 'none') {
    commitGlobal({ ...draft, backgroundMode: { ...draft.backgroundMode, [device]: mode }, backgroundData: mode === 'none' ? { ...draft.backgroundData, [device]: '' } : draft.backgroundData });
    setBackgroundEditing(mode !== 'none');
  }

  async function saveToServer(action: 'save' | 'publish') {
    if (!campaign || busyAction) return;
    if (action === 'publish' && !publicationReady) {
      setMessage(publicationBlockReason || 'A landing ainda não está pronta para publicação.');
      return;
    }
    setBusyAction(action);
    setMessage(action === 'publish' ? 'Enviando imagens e publicando...' : 'Enviando imagens e salvando rascunho...');
    try {
      const headers = await authHeaders();
      const persisted = await persistCampaignDraftAssets(draft, campaign, headers);
      const response = await fetch('/api/master/campaigns/layout', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campaign.id, action, layout: persisted })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o layout.');

      const nextDraft = stamp(persisted);
      setDraft(nextDraft);
      localStorage.setItem(storageKey(campaign), JSON.stringify(nextDraft));
      setDirty(false);
      setCampaigns((current) => current.map((item) => item.id === campaign.id ? { ...item, ...result.campaign } : item));
      setMessage(action === 'publish' ? 'Landing publicada com sucesso.' : 'Rascunho salvo no servidor.');
    } catch (error: any) {
      setMessage(error?.message || 'Falha ao salvar o layout.');
    } finally {
      setBusyAction('');
    }
  }

  function viewPublicPage() {
    if (!publicUrl) return;
    window.open(publicUrl, '_blank', 'noopener,noreferrer');
  }

  async function copyPublicLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage('Link público copiado.');
    } catch {
      setMessage(`Link público: ${publicUrl}`);
    }
  }

  function reset() {
    if (!campaign) return;
    updateState(forceResponsiveBoth(defaults(campaign)), 'Configuração responsiva padrão restaurada.');
  }

  function toggleResponsive(enabled: boolean) {
    updateState(setResponsiveEnabled(draft, enabled), enabled ? 'Responsividade automática ativada.' : 'Responsividade automática pausada.');
  }

  function toggleLink(target: ResponsiveTarget) {
    const linked = responsive.linked[target];
    updateState(setDeviceLinked(draft, target, !linked), linked ? `${deviceNames[target]} desvinculado. Ajustes manuais serão preservados.` : `${deviceNames[target]} vinculado e recalculado a partir do desktop.`);
  }

  function recalculateLinked() {
    updateState(synchronizeResponsive(draft, { onlyLinked: true }), 'Tablet e mobile vinculados foram recalculados.');
  }

  function applyBoth() {
    updateState(forceResponsiveBoth(draft), 'Desktop aplicado novamente ao tablet e ao mobile.');
  }

  const preview = <CampaignVisualEditorPreviewResponsive draft={draft} device={device} campaign={campaign} eventInfo={eventInfo} vehicles={vehicles} stores={stores} layer={layer} selectedContent={selectedContent} clientView={client} heroRef={heroRef} heroSource={heroSource} onSelect={(next) => { select(next); if (next === 'background') setBackgroundEditing(true); }} onSelectContent={selectText} onStartBox={startBox} onStartContent={startContent} onStartBackground={startBackground} onWheel={wheel} onBackgroundDoubleClick={() => backgroundInput.current?.click()} onSelectVehicle={() => select('simulator')} />;
  const inspectorProps = { layer, draft, device, layout, campaign, eventInfo, stores, selectedContent, heroSource, bgInput: backgroundInput, headerInput, logoInput, bgEdit: backgroundEditing, setBgEdit: setBackgroundEditing, asset: (file: File | undefined, type: 'background' | 'header' | 'logo') => void asset(file, type), setBackgroundMode, commit: commitGlobal, patchLayout, patchBox, patchContentBox, patchVisual, selectText };

  return <>
    <section className="mb-6 rounded-3xl border border-indigo-200 bg-white p-5"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase text-indigo-600">Editor visual nativo</p><h2 className="mt-1 text-xl font-black">Rascunho e publicação da landing</h2><p className="mt-1 text-sm text-zinc-500">Salve no servidor, publique e abra a URL pública sem sair do editor.</p></div><button onClick={launch} className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white"><Sparkles size={17} className="inline" /> Abrir editor</button></div></section>

    {open ? <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950">
      <header className="flex min-h-[76px] items-center justify-between gap-3 bg-zinc-950 px-4 text-white"><div className="min-w-0"><strong>Editor visual completo</strong><p className="truncate text-[11px] text-zinc-400">{campaign?.name} • {publicationLabel}{campaign?.published_at ? ` • ${dateTimeLabel(campaign.published_at)}` : ''}</p></div><div className="flex rounded-xl bg-white/10 p-1">{devices.map((item) => { const Icon = item === 'desktop' ? Monitor : item === 'tablet' ? Tablet : Smartphone; const linked = item === 'desktop' ? false : responsive.linked[item]; return <button key={item} onClick={() => setDevice(item)} className={`rounded-lg px-4 py-2 text-xs font-black ${device === item ? 'bg-white text-zinc-950' : ''}`}><Icon size={15} className="inline" /> {deviceNames[item]}{item !== 'desktop' ? <span className={`ml-2 rounded-full px-2 py-0.5 text-[8px] ${linked ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{linked ? 'AUTO' : 'MANUAL'}</span> : null}</button>; })}</div><div className="flex flex-wrap justify-end gap-2"><button onClick={() => setClient(true)} className="rounded-xl bg-indigo-500/20 px-3 py-2 text-[10px] font-black"><Maximize2 size={14} className="inline" /> Preview</button><button disabled={Boolean(busyAction)} onClick={() => void saveToServer('save')} className="rounded-xl bg-sky-600 px-3 py-2 text-[10px] font-black disabled:opacity-50"><Save size={14} className="inline" /> {busyAction === 'save' ? 'Salvando...' : 'Salvar rascunho'}</button><button disabled={Boolean(busyAction) || !publicationReady} title={!publicationReady ? publicationBlockReason : 'Publicar landing'} onClick={() => void saveToServer('publish')} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-40"><UploadCloud size={14} className="inline" /> {busyAction === 'publish' ? 'Publicando...' : 'Publicar'}</button><button disabled={!campaign?.slug} onClick={viewPublicPage} className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black disabled:opacity-40"><ExternalLink size={14} className="inline" /> Visualizar página</button><button disabled={!campaign?.slug} onClick={() => void copyPublicLink()} className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black disabled:opacity-40"><Copy size={14} className="inline" /> Copiar link</button><button onClick={() => setOpen(false)} className="h-10 w-10 rounded-xl bg-white/10" aria-label="Fechar editor"><X size={18} className="mx-auto" /></button></div></header>

      <div className="grid min-h-0 flex-1 grid-cols-[310px_minmax(0,1fr)_360px]">
        <aside className="overflow-y-auto bg-white p-4"><p className="text-[10px] font-black uppercase text-zinc-400">Landing selecionada</p><select value={selectedId} disabled={loading} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setSelectedId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border px-3 text-xs font-black">{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className={`mt-4 rounded-xl p-3 text-xs font-bold ${hasPublishedLayout && !hasUnpublishedChanges ? 'bg-emerald-50 text-emerald-800' : hasPublishedLayout ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900'}`}><div className="flex items-center gap-2"><Globe2 size={16} /> {publicationLabel}</div>{campaign?.draft_updated_at ? <p className="mt-2 text-[10px] opacity-70">Rascunho: {dateTimeLabel(campaign.draft_updated_at)}</p> : null}{campaign?.published_at ? <p className="mt-1 text-[10px] opacity-70">Publicação: {dateTimeLabel(campaign.published_at)}</p> : null}</div>

          <div className={`mt-3 rounded-xl border p-3 text-[10px] font-bold ${publicationReady ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><p className="text-xs font-black">Prontidão para publicar</p>{requiresEventReadiness ? <div className="mt-2 space-y-1"><p>{eventReady ? '✓' : '✕'} Evento {eventReady ? 'ativo' : 'inativo'}</p><p>{storesReady ? '✓' : '✕'} {Number(campaign?.store_count || 0)} loja(s) ativa(s)</p><p>{vehiclesReady ? '✓' : '✕'} {Number(campaign?.vehicle_count || 0)} veículo(s) visível(is)</p></div> : <p className="mt-2">✓ Landing legada sem evento: publicação permitida pelo backend.</p>}{!publicationReady ? <p className="mt-2 font-semibold">{publicationBlockReason}</p> : null}</div>

          <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black text-indigo-950">Responsividade automática</p><p className="mt-1 text-[10px] font-semibold text-indigo-700">Desktop controla os dispositivos vinculados.</p></div><input type="checkbox" checked={responsive.enabled} onChange={(event: React.ChangeEvent<HTMLInputElement>) => toggleResponsive(event.target.checked)} aria-label="Ativar responsividade automática" /></div>{(['tablet', 'mobile'] as ResponsiveTarget[]).map((target) => <div key={target} className="mt-3 flex items-center justify-between rounded-xl bg-white p-2"><span className="text-[11px] font-black">{deviceNames[target]}</span><button type="button" onClick={() => toggleLink(target)} className={`rounded-lg px-3 py-2 text-[9px] font-black ${responsive.linked[target] ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{responsive.linked[target] ? 'AUTO • DESVINCULAR' : 'MANUAL • VINCULAR'}</button></div>)}<div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={recalculateLinked} disabled={!responsive.enabled} className="rounded-xl bg-indigo-600 px-2 py-3 text-[9px] font-black text-white disabled:opacity-40"><RefreshCcw size={13} className="inline" /> Recalcular vinculados</button><button type="button" onClick={applyBoth} className="rounded-xl border border-indigo-200 bg-white px-2 py-3 text-[9px] font-black text-indigo-700">Aplicar aos dois</button></div></div>

          <div className="mt-5 space-y-2"><LayerRow label="Imagem de fundo" active={layer === 'background'} onSelect={() => { select('background'); setBackgroundEditing(true); }} /><LayerRow label="Cabeçalho / Apoio" active={layer === 'header'} box={layout.header} onSelect={() => select('header')} onVisible={() => patchBox('header', { visible: !layout.header.visible })} onLock={() => patchBox('header', { locked: !layout.header.locked })} /><LayerRow label="Logomarca" active={layer === 'logo'} box={layout.logo} onSelect={() => select('logo')} onVisible={() => patchBox('logo', { visible: !layout.logo.visible })} onLock={() => patchBox('logo', { locked: !layout.logo.locked })} /><div className="rounded-xl border p-2"><button onClick={() => selectText(selectedContent)} className="w-full text-left text-xs font-black">Textos e botões</button><div className="mt-2 space-y-1">{contentKeys.map((key) => <LayerRow key={key} label={contentNames[key]} active={layer === 'content' && selectedContent === key} box={layout.content[key]} onSelect={() => selectText(key)} onVisible={() => patchContentBox(key, { visible: !layout.content[key].visible })} onLock={() => patchContentBox(key, { locked: !layout.content[key].locked })} />)}</div></div><LayerRow label="Simulador" active={layer === 'simulator'} box={layout.simulator} onSelect={() => select('simulator')} onVisible={() => patchBox('simulator', { visible: !layout.simulator.visible })} onLock={() => patchBox('simulator', { locked: !layout.simulator.locked })} /><LayerRow label="Rodapé oficial" active={layer === 'footer'} box={{ ...bx(0, 0, 100), visible: draft.footer.visible }} onSelect={() => select('footer')} onVisible={() => commitGlobal({ ...draft, footer: { ...draft.footer, visible: !draft.footer.visible } })} /></div><button onClick={reset} className="mt-5 w-full rounded-xl border p-3 text-xs font-black"><RotateCcw size={15} className="inline" /> Restaurar padrão</button>{message ? <div className="mt-3 rounded-xl bg-indigo-50 p-3 text-xs font-bold text-indigo-700">{message}</div> : null}</aside>

        <main className="overflow-auto bg-zinc-900 p-5"><div className="mb-4 flex justify-between text-white"><div className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black">Zoom <input type="range" min="30" max="100" value={zoom} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setZoom(Number(event.target.value))} /> {zoom}%</div><button onClick={() => setClient(true)} className="rounded-xl bg-indigo-600 px-4 text-xs font-black">Expandir preview</button></div><div className="mx-auto origin-top" style={{ width: widths[device], transform: `scale(${zoom / 100})` }}>{preview}</div></main>
        <CampaignVisualEditorInspector {...inspectorProps} />
      </div>

      {client ? <div className="fixed inset-0 z-[200] overflow-auto bg-zinc-950"><div className="sticky top-0 z-[210] flex justify-between bg-zinc-950 p-4 text-white"><strong>Modo cliente</strong><button onClick={() => setClient(false)} className="rounded-xl bg-white/10 px-4 py-2 text-xs font-black"><Minimize2 size={15} className="inline" /> Voltar</button></div><div className="mx-auto bg-white" style={{ width: device === 'desktop' ? '100%' : widths[device], maxWidth: '100%' }}>{preview}</div></div> : null}
    </div> : null}
  </>;
}
