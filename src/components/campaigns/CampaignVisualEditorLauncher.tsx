'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Copy,
  ExternalLink,
  Grip,
  Laptop,
  LayoutTemplate,
  Maximize2,
  Monitor,
  Palette,
  Redo2,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Type,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Device = 'desktop' | 'tablet' | 'mobile';
type Align = 'left' | 'center' | 'right';
type ButtonStyle = 'solid' | 'outline' | 'gradient';

type DeviceLayout = {
  logoWidth: number;
  logoOffsetX: number;
  logoOffsetY: number;
  titleSize: number;
  descriptionSize: number;
  contentMaxWidth: number;
  heroMinHeight: number;
  heroPaddingTop: number;
  heroPaddingBottom: number;
  buttonRadius: number;
  buttonFullWidth: boolean;
  contentAlign: Align;
  cardRadius: number;
};

type VisualDraft = {
  primaryColor: string;
  secondaryColor: string;
  gradientEnabled: boolean;
  gradientColor: string;
  gradientAngle: number;
  overlayOpacity: number;
  buttonStyle: ButtonStyle;
  buttonTextColor: string;
  devices: Record<Device, DeviceLayout>;
  updatedAt: string;
};

type SavedTemplate = {
  id: string;
  name: string;
  campaignName: string;
  createdAt: string;
  draft: VisualDraft;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
} | null;

const frameWidth: Record<Device, number> = { desktop: 1180, tablet: 768, mobile: 390 };
const deviceLabel: Record<Device, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
const templateStorageKey = 'auto-sede:landing-visual:templates:v1';

function defaultLayout(device: Device): DeviceLayout {
  if (device === 'mobile') {
    return {
      logoWidth: 170,
      logoOffsetX: 0,
      logoOffsetY: 0,
      titleSize: 38,
      descriptionSize: 16,
      contentMaxWidth: 340,
      heroMinHeight: 760,
      heroPaddingTop: 52,
      heroPaddingBottom: 64,
      buttonRadius: 999,
      buttonFullWidth: true,
      contentAlign: 'left',
      cardRadius: 26
    };
  }
  if (device === 'tablet') {
    return {
      logoWidth: 230,
      logoOffsetX: 0,
      logoOffsetY: 0,
      titleSize: 52,
      descriptionSize: 18,
      contentMaxWidth: 620,
      heroMinHeight: 760,
      heroPaddingTop: 68,
      heroPaddingBottom: 76,
      buttonRadius: 999,
      buttonFullWidth: false,
      contentAlign: 'left',
      cardRadius: 30
    };
  }
  return {
    logoWidth: 290,
    logoOffsetX: 0,
    logoOffsetY: 0,
    titleSize: 68,
    descriptionSize: 19,
    contentMaxWidth: 760,
    heroMinHeight: 780,
    heroPaddingTop: 82,
    heroPaddingBottom: 88,
    buttonRadius: 999,
    buttonFullWidth: false,
    contentAlign: 'left',
    cardRadius: 34
  };
}

function makeDefaultDraft(campaign?: any): VisualDraft {
  return {
    primaryColor: campaign?.primary_color || '#DC2626',
    secondaryColor: campaign?.secondary_color || '#071020',
    gradientEnabled: true,
    gradientColor: '#7F1D1D',
    gradientAngle: 120,
    overlayOpacity: 78,
    buttonStyle: 'solid',
    buttonTextColor: '#FFFFFF',
    devices: {
      desktop: defaultLayout('desktop'),
      tablet: defaultLayout('tablet'),
      mobile: defaultLayout('mobile')
    },
    updatedAt: new Date().toISOString()
  };
}

function cloneDraft(draft: VisualDraft): VisualDraft {
  return JSON.parse(JSON.stringify(draft));
}

