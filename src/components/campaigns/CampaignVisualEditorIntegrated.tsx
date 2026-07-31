'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
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
  Settings2,
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
type EditableElement = 'headerSupport' | 'logo' | 'content' | 'simulator';
type SelectedElement = 'background' | EditableElement;
type AssetKind = 'headerSupport' | 'logo' | 'background';

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
  localHeaderSupportDataUrl: string;
  headerSupportLabel: string;
  showHeaderSupportLabel: boolean;
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
  device: Device;
  startX: number;
  startY: number;
  origin: ElementBox;
  snapshot: VisualDraft;
};

const frameWidth: Record<Device, number> = { desktop: 1440, tablet: 768, mobile: 390 };
const deviceLabel: Record<Device, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
const templateStorageKey = 'auto-sede:landing-visual:templates:v3';
const legacyTemplateStorageKeys = ['auto-sede:landing-visual:templates:v2', 'auto-sede:landing-visual:templates:v1'];
const editableElements: EditableElement[] = ['headerSupport', 'logo', 'content', 'simulator'];
const defaultHeaderSupportSource = '/campaign-assets/auto-sede-logo-cropped.png';

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
        headerSupport: box(5, 2.5, 48),
        logo: box(6, 12, 50),
        content: box(6, 27, 88),
        simulator: box(5, 70, 90)
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
        headerSupport: box(3, 2.5, 28),
        logo: box(6, 13, 34),
        content: box(6, 27, 86),
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
      headerSupport: box(2, 2.5, 16),
      logo: box(4, 12, 23),
      content: box(4, 28, 58),
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
    localHeaderSupportDataUrl: '',
    headerSupportLabel: 'APOIO',
    showHeaderSupportLabel: true,
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
  const incoming = value as Partial<ElementBox>;
  return {
    x: Number.isFinite(Number(incoming.x)) ? Number(incoming.x) : fallback.x,
    y: Number.isFinite(Number(incoming.y)) ? Number(incoming.y) : fallback.y,
    width: Number.isFinite(Number(incoming.width)) ? Number(incoming.width) : fallback.width,
    visible: incoming.visible !== false,
    locked: incoming.locked === true
  };
}

