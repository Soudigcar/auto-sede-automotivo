'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Grip,
  ImagePlus,
  Layers3,
  LayoutTemplate,
  Lock,
  Maximize2,
  Minimize2,
  Monitor,
  Move,
  Palette,
  Redo2,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Device = 'desktop' | 'tablet' | 'mobile';
type Align = 'left' | 'center' | 'right';
type ButtonStyle = 'solid' | 'outline' | 'gradient';
type EditableElement = 'logo' | 'content' | 'simulator';
type SelectedElement = 'background' | EditableElement;

type ElementBox = {
  x: number;
  y: number;
  width: number;
  visible: boolean;
  locked: boolean;
};

type DeviceLayout = {
  heroMinHeight: number;
  titleSize: number;
  descriptionSize: number;
  buttonRadius: number;
  buttonFullWidth: boolean;
  contentAlign: Align;
  cardRadius: number;
  backgroundZoom: number;
  backgroundX: number;
  backgroundY: number;
  boxes: Record<EditableElement, ElementBox>;
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
  localLogoDataUrl: string;
  localHeroDataUrl: string;
  localMobileHeroDataUrl: string;
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

type InteractionState = {
  pointerId: number;
  mode: 'move' | 'resize';
  element: EditableElement;
  startX: number;
  startY: number;
  origin: ElementBox;
  snapshot: VisualDraft;
} | null;

const frameWidth: Record<Device, number> = { desktop: 1440, tablet: 768, mobile: 390 };
const deviceLabel: Record<Device, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
const templateStorageKey = 'auto-sede:landing-visual:templates:v2';
const legacyTemplateStorageKey = 'auto-sede:landing-visual:templates:v1';
const editableElements: EditableElement[] = ['logo', 'content', 'simulator'];

function box(x: number, y: number, width: number): ElementBox {
  return { x, y, width, visible: true, locked: false };
}

function defaultLayout(device: Device): DeviceLayout {
  if (device === 'mobile') {
    return {
      heroMinHeight: 1240,
      titleSize: 42,
      descriptionSize: 16,
      buttonRadius: 24,
      buttonFullWidth: true,
      contentAlign: 'left',
      cardRadius: 26,
      backgroundZoom: 110,
      backgroundX: 50,
      backgroundY: 50,
      boxes: {
        logo: box(6, 5, 50),
        content: box(6, 24, 88),
        simulator: box(5, 69, 90)
      }
    };
  }
  if (device === 'tablet') {
    return {
      heroMinHeight: 1180,
      titleSize: 58,
      descriptionSize: 18,
      buttonRadius: 28,
      buttonFullWidth: false,
      contentAlign: 'left',
      cardRadius: 30,
      backgroundZoom: 105,
      backgroundX: 50,
      backgroundY: 50,
      boxes: {
        logo: box(6, 5, 34),
        content: box(6, 25, 86),
        simulator: box(14, 68, 72)
      }
    };
  }
  return {
    heroMinHeight: 880,
    titleSize: 70,
    descriptionSize: 19,
    buttonRadius: 999,
    buttonFullWidth: false,
    contentAlign: 'left',
    cardRadius: 34,
    backgroundZoom: 100,
    backgroundX: 50,
    backgroundY: 50,
    boxes: {
      logo: box(4, 5, 23),
      content: box(4, 27, 58),
      simulator: box(68, 29, 28)
    }
  };
}

function makeDefaultDraft(campaign?: any): VisualDraft {
  return {
    primaryColor: campaign?.primary_color || '#DC2626',
    secondaryColor: campaign?.secondary_color || '#071020',
    gradientEnabled: true,
    gradientColor: '#7F1D1D',
    gradientAngle: 120,
    overlayOpacity: 76,
    buttonStyle: 'solid',
    buttonTextColor: '#FFFFFF',
    localLogoDataUrl: '',
    localHeroDataUrl: '',
    localMobileHeroDataUrl: '',
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

function safeBox(value: unknown, fallback: ElementBox): ElementBox {
  if (!value || typeof value !== 'object') return fallback;
  return { ...fallback, ...(value as Partial<ElementBox>) };
}

function safeLayout(value: unknown, fallback: DeviceLayout): DeviceLayout {
  if (!value || typeof value !== 'object') return fallback;
  const incoming = value as Partial<DeviceLayout> & { logoWidth?: number; logoOffsetX?: number; logoOffsetY?: number; contentMaxWidth?: number };
  const boxes = incoming.boxes || ({} as Record<EditableElement, ElementBox>);
  const migratedLogo = incoming.logoWidth
    ? {
        ...fallback.boxes.logo,
        width: Math.max(8, Math.min(70, (incoming.logoWidth / frameWidth.desktop) * 100)),
        x: Math.max(0, Math.min(90, fallback.boxes.logo.x + Number(incoming.logoOffsetX || 0) / 12)),
        y: Math.max(0, Math.min(90, fallback.boxes.logo.y + Number(incoming.logoOffsetY || 0) / 12))
      }
    : fallback.boxes.logo;
  return {
    ...fallback,
    ...incoming,
    boxes: {
      logo: safeBox(boxes.logo, migratedLogo),
      content: safeBox(boxes.content, fallback.boxes.content),
      simulator: safeBox(boxes.simulator, fallback.boxes.simulator)
    }
  };
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
    localLogoDataUrl: incoming.localLogoDataUrl || '',
    localHeroDataUrl: incoming.localHeroDataUrl || '',
    localMobileHeroDataUrl: incoming.localMobileHeroDataUrl || '',
    devices: {
      desktop: safeLayout(incoming.devices?.desktop, fallback.devices.desktop),
      tablet: safeLayout(incoming.devices?.tablet, fallback.devices.tablet),
      mobile: safeLayout(incoming.devices?.mobile, fallback.devices.mobile)
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

async function optimizeLocalImage(file: File, kind: 'logo' | 'background') {
  if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem válida.');
  if (file.size > 14 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 14 MB.');

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      next.src = objectUrl;
    });
    const maxWidth = kind === 'logo' ? 1200 : 2200;
    const maxHeight = kind === 'logo' ? 900 : 1600;
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu processar a imagem.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const keepTransparency = kind === 'logo' && file.type === 'image/png';
    return canvas.toDataURL(keepTransparency ? 'image/png' : 'image/jpeg', keepTransparency ? undefined : 0.86);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function CampaignVisualEditorLauncher() {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [clientMode, setClientMode] = useState(false);
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
  const [selectedElement, setSelectedElement] = useState<SelectedElement>('content');
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [zoom, setZoom] = useState(80);
  const [past, setPast] = useState<VisualDraft[]>([]);
  const [future, setFuture] = useState<VisualDraft[]>([]);
  const heroRef = useRef<HTMLDivElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  const selectedCampaign = campaigns.find((item) => item.id === selectedId) || campaigns[0] || null;
  const selectedEvent = events.find((item) => item.id === selectedCampaign?.event_id) || selectedCampaign?.event || null;
  const layout = draft.devices[device];
  const logoSource = draft.localLogoDataUrl || selectedCampaign?.logo_url || '';
  const desktopHeroSource = draft.localHeroDataUrl || selectedCampaign?.hero_image_url || '';
  const mobileHeroSource = draft.localMobileHeroDataUrl || selectedCampaign?.mobile_hero_image_url || desktopHeroSource;
  const heroSource = device === 'mobile' ? mobileHeroSource : desktopHeroSource;

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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(templateStorageKey) || localStorage.getItem(legacyTemplateStorageKey) || '[]';
      const stored = JSON.parse(raw);
      setTemplates(Array.isArray(stored) ? stored.map((item: SavedTemplate) => ({ ...item, draft: safeDraft(item.draft) })) : []);
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
      setPast([]);
      setFuture([]);
      setMessage(stored ? 'Rascunho visual local restaurado.' : 'Configuração visual padrão carregada.');
    } catch {
      setDraft(makeDefaultDraft(selectedCampaign));
      setDirty(false);
    }
  }, [selectedCampaign?.id]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (clientMode) setClientMode(false);
        else setOpen(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  function commit(next: VisualDraft, snapshot = draft) {
    setPast((current) => [...current.slice(-39), cloneDraft(snapshot)]);
    setFuture([]);
    setDraft({ ...next, updatedAt: new Date().toISOString() });
    setDirty(true);
  }

  function updateDraft(patch: Partial<VisualDraft>) {
    commit({ ...draft, ...patch });
  }

  function updateDevice(patch: Partial<DeviceLayout>) {
    commit({
      ...draft,
      devices: { ...draft.devices, [device]: { ...layout, ...patch } }
    });
  }

  function updateBox(element: EditableElement, patch: Partial<ElementBox>, withHistory = true) {
    const next = {
      ...draft,
      devices: {
        ...draft.devices,
        [device]: {
          ...layout,
          boxes: { ...layout.boxes, [element]: { ...layout.boxes[element], ...patch } }
        }
      },
      updatedAt: new Date().toISOString()
    };
    if (withHistory) commit(next);
    else {
      setDraft(next);
      setDirty(true);
    }
  }

  function undo() {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setPast((current) => current.slice(0, -1));
    setFuture((current) => [cloneDraft(draft), ...current].slice(0, 40));
    setDraft(cloneDraft(previous));
    setDirty(true);
    setMessage('Alteração desfeita.');
  }

  function redo() {
    if (!future.length) return;
    const next = future[0];
    setFuture((current) => current.slice(1));
    setPast((current) => [...current.slice(-39), cloneDraft(draft)]);
    setDraft(cloneDraft(next));
    setDirty(true);
    setMessage('Alteração refeita.');
  }

  function saveDraft() {
    if (!selectedCampaign) return;
    try {
      localStorage.setItem(storageKey(selectedCampaign), JSON.stringify(draft));
      setDirty(false);
      setMessage(`Rascunho salvo neste navegador para ${selectedCampaign.name}.`);
    } catch {
      setMessage('O navegador ficou sem espaço para salvar. Tente usar imagens menores.');
    }
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
    try {
      localStorage.setItem(templateStorageKey, JSON.stringify(next));
      setTemplates(next);
      setTemplateName('');
      setMessage(`Modelo “${name}” salvo neste navegador.`);
    } catch {
      setMessage('Não foi possível salvar o modelo. Reduza o tamanho das imagens locais.');
    }
  }

  function applyTemplate(template: SavedTemplate) {
    commit(safeDraft(cloneDraft(template.draft), selectedCampaign));
    setMessage(`Modelo “${template.name}” aplicado ao preview.`);
  }

  function deleteTemplate(templateId: string) {
    const next = templates.filter((item) => item.id !== templateId);
    setTemplates(next);
    localStorage.setItem(templateStorageKey, JSON.stringify(next));
  }

  function resetDraft() {
    if (!selectedCampaign) return;
    commit(makeDefaultDraft(selectedCampaign));
    setMessage('Configuração visual restaurada para o padrão.');
  }

  async function handleLocalAsset(file: File | undefined, kind: 'logo' | 'background') {
    if (!file) return;
    setMessage('Processando imagem local...');
    try {
      const dataUrl = await optimizeLocalImage(file, kind);
      if (kind === 'logo') {
        updateDraft({ localLogoDataUrl: dataUrl });
        setSelectedElement('logo');
      } else if (device === 'mobile') {
        updateDraft({ localMobileHeroDataUrl: dataUrl });
        setSelectedElement('background');
      } else {
        updateDraft({ localHeroDataUrl: dataUrl });
        setSelectedElement('background');
      }
      setMessage('Imagem aplicada ao preview local. Salve o rascunho para mantê-la neste navegador.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível processar a imagem.');
    }
  }

  function beginInteraction(event: React.PointerEvent<HTMLElement>, element: EditableElement, mode: 'move' | 'resize') {
    const currentBox = layout.boxes[element];
    if (currentBox.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedElement(element);
    setInteraction({
      pointerId: event.pointerId,
      mode,
      element,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...currentBox },
      snapshot: cloneDraft(draft)
    });
  }

  function moveInteraction(event: React.PointerEvent<HTMLElement>) {
    if (!interaction || interaction.pointerId !== event.pointerId || !heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const deltaX = ((event.clientX - interaction.startX) / rect.width) * 100;
    const deltaY = ((event.clientY - interaction.startY) / rect.height) * 100;
    if (interaction.mode === 'move') {
      updateBox(interaction.element, {
        x: clamp(interaction.origin.x + deltaX, 0, 100 - interaction.origin.width),
        y: clamp(interaction.origin.y + deltaY, 0, 94)
      }, false);
    } else {
      updateBox(interaction.element, {
        width: clamp(interaction.origin.width + deltaX, interaction.element === 'logo' ? 8 : 18, 100 - interaction.origin.x)
      }, false);
    }
  }

  function endInteraction(event: React.PointerEvent<HTMLElement>) {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    setPast((current) => [...current.slice(-39), interaction.snapshot]);
    setFuture([]);
    setInteraction(null);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  }

  const heroBackground = draft.gradientEnabled
    ? `linear-gradient(${draft.gradientAngle}deg, ${hexToRgba(draft.secondaryColor, draft.overlayOpacity)} 8%, ${hexToRgba(draft.secondaryColor, Math.max(draft.overlayOpacity - 18, 10))} 58%, ${hexToRgba(draft.gradientColor, Math.max(draft.overlayOpacity - 28, 8))} 100%)`
    : hexToRgba(draft.secondaryColor, draft.overlayOpacity);

  function editableFrame(element: EditableElement, children: React.ReactNode) {
    const currentBox = layout.boxes[element];
    if (!currentBox.visible) return null;
    const active = selectedElement === element;
    return (
      <div
        key={element}
        className={`absolute select-none ${active ? 'z-30' : 'z-20'} ${currentBox.locked ? 'cursor-default' : 'cursor-move'}`}
        style={{ left: `${currentBox.x}%`, top: `${currentBox.y}%`, width: `${currentBox.width}%` }}
        onClick={(event) => { event.stopPropagation(); setSelectedElement(element); }}
        onPointerDown={(event) => beginInteraction(event, element, 'move')}
        onPointerMove={moveInteraction}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
      >
        <div className={`relative ${active ? 'rounded-xl outline outline-2 outline-indigo-400 outline-offset-4' : ''}`}>
          {children}
          {active ? (
            <>
              <span className="pointer-events-none absolute -left-2 -top-9 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white shadow-lg"><Move size={11} /> {element === 'logo' ? 'Logo' : element === 'content' ? 'Conteúdo' : 'Simulador'}</span>
              {!currentBox.locked ? (
                <button
                  type="button"
                  aria-label={`Redimensionar ${element}`}
                  className="absolute -bottom-4 -right-4 z-40 flex h-9 w-9 touch-none items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-white shadow-xl cursor-nwse-resize"
                  onPointerDown={(event) => beginInteraction(event, element, 'resize')}
                  onPointerMove={moveInteraction}
                  onPointerUp={endInteraction}
                  onPointerCancel={endInteraction}
                ><Grip size={15} /></button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function previewPage(client = false) {
    const mobile = device === 'mobile';
    const alignItems = layout.contentAlign === 'center' ? 'center' : layout.contentAlign === 'right' ? 'flex-end' : 'flex-start';
    const justifyContent = layout.contentAlign === 'center' ? 'center' : layout.contentAlign === 'right' ? 'flex-end' : 'flex-start';
    const benefits = Array.isArray(selectedCampaign?.benefits) && selectedCampaign.benefits.length
      ? selectedCampaign.benefits
      : [
          { title: 'Simulação rápida', description: 'Faça uma estimativa inicial antes do atendimento.' },
          { title: 'Estoque conectado', description: 'Veículos das lojas participantes.' },
          { title: 'Atendimento direto', description: 'Contato com a loja responsável.' }
        ];
    const vehicleCards = mobile ? 3 : device === 'tablet' ? 4 : 8;

    return (
      <div className="bg-slate-50 text-slate-950">
        <section
          ref={heroRef}
          className="relative overflow-hidden text-white"
          style={{ minHeight: layout.heroMinHeight, backgroundColor: draft.secondaryColor }}
          onClick={() => setSelectedElement('background')}
        >
          {heroSource ? (
            <img
              src={heroSource}
              alt="Capa local da campanha"
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                objectPosition: `${layout.backgroundX}% ${layout.backgroundY}%`,
                transform: `scale(${layout.backgroundZoom / 100})`
              }}
            />
          ) : null}
          <div className="absolute inset-0" style={{ background: heroBackground }} />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 sm:px-8">
            <img src="/campaign-assets/auto-sede-logo-cropped.png" alt="Auto Sede" className={mobile ? 'h-8 w-auto object-contain' : 'h-11 w-auto object-contain'} />
            {!client ? <span className="rounded-full border border-white/20 bg-black/20 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] backdrop-blur">Clique no fundo para editar</span> : null}
          </div>

          {editableFrame('logo', logoSource ? (
            <img
              src={logoSource}
              alt={selectedCampaign?.name || 'Logo do evento'}
              draggable={false}
              onDoubleClick={(event) => { event.stopPropagation(); logoInputRef.current?.click(); }}
              className="block h-auto w-full object-contain drop-shadow-2xl"
            />
          ) : (
            <button type="button" onDoubleClick={() => logoInputRef.current?.click()} className="flex min-h-24 w-full items-center justify-center rounded-2xl border-2 border-dashed border-white/40 bg-black/20 p-4 text-xs font-black uppercase tracking-wide text-white"><ImagePlus size={22} className="mr-2" /> Adicionar logo</button>
          ))}

          {editableFrame('content', (
            <div className="flex min-w-0 flex-col" style={{ alignItems, textAlign: layout.contentAlign }}>
              <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur">{selectedCampaign?.hero_eyebrow || 'Evento automotivo'}</span>
              <h1 className="mt-5 font-black leading-[0.98] tracking-[-0.04em]" style={{ fontSize: layout.titleSize }}>{selectedCampaign?.title || 'Título principal da landing'}</h1>
              <p className="mt-5 font-medium leading-relaxed text-slate-200" style={{ fontSize: layout.descriptionSize }}>{selectedCampaign?.description || 'Descrição da campanha e chamada para o cliente.'}</p>
              <div className="mt-5 flex flex-wrap gap-2" style={{ justifyContent }}>
                {selectedEvent?.start_date ? <span className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-[11px] font-black backdrop-blur">{formatDate(selectedEvent.start_date)}{selectedEvent.end_date ? ` a ${formatDate(selectedEvent.end_date)}` : ''}</span> : null}
                {selectedEvent?.city ? <span className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-[11px] font-black backdrop-blur">{selectedEvent.city}</span> : null}
              </div>
              <div className="mt-6 flex flex-wrap gap-3" style={{ justifyContent, width: layout.buttonFullWidth ? '100%' : undefined }}>
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
          ))}

          {editableFrame('simulator', (
            <aside className="border border-white/15 bg-white/10 p-3 shadow-2xl backdrop-blur" style={{ borderRadius: layout.cardRadius }}>
              <div className="bg-white p-5 text-slate-950" style={{ borderRadius: Math.max(layout.cardRadius - 6, 8) }}>
                <span className="rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-700">SIMULAÇÃO SEGURA</span>
                <h3 className="mt-5 text-2xl font-black">Financiamento automotivo</h3>
                <p className="mt-2 text-xs text-slate-500">Taxa referencial de {Number(selectedCampaign?.interest_rate || 1.89).toLocaleString('pt-BR')}% ao mês.</p>
                <div className="mt-5 bg-slate-100 p-4" style={{ borderRadius: Math.max(layout.cardRadius - 10, 8) }}>
                  <strong className="block text-3xl font-black">{selectedCampaign?.vehicle_count || 0}</strong>
                  <p className="mt-1 text-xs font-semibold text-slate-500">veículos conectados</p>
                </div>
                <button type="button" className="mt-5 min-h-11 w-full text-xs font-black text-white" style={{ borderRadius: layout.buttonRadius, background: draft.primaryColor }}>Começar simulação</button>
              </div>
            </aside>
          ))}

          {!client ? (
            <button type="button" onClick={(event) => { event.stopPropagation(); backgroundInputRef.current?.click(); }} className="absolute bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/55 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur"><Upload size={13} /> Trocar fundo</button>
          ) : null}
        </section>

        <section className="bg-white px-5 py-14 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-[1380px]">
            <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: draft.primaryColor }}>Vantagens do evento</p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {benefits.slice(0, 3).map((benefit: any, index: number) => (
                <article key={index} className="border border-slate-200 bg-slate-50 p-6 shadow-sm" style={{ borderRadius: layout.cardRadius }}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-white" style={{ background: draft.primaryColor }}><Sparkles size={17} /></span>
                  <h3 className="mt-4 text-xl font-black">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{benefit.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-100 px-5 py-16 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-[1380px]">
            <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: draft.primaryColor }}>Estoque do evento</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Escolha seu próximo carro</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-500 sm:text-base">Prévia da vitrine completa que o cliente encontrará abaixo do banner principal.</p>
            <div className={`mt-8 grid gap-5 ${mobile ? 'grid-cols-1' : device === 'tablet' ? 'grid-cols-2' : 'grid-cols-4'}`}>
              {Array.from({ length: vehicleCards }).map((_, index) => (
                <article key={index} className="overflow-hidden border border-slate-200 bg-white shadow-sm" style={{ borderRadius: layout.cardRadius }}>
                  <div className="aspect-[16/10] bg-gradient-to-br from-slate-200 to-slate-300" />
                  <div className="p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: draft.primaryColor }}>Loja participante</p>
                    <h3 className="mt-2 text-xl font-black">Veículo em destaque</h3>
                    <p className="mt-1 text-sm text-slate-500">Modelo • Ano • Versão</p>
                    <strong className="mt-4 block text-2xl font-black">R$ 00.000,00</strong>
                    <button type="button" className="mt-5 min-h-11 w-full text-xs font-black text-white" style={{ background: draft.primaryColor, borderRadius: layout.buttonRadius }}>Simular este veículo</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-16 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-[1380px]">
            <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: draft.primaryColor }}>Rede participante</p>
            <h2 className="mt-3 text-3xl font-black">Lojas e apoiadores</h2>
            <div className="mt-7 flex flex-wrap gap-3">
              {Array.from({ length: Math.max(3, selectedCampaign?.store_count || 3) }).slice(0, 8).map((_, index) => <span key={index} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-black">Loja participante {index + 1}</span>)}
            </div>
            {Array.isArray(selectedCampaign?.sponsor_logo_urls) && selectedCampaign.sponsor_logo_urls.length ? (
              <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-slate-200 pt-8">
                {selectedCampaign.sponsor_logo_urls.map((url: string) => <img key={url} src={url} alt="Patrocinador" className="h-14 max-w-44 object-contain" />)}
              </div>
            ) : null}
          </div>
        </section>

        <footer className="px-5 py-10 text-center text-xs font-semibold text-slate-300" style={{ background: draft.secondaryColor }}>
          © {new Date().getFullYear()} Auto Sede. Condições sujeitas à análise e confirmação da loja responsável.
        </footer>
      </div>
    );
  }

  const gridColumns = `${leftOpen ? '280px' : '0px'} minmax(0,1fr) ${rightOpen ? '350px' : '0px'}`;

  return (
    <>
      <section className="mb-6 rounded-[28px] border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-violet-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><LayoutTemplate size={22} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Editor visual responsivo — fase 2</p>
              <h2 className="mt-1 text-xl font-black text-zinc-950">Movimente, redimensione e substitua os elementos</h2>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-zinc-500">Logo, conteúdo e simulador são independentes. Troque imagens localmente, ajuste o fundo, recolha os painéis e abra a landing em modo cliente sem gravar nada no Supabase.</p>
            </div>
          </div>
          <button type="button" onClick={openEditor} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-black text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500"><Maximize2 size={17} /> Abrir editor completo</button>
        </div>
      </section>

      <input ref={logoInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void handleLocalAsset(event.target.files?.[0], 'logo'); event.currentTarget.value = ''; }} />
      <input ref={backgroundInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void handleLocalAsset(event.target.files?.[0], 'background'); event.currentTarget.value = ''; }} />

      {open ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950 text-zinc-950">
          {clientMode ? (
            <div className="absolute inset-0 z-[120] overflow-auto bg-slate-50">
              <div className="fixed right-4 top-4 z-[150] flex items-center gap-2">
                <span className="hidden rounded-xl bg-black/70 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur sm:inline-flex">Modo cliente • {deviceLabel[device]}</span>
                <button type="button" onClick={() => setClientMode(false)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black text-white shadow-xl"><Minimize2 size={15} /> Voltar ao editor</button>
              </div>
              <div className={device === 'desktop' ? 'w-full' : 'mx-auto min-h-screen shadow-2xl'} style={device === 'desktop' ? undefined : { width: frameWidth[device] }}>
                {previewPage(true)}
              </div>
            </div>
          ) : null}

          <header className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-3 text-white sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 sm:flex"><Sparkles size={19} /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">Editor visual completo</p>
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
              <button type="button" onClick={undo} disabled={!past.length} className="hidden h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white disabled:opacity-30 sm:flex" aria-label="Desfazer"><Undo2 size={16} /></button>
              <button type="button" onClick={redo} disabled={!future.length} className="hidden h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white disabled:opacity-30 sm:flex" aria-label="Refazer"><Redo2 size={16} /></button>
              <button type="button" onClick={() => setClientMode(true)} className="hidden min-h-10 items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-4 text-xs font-black text-indigo-100 lg:inline-flex"><Maximize2 size={15} /> Modo cliente</button>
              <button type="button" onClick={saveDraft} disabled={!selectedCampaign} className="hidden min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-50 sm:inline-flex"><Save size={15} /> Salvar rascunho</button>
              <a href={selectedCampaign?.slug ? `/campanha/${selectedCampaign.slug}` : '#'} target="_blank" rel="noreferrer" className={`hidden min-h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-black text-white xl:inline-flex ${selectedCampaign?.slug ? '' : 'pointer-events-none opacity-40'}`}>Landing atual <ExternalLink size={14} /></a>
              <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Fechar editor"><X size={18} /></button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 transition-[grid-template-columns] duration-300" style={{ gridTemplateColumns: gridColumns }}>
            <aside className={`min-w-0 overflow-y-auto border-r border-zinc-200 bg-white transition-opacity ${leftOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
              <div className="w-[280px] p-4">
                <label className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400">Landing selecionada
                  <div className="relative mt-2">
                    <select value={selectedCampaign?.id || ''} onChange={(event) => setSelectedId(event.target.value)} className="premium-input appearance-none pr-10" disabled={loading}>
                      {!campaigns.length ? <option value="">Nenhuma landing</option> : null}
                      {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                    </select>
                    <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  </div>
                </label>

                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-900">Tudo desta tela é local. Nenhuma imagem, posição ou estilo é publicado ou gravado no Supabase.</div>

                <div className="mt-5">
                  <PanelTitle icon={<Layers3 size={16} />} title={`Camadas — ${deviceLabel[device]}`} />
                  <div className="mt-3 space-y-2">
                    <LayerRow label="Imagem de fundo" active={selectedElement === 'background'} onSelect={() => setSelectedElement('background')} />
                    {editableElements.map((element) => {
                      const currentBox = layout.boxes[element];
                      return (
                        <LayerRow
                          key={element}
                          label={element === 'logo' ? 'Logomarca' : element === 'content' ? 'Textos e botões' : 'Simulador'}
                          active={selectedElement === element}
                          visible={currentBox.visible}
                          locked={currentBox.locked}
                          onSelect={() => setSelectedElement(element)}
                          onVisible={() => updateBox(element, { visible: !currentBox.visible })}
                          onLock={() => updateBox(element, { locked: !currentBox.locked })}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400">Modelos locais</p><Copy size={14} className="text-zinc-400" /></div>
                  <div className="mt-3 flex gap-2"><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Nome do modelo" className="premium-input min-w-0" /><button type="button" onClick={saveTemplate} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Save size={16} /></button></div>
                  <div className="mt-3 space-y-2">
                    {templates.map((template) => <article key={template.id} className="rounded-2xl border border-zinc-200 p-3"><div className="flex items-start justify-between gap-2"><button type="button" onClick={() => applyTemplate(template)} className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm">{template.name}</strong><span className="mt-1 block truncate text-[11px] font-semibold text-zinc-400">{template.campaignName}</span></button><button type="button" onClick={() => deleteTemplate(template.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 hover:text-red-600"><Trash2 size={14} /></button></div></article>)}
                    {!templates.length ? <p className="rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-xs font-bold text-zinc-400">Nenhum modelo salvo.</p> : null}
                  </div>
                </div>

                <button type="button" onClick={resetDraft} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 text-xs font-black text-zinc-600 hover:border-red-200 hover:text-red-600"><RotateCcw size={15} /> Restaurar padrão</button>
                {message ? <p className="mt-3 rounded-2xl bg-blue-50 p-3 text-xs font-bold leading-relaxed text-blue-800">{message}</p> : null}
              </div>
            </aside>

            <section className="relative min-w-0 overflow-auto bg-zinc-900 p-3 sm:p-5">
              <button type="button" onClick={() => setLeftOpen((current) => !current)} className="fixed left-0 top-1/2 z-[115] flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-white/15 bg-zinc-800 text-white shadow-xl lg:absolute" aria-label={leftOpen ? 'Recolher painel esquerdo' : 'Abrir painel esquerdo'}>{leftOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}</button>
              <button type="button" onClick={() => setRightOpen((current) => !current)} className="fixed right-0 top-1/2 z-[115] flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-xl border border-r-0 border-white/15 bg-zinc-800 text-white shadow-xl lg:absolute" aria-label={rightOpen ? 'Recolher painel direito' : 'Abrir painel direito'}>{rightOpen ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-white">
                <div className="flex items-center rounded-xl bg-white/10 p-1 md:hidden">
                  {(['desktop', 'tablet', 'mobile'] as Device[]).map((item) => {
                    const Icon = item === 'desktop' ? Monitor : item === 'tablet' ? Tablet : Smartphone;
                    return <button key={item} type="button" onClick={() => setDevice(item)} className={`flex h-9 w-9 items-center justify-center rounded-lg ${device === item ? 'bg-white text-zinc-950' : 'text-zinc-300'}`} aria-label={deviceLabel[item]}><Icon size={15} /></button>;
                  })}
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/10 p-1">
                  <button type="button" onClick={() => setZoom((current) => clamp(current - 10, 40, 100))} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10" aria-label="Diminuir zoom"><ZoomOut size={16} /></button>
                  <span className="min-w-12 text-center text-[11px] font-black">{zoom}%</span>
                  <button type="button" onClick={() => setZoom((current) => clamp(current + 10, 40, 100))} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10" aria-label="Aumentar zoom"><ZoomIn size={16} /></button>
                </div>
                <button type="button" onClick={() => setClientMode(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black"><Maximize2 size={14} /> Expandir preview</button>
              </div>

              <div className="mx-auto" style={{ width: `min(100%, ${frameWidth[device] * zoom / 100}px)` }}>
                <div
                  className="overflow-hidden rounded-[24px] bg-white shadow-2xl"
                  style={{ width: frameWidth[device], zoom: zoom / 100 } as any}
                >
                  <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-100 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400"><span>{deviceLabel[device]} • {frameWidth[device]}px</span><span>Preview local não publicado</span></div>
                  {previewPage(false)}
                </div>
              </div>
            </section>

            <aside className={`min-w-0 overflow-y-auto border-l border-zinc-200 bg-white transition-opacity ${rightOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
              <div className="w-[350px] p-4">
                <PanelTitle icon={selectedElement === 'background' ? <ImagePlus size={16} /> : selectedElement === 'logo' ? <ImagePlus size={16} /> : selectedElement === 'content' ? <Type size={16} /> : <LayoutTemplate size={16} />} title={selectedElement === 'background' ? 'Imagem de fundo' : selectedElement === 'logo' ? 'Logomarca' : selectedElement === 'content' ? 'Textos e botões' : 'Simulador'} />

                {selectedElement === 'background' ? (
                  <>
                    <AssetControl label={device === 'mobile' ? 'Fundo do mobile' : 'Fundo do desktop/tablet'} value={heroSource} onUpload={() => backgroundInputRef.current?.click()} onRemove={() => updateDraft(device === 'mobile' ? { localMobileHeroDataUrl: '' } : { localHeroDataUrl: '' })} />
                    <RangeField label="Zoom da imagem" value={layout.backgroundZoom} min={70} max={180} suffix="%" onChange={(value) => updateDevice({ backgroundZoom: value })} />
                    <RangeField label="Ponto focal horizontal" value={layout.backgroundX} min={0} max={100} suffix="%" onChange={(value) => updateDevice({ backgroundX: value })} />
                    <RangeField label="Ponto focal vertical" value={layout.backgroundY} min={0} max={100} suffix="%" onChange={(value) => updateDevice({ backgroundY: value })} />
                  </>
                ) : null}

                {selectedElement === 'logo' ? (
                  <>
                    <AssetControl label="Logo local do evento" value={logoSource} onUpload={() => logoInputRef.current?.click()} onRemove={() => updateDraft({ localLogoDataUrl: '' })} />
                    <p className="mt-3 rounded-xl bg-indigo-50 p-3 text-[11px] font-bold leading-relaxed text-indigo-800">Clique uma vez para selecionar. Arraste para mover, use a alça inferior para redimensionar e dê dois cliques para trocar a imagem.</p>
                    <ElementPositionControls element="logo" layout={layout} updateBox={updateBox} />
                  </>
                ) : null}

                {selectedElement === 'content' ? (
                  <>
                    <ElementPositionControls element="content" layout={layout} updateBox={updateBox} />
                    <RangeField label="Tamanho do título" value={layout.titleSize} min={28} max={96} suffix="px" onChange={(value) => updateDevice({ titleSize: value })} />
                    <RangeField label="Tamanho da descrição" value={layout.descriptionSize} min={13} max={26} suffix="px" onChange={(value) => updateDevice({ descriptionSize: value })} />
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {(['left', 'center', 'right'] as Align[]).map((align) => {
                        const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                        return <button key={align} type="button" onClick={() => updateDevice({ contentAlign: align })} className={`flex min-h-10 items-center justify-center rounded-xl border ${layout.contentAlign === align ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-zinc-200 text-zinc-500'}`} aria-label={`Alinhar ${align}`}><Icon size={16} /></button>;
                      })}
                    </div>
                    <ToggleField label="Botão em largura total" checked={layout.buttonFullWidth} onChange={(checked) => updateDevice({ buttonFullWidth: checked })} />
                  </>
                ) : null}

                {selectedElement === 'simulator' ? (
                  <>
                    <p className="mt-3 rounded-xl bg-indigo-50 p-3 text-[11px] font-bold leading-relaxed text-indigo-800">Arraste o card para qualquer posição e use a alça inferior para aumentar ou diminuir sua largura.</p>
                    <ElementPositionControls element="simulator" layout={layout} updateBox={updateBox} />
                    <RangeField label="Curvatura do simulador" value={layout.cardRadius} min={0} max={50} suffix="px" onChange={(value) => updateDevice({ cardRadius: value })} />
                  </>
                ) : null}

                <div className="my-6 h-px bg-zinc-200" />
                <PanelTitle icon={<Palette size={16} />} title="Aparência geral" />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <ColorField label="Cor principal" value={draft.primaryColor} onChange={(value) => updateDraft({ primaryColor: value })} />
                  <ColorField label="Cor de fundo" value={draft.secondaryColor} onChange={(value) => updateDraft({ secondaryColor: value })} />
                  <ColorField label="Cor do gradiente" value={draft.gradientColor} onChange={(value) => updateDraft({ gradientColor: value })} />
                  <ColorField label="Texto do botão" value={draft.buttonTextColor} onChange={(value) => updateDraft({ buttonTextColor: value })} />
                </div>
                <ToggleField label="Usar gradiente" checked={draft.gradientEnabled} onChange={(checked) => updateDraft({ gradientEnabled: checked })} />
                <RangeField label="Direção do gradiente" value={draft.gradientAngle} min={0} max={360} suffix="°" onChange={(value) => updateDraft({ gradientAngle: value })} />
                <RangeField label="Escurecimento da capa" value={draft.overlayOpacity} min={10} max={95} suffix="%" onChange={(value) => updateDraft({ overlayOpacity: value })} />
                <SelectField label="Estilo do botão" value={draft.buttonStyle} onChange={(value) => updateDraft({ buttonStyle: value as ButtonStyle })} options={[["solid", "Preenchido"], ["outline", "Contorno"], ["gradient", "Gradiente"]]} />
                <RangeField label="Curvatura dos botões" value={layout.buttonRadius >= 60 ? 60 : layout.buttonRadius} min={0} max={60} suffix={layout.buttonRadius >= 60 ? 'px +' : 'px'} onChange={(value) => updateDevice({ buttonRadius: value >= 60 ? 999 : value })} />
                <RangeField label="Altura total do banner" value={layout.heroMinHeight} min={600} max={1500} suffix="px" onChange={(value) => updateDevice({ heroMinHeight: value })} />
              </div>
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

function LayerRow({ label, active, visible, locked, onSelect, onVisible, onLock }: { label: string; active: boolean; visible?: boolean; locked?: boolean; onSelect: () => void; onVisible?: () => void; onLock?: () => void }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border p-2 ${active ? 'border-indigo-300 bg-indigo-50' : 'border-zinc-200 bg-white'}`}>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 truncate text-left text-xs font-black text-zinc-700">{label}</button>
      {onVisible ? <button type="button" onClick={onVisible} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-zinc-500" aria-label={visible ? 'Ocultar camada' : 'Exibir camada'}>{visible ? <Eye size={14} /> : <EyeOff size={14} />}</button> : null}
      {onLock ? <button type="button" onClick={onLock} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-zinc-500" aria-label={locked ? 'Desbloquear camada' : 'Bloquear camada'}>{locked ? <Lock size={14} /> : <Unlock size={14} />}</button> : null}
    </div>
  );
}

function AssetControl({ label, value, onUpload, onRemove }: { label: string; value: string; onUpload: () => void; onRemove: () => void }) {
  return (
    <div className="mt-4 rounded-2xl border border-zinc-200 p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-400">{label}</p>
      <div className="mt-3 flex h-32 items-center justify-center overflow-hidden rounded-xl bg-zinc-100">
        {value ? <img src={value} alt={label} className="h-full w-full object-contain" /> : <ImagePlus size={34} className="text-zinc-300" />}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onUpload} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white"><Upload size={14} /> Trocar imagem</button>
        {value ? <button type="button" onClick={onRemove} className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500" aria-label="Remover imagem local"><Trash2 size={14} /></button> : null}
      </div>
    </div>
  );
}

function ElementPositionControls({ element, layout, updateBox }: { element: EditableElement; layout: DeviceLayout; updateBox: (element: EditableElement, patch: Partial<ElementBox>, withHistory?: boolean) => void }) {
  const current = layout.boxes[element];
  return (
    <>
      <RangeField label="Posição horizontal" value={current.x} min={0} max={Math.max(0, 100 - current.width)} suffix="%" onChange={(value) => updateBox(element, { x: value })} />
      <RangeField label="Posição vertical" value={current.y} min={0} max={94} suffix="%" onChange={(value) => updateBox(element, { y: value })} />
      <RangeField label="Largura" value={current.width} min={element === 'logo' ? 8 : 18} max={Math.max(20, 100 - current.x)} suffix="%" onChange={(value) => updateBox(element, { width: value })} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => updateBox(element, { x: 0 })} className="min-h-10 rounded-xl bg-zinc-100 px-3 text-[11px] font-black text-zinc-600">Alinhar esquerda</button>
        <button type="button" onClick={() => updateBox(element, { x: (100 - current.width) / 2 })} className="min-h-10 rounded-xl bg-zinc-100 px-3 text-[11px] font-black text-zinc-600">Centralizar</button>
      </div>
    </>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-[11px] font-black text-zinc-500">{label}<span className="mt-2 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0" /><span className="truncate text-[10px] uppercase text-zinc-500">{value}</span></span></label>;
}

function RangeField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  const normalizedMax = Math.max(min, max);
  const shown = clamp(value, min, normalizedMax);
  return <label className="mt-4 block text-[11px] font-black text-zinc-500"><span className="flex items-center justify-between gap-3"><span>{label}</span><strong className="text-zinc-900">{Math.round(shown)}{suffix}</strong></span><input type="range" min={min} max={normalizedMax} value={shown} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-indigo-600" /></label>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-zinc-50 p-3 text-xs font-black text-zinc-600"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-indigo-600" /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="mt-4 block text-[11px] font-black text-zinc-500">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="premium-input mt-2">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