function safeDraft(value: unknown, campaign?: any): VisualDraft {
  const fallback = makeDefaultDraft(campaign);
  if (!value || typeof value !== 'object') return fallback;
  const incoming = value as Partial<VisualDraft>;
  return {
    ...fallback,
    ...incoming,
    primaryColor: incoming.primaryColor || fallback.primaryColor,
    secondaryColor: incoming.secondaryColor || fallback.secondaryColor,
    gradientColor: incoming.gradientColor || fallback.gradientColor,
    buttonTextColor: incoming.buttonTextColor || fallback.buttonTextColor,
    devices: {
      desktop: { ...fallback.devices.desktop, ...(incoming.devices?.desktop || {}) },
      tablet: { ...fallback.devices.tablet, ...(incoming.devices?.tablet || {}) },
      mobile: { ...fallback.devices.mobile, ...(incoming.devices?.mobile || {}) }
    },
    updatedAt: incoming.updatedAt || fallback.updatedAt
  };
}

function storageKey(campaign: any) {
  return `auto-sede:landing-visual:draft:${campaign?.id || campaign?.slug || 'new'}`;
}

function hexToRgba(hex: string, opacity: number) {
  const normalized = String(hex || '').replace('#', '');
  const safe = /^[0-9a-f]{6}$/i.test(normalized) ? normalized : '071020';
  const red = parseInt(safe.slice(0, 2), 16);
  const green = parseInt(safe.slice(2, 4), 16);
  const blue = parseInt(safe.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(opacity, 100)) / 100})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