function safeLayout(value: unknown, fallback: DeviceLayout, device: Device): DeviceLayout {
  if (!value || typeof value !== 'object') return fallback;
  const incoming = value as Partial<DeviceLayout> & {
    logoWidth?: number;
    logoOffsetX?: number;
    logoOffsetY?: number;
  };
  const boxes = incoming.boxes || ({} as Partial<Record<EditableElement, ElementBox>>);
  const migratedLogo = incoming.logoWidth
    ? {
        ...fallback.boxes.logo,
        width: Math.max(8, Math.min(70, (incoming.logoWidth / frameWidth[device]) * 100)),
        x: Math.max(0, Math.min(90, fallback.boxes.logo.x + Number(incoming.logoOffsetX || 0) / 12)),
        y: Math.max(0, Math.min(90, fallback.boxes.logo.y + Number(incoming.logoOffsetY || 0) / 12))
      }
    : fallback.boxes.logo;

  return {
    ...fallback,
    ...incoming,
    boxes: {
      headerSupport: safeBox(boxes.headerSupport, fallback.boxes.headerSupport),
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
    localHeaderSupportDataUrl: incoming.localHeaderSupportDataUrl || '',
    headerSupportLabel: typeof incoming.headerSupportLabel === 'string' ? incoming.headerSupportLabel : fallback.headerSupportLabel,
    showHeaderSupportLabel: incoming.showHeaderSupportLabel !== false,
    localLogoDataUrl: incoming.localLogoDataUrl || '',
    localHeroDataUrl: incoming.localHeroDataUrl || '',
    localMobileHeroDataUrl: incoming.localMobileHeroDataUrl || '',
    devices: {
      desktop: safeLayout(incoming.devices?.desktop, fallback.devices.desktop, 'desktop'),
      tablet: safeLayout(incoming.devices?.tablet, fallback.devices.tablet, 'tablet'),
      mobile: safeLayout(incoming.devices?.mobile, fallback.devices.mobile, 'mobile')
    },
    updatedAt: incoming.updatedAt || fallback.updatedAt
  };
}

function storageKey(campaign: any) {
  return `auto-sede:landing-visual:draft:${campaign?.id || campaign?.slug || 'new'}`;
}

function legacyHeaderKey(campaign: any) {
  return `auto-sede:landing-visual:header-support:${campaign?.id || campaign?.slug || 'default'}:v1`;
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

async function optimizeLocalImage(file: File, kind: AssetKind) {
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
    const isLogo = kind !== 'background';
    const maxWidth = isLogo ? 1400 : 2400;
    const maxHeight = isLogo ? 1000 : 1800;
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu processar a imagem.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const keepTransparency = isLogo && file.type === 'image/png';
    return canvas.toDataURL(keepTransparency ? 'image/png' : 'image/jpeg', keepTransparency ? undefined : 0.86);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function elementLabel(element: EditableElement) {
  if (element === 'headerSupport') return 'Cabeçalho / Apoio';
  if (element === 'logo') return 'Logomarca';
  if (element === 'content') return 'Textos e botões';
  return 'Simulador';
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
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [zoom, setZoom] = useState(80);
  const [past, setPast] = useState<VisualDraft[]>([]);
  const [future, setFuture] = useState<VisualDraft[]>([]);

  const heroRef = useRef<HTMLDivElement>(null);
  const headerSupportInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  const selectedCampaign = campaigns.find((item) => item.id === selectedId) || campaigns[0] || null;
  const selectedEvent = events.find((item) => item.id === selectedCampaign?.event_id) || selectedCampaign?.event || null;
  const layout = draft.devices[device];
  const headerSupportSource = draft.localHeaderSupportDataUrl || defaultHeaderSupportSource;
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
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      const key = [templateStorageKey, ...legacyTemplateStorageKeys].find((item) => localStorage.getItem(item));
      const raw = key ? localStorage.getItem(key) || '[]' : '[]';
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
      let next = stored ? safeDraft(JSON.parse(stored), selectedCampaign) : makeDefaultDraft(selectedCampaign);

      const legacyHeader = localStorage.getItem(legacyHeaderKey(selectedCampaign));
      if (legacyHeader) {
        try {
          const parsed = JSON.parse(legacyHeader);
          next = {
            ...next,
            localHeaderSupportDataUrl: parsed.source && parsed.source !== defaultHeaderSupportSource ? parsed.source : next.localHeaderSupportDataUrl,
            headerSupportLabel: typeof parsed.label === 'string' ? parsed.label : next.headerSupportLabel,
            showHeaderSupportLabel: parsed.showLabel !== false,
            devices: {
              desktop: {
                ...next.devices.desktop,
                boxes: { ...next.devices.desktop.boxes, headerSupport: safeBox(parsed.devices?.desktop, next.devices.desktop.boxes.headerSupport) }
              },
              tablet: {
                ...next.devices.tablet,
                boxes: { ...next.devices.tablet.boxes, headerSupport: safeBox(parsed.devices?.tablet, next.devices.tablet.boxes.headerSupport) }
              },
              mobile: {
                ...next.devices.mobile,
                boxes: { ...next.devices.mobile.boxes, headerSupport: safeBox(parsed.devices?.mobile, next.devices.mobile.boxes.headerSupport) }
              }
            }
          };
        } catch {}
      }

      setDraft(next);
      setDirty(false);
      setPast([]);
      setFuture([]);
      setSelectedElement('content');
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

  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== interaction.pointerId || !heroRef.current) return;
      event.preventDefault();
      const rect = heroRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const deltaX = ((event.clientX - interaction.startX) / rect.width) * 100;
      const deltaY = ((event.clientY - interaction.startY) / rect.height) * 100;

      setDraft((current) => {
        const currentLayout = current.devices[interaction.device];
        const currentBox = currentLayout.boxes[interaction.element];
        const patch = interaction.mode === 'move'
          ? {
              x: clamp(interaction.origin.x + deltaX, 0, 100 - interaction.origin.width),
              y: clamp(interaction.origin.y + deltaY, 0, 96)
            }
          : {
              width: clamp(
                interaction.origin.width + deltaX,
                interaction.element === 'headerSupport' || interaction.element === 'logo' ? 7 : 18,
                100 - interaction.origin.x
              )
            };

        return {
          ...current,
          devices: {
            ...current.devices,
            [interaction.device]: {
              ...currentLayout,
              boxes: {
                ...currentLayout.boxes,
                [interaction.element]: { ...currentBox, ...patch }
              }
            }
          },
          updatedAt: new Date().toISOString()
        };
      });
      setDirty(true);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== interaction.pointerId) return;
      setPast((current) => [...current.slice(-39), interaction.snapshot]);
      setFuture([]);
      setInteraction(null);
      setDirty(true);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [interaction]);

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

  function updateBox(element: EditableElement, patch: Partial<ElementBox>) {
    commit({
      ...draft,
      devices: {
        ...draft.devices,
        [device]: {
          ...layout,
          boxes: { ...layout.boxes, [element]: { ...layout.boxes[element], ...patch } }
        }
      }
    });
  }

  function selectElement(element: SelectedElement) {
    setSelectedElement(element);
    setRightOpen(true);
    setLeftOpen(true);
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

  async function handleLocalAsset(file: File | undefined, kind: AssetKind) {
    if (!file) return;
    setMessage('Processando imagem local...');
    try {
      const dataUrl = await optimizeLocalImage(file, kind);
      if (kind === 'headerSupport') {
        updateDraft({ localHeaderSupportDataUrl: dataUrl });
        selectElement('headerSupport');
      } else if (kind === 'logo') {
        updateDraft({ localLogoDataUrl: dataUrl });
        selectElement('logo');
      } else if (device === 'mobile') {
        updateDraft({ localMobileHeroDataUrl: dataUrl });
        selectElement('background');
      } else {
        updateDraft({ localHeroDataUrl: dataUrl });
        selectElement('background');
      }
      setMessage('Imagem aplicada ao preview local. Salve o rascunho para mantê-la neste navegador.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível processar a imagem.');
    }
  }

  function beginInteraction(event: React.PointerEvent<HTMLElement>, element: EditableElement, mode: 'move' | 'resize') {
    const currentBox = layout.boxes[element];
    if (clientMode || currentBox.locked) return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(element);
    setInteraction({
      pointerId: event.pointerId,
      mode,
      element,
      device,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...currentBox },
      snapshot: cloneDraft(draft)
    });
  }

  const heroBackground = draft.gradientEnabled
    ? `linear-gradient(${draft.gradientAngle}deg, ${hexToRgba(draft.secondaryColor, draft.overlayOpacity)} 8%, ${hexToRgba(draft.secondaryColor, Math.max(draft.overlayOpacity - 18, 10))} 58%, ${hexToRgba(draft.gradientColor, Math.max(draft.overlayOpacity - 28, 8))} 100%)`
    : hexToRgba(draft.secondaryColor, draft.overlayOpacity);

  function editableFrame(element: EditableElement, children: React.ReactNode, doubleClick?: () => void) {
    const currentBox = layout.boxes[element];
    if (!currentBox.visible) return null;
    const active = !clientMode && selectedElement === element;
    const moving = interaction?.element === element;

    return (
      <div
        key={element}
        data-editor-element={element}
        className={`absolute select-none ${active ? 'z-40' : 'z-30'} ${currentBox.locked || clientMode ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        style={{
          left: `${currentBox.x}%`,
          top: `${currentBox.y}%`,
          width: `${currentBox.width}%`,
          touchAction: 'none',
          userSelect: 'none'
        }}
        onClick={(event) => {
          if (clientMode) return;
          event.preventDefault();
          event.stopPropagation();
          selectElement(element);
        }}
        onDoubleClick={(event) => {
          if (clientMode || !doubleClick) return;
          event.preventDefault();
          event.stopPropagation();
          doubleClick();
        }}
        onPointerDown={(event) => beginInteraction(event, element, 'move')}
      >
        <div className={`relative ${active ? 'rounded-xl outline outline-2 outline-indigo-400 outline-offset-4' : ''} ${moving ? 'opacity-90' : ''}`}>
          {children}
          {active ? (
            <>
              <span className="pointer-events-none absolute -left-1 -top-9 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white shadow-lg">
                <Move size={11} /> {elementLabel(element)}
              </span>
              {!currentBox.locked ? (
                <button
                  type="button"
                  aria-label={`Redimensionar ${elementLabel(element)}`}
                  className="absolute -bottom-4 -right-4 z-50 flex h-9 w-9 touch-none items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-white shadow-xl cursor-nwse-resize"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(event) => beginInteraction(event, element, 'resize')}
                >
                  <Grip size={15} />
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function previewPage(client = false) {
    const mobile = device === 'mobile';
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
          className={`relative overflow-hidden text-white ${!client && selectedElement === 'background' ? 'outline outline-2 outline-cyan-400 outline-offset-[-2px]' : ''}`}
          style={{ minHeight: layout.heroMinHeight, backgroundColor: draft.secondaryColor }}
          onClick={(event) => {
            if (client || (event.target as HTMLElement).closest('[data-editor-element]')) return;
            selectElement('background');
          }}
          onDoubleClick={(event) => {
            if (client || (event.target as HTMLElement).closest('[data-editor-element]')) return;
            selectElement('background');
            backgroundInputRef.current?.click();
          }}
        >
          {heroSource ? (
            <img
              src={heroSource}
              alt="Capa da campanha"
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              style={{
                objectPosition: `${layout.backgroundX}% ${layout.backgroundY}%`,
                transform: `scale(${layout.backgroundZoom / 100})`,
                transformOrigin: `${layout.backgroundX}% ${layout.backgroundY}%`
              }}
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0" style={{ background: heroBackground }} />

          {editableFrame(
            'headerSupport',
            <div className="flex items-center gap-[5%] p-1">
              {draft.showHeaderSupportLabel ? (
                <span className="shrink-0 text-[clamp(8px,0.75vw,15px)] font-black uppercase tracking-[0.08em] text-white drop-shadow-lg">
                  {draft.headerSupportLabel || 'APOIO'}
                </span>
              ) : null}
              <img
                src={headerSupportSource}
                alt="Logo de apoio"
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                className="pointer-events-none min-w-0 flex-1 object-contain drop-shadow-2xl"
              />
            </div>,
            () => headerSupportInputRef.current?.click()
          )}

          {editableFrame(
            'logo',
            logoSource ? (
              <img
                src={logoSource}
                alt="Logomarca do evento"
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                className="pointer-events-none block h-auto w-full object-contain drop-shadow-2xl"
              />
            ) : (
              <div className="pointer-events-none rounded-2xl border border-dashed border-white/50 bg-black/20 px-5 py-4 text-center text-xs font-black uppercase tracking-widest text-white/80">
                Adicionar logo do evento
              </div>
            ),
            () => logoInputRef.current?.click()
          )}

          {editableFrame(
            'content',
            <div className={`flex flex-col ${layout.contentAlign === 'center' ? 'items-center text-center' : layout.contentAlign === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
              <span className="rounded-full border border-white/20 bg-black/25 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur">
                {selectedCampaign?.hero_eyebrow || 'Financiamento de veículos'}
              </span>
              <h1 className="mt-5 font-black leading-[0.98] tracking-[-0.045em]" style={{ fontSize: layout.titleSize }}>
                {selectedCampaign?.title || 'É rápido e fácil. Escolha seu carro e faça uma simulação do seu financiamento'}
              </h1>
              <p className="mt-5 max-w-3xl font-medium leading-relaxed text-white/85" style={{ fontSize: layout.descriptionSize }}>
                {selectedCampaign?.description || 'Escolha um veículo disponível no estoque do evento, preencha seus dados e receba uma simulação do seu financiamento!'}
              </p>
              <div className={`mt-6 flex flex-wrap gap-2 ${layout.contentAlign === 'center' ? 'justify-center' : layout.contentAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
                {selectedEvent?.start_date ? <span className="rounded-full border border-white/15 bg-black/25 px-3 py-2 text-[11px] font-black">{formatDate(selectedEvent.start_date)} a {formatDate(selectedEvent.end_date)}</span> : null}
                {selectedEvent?.city ? <span className="rounded-full border border-white/15 bg-black/25 px-3 py-2 text-[11px] font-black">{selectedEvent.city}</span> : null}
              </div>
              <button
                type="button"
                className={`${layout.buttonFullWidth ? 'w-full' : ''} mt-7 min-h-13 px-7 py-4 text-sm font-black shadow-xl transition`}
                style={{
                  borderRadius: layout.buttonRadius,
                  color: draft.buttonTextColor,
                  border: draft.buttonStyle === 'outline' ? `2px solid ${draft.primaryColor}` : 'none',
                  background: draft.buttonStyle === 'outline'
                    ? 'transparent'
                    : draft.buttonStyle === 'gradient'
                      ? `linear-gradient(135deg, ${draft.primaryColor}, ${draft.gradientColor})`
                      : draft.primaryColor
                }}
              >
                {selectedCampaign?.cta_label || 'Começar simulação'}
              </button>
            </div>
          )}

          {editableFrame(
            'simulator',
            <div className="bg-white p-6 text-slate-950 shadow-2xl" style={{ borderRadius: layout.cardRadius }}>
              <span className="inline-flex rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-700">Simulação segura</span>
              <h2 className="mt-5 text-3xl font-black tracking-tight">Financiamento automotivo</h2>
              <p className="mt-2 text-sm font-medium text-slate-500">Taxa referencial de {Number(selectedCampaign?.interest_rate || 2.89).toLocaleString('pt-BR')}% ao mês.</p>
              <div className="mt-6 rounded-3xl bg-slate-100 p-5">
                <strong className="block text-4xl font-black">{selectedCampaign?.vehicle_count || 0}</strong>
                <span className="text-xs font-black text-slate-500">veículos conectados</span>
              </div>
              <button type="button" className="mt-6 w-full px-5 py-4 text-sm font-black" style={{ borderRadius: layout.buttonRadius, background: draft.primaryColor, color: draft.buttonTextColor }}>
                {selectedCampaign?.cta_label || 'Começar simulação'}
              </button>
            </div>
          )}

          {!client ? (
            <button
              type="button"
              className="absolute right-5 top-5 z-20 rounded-full border border-white/20 bg-black/35 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-white backdrop-blur"
              onClick={(event) => {
                event.stopPropagation();
                selectElement('background');
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                backgroundInputRef.current?.click();
              }}
            >
              Clique no fundo para editar
            </button>
          ) : null}
        </section>

        <section className="bg-white px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: draft.primaryColor }}>Vantagens do evento</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Tudo preparado para facilitar sua escolha</h2>
            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {benefits.slice(0, 3).map((benefit: any, index: number) => (
                <article key={`${benefit.title}-${index}`} className="rounded-3xl border border-slate-200 p-6 shadow-sm">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-black text-white" style={{ background: draft.primaryColor }}>{index + 1}</span>
                  <h3 className="mt-5 text-xl font-black">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{benefit.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-100 px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between gap-5">
              <div><p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: draft.primaryColor }}>Estoque do evento</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Veículos disponíveis</h2></div>
              <span className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-600">{selectedCampaign?.vehicle_count || 0} conectados</span>
            </div>
            <div className={`mt-8 grid gap-4 ${mobile ? 'grid-cols-1' : device === 'tablet' ? 'grid-cols-2' : 'grid-cols-4'}`}>
              {Array.from({ length: vehicleCards }).map((_, index) => (
                <article key={index} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                  <div className="aspect-[4/3] bg-gradient-to-br from-slate-200 to-slate-300" />
                  <div className="p-5"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Veículo {index + 1}</p><h3 className="mt-2 text-lg font-black">Modelo disponível</h3><p className="mt-2 text-sm text-slate-500">Consulte detalhes e condições.</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-16">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
            <div className="rounded-[34px] bg-slate-950 p-8 text-white"><p className="text-xs font-black uppercase tracking-[0.22em] text-red-400">Lojas participantes</p><strong className="mt-4 block text-6xl font-black">{selectedCampaign?.store_count || 0}</strong><p className="mt-3 text-sm text-white/65">Operações conectadas à landing deste evento.</p></div>
            <div className="rounded-[34px] border border-slate-200 p-8"><p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Local do evento</p><h3 className="mt-4 text-3xl font-black">{selectedEvent?.location || selectedEvent?.city || 'Local a definir'}</h3><p className="mt-3 text-sm text-slate-500">{selectedEvent?.city}{selectedEvent?.state ? ` • ${selectedEvent.state}` : ''}</p></div>
          </div>
        </section>

        <footer className="bg-slate-950 px-6 py-10 text-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-black">{selectedCampaign?.name || 'Landing do evento'}</p><p className="mt-1 text-xs text-white/50">Preview visual local — conteúdo sujeito à publicação.</p></div>
            <p className="text-xs font-semibold text-white/50">© {new Date().getFullYear()} Auto Sede</p>
          </div>
        </footer>
      </div>
    );
  }

  const gridColumns = `${leftOpen ? '290px' : '0px'} minmax(0,1fr) ${rightOpen ? '360px' : '0px'}`;

  return (
    <>
      <section className="mb-6 rounded-[28px] border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-violet-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg"><Sparkles size={22} /></span>
            <div><p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Editor visual responsivo</p><h2 className="mt-1 text-xl font-black tracking-tight text-zinc-950">Personalize a landing em camadas</h2><p className="mt-1 text-sm text-zinc-500">Arraste, redimensione e configure desktop, tablet e mobile sem alterar a landing pública.</p></div>
          </div>
          <button type="button" onClick={openEditor} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-black text-white shadow-lg transition hover:bg-indigo-700"><Maximize2 size={18} /> Abrir editor visual</button>
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950">
          <header className="relative z-[120] flex min-h-[72px] items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-4 text-white">
            <div className="min-w-0"><p className="truncate text-sm font-black">Editor visual completo</p><p className="truncate text-[11px] font-bold text-zinc-400">{selectedCampaign?.name || 'Carregando landing...'} • {dirty ? 'alterações não salvas' : 'rascunho salvo'}</p></div>
            <div className="hidden items-center rounded-xl bg-white/10 p-1 md:flex">
              {(['desktop', 'tablet', 'mobile'] as Device[]).map((item) => {
                const Icon = item === 'desktop' ? Monitor : item === 'tablet' ? Tablet : Smartphone;
                return <button key={item} type="button" onClick={() => setDevice(item)} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-xs font-black ${device === item ? 'bg-white text-zinc-950' : 'text-zinc-300'}`}><Icon size={16} /> {deviceLabel[item]}</button>;
              })}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={undo} disabled={!past.length} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 disabled:opacity-30" aria-label="Desfazer"><Undo2 size={18} /></button>
              <button type="button" onClick={redo} disabled={!future.length} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 disabled:opacity-30" aria-label="Refazer"><Redo2 size={18} /></button>
              <button type="button" onClick={() => setClientMode(true)} className="hidden min-h-11 items-center gap-2 rounded-xl border border-indigo-400/40 bg-indigo-500/15 px-4 text-xs font-black text-indigo-100 sm:inline-flex"><Maximize2 size={16} /> Modo cliente</button>
              <button type="button" onClick={saveDraft} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white"><Save size={16} /> Salvar rascunho</button>
              {selectedCampaign?.slug ? <a href={`/campanha/${selectedCampaign.slug}`} target="_blank" rel="noreferrer" className="hidden min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-black lg:inline-flex">Landing atual <ExternalLink size={15} /></a> : null}
              <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10" aria-label="Fechar"><X size={19} /></button>
            </div>
          </header>

          <div className="relative grid min-h-0 flex-1 transition-[grid-template-columns] duration-200" style={{ gridTemplateColumns: gridColumns }}>
            <aside className={`min-w-0 overflow-y-auto border-r border-zinc-200 bg-white transition-opacity ${leftOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
              <div className="w-[290px] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Landing selecionada</p>
                <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-3 min-h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-black outline-none">
                  {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                </select>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-900">Tudo desta tela é local. Nenhuma imagem, posição ou estilo é publicado ou gravado no Supabase.</div>

                <div className="mt-6">
                  <PanelTitle icon={<Layers3 size={16} />} title={`Camadas — ${deviceLabel[device]}`} />
                  <div className="mt-3 space-y-2">
                    <LayerRow label="Imagem de fundo" active={selectedElement === 'background'} onSelect={() => selectElement('background')} />
                    {editableElements.map((element) => {
                      const currentBox = layout.boxes[element];
                      return (
                        <LayerRow
                          key={element}
                          label={elementLabel(element)}
                          active={selectedElement === element}
                          visible={currentBox.visible}
                          locked={currentBox.locked}
                          onSelect={() => selectElement(element)}
                          onToggleVisible={() => updateBox(element, { visible: !currentBox.visible })}
                          onToggleLocked={() => updateBox(element, { locked: !currentBox.locked })}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="mt-7">
                  <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Modelos locais</p><Copy size={15} className="text-zinc-400" /></div>
                  <div className="mt-3 flex gap-2"><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Nome do modelo" className="min-w-0 flex-1 rounded-2xl border border-zinc-200 px-3 text-xs font-bold outline-none" /><button type="button" onClick={saveTemplate} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Save size={17} /></button></div>
                  <div className="mt-3 space-y-2">
                    {templates.length ? templates.map((template) => (
                      <div key={template.id} className="flex items-center gap-2 rounded-2xl border border-zinc-200 p-3"><button type="button" onClick={() => applyTemplate(template)} className="min-w-0 flex-1 text-left"><strong className="block truncate text-xs">{template.name}</strong><span className="mt-1 block truncate text-[10px] text-zinc-400">{template.campaignName}</span></button><button type="button" onClick={() => deleteTemplate(template.id)} className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></div>
                    )) : <div className="rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-xs font-bold text-zinc-400">Nenhum modelo salvo.</div>}
                  </div>
                </div>

                <button type="button" onClick={resetDraft} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 text-xs font-black text-zinc-600"><RotateCcw size={16} /> Restaurar padrão</button>
                {message ? <div className="mt-4 rounded-2xl bg-indigo-50 p-3 text-xs font-bold leading-relaxed text-indigo-700">{message}</div> : null}
              </div>
            </aside>

            <section className="relative min-w-0 overflow-auto bg-zinc-900 p-3 sm:p-5">
              <button type="button" onClick={() => setLeftOpen((current) => !current)} className="absolute left-0 top-1/2 z-[115] flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-white/15 bg-zinc-800 text-white shadow-xl" aria-label={leftOpen ? 'Recolher painel esquerdo' : 'Abrir painel esquerdo'}>{leftOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}</button>
              <button type="button" onClick={() => setRightOpen((current) => !current)} className="absolute right-0 top-1/2 z-[115] flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-xl border border-r-0 border-white/15 bg-zinc-800 text-white shadow-xl" aria-label={rightOpen ? 'Recolher painel direito' : 'Abrir painel direito'}>{rightOpen ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-white">
                <div className="flex items-center rounded-xl bg-white/10 p-1 md:hidden">
                  {(['desktop', 'tablet', 'mobile'] as Device[]).map((item) => {
                    const Icon = item === 'desktop' ? Monitor : item === 'tablet' ? Tablet : Smartphone;
                    return <button key={item} type="button" onClick={() => setDevice(item)} className={`flex h-10 w-10 items-center justify-center rounded-lg ${device === item ? 'bg-white text-zinc-950' : 'text-zinc-300'}`} aria-label={deviceLabel[item]}><Icon size={16} /></button>;
                  })}
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2"><button type="button" onClick={() => setZoom((value) => clamp(value - 10, 40, 100))} aria-label="Diminuir zoom"><ZoomOut size={16} /></button><strong className="min-w-12 text-center text-xs">{zoom}%</strong><button type="button" onClick={() => setZoom((value) => clamp(value + 10, 40, 100))} aria-label="Aumentar zoom"><ZoomIn size={16} /></button></div>
                <button type="button" onClick={() => setClientMode(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black"><Maximize2 size={16} /> Expandir preview</button>
              </div>

              <div className="mx-auto origin-top transition-transform" style={{ width: frameWidth[device], maxWidth: 'none', transform: `scale(${zoom / 100})`, marginBottom: `calc(${(zoom / 100 - 1) * 100}%)` }}>
                <div className="overflow-hidden rounded-t-[26px] bg-slate-100 shadow-2xl">
                  <div className="flex h-9 items-center justify-between px-5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400"><span>{deviceLabel[device]} • {frameWidth[device]}px</span><span>Preview não publicado</span></div>
                  {previewPage(false)}
                </div>
              </div>
            </section>

            <aside className={`min-w-0 overflow-y-auto border-l border-zinc-200 bg-white transition-opacity ${rightOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
              <div className="w-[360px] p-4">
                <PanelTitle
                  icon={selectedElement === 'background' ? <ImagePlus size={16} /> : selectedElement === 'content' ? <Type size={16} /> : selectedElement === 'simulator' ? <LayoutTemplate size={16} /> : <Settings2 size={16} />}
                  title={selectedElement === 'background' ? 'Imagem de fundo' : elementLabel(selectedElement)}
                />

                {selectedElement === 'background' ? (
                  <>
                    <AssetControl label={device === 'mobile' ? 'Fundo do mobile' : 'Fundo do desktop/tablet'} value={heroSource} onUpload={() => backgroundInputRef.current?.click()} onRemove={() => updateDraft(device === 'mobile' ? { localMobileHeroDataUrl: '' } : { localHeroDataUrl: '' })} />
                    <RangeField label="Zoom da imagem" value={layout.backgroundZoom} min={70} max={180} suffix="%" onChange={(value) => updateDevice({ backgroundZoom: value })} />
                    <RangeField label="Ponto focal horizontal" value={layout.backgroundX} min={0} max={100} suffix="%" onChange={(value) => updateDevice({ backgroundX: value })} />
                    <RangeField label="Ponto focal vertical" value={layout.backgroundY} min={0} max={100} suffix="%" onChange={(value) => updateDevice({ backgroundY: value })} />
                  </>
                ) : null}

                {selectedElement === 'headerSupport' ? (
                  <>
                    <AssetControl label="Logo do Cabeçalho/Apoio" value={headerSupportSource} onUpload={() => headerSupportInputRef.current?.click()} onRemove={() => updateDraft({ localHeaderSupportDataUrl: '' })} />
                    <TextField label="Texto de apoio" value={draft.headerSupportLabel} onChange={(value) => updateDraft({ headerSupportLabel: value })} />
                    <ToggleField label="Exibir texto de apoio" checked={draft.showHeaderSupportLabel} onChange={(checked) => updateDraft({ showHeaderSupportLabel: checked })} />
                    <ElementInspector element="headerSupport" layout={layout} onUpdate={(patch) => updateBox('headerSupport', patch)} />
                  </>
                ) : null}

                {selectedElement === 'logo' ? (
                  <>
                    <AssetControl label="Logo local do evento" value={logoSource} onUpload={() => logoInputRef.current?.click()} onRemove={() => updateDraft({ localLogoDataUrl: '' })} />
                    <ElementInspector element="logo" layout={layout} onUpdate={(patch) => updateBox('logo', patch)} />
                  </>
                ) : null}

                {selectedElement === 'content' ? (
                  <>
                    <ElementInspector element="content" layout={layout} onUpdate={(patch) => updateBox('content', patch)} />
                    <RangeField label="Tamanho do título" value={layout.titleSize} min={28} max={92} suffix="px" onChange={(value) => updateDevice({ titleSize: value })} />
                    <RangeField label="Tamanho da descrição" value={layout.descriptionSize} min={12} max={28} suffix="px" onChange={(value) => updateDevice({ descriptionSize: value })} />
                    <div className="mt-5"><p className="text-xs font-black text-zinc-600">Alinhamento</p><div className="mt-2 grid grid-cols-3 gap-2"><AlignButton active={layout.contentAlign === 'left'} onClick={() => updateDevice({ contentAlign: 'left' })} icon={<AlignLeft size={16} />} /><AlignButton active={layout.contentAlign === 'center'} onClick={() => updateDevice({ contentAlign: 'center' })} icon={<AlignCenter size={16} />} /><AlignButton active={layout.contentAlign === 'right'} onClick={() => updateDevice({ contentAlign: 'right' })} icon={<AlignRight size={16} />} /></div></div>
                  </>
                ) : null}

                {selectedElement === 'simulator' ? (
                  <>
                    <ElementInspector element="simulator" layout={layout} onUpdate={(patch) => updateBox('simulator', patch)} />
                    <RangeField label="Curvatura do card" value={layout.cardRadius} min={0} max={60} suffix="px" onChange={(value) => updateDevice({ cardRadius: value })} />
                  </>
                ) : null}

                <div className="mt-7 border-t border-zinc-200 pt-6">
                  <PanelTitle icon={<Palette size={16} />} title="Aparência geral" />
                  <div className="mt-4 grid grid-cols-2 gap-3"><ColorField label="Cor principal" value={draft.primaryColor} onChange={(value) => updateDraft({ primaryColor: value })} /><ColorField label="Cor de fundo" value={draft.secondaryColor} onChange={(value) => updateDraft({ secondaryColor: value })} /><ColorField label="Cor do gradiente" value={draft.gradientColor} onChange={(value) => updateDraft({ gradientColor: value })} /><ColorField label="Texto do botão" value={draft.buttonTextColor} onChange={(value) => updateDraft({ buttonTextColor: value })} /></div>
                  <ToggleField label="Usar gradiente" checked={draft.gradientEnabled} onChange={(checked) => updateDraft({ gradientEnabled: checked })} />
                  <RangeField label="Direção do gradiente" value={draft.gradientAngle} min={0} max={360} suffix="°" onChange={(value) => updateDraft({ gradientAngle: value })} />
                  <RangeField label="Escurecimento da capa" value={draft.overlayOpacity} min={0} max={95} suffix="%" onChange={(value) => updateDraft({ overlayOpacity: value })} />
                  <RangeField label="Curvatura dos botões" value={layout.buttonRadius} min={0} max={999} suffix="px" onChange={(value) => updateDevice({ buttonRadius: value })} />
                  <ToggleField label="Botão em largura total" checked={layout.buttonFullWidth} onChange={(checked) => updateDevice({ buttonFullWidth: checked })} />
                  <SelectField label="Estilo do botão" value={draft.buttonStyle} options={[["solid", "Preenchido"], ["outline", "Contorno"], ["gradient", "Gradiente"]]} onChange={(value) => updateDraft({ buttonStyle: value as ButtonStyle })} />
                  <RangeField label="Altura mínima do banner" value={layout.heroMinHeight} min={device === 'mobile' ? 900 : 600} max={1600} suffix="px" onChange={(value) => updateDevice({ heroMinHeight: value })} />
                </div>
              </div>
            </aside>
          </div>

          <input ref={headerSupportInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void handleLocalAsset(event.target.files?.[0], 'headerSupport'); event.currentTarget.value = ''; }} />
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void handleLocalAsset(event.target.files?.[0], 'logo'); event.currentTarget.value = ''; }} />
          <input ref={backgroundInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void handleLocalAsset(event.target.files?.[0], 'background'); event.currentTarget.value = ''; }} />

          {clientMode ? (
            <div className="fixed inset-0 z-[200] overflow-auto bg-zinc-950">
              <div className="sticky top-0 z-[210] flex min-h-14 items-center justify-between border-b border-white/10 bg-zinc-950/95 px-4 text-white backdrop-blur"><div><strong className="text-sm">Modo cliente</strong><span className="ml-3 text-xs text-zinc-400">{deviceLabel[device]} • preview local</span></div><button type="button" onClick={() => setClientMode(false)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-xs font-black"><Minimize2 size={16} /> Voltar ao editor</button></div>
              <div className="mx-auto bg-white" style={{ width: device === 'desktop' ? '100%' : frameWidth[device], maxWidth: '100%' }}>{previewPage(true)}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{icon}</span><h3 className="text-sm font-black tracking-tight text-zinc-900">{title}</h3></div>;
}

function LayerRow({ label, active, visible, locked, onSelect, onToggleVisible, onToggleLocked }: { label: string; active: boolean; visible?: boolean; locked?: boolean; onSelect: () => void; onToggleVisible?: () => void; onToggleLocked?: () => void }) {
  return (
    <div className={`flex min-h-12 items-center gap-2 rounded-2xl border px-3 ${active ? 'border-indigo-300 bg-indigo-50' : 'border-zinc-200 bg-white'}`}>
      <button type="button" onClick={onSelect} className={`min-w-0 flex-1 text-left text-xs font-black ${active ? 'text-indigo-700' : 'text-zinc-700'}`}>{label}</button>
      {onToggleVisible ? <button type="button" onClick={onToggleVisible} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-zinc-400 shadow-sm" aria-label={visible ? `Ocultar ${label}` : `Mostrar ${label}`}>{visible ? <Eye size={15} /> : <EyeOff size={15} />}</button> : null}
      {onToggleLocked ? <button type="button" onClick={onToggleLocked} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-zinc-400 shadow-sm" aria-label={locked ? `Desbloquear ${label}` : `Bloquear ${label}`}>{locked ? <Lock size={15} /> : <Unlock size={15} />}</button> : null}
    </div>
  );
}

function AssetControl({ label, value, onUpload, onRemove }: { label: string; value: string; onUpload: () => void; onRemove: () => void }) {
  return (
    <div className="mt-5 rounded-3xl border border-zinc-200 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <div className="mt-3 flex min-h-32 items-center justify-center overflow-hidden rounded-2xl bg-zinc-100 p-3">{value ? <img src={value} alt="Prévia do arquivo" draggable={false} className="max-h-28 max-w-full object-contain" /> : <ImagePlus size={34} className="text-zinc-300" />}</div>
      <div className="mt-3 flex gap-2"><button type="button" onClick={onUpload} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white"><Upload size={15} /> Trocar imagem</button><button type="button" onClick={onRemove} className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500"><Trash2 size={15} /></button></div>
    </div>
  );
}

function ElementInspector({ element, layout, onUpdate }: { element: EditableElement; layout: DeviceLayout; onUpdate: (patch: Partial<ElementBox>) => void }) {
  const current = layout.boxes[element];
  return (
    <div className="mt-5">
      <div className="rounded-2xl bg-indigo-50 p-3 text-xs font-bold leading-relaxed text-indigo-700">Clique uma vez para selecionar. Arraste pelo próprio elemento para mover, use a alça inferior para redimensionar e dê dois cliques nas imagens para trocá-las.</div>
      <RangeField label="Posição horizontal" value={current.x} min={0} max={Math.max(0, 100 - current.width)} suffix="%" onChange={(value) => onUpdate({ x: value })} />
      <RangeField label="Posição vertical" value={current.y} min={0} max={96} suffix="%" onChange={(value) => onUpdate({ y: value })} />
      <RangeField label="Largura" value={current.width} min={element === 'headerSupport' || element === 'logo' ? 7 : 18} max={100 - current.x} suffix="%" onChange={(value) => onUpdate({ width: value })} />
      <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => onUpdate({ x: 2 })} className="min-h-11 rounded-xl bg-zinc-100 text-xs font-black text-zinc-600">Alinhar esquerda</button><button type="button" onClick={() => onUpdate({ x: Math.max(0, (100 - current.width) / 2) })} className="min-h-11 rounded-xl bg-zinc-100 text-xs font-black text-zinc-600">Centralizar</button></div>
      <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => onUpdate({ visible: !current.visible })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 text-xs font-black text-zinc-600">{current.visible ? <EyeOff size={15} /> : <Eye size={15} />} {current.visible ? 'Ocultar' : 'Mostrar'}</button><button type="button" onClick={() => onUpdate({ locked: !current.locked })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 text-xs font-black text-zinc-600">{current.locked ? <Unlock size={15} /> : <Lock size={15} />} {current.locked ? 'Desbloquear' : 'Bloquear'}</button></div>
    </div>
  );
}

function RangeField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="mt-5 block"><span className="flex items-center justify-between gap-3 text-xs font-black text-zinc-600"><span>{label}</span><span>{Math.round(value * 10) / 10}{suffix}</span></span><input type="range" min={min} max={Math.max(min, max)} step={0.5} value={clamp(value, min, Math.max(min, max))} onChange={(event) => onChange(Number(event.target.value))} className="mt-3 w-full accent-indigo-600" /></label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</span><span className="flex min-h-12 items-center gap-2 rounded-2xl border border-zinc-200 px-3"><input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0" /><input value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} className="min-w-0 flex-1 bg-transparent text-xs font-black outline-none" /></span></label>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="mt-5 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-4"><span className="text-xs font-black text-zinc-600">{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-indigo-600" /></label>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="mt-5 block"><span className="mb-2 block text-xs font-black text-zinc-600">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-2xl border border-zinc-200 px-4 text-sm font-bold outline-none focus:border-indigo-400" /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="mt-5 block"><span className="mb-2 block text-xs font-black text-zinc-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-xs font-black outline-none">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function AlignButton({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`flex h-11 items-center justify-center rounded-xl ${active ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-500'}`}>{icon}</button>;
}