export function CampaignVisualEditorLauncher() {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [device, setDevice] = useState<Device>('desktop');
  const [draft, setDraft] = useState<VisualDraft>(() => makeDefaultDraft());
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);

  const selectedCampaign = campaigns.find((item) => item.id === selectedId) || campaigns[0] || null;
  const selectedEvent = events.find((item) => item.id === selectedCampaign?.event_id) || selectedCampaign?.event || null;
  const layout = draft.devices[device];

  async function authHeaders() {
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    return headers;
  }

  async function loadEditorData() {
    setLoading(true);
    setMessage('Carregando landings...');
    try {
      const response = await fetch('/api/master/campaigns', { headers: await authHeaders(), cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as landings.');
      const nextCampaigns = result.campaigns || [];
      setCampaigns(nextCampaigns);
      setEvents(result.events || []);
      setSelectedId((current) => current || nextCampaigns[0]?.id || '');
      setMessage(nextCampaigns.length ? '' : 'Nenhuma landing cadastrada para editar.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar as landings.');
    } finally {
      setLoading(false);
    }
  }

  function openEditor() {
    setOpen(true);
    if (!campaigns.length) void loadEditorData();
  }

  useEffect(() => {
    if (!open) return;
    try {
      const stored = JSON.parse(localStorage.getItem(templateStorageKey) || '[]');
      setTemplates(Array.isArray(stored) ? stored : []);
    } catch {
      setTemplates([]);
    }
  }, [open]);

  useEffect(() => {
    if (!selectedCampaign) return;
    try {
      const stored = localStorage.getItem(storageKey(selectedCampaign));
      setDraft(stored ? safeDraft(JSON.parse(stored), selectedCampaign) : makeDefaultDraft(selectedCampaign));
      setDirty(false);
      setMessage(stored ? 'Rascunho visual local restaurado.' : 'Configuração visual padrão carregada.');
    } catch {
      setDraft(makeDefaultDraft(selectedCampaign));
      setDirty(false);
    }
  }, [selectedCampaign?.id]);

  function updateDraft(patch: Partial<VisualDraft>) {
    setDraft((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
    setDirty(true);
  }

  function updateDevice(patch: Partial<DeviceLayout>) {
    setDraft((current) => ({
      ...current,
      devices: { ...current.devices, [device]: { ...current.devices[device], ...patch } },
      updatedAt: new Date().toISOString()
    }));
    setDirty(true);
  }

  function saveDraft() {
    if (!selectedCampaign) return;
    localStorage.setItem(storageKey(selectedCampaign), JSON.stringify(draft));
    setDirty(false);
    setMessage(`Rascunho salvo neste navegador para ${selectedCampaign.name}.`);
  }

  function saveTemplate() {
    const name = templateName.trim();
    if (!name) {
      setMessage('Informe um nome para o modelo.');
      return;
    }
    const nextTemplate: SavedTemplate = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      campaignName: selectedCampaign?.name || 'Landing',
      createdAt: new Date().toISOString(),
      draft: cloneDraft(draft)
    };
    const next = [nextTemplate, ...templates].slice(0, 24);
    setTemplates(next);
    localStorage.setItem(templateStorageKey, JSON.stringify(next));
    setTemplateName('');
    setMessage(`Modelo “${name}” salvo neste navegador.`);
  }

  function applyTemplate(template: SavedTemplate) {
    setDraft(safeDraft(cloneDraft(template.draft), selectedCampaign));
    setDirty(true);
    setMessage(`Modelo “${template.name}” aplicado ao preview.`);
  }

  function deleteTemplate(templateId: string) {
    const next = templates.filter((item) => item.id !== templateId);
    setTemplates(next);
    localStorage.setItem(templateStorageKey, JSON.stringify(next));
  }

  function resetDraft() {
    if (!selectedCampaign) return;
    setDraft(makeDefaultDraft(selectedCampaign));
    setDirty(true);
    setMessage('Configuração visual restaurada para o padrão.');
  }

  function beginLogoDrag(event: React.PointerEvent<HTMLImageElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: layout.logoOffsetX,
      originY: layout.logoOffsetY
    });
  }

  function moveLogo(event: React.PointerEvent<HTMLImageElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateDevice({
      logoOffsetX: clamp(drag.originX + event.clientX - drag.startX, -240, 240),
      logoOffsetY: clamp(drag.originY + event.clientY - drag.startY, -180, 180)
    });
  }

  function endLogoDrag(event: React.PointerEvent<HTMLImageElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDrag(null);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  }

  const heroBackground = draft.gradientEnabled
    ? `linear-gradient(${draft.gradientAngle}deg, ${hexToRgba(draft.secondaryColor, draft.overlayOpacity)} 10%, ${hexToRgba(draft.secondaryColor, Math.max(draft.overlayOpacity - 18, 10))} 58%, ${hexToRgba(draft.gradientColor, Math.max(draft.overlayOpacity - 30, 8))} 100%)`
    : hexToRgba(draft.secondaryColor, draft.overlayOpacity);

  const textAlign = layout.contentAlign;
  const alignItems = layout.contentAlign === 'center' ? 'center' : layout.contentAlign === 'right' ? 'flex-end' : 'flex-start';
  const justifyContent = layout.contentAlign === 'center' ? 'center' : layout.contentAlign === 'right' ? 'flex-end' : 'flex-start';
  const mobile = device === 'mobile';
  const desktop = device === 'desktop';

  return (
    <>
      <section className="mb-6 rounded-[28px] border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-violet-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><LayoutTemplate size={22} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Editor visual responsivo — fase 1</p>
              <h2 className="mt-1 text-xl font-black text-zinc-950">Ajuste o design diretamente no preview</h2>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-zinc-500">Edite desktop, tablet e mobile, arraste a logo, configure gradientes, tipografia, espaçamentos e curvatura dos botões. Os rascunhos e modelos ficam salvos somente neste navegador.</p>
            </div>
          </div>
          <button type="button" onClick={openEditor} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-black text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500"><Maximize2 size={17} /> Abrir preview visual</button>
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950 text-zinc-950">
          <header className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-3 text-white sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 sm:flex"><Sparkles size={19} /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">Editor visual de landings</p>
                <p className="truncate text-[11px] font-bold text-zinc-400">{selectedCampaign?.name || 'Selecione uma landing'} {dirty ? '• alterações não salvas' : '• rascunho salvo'}</p>
              </div>
            </div>

            <div className="hidden items-center rounded-xl bg-white/10 p-1 md:flex">
              {(['desktop', 'tablet', 'mobile'] as Device[]).map((item) => {
                const Icon = item === 'desktop' ? Monitor : item === 'tablet' ? Tablet : Smartphone;
                return <button key={item} type="button" onClick={() => setDevice(item)} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-black ${device === item ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-white/10'}`}><Icon size={15} /> {deviceLabel[item]}</button>;
              })}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={saveDraft} disabled={!selectedCampaign} className="hidden min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-50 sm:inline-flex"><Save size={15} /> Salvar rascunho</button>
              <a href={selectedCampaign?.slug ? `/campanha/${selectedCampaign.slug}` : '#'} target="_blank" rel="noreferrer" className={`hidden min-h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-black text-white lg:inline-flex ${selectedCampaign?.slug ? '' : 'pointer-events-none opacity-40'}`}>Landing atual <ExternalLink size={14} /></a>
              <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Fechar editor"><X size={18} /></button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[270px_minmax(0,1fr)_320px]">
            <aside className="order-2 max-h-[38vh] overflow-y-auto border-t border-zinc-200 bg-white p-4 lg:order-none lg:max-h-none lg:border-r lg:border-t-0">
              <label className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400">Landing selecionada
                <div className="relative mt-2">
                  <select value={selectedCampaign?.id || ''} onChange={(event) => setSelectedId(event.target.value)} className="premium-input appearance-none pr-10" disabled={loading}>
                    {!campaigns.length ? <option value="">Nenhuma landing</option> : null}
                    {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                  </select>
                  <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                </div>
              </label>

              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-900">
                Preview experimental. Nenhum ajuste visual desta tela é publicado ou gravado no Supabase nesta fase.
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400">Modelos locais</p><Copy size={14} className="text-zinc-400" /></div>
                <div className="mt-3 flex gap-2"><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Nome do modelo" className="premium-input min-w-0" /><button type="button" onClick={saveTemplate} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Save size={16} /></button></div>
                <div className="mt-3 space-y-2">
                  {templates.map((template) => <article key={template.id} className="rounded-2xl border border-zinc-200 p-3"><div className="flex items-start justify-between gap-2"><button type="button" onClick={() => applyTemplate(template)} className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm">{template.name}</strong><span className="mt-1 block truncate text-[11px] font-semibold text-zinc-400">{template.campaignName}</span></button><button type="button" onClick={() => deleteTemplate(template.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 hover:text-red-600"><Trash2 size={14} /></button></div></article>)}
                  {!templates.length ? <p className="rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-xs font-bold text-zinc-400">Nenhum modelo salvo.</p> : null}
                </div>
              </div>

              <button type="button" onClick={resetDraft} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 text-xs font-black text-zinc-600 hover:border-red-200 hover:text-red-600"><RotateCcw size={15} /> Restaurar padrão</button>
              {message ? <p className="mt-3 rounded-2xl bg-blue-50 p-3 text-xs font-bold leading-relaxed text-blue-800">{message}</p> : null}
            </aside>

            <section className="order-1 min-h-0 overflow-auto bg-zinc-900 p-3 sm:p-6 lg:order-none">
              <div className="mb-3 flex items-center justify-between gap-3 text-white md:hidden">
                <div className="flex items-center rounded-xl bg-white/10 p-1">
                  {(['desktop', 'tablet', 'mobile'] as Device[]).map((item) => {
                    const Icon = item === 'desktop' ? Laptop : item === 'tablet' ? Tablet : Smartphone;
                    return <button key={item} type="button" onClick={() => setDevice(item)} className={`flex h-9 w-9 items-center justify-center rounded-lg ${device === item ? 'bg-white text-zinc-950' : 'text-zinc-300'}`} aria-label={deviceLabel[item]}><Icon size={15} /></button>;
                  })}
                </div>
                <button type="button" onClick={saveDraft} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black"><Save size={14} /> Salvar</button>
              </div>

              <div className="mx-auto overflow-hidden rounded-[24px] bg-white shadow-2xl transition-[width] duration-300" style={{ width: `min(100%, ${frameWidth[device]}px)` }}>
                <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-100 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400"><span>{deviceLabel[device]} • {frameWidth[device]}px</span><span>Preview não publicado</span></div>
                <div className="max-h-[calc(100vh-150px)] overflow-y-auto bg-slate-50">
                  <section
                    className="relative overflow-hidden text-white"
                    style={{
                      minHeight: layout.heroMinHeight,
                      backgroundColor: draft.secondaryColor,
                      backgroundImage: selectedCampaign?.hero_image_url ? `url(${mobile && selectedCampaign.mobile_hero_image_url ? selectedCampaign.mobile_hero_image_url : selectedCampaign.hero_image_url})` : undefined,
                      backgroundPosition: 'center',
                      backgroundSize: 'cover'
                    }}
                  >
                    <div className="absolute inset-0" style={{ background: heroBackground }} />
                    <div className="relative mx-auto h-full px-5 sm:px-8" style={{ paddingTop: layout.heroPaddingTop, paddingBottom: layout.heroPaddingBottom }}>
                      <header className="flex items-center justify-between gap-4">
                        <img src="/campaign-assets/auto-sede-logo-cropped.png" alt="Auto Sede" className={mobile ? 'h-8 w-auto object-contain' : 'h-11 w-auto object-contain'} />
                        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] backdrop-blur">Preview</span>
                      </header>

                      <div className={`grid items-center gap-8 ${desktop ? 'grid-cols-[minmax(0,1fr)_330px]' : 'grid-cols-1'}`} style={{ minHeight: Math.max(layout.heroMinHeight - layout.heroPaddingTop - layout.heroPaddingBottom - 55, 400) }}>
                        <div className="flex min-w-0 flex-col" style={{ alignItems, textAlign, maxWidth: layout.contentMaxWidth, marginLeft: layout.contentAlign === 'right' ? 'auto' : undefined, marginRight: layout.contentAlign === 'center' ? 'auto' : undefined }}>
                          <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur">{selectedCampaign?.hero_eyebrow || 'Evento automotivo'}</span>
                          {selectedCampaign?.logo_url ? (
                            <div className="relative mt-6 inline-flex select-none items-center gap-2">
                              <img
                                src={selectedCampaign.logo_url}
                                alt={selectedCampaign.name || 'Logo do evento'}
                                draggable={false}
                                onPointerDown={beginLogoDrag}
                                onPointerMove={moveLogo}
                                onPointerUp={endLogoDrag}
                                onPointerCancel={endLogoDrag}
                                className="touch-none cursor-grab object-contain drop-shadow-2xl active:cursor-grabbing"
                                style={{ width: layout.logoWidth, maxWidth: '90%', transform: `translate(${layout.logoOffsetX}px, ${layout.logoOffsetY}px)` }}
                              />
                              <span className="pointer-events-none absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg"><Grip size={14} /></span>
                            </div>
                          ) : <h2 className="mt-6 font-black" style={{ fontSize: Math.max(layout.titleSize * 0.48, 22) }}>{selectedCampaign?.name || 'Nome do evento'}</h2>}
                          <h1 className="mt-7 font-black leading-[0.98] tracking-[-0.04em]" style={{ fontSize: layout.titleSize }}>{selectedCampaign?.title || 'Título principal da landing'}</h1>
                          <p className="mt-5 font-medium leading-relaxed text-slate-200" style={{ fontSize: layout.descriptionSize }}>{selectedCampaign?.description || 'Descrição da campanha e chamada para o cliente.'}</p>
                          <div className="mt-6 flex flex-wrap gap-2" style={{ justifyContent }}>
                            {selectedEvent?.start_date ? <span className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-[11px] font-black backdrop-blur">{formatDate(selectedEvent.start_date)}{selectedEvent.end_date ? ` a ${formatDate(selectedEvent.end_date)}` : ''}</span> : null}
                            {selectedEvent?.city ? <span className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-[11px] font-black backdrop-blur">{selectedEvent.city}</span> : null}
                          </div>
                          <div className="mt-7 flex flex-wrap gap-3" style={{ justifyContent, width: layout.buttonFullWidth ? '100%' : undefined }}>
                            <button
                              type="button"
                              className="min-h-12 px-7 text-xs font-black uppercase tracking-wide shadow-xl"
                              style={{
                                width: layout.buttonFullWidth ? '100%' : undefined,
                                borderRadius: layout.buttonRadius,
                                color: draft.buttonTextColor,
                                background: draft.buttonStyle === 'gradient' ? `linear-gradient(120deg, ${draft.primaryColor}, ${draft.gradientColor})` : draft.buttonStyle === 'solid' ? draft.primaryColor : 'transparent',
                                border: draft.buttonStyle === 'outline' ? `2px solid ${draft.primaryColor}` : 'none'
                              }}
                            >{selectedCampaign?.cta_label || 'Simular agora'}</button>
                            {!layout.buttonFullWidth ? <button type="button" className="min-h-12 border border-white/25 bg-white/10 px-7 text-xs font-black uppercase tracking-wide backdrop-blur" style={{ borderRadius: layout.buttonRadius }}>Ver veículos</button> : null}
                          </div>
                        </div>

                        {desktop ? <aside className="border border-white/15 bg-white/10 p-3 shadow-2xl backdrop-blur" style={{ borderRadius: layout.cardRadius }}><div className="bg-white p-5 text-slate-950" style={{ borderRadius: Math.max(layout.cardRadius - 6, 8) }}><span className="rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-700">SIMULAÇÃO SEGURA</span><h3 className="mt-5 text-2xl font-black">Financiamento automotivo</h3><p className="mt-2 text-xs text-slate-500">Taxa referencial de {Number(selectedCampaign?.interest_rate || 1.89).toLocaleString('pt-BR')}% ao mês.</p><div className="mt-5 bg-slate-100 p-4" style={{ borderRadius: Math.max(layout.cardRadius - 10, 8) }}><strong className="block text-3xl font-black">{selectedCampaign?.vehicle_count || 0}</strong><p className="mt-1 text-xs font-semibold text-slate-500">veículos conectados</p></div><button type="button" className="mt-5 min-h-11 w-full text-xs font-black text-white" style={{ borderRadius: layout.buttonRadius, background: draft.primaryColor }}>Começar simulação</button></div></aside> : null}
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-3 bg-white p-5 sm:grid-cols-3 sm:p-8">
                    {(Array.isArray(selectedCampaign?.benefits) && selectedCampaign.benefits.length ? selectedCampaign.benefits : [
                      { title: 'Simulação rápida', description: 'Faça uma estimativa inicial.' },
                      { title: 'Estoque conectado', description: 'Veículos das lojas participantes.' },
                      { title: 'Atendimento direto', description: 'Contato com a loja responsável.' }
                    ]).slice(0, 3).map((benefit: any, index: number) => <article key={index} className="border border-slate-200 bg-slate-50 p-4" style={{ borderRadius: layout.cardRadius }}><span className="flex h-8 w-8 items-center justify-center rounded-xl text-white" style={{ background: draft.primaryColor }}><Sparkles size={14} /></span><h3 className="mt-3 text-base font-black">{benefit.title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">{benefit.description}</p></article>)}
                  </section>
                </div>
              </div>
            </section>

            <aside className="order-3 max-h-[44vh] overflow-y-auto border-t border-zinc-200 bg-white p-4 lg:max-h-none lg:border-l lg:border-t-0">
              <PanelTitle icon={<Palette size={16} />} title="Aparência" />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <ColorField label="Cor principal" value={draft.primaryColor} onChange={(value) => updateDraft({ primaryColor: value })} />
                <ColorField label="Cor de fundo" value={draft.secondaryColor} onChange={(value) => updateDraft({ secondaryColor: value })} />
                <ColorField label="Cor do gradiente" value={draft.gradientColor} onChange={(value) => updateDraft({ gradientColor: value })} />
                <ColorField label="Texto do botão" value={draft.buttonTextColor} onChange={(value) => updateDraft({ buttonTextColor: value })} />
              </div>
              <ToggleField label="Usar gradiente" checked={draft.gradientEnabled} onChange={(checked) => updateDraft({ gradientEnabled: checked })} />
              <RangeField label="Direção do gradiente" value={draft.gradientAngle} min={0} max={360} suffix="°" onChange={(value) => updateDraft({ gradientAngle: value })} />
              <RangeField label="Escurecimento da capa" value={draft.overlayOpacity} min={20} max={95} suffix="%" onChange={(value) => updateDraft({ overlayOpacity: value })} />
              <SelectField label="Estilo do botão" value={draft.buttonStyle} onChange={(value) => updateDraft({ buttonStyle: value as ButtonStyle })} options={[["solid", "Preenchido"], ["outline", "Contorno"], ["gradient", "Gradiente"]]} />

              <div className="my-6 h-px bg-zinc-200" />
              <PanelTitle icon={<Type size={16} />} title={`Tipografia e logo — ${deviceLabel[device]}`} />
              <RangeField label="Largura da logo" value={layout.logoWidth} min={90} max={mobile ? 300 : 480} suffix="px" onChange={(value) => updateDevice({ logoWidth: value })} />
              <RangeField label="Posição horizontal" value={layout.logoOffsetX} min={-240} max={240} suffix="px" onChange={(value) => updateDevice({ logoOffsetX: value })} />
              <RangeField label="Posição vertical" value={layout.logoOffsetY} min={-180} max={180} suffix="px" onChange={(value) => updateDevice({ logoOffsetY: value })} />
              <button type="button" onClick={() => updateDevice({ logoOffsetX: 0, logoOffsetY: 0 })} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-xs font-black text-zinc-600"><Redo2 size={14} /> Centralizar deslocamento</button>
              <RangeField label="Tamanho do título" value={layout.titleSize} min={28} max={88} suffix="px" onChange={(value) => updateDevice({ titleSize: value })} />
              <RangeField label="Tamanho da descrição" value={layout.descriptionSize} min={13} max={24} suffix="px" onChange={(value) => updateDevice({ descriptionSize: value })} />

              <div className="my-6 h-px bg-zinc-200" />
              <PanelTitle icon={<Maximize2 size={16} />} title="Layout responsivo" />
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(['left', 'center', 'right'] as Align[]).map((align) => {
                  const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                  return <button key={align} type="button" onClick={() => updateDevice({ contentAlign: align })} className={`flex min-h-10 items-center justify-center rounded-xl border ${layout.contentAlign === align ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-zinc-200 text-zinc-500'}`} aria-label={`Alinhar ${align}`}><Icon size={16} /></button>;
                })}
              </div>
              <RangeField label="Altura mínima do banner" value={layout.heroMinHeight} min={560} max={1000} suffix="px" onChange={(value) => updateDevice({ heroMinHeight: value })} />
              <RangeField label="Largura do conteúdo" value={layout.contentMaxWidth} min={280} max={desktop ? 920 : mobile ? 380 : 720} suffix="px" onChange={(value) => updateDevice({ contentMaxWidth: value })} />
              <RangeField label="Espaço superior" value={layout.heroPaddingTop} min={20} max={160} suffix="px" onChange={(value) => updateDevice({ heroPaddingTop: value })} />
              <RangeField label="Espaço inferior" value={layout.heroPaddingBottom} min={20} max={180} suffix="px" onChange={(value) => updateDevice({ heroPaddingBottom: value })} />
              <RangeField label="Curvatura dos botões" value={layout.buttonRadius} min={0} max={60} suffix={layout.buttonRadius >= 60 ? 'px +' : 'px'} onChange={(value) => updateDevice({ buttonRadius: value >= 60 ? 999 : value })} displayValue={layout.buttonRadius >= 60 ? 60 : layout.buttonRadius} />
              <RangeField label="Curvatura dos cards" value={layout.cardRadius} min={0} max={48} suffix="px" onChange={(value) => updateDevice({ cardRadius: value })} />
              <ToggleField label="Botão em largura total" checked={layout.buttonFullWidth} onChange={(checked) => updateDevice({ buttonFullWidth: checked })} />
            </aside>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{icon}</span><h3 className="text-sm font-black text-zinc-950">{title}</h3></div>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-[11px] font-black text-zinc-500">{label}<span className="mt-2 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0" /><span className="truncate text-[10px] uppercase text-zinc-500">{value}</span></span></label>;
}

function RangeField({ label, value, displayValue, min, max, suffix, onChange }: { label: string; value: number; displayValue?: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  const shown = displayValue ?? value;
  return <label className="mt-4 block text-[11px] font-black text-zinc-500"><span className="flex items-center justify-between gap-3"><span>{label}</span><strong className="text-zinc-900">{Math.round(shown)}{suffix}</strong></span><input type="range" min={min} max={max} value={clamp(shown, min, max)} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-indigo-600" /></label>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-zinc-50 p-3 text-xs font-black text-zinc-600"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-indigo-600" /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="mt-4 block text-[11px] font-black text-zinc-500">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="premium-input mt-2">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
