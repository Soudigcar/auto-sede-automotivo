'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
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
  RotateCcw,
  Save,
  Settings2,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Type,
  Unlock,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { CampaignFinanceSimulatorInline } from '@/components/campaigns/CampaignFinanceSimulatorInline';

type Device = 'desktop' | 'tablet' | 'mobile';
type ElementName = 'headerSupport' | 'logo' | 'content' | 'simulator';
type Layer = 'background' | ElementName;
type BackgroundMode = 'original' | 'custom' | 'none';

type Box = {
  x: number;
  y: number;
  width: number;
  visible: boolean;
  locked: boolean;
};

type Layout = {
  heroMinHeight: number;
  titleSize: number;
  descriptionSize: number;
  cardRadius: number;
  buttonRadius: number;
  backgroundScale: number;
  backgroundX: number;
  backgroundY: number;
  boxes: Record<ElementName, Box>;
};

type Draft = {
  primaryColor: string;
  secondaryColor: string;
  overlayOpacity: number;
  headerLogo: string;
  headerLabel: string;
  showHeaderLabel: boolean;
  eventLogo: string;
  backgroundMode: Record<Device, BackgroundMode>;
  backgroundData: Record<Device, string>;
  layouts: Record<Device, Layout>;
  updatedAt: string;
};

type DragState = {
  pointerId: number;
  kind: 'element' | 'background' | 'resize';
  element?: ElementName;
  startX: number;
  startY: number;
  originBox?: Box;
  originX?: number;
  originY?: number;
  device: Device;
};

type NaturalSize = { width: number; height: number };

const widths: Record<Device, number> = { desktop: 1440, tablet: 768, mobile: 390 };
const labels: Record<Device, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
const elements: ElementName[] = ['headerSupport', 'logo', 'content', 'simulator'];
const defaultHeader = '/campaign-assets/auto-sede-logo-cropped.png';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const box = (x: number, y: number, width: number): Box => ({ x, y, width, visible: true, locked: false });

function defaultLayout(device: Device): Layout {
  if (device === 'mobile') {
    return {
      heroMinHeight: 1980,
      titleSize: 42,
      descriptionSize: 16,
      cardRadius: 26,
      buttonRadius: 24,
      backgroundScale: 100,
      backgroundX: 50,
      backgroundY: 50,
      boxes: {
        headerSupport: box(5, 2.5, 48),
        logo: box(6, 11, 50),
        content: box(6, 23, 88),
        simulator: box(5, 51, 90)
      }
    };
  }

  if (device === 'tablet') {
    return {
      heroMinHeight: 1580,
      titleSize: 58,
      descriptionSize: 18,
      cardRadius: 30,
      buttonRadius: 28,
      backgroundScale: 100,
      backgroundX: 50,
      backgroundY: 50,
      boxes: {
        headerSupport: box(3, 2.5, 28),
        logo: box(5, 11, 34),
        content: box(6, 24, 86),
        simulator: box(6, 52, 88)
      }
    };
  }

  return {
    heroMinHeight: 1120,
    titleSize: 64,
    descriptionSize: 18,
    cardRadius: 30,
    buttonRadius: 999,
    backgroundScale: 100,
    backgroundX: 50,
    backgroundY: 50,
    boxes: {
      headerSupport: box(2, 2.5, 16),
      logo: box(4, 11, 22),
      content: box(4, 24, 37),
      simulator: box(43, 12, 55)
    }
  };
}

function defaultDraft(campaign?: any): Draft {
  return {
    primaryColor: campaign?.primary_color || '#DC2626',
    secondaryColor: campaign?.secondary_color || '#071020',
    overlayOpacity: 76,
    headerLogo: '',
    headerLabel: 'APOIO',
    showHeaderLabel: true,
    eventLogo: '',
    backgroundMode: { desktop: 'original', tablet: 'original', mobile: 'original' },
    backgroundData: { desktop: '', tablet: '', mobile: '' },
    layouts: {
      desktop: defaultLayout('desktop'),
      tablet: defaultLayout('tablet'),
      mobile: defaultLayout('mobile')
    },
    updatedAt: new Date().toISOString()
  };
}

function safeBox(value: any, fallback: Box, minimumWidth = 7): Box {
  const width = clamp(Number.isFinite(Number(value?.width)) ? Number(value.width) : fallback.width, minimumWidth, 100);
  return {
    x: clamp(Number.isFinite(Number(value?.x)) ? Number(value.x) : fallback.x, 0, Math.max(0, 100 - width)),
    y: clamp(Number.isFinite(Number(value?.y)) ? Number(value.y) : fallback.y, 0, 96),
    width,
    visible: value?.visible !== false,
    locked: value?.locked === true
  };
}

function safeLayout(value: any, fallback: Layout): Layout {
  const simulator = safeBox(value?.boxes?.simulator, fallback.boxes.simulator, 44);
  const simulatorWidth = Math.max(simulator.width, fallback.boxes.simulator.width);
  const normalizedSimulator = {
    ...simulator,
    width: simulatorWidth,
    x: clamp(simulator.x, 0, Math.max(0, 100 - simulatorWidth))
  };

  return {
    ...fallback,
    ...value,
    heroMinHeight: clamp(Number(value?.heroMinHeight ?? fallback.heroMinHeight), 600, 2600),
    backgroundScale: clamp(Number(value?.backgroundScale ?? value?.backgroundZoom ?? fallback.backgroundScale), 1, 1000),
    backgroundX: clamp(Number(value?.backgroundX ?? fallback.backgroundX), -200, 300),
    backgroundY: clamp(Number(value?.backgroundY ?? fallback.backgroundY), -200, 300),
    boxes: {
      headerSupport: safeBox(value?.boxes?.headerSupport, fallback.boxes.headerSupport),
      logo: safeBox(value?.boxes?.logo, fallback.boxes.logo),
      content: safeBox(value?.boxes?.content, fallback.boxes.content, 18),
      simulator: normalizedSimulator
    }
  };
}

function safeDraft(value: any, campaign?: any): Draft {
  const fallback = defaultDraft(campaign);
  if (!value || typeof value !== 'object') return fallback;

  const legacyDesktop = value.localHeroDataUrl || '';
  const legacyMobile = value.localMobileHeroDataUrl || '';
  const data = {
    desktop: value.backgroundData?.desktop || legacyDesktop,
    tablet: value.backgroundData?.tablet || legacyDesktop,
    mobile: value.backgroundData?.mobile || legacyMobile
  };
  const mode = (device: Device): BackgroundMode => {
    const incoming = value.backgroundMode?.[device];
    if (incoming === 'none' || incoming === 'custom' || incoming === 'original') return incoming;
    return data[device] ? 'custom' : 'original';
  };

  return {
    ...fallback,
    ...value,
    primaryColor: value.primaryColor || fallback.primaryColor,
    secondaryColor: value.secondaryColor || fallback.secondaryColor,
    headerLogo: value.headerLogo || value.localHeaderSupportDataUrl || '',
    eventLogo: value.eventLogo || value.localLogoDataUrl || '',
    backgroundMode: { desktop: mode('desktop'), tablet: mode('tablet'), mobile: mode('mobile') },
    backgroundData: data,
    layouts: {
      desktop: safeLayout(value.layouts?.desktop || value.devices?.desktop, fallback.layouts.desktop),
      tablet: safeLayout(value.layouts?.tablet || value.devices?.tablet, fallback.layouts.tablet),
      mobile: safeLayout(value.layouts?.mobile || value.devices?.mobile, fallback.layouts.mobile)
    },
    updatedAt: value.updatedAt || fallback.updatedAt
  };
}

function storageKey(campaign: any) {
  return `auto-sede:landing-visual:draft:${campaign?.id || campaign?.slug || 'new'}`;
}

function elementLabel(element: ElementName) {
  if (element === 'headerSupport') return 'Cabeçalho / Apoio';
  if (element === 'logo') return 'Logomarca';
  if (element === 'content') return 'Textos e botões';
  return 'Simulador';
}

function originalBackground(campaign: any, device: Device) {
  const desktop = campaign?.hero_image_url || '';
  return device === 'mobile' ? campaign?.mobile_hero_image_url || desktop : desktop;
}

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

async function optimize(file: File, logo = false) {
  if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem válida.');
  if (file.size > 20 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 20 MB.');

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      next.src = url;
    });
    const maxWidth = logo ? 1400 : 2400;
    const maxHeight = logo ? 1000 : 1800;
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu processar a imagem.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const keepPng = logo && file.type === 'image/png';
    return canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', keepPng ? undefined : 0.84);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CampaignVisualEditorLauncher() {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [clientMode, setClientMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [device, setDevice] = useState<Device>('desktop');
  const [layer, setLayer] = useState<Layer>('content');
  const [draft, setDraft] = useState<Draft>(() => defaultDraft());
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [previewZoom, setPreviewZoom] = useState(80);
  const [backgroundEditing, setBackgroundEditing] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [simulatorVehicle, setSimulatorVehicle] = useState('');
  const [backgroundNatural, setBackgroundNatural] = useState<NaturalSize>({ width: 0, height: 0 });

  const heroRef = useRef<HTMLElement | null>(null);
  const headerInput = useRef<HTMLInputElement | null>(null);
  const logoInput = useRef<HTMLInputElement | null>(null);
  const backgroundInput = useRef<HTMLInputElement | null>(null);

  const campaign = campaigns.find((item) => item.id === selectedId) || campaigns[0] || null;
  const eventInfo = events.find((item) => item.id === campaign?.event_id) || campaign?.event || null;
  const layout = draft.layouts[device];
  const headerSource = draft.headerLogo || defaultHeader;
  const eventLogo = draft.eventLogo || campaign?.logo_url || '';
  const backgroundMode = draft.backgroundMode[device];
  const heroSource = backgroundMode === 'none'
    ? ''
    : backgroundMode === 'custom'
      ? draft.backgroundData[device]
      : originalBackground(campaign, device);

  async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    return headers;
  }

  async function load() {
    setLoading(true);
    setMessage('Carregando landings...');
    try {
      const response = await fetch('/api/master/campaigns', {
        headers: await authHeaders(),
        cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as landings.');
      const nextCampaigns = result.campaigns || [];
      setCampaigns(nextCampaigns);
      setEvents(result.events || []);
      setSelectedId((current) => current || nextCampaigns[0]?.id || '');
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar as landings.');
    } finally {
      setLoading(false);
    }
  }

  function launch() {
    setOpen(true);
    if (!campaigns.length) void load();
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!campaign) return;
    try {
      const stored = localStorage.getItem(storageKey(campaign));
      setDraft(stored ? safeDraft(JSON.parse(stored), campaign) : defaultDraft(campaign));
      setDirty(false);
      setLayer('content');
      setBackgroundEditing(false);
      setMessage(stored ? 'Rascunho visual local restaurado.' : 'Configuração padrão carregada.');
    } catch {
      setDraft(defaultDraft(campaign));
    }
  }, [campaign?.id]);

  useEffect(() => {
    if (!campaign?.slug) {
      setVehicles([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/site-vehicles?slug=${encodeURIComponent(campaign.slug)}`, {
      cache: 'no-store',
      signal: controller.signal
    })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error(result.error || 'Estoque indisponível.');
        setVehicles(result.vehicles || []);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setVehicles([]);
      });
    return () => controller.abort();
  }, [campaign?.slug]);

  useEffect(() => {
    setBackgroundNatural({ width: 0, height: 0 });
  }, [heroSource]);

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (clientMode) setClientMode(false);
      else if (backgroundEditing) setBackgroundEditing(false);
      else setOpen(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, clientMode, backgroundEditing]);

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
        const currentLayout = current.layouts[drag.device];
        if (drag.kind === 'background') {
          return {
            ...current,
            layouts: {
              ...current.layouts,
              [drag.device]: {
                ...currentLayout,
                backgroundX: clamp((drag.originX || 0) + deltaX, -200, 300),
                backgroundY: clamp((drag.originY || 0) + deltaY, -200, 300)
              }
            },
            updatedAt: new Date().toISOString()
          };
        }

        const element = drag.element!;
        const currentBox = currentLayout.boxes[element];
        const origin = drag.originBox!;
        const minimumWidth = element === 'simulator' ? 44 : element === 'logo' || element === 'headerSupport' ? 7 : 18;
        const patch = drag.kind === 'resize'
          ? { width: clamp(origin.width + deltaX, minimumWidth, 100 - origin.x) }
          : {
              x: clamp(origin.x + deltaX, 0, 100 - origin.width),
              y: clamp(origin.y + deltaY, 0, 96)
            };

        return {
          ...current,
          layouts: {
            ...current.layouts,
            [drag.device]: {
              ...currentLayout,
              boxes: {
                ...currentLayout.boxes,
                [element]: { ...currentBox, ...patch }
              }
            }
          },
          updatedAt: new Date().toISOString()
        };
      });
      setDirty(true);
    };

    const up = (event: PointerEvent) => {
      if (event.pointerId === drag.pointerId) setDrag(null);
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag]);

  function commit(next: Draft) {
    setDraft({ ...next, updatedAt: new Date().toISOString() });
    setDirty(true);
  }

  function select(next: Layer) {
    setLayer(next);
    setLeftOpen(true);
    setRightOpen(true);
    if (next !== 'background') setBackgroundEditing(false);
  }

  function updateLayout(patch: Partial<Layout>) {
    commit({
      ...draft,
      layouts: { ...draft.layouts, [device]: { ...layout, ...patch } }
    });
  }

  function updateBox(element: ElementName, patch: Partial<Box>) {
    commit({
      ...draft,
      layouts: {
        ...draft.layouts,
        [device]: {
          ...layout,
          boxes: {
            ...layout.boxes,
            [element]: { ...layout.boxes[element], ...patch }
          }
        }
      }
    });
  }

  function save() {
    if (!campaign) return;
    try {
      localStorage.setItem(storageKey(campaign), JSON.stringify(draft));
      setDirty(false);
      setMessage('Rascunho salvo neste navegador.');
    } catch {
      setMessage('O navegador ficou sem espaço. Use imagens menores.');
    }
  }

  function reset() {
    if (!campaign) return;
    commit(defaultDraft(campaign));
    setMessage('Configuração padrão restaurada.');
  }

  async function asset(file: File | undefined, kind: 'header' | 'logo' | 'background') {
    if (!file) return;
    setMessage('Otimizando imagem...');
    try {
      const data = await optimize(file, kind !== 'background');
      if (kind === 'header') {
        commit({ ...draft, headerLogo: data });
        select('headerSupport');
      } else if (kind === 'logo') {
        commit({ ...draft, eventLogo: data });
        select('logo');
      } else {
        commit({
          ...draft,
          backgroundMode: { ...draft.backgroundMode, [device]: 'custom' },
          backgroundData: { ...draft.backgroundData, [device]: data },
          layouts: {
            ...draft.layouts,
            [device]: {
              ...layout,
              backgroundScale: 100,
              backgroundX: 50,
              backgroundY: 50
            }
          }
        });
        select('background');
        setBackgroundEditing(true);
      }
      setMessage('Imagem aplicada ao Preview local.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível processar a imagem.');
    }
  }

  function setBackgroundMode(mode: BackgroundMode) {
    commit({
      ...draft,
      backgroundMode: { ...draft.backgroundMode, [device]: mode },
      backgroundData: mode === 'none'
        ? { ...draft.backgroundData, [device]: '' }
        : draft.backgroundData
    });
    setBackgroundEditing(mode !== 'none');
    setMessage(
      mode === 'none'
        ? 'Imagem removida. A cor de fundo ficou visível.'
        : mode === 'original'
          ? 'Imagem original restaurada.'
          : 'Imagem personalizada ativada.'
    );
  }

  function startElement(event: React.PointerEvent<HTMLElement>, element: ElementName, kind: 'element' | 'resize') {
    const current = layout.boxes[element];
    if (clientMode || current.locked) return;
    event.preventDefault();
    event.stopPropagation();
    select(element);
    setDrag({
      pointerId: event.pointerId,
      kind,
      element,
      startX: event.clientX,
      startY: event.clientY,
      originBox: { ...current },
      device
    });
  }

  function startBackground(event: React.PointerEvent<HTMLElement>) {
    if (
      clientMode ||
      !backgroundEditing ||
      !heroSource ||
      (event.target as HTMLElement).closest('[data-editor-element]')
    ) return;
    event.preventDefault();
    select('background');
    setDrag({
      pointerId: event.pointerId,
      kind: 'background',
      startX: event.clientX,
      startY: event.clientY,
      originX: layout.backgroundX,
      originY: layout.backgroundY,
      device
    });
  }

  function wheel(event: React.WheelEvent<HTMLElement>) {
    if (
      clientMode ||
      !backgroundEditing ||
      !heroSource ||
      (event.target as HTMLElement).closest('[data-editor-element]')
    ) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : Math.max(2, Math.round(layout.backgroundScale * 0.05));
    updateLayout({
      backgroundScale: clamp(layout.backgroundScale + (event.deltaY > 0 ? -step : step), 1, 1000)
    });
  }

  function scaleBackground(mode: 'fit' | 'fill' | 'original') {
    if (!heroRef.current || !backgroundNatural.width || !backgroundNatural.height) return;
    const rect = heroRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const heroAspect = rect.width / rect.height;
    const imageAspect = backgroundNatural.width / backgroundNatural.height;
    const widthWhenHeightFits = (imageAspect / heroAspect) * 100;
    const nextScale = mode === 'fit'
      ? Math.min(100, widthWhenHeightFits)
      : mode === 'fill'
        ? Math.max(100, widthWhenHeightFits)
        : (backgroundNatural.width / widths[device]) * 100;
    updateLayout({
      backgroundScale: clamp(nextScale, 1, 1000),
      backgroundX: 50,
      backgroundY: 50
    });
  }

  function frame(
    element: ElementName,
    children: React.ReactNode,
    options?: { doubleClick?: () => void; dragHandleOnly?: boolean }
  ) {
    const current = layout.boxes[element];
    if (!current.visible) return null;
    const active = !clientMode && layer === element;
    const dragHandleOnly = options?.dragHandleOnly === true;

    return (
      <div
        data-editor-element={element}
        className={`absolute select-none ${active ? 'z-40' : 'z-30'} ${current.locked || clientMode || dragHandleOnly ? 'cursor-default' : 'cursor-grab'}`}
        style={{
          left: `${current.x}%`,
          top: `${current.y}%`,
          width: `${current.width}%`,
          touchAction: 'none'
        }}
        onClick={(event) => {
          if (clientMode) return;
          event.stopPropagation();
          select(element);
        }}
        onDoubleClick={(event) => {
          if (clientMode || !options?.doubleClick) return;
          event.stopPropagation();
          options.doubleClick();
        }}
        onPointerDown={dragHandleOnly ? undefined : (event) => startElement(event, element, 'element')}
      >
        <div className={`relative ${active ? 'rounded-xl outline outline-2 outline-indigo-400 outline-offset-4' : ''}`}>
          {children}
          {active ? (
            <>
              {dragHandleOnly && !current.locked ? (
                <button
                  type="button"
                  className="absolute -top-11 left-0 z-50 inline-flex min-h-9 items-center gap-2 rounded-xl bg-indigo-600 px-3 text-[10px] font-black uppercase tracking-wide text-white shadow-xl cursor-grab"
                  onPointerDown={(event) => startElement(event, element, 'element')}
                >
                  <Move size={13} /> Mover simulador
                </button>
              ) : (
                <span className="pointer-events-none absolute -left-1 -top-9 rounded-lg bg-indigo-600 px-2 py-1 text-[9px] font-black uppercase text-white">
                  <Move size={11} className="inline" /> {elementLabel(element)}
                </span>
              )}
              {!current.locked ? (
                <button
                  type="button"
                  className="absolute -bottom-4 -right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-white shadow-xl"
                  onPointerDown={(event) => startElement(event, element, 'resize')}
                  aria-label={`Redimensionar ${elementLabel(element)}`}
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

  function preview(client = false) {
    const fallbackVehicles = Array.from({ length: device === 'mobile' ? 3 : device === 'tablet' ? 4 : 8 }).map((_, index) => ({
      id: `preview-${index}`,
      brand: 'Veículo',
      model: `disponível ${index + 1}`,
      version: 'Consulte condições',
      price: 0,
      store_name: 'Loja participante'
    }));
    const list = (vehicles.length ? vehicles : fallbackVehicles).slice(0, device === 'mobile' ? 3 : device === 'tablet' ? 4 : 8);

    return (
      <div className="bg-slate-50 text-slate-950">
        <section
          ref={(node) => {
            heroRef.current = node;
          }}
          className={`relative overflow-hidden text-white ${!client && layer === 'background' ? 'outline outline-2 outline-cyan-400 outline-offset-[-2px]' : ''} ${!client && backgroundEditing ? 'cursor-move' : ''}`}
          style={{
            minHeight: layout.heroMinHeight,
            backgroundColor: draft.secondaryColor,
            touchAction: 'none'
          }}
          onClick={(event) => {
            if (client || (event.target as HTMLElement).closest('[data-editor-element]')) return;
            select('background');
            setBackgroundEditing(true);
          }}
          onDoubleClick={(event) => {
            if (client || (event.target as HTMLElement).closest('[data-editor-element]')) return;
            event.preventDefault();
            backgroundInput.current?.click();
          }}
          onPointerDown={startBackground}
          onWheel={wheel}
        >
          {heroSource ? (
            <img
              src={heroSource}
              alt="Capa da campanha"
              draggable={false}
              onLoad={(event) => {
                setBackgroundNatural({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight
                });
              }}
              className="pointer-events-none absolute h-auto max-w-none select-none"
              style={{
                left: `${layout.backgroundX}%`,
                top: `${layout.backgroundY}%`,
                width: `${layout.backgroundScale}%`,
                transform: 'translate(-50%, -50%)'
              }}
            />
          ) : null}

          {heroSource && draft.overlayOpacity > 0 ? (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: `rgba(7,16,32,${draft.overlayOpacity / 100})` }}
            />
          ) : null}

          {frame(
            'headerSupport',
            <div className="flex items-center gap-[5%] p-1">
              {draft.showHeaderLabel ? (
                <span className="shrink-0 text-[clamp(8px,0.75vw,15px)] font-black uppercase text-white">
                  {draft.headerLabel || 'APOIO'}
                </span>
              ) : null}
              <img src={headerSource} alt="Logo de apoio" draggable={false} className="pointer-events-none min-w-0 flex-1 object-contain drop-shadow-2xl" />
            </div>,
            { doubleClick: () => headerInput.current?.click() }
          )}

          {frame(
            'logo',
            eventLogo ? (
              <img src={eventLogo} alt="Logomarca do evento" draggable={false} className="pointer-events-none block h-auto w-full object-contain drop-shadow-2xl" />
            ) : (
              <div className="pointer-events-none rounded-2xl border border-dashed border-white/50 bg-black/20 px-5 py-4 text-center text-xs font-black uppercase text-white/80">
                Adicionar logo do evento
              </div>
            ),
            { doubleClick: () => logoInput.current?.click() }
          )}

          {frame(
            'content',
            <div>
              <span className="rounded-full border border-white/20 bg-black/25 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em]">
                {campaign?.hero_eyebrow || 'Financiamento de veículos'}
              </span>
              <h1 className="mt-5 font-black leading-[0.98] tracking-[-0.045em]" style={{ fontSize: layout.titleSize }}>
                {campaign?.title || 'Escolha seu carro e faça uma simulação do seu financiamento'}
              </h1>
              <p className="mt-5 max-w-3xl font-medium leading-relaxed text-white/85" style={{ fontSize: layout.descriptionSize }}>
                {campaign?.description || 'Escolha um veículo, preencha seus dados e receba uma simulação.'}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {eventInfo?.start_date ? (
                  <span className="rounded-full border border-white/15 bg-black/25 px-3 py-2 text-[11px] font-black">
                    {formatDate(eventInfo.start_date)} a {formatDate(eventInfo.end_date)}
                  </span>
                ) : null}
                {eventInfo?.city ? (
                  <span className="rounded-full border border-white/15 bg-black/25 px-3 py-2 text-[11px] font-black">
                    {eventInfo.city}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  select('simulator');
                }}
                className="mt-7 min-h-13 px-7 py-4 text-sm font-black shadow-xl"
                style={{ borderRadius: layout.buttonRadius, color: '#fff', background: draft.primaryColor }}
              >
                {campaign?.cta_label || 'Começar simulação'}
              </button>
            </div>
          )}

          {frame(
            'simulator',
            <CampaignFinanceSimulatorInline
              campaign={campaign}
              eventInfo={eventInfo}
              vehicles={vehicles}
              initialVehicleId={simulatorVehicle}
              primaryColor={draft.primaryColor}
              cardRadius={layout.cardRadius}
              stacked={device !== 'desktop'}
            />,
            { dragHandleOnly: true }
          )}

          {!client && layer === 'background' ? (
            <div className="pointer-events-none absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/70 px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-white">
              {heroSource
                ? backgroundEditing
                  ? 'Arraste a foto • rolagem = escala • duplo clique = trocar'
                  : 'Clique para editar a foto'
                : 'Sem imagem • a cor de fundo está ativa'}
            </div>
          ) : null}
        </section>

        <section className="bg-white px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: draft.primaryColor }}>Vantagens do evento</p>
            <h2 className="mt-3 text-3xl font-black sm:text-5xl">Tudo preparado para facilitar sua escolha</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { title: 'Simulação rápida', description: 'Faça uma estimativa inicial antes do atendimento.' },
                { title: 'Estoque conectado', description: 'Veículos das lojas participantes.' },
                { title: 'Atendimento direto', description: 'Contato com a loja responsável.' }
              ].map((item, index) => (
                <article key={item.title} className="rounded-3xl border border-slate-200 p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ background: draft.primaryColor }}>{index + 1}</span>
                  <h3 className="mt-5 text-xl font-black">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-500">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-100 px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl font-black sm:text-5xl">Veículos disponíveis</h2>
            <div className={`mt-8 grid gap-4 ${device === 'mobile' ? 'grid-cols-1' : device === 'tablet' ? 'grid-cols-2' : 'grid-cols-4'}`}>
              {list.map((vehicle: any) => (
                <article key={vehicle.id} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                  <div className="aspect-[4/3] bg-slate-200">
                    {vehicle.image_url ? <img src={vehicle.image_url} alt={`${vehicle.brand} ${vehicle.model}`} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-black uppercase text-slate-400">{vehicle.store_name}</p>
                    <h3 className="mt-2 text-lg font-black">{vehicle.brand} {vehicle.model}</h3>
                    <p className="mt-2 text-sm text-slate-500">{vehicle.version}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSimulatorVehicle(vehicle.id);
                        select('simulator');
                      }}
                      className="mt-4 min-h-10 w-full rounded-xl text-xs font-black text-white"
                      style={{ background: draft.primaryColor }}
                    >
                      Simular este veículo
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <footer className="bg-slate-950 px-6 py-10 text-white">
          <div className="mx-auto max-w-6xl">
            <p className="font-black">{campaign?.name || 'Landing do evento'}</p>
            <p className="mt-1 text-xs text-white/50">Preview visual local — não publicado.</p>
          </div>
        </footer>
      </div>
    );
  }

  const gridColumns = `${leftOpen ? '290px' : '0px'} minmax(0,1fr) ${rightOpen ? '360px' : '0px'}`;

  return (
    <>
      <section className="mb-6 rounded-[28px] border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-violet-50 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Sparkles size={22} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Editor visual nativo</p>
              <h2 className="mt-1 text-xl font-black">Recorte livre e simulador completo</h2>
              <p className="mt-1 text-sm text-zinc-500">A imagem pode ser reduzida até 1% e o formulário oficial fica diretamente no banner.</p>
            </div>
          </div>
          <button type="button" onClick={launch} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-black text-white">
            <Maximize2 size={18} /> Abrir editor visual
          </button>
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950">
          <header className="relative z-[120] flex min-h-[72px] items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-4 text-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-black">Editor visual completo</p>
              <p className="truncate text-[11px] font-bold text-zinc-400">{campaign?.name || 'Carregando...'} • {dirty ? 'alterações não salvas' : 'rascunho salvo'}</p>
            </div>
            <div className="hidden items-center rounded-xl bg-white/10 p-1 md:flex">
              {(['desktop', 'tablet', 'mobile'] as Device[]).map((item) => {
                const Icon = item === 'desktop' ? Monitor : item === 'tablet' ? Tablet : Smartphone;
                return (
                  <button key={item} type="button" onClick={() => setDevice(item)} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-xs font-black ${device === item ? 'bg-white text-zinc-950' : 'text-zinc-300'}`}>
                    <Icon size={16} /> {labels[item]}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setClientMode(true)} className="hidden min-h-11 items-center gap-2 rounded-xl bg-indigo-500/20 px-4 text-xs font-black sm:inline-flex">
                <Maximize2 size={16} /> Modo cliente
              </button>
              <button type="button" onClick={save} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black">
                <Save size={16} /> Salvar rascunho
              </button>
              <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10" aria-label="Fechar editor">
                <X size={19} />
              </button>
            </div>
          </header>

          <div className="relative grid min-h-0 flex-1" style={{ gridTemplateColumns: gridColumns }}>
            <aside className={`min-w-0 overflow-y-auto bg-white ${leftOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
              <div className="w-[290px] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Landing selecionada</p>
                <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loading} className="mt-3 min-h-12 w-full rounded-2xl border border-zinc-200 px-3 text-xs font-black">
                  {campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">
                  Tudo desta tela é local. Nenhuma alteração é gravada no Supabase.
                </div>

                <div className="mt-6">
                  <Title icon={<Layers3 size={16} />} text={`Camadas — ${labels[device]}`} />
                  <div className="mt-3 space-y-2">
                    <LayerRow label="Imagem de fundo" active={layer === 'background'} onSelect={() => select('background')} />
                    {elements.map((element) => (
                      <LayerRow
                        key={element}
                        label={elementLabel(element)}
                        active={layer === element}
                        visible={layout.boxes[element].visible}
                        locked={layout.boxes[element].locked}
                        onSelect={() => select(element)}
                        onVisible={() => updateBox(element, { visible: !layout.boxes[element].visible })}
                        onLocked={() => updateBox(element, { locked: !layout.boxes[element].locked })}
                      />
                    ))}
                  </div>
                </div>

                <button type="button" onClick={reset} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 text-xs font-black text-zinc-600">
                  <RotateCcw size={16} /> Restaurar padrão
                </button>
                {message ? <div className="mt-4 rounded-2xl bg-indigo-50 p-3 text-xs font-bold text-indigo-700">{message}</div> : null}
              </div>
            </aside>

            <section className="relative min-w-0 overflow-auto bg-zinc-900 p-5">
              <button type="button" onClick={() => setLeftOpen((value) => !value)} className="absolute left-0 top-1/2 z-[115] flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-xl bg-zinc-800 text-white">
                {leftOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
              </button>
              <button type="button" onClick={() => setRightOpen((value) => !value)} className="absolute right-0 top-1/2 z-[115] flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-xl bg-zinc-800 text-white">
                {rightOpen ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
              </button>

              <div className="mb-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                  <button type="button" onClick={() => setPreviewZoom((value) => clamp(value - 10, 40, 100))} aria-label="Diminuir zoom do Preview"><ZoomOut size={16} /></button>
                  <strong className="min-w-12 text-center text-xs">{previewZoom}%</strong>
                  <button type="button" onClick={() => setPreviewZoom((value) => clamp(value + 10, 40, 100))} aria-label="Aumentar zoom do Preview"><ZoomIn size={16} /></button>
                </div>
                <button type="button" onClick={() => setClientMode(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black">
                  <Maximize2 size={16} /> Expandir preview
                </button>
              </div>

              <div className="mx-auto origin-top" style={{ width: widths[device], transform: `scale(${previewZoom / 100})`, marginBottom: `calc(${previewZoom / 100 - 1} * 100%)` }}>
                <div className="overflow-hidden rounded-t-[26px] bg-slate-100 shadow-2xl">
                  <div className="flex h-9 items-center justify-between px-5 text-[10px] font-black uppercase text-slate-400">
                    <span>{labels[device]} • {widths[device]}px</span>
                    <span>Preview não publicado</span>
                  </div>
                  {preview(false)}
                </div>
              </div>
            </section>

            <aside className={`min-w-0 overflow-y-auto bg-white ${rightOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
              <div className="w-[360px] p-4">
                <Title
                  icon={layer === 'background' ? <ImagePlus size={16} /> : layer === 'content' ? <Type size={16} /> : layer === 'simulator' ? <LayoutTemplate size={16} /> : <Settings2 size={16} />}
                  text={layer === 'background' ? 'Imagem de fundo' : elementLabel(layer as ElementName)}
                />

                {layer === 'background' ? (
                  <BackgroundPanel
                    device={device}
                    mode={backgroundMode}
                    source={heroSource}
                    editing={backgroundEditing}
                    inputRef={backgroundInput}
                    inputId={`native-bg-v2-${device}`}
                    layout={layout}
                    onFile={(file) => void asset(file, 'background')}
                    onEditing={() => setBackgroundEditing((value) => !value)}
                    onRemove={() => setBackgroundMode('none')}
                    onRestore={() => setBackgroundMode('original')}
                    onLayout={updateLayout}
                    onScaleMode={scaleBackground}
                  />
                ) : null}

                {layer === 'headerSupport' ? (
                  <>
                    <Asset label="Logo do Cabeçalho/Apoio" value={headerSource} onUpload={() => headerInput.current?.click()} onRemove={() => commit({ ...draft, headerLogo: '' })} />
                    <label className="mt-5 block text-xs font-black text-zinc-600">
                      Texto de apoio
                      <input value={draft.headerLabel} onChange={(event) => commit({ ...draft, headerLabel: event.target.value })} className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-200 px-4" />
                    </label>
                    <label className="mt-4 flex items-center justify-between rounded-2xl bg-zinc-50 p-4 text-xs font-black">
                      Exibir texto
                      <input type="checkbox" checked={draft.showHeaderLabel} onChange={(event) => commit({ ...draft, showHeaderLabel: event.target.checked })} />
                    </label>
                    <Inspector element="headerSupport" layout={layout} onUpdate={(patch) => updateBox('headerSupport', patch)} />
                  </>
                ) : null}

                {layer === 'logo' ? (
                  <>
                    <Asset label="Logo do evento" value={eventLogo} onUpload={() => logoInput.current?.click()} onRemove={() => commit({ ...draft, eventLogo: '' })} />
                    <Inspector element="logo" layout={layout} onUpdate={(patch) => updateBox('logo', patch)} />
                  </>
                ) : null}

                {layer === 'content' ? (
                  <>
                    <Inspector element="content" layout={layout} onUpdate={(patch) => updateBox('content', patch)} />
                    <Range label="Tamanho do título" value={layout.titleSize} min={28} max={92} suffix="px" onChange={(titleSize) => updateLayout({ titleSize })} />
                    <Range label="Tamanho da descrição" value={layout.descriptionSize} min={12} max={28} suffix="px" onChange={(descriptionSize) => updateLayout({ descriptionSize })} />
                  </>
                ) : null}

                {layer === 'simulator' ? (
                  <>
                    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800">
                      O formulário completo está diretamente no banner. Use a alça “Mover simulador” para reposicionar sem bloquear os campos.
                    </div>
                    <Inspector element="simulator" layout={layout} onUpdate={(patch) => updateBox('simulator', patch)} />
                    <Range label="Curvatura do simulador" value={layout.cardRadius} min={0} max={60} suffix="px" onChange={(cardRadius) => updateLayout({ cardRadius })} />
                  </>
                ) : null}

                <div className="mt-7 border-t border-zinc-200 pt-6">
                  <Title icon={<Settings2 size={16} />} text="Aparência geral" />
                  <Color label="Cor principal" value={draft.primaryColor} onChange={(primaryColor) => commit({ ...draft, primaryColor })} />
                  <Color label="Cor de fundo" value={draft.secondaryColor} onChange={(secondaryColor) => commit({ ...draft, secondaryColor })} />
                  <Range label="Escurecimento da capa" value={draft.overlayOpacity} min={0} max={95} suffix="%" onChange={(overlayOpacity) => commit({ ...draft, overlayOpacity })} />
                  <Range label="Altura mínima do banner" value={layout.heroMinHeight} min={device === 'mobile' ? 900 : 600} max={2600} suffix="px" onChange={(heroMinHeight) => updateLayout({ heroMinHeight })} />
                </div>
              </div>
            </aside>
          </div>

          <input ref={headerInput} type="file" accept="image/*" className="hidden" onChange={(event) => { void asset(event.currentTarget.files?.[0], 'header'); event.currentTarget.value = ''; }} />
          <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(event) => { void asset(event.currentTarget.files?.[0], 'logo'); event.currentTarget.value = ''; }} />

          {clientMode ? (
            <div className="fixed inset-0 z-[200] overflow-auto bg-zinc-950">
              <div className="sticky top-0 z-[210] flex min-h-14 items-center justify-between bg-zinc-950 px-4 text-white">
                <strong>Modo cliente</strong>
                <button type="button" onClick={() => setClientMode(false)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-xs font-black">
                  <Minimize2 size={16} /> Voltar ao editor
                </button>
              </div>
              <div className="mx-auto bg-white" style={{ width: device === 'desktop' ? '100%' : widths[device], maxWidth: '100%' }}>
                {preview(true)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Title({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{icon}</span><h3 className="text-sm font-black text-zinc-900">{text}</h3></div>;
}

function LayerRow({ label, active, visible, locked, onSelect, onVisible, onLocked }: { label: string; active: boolean; visible?: boolean; locked?: boolean; onSelect: () => void; onVisible?: () => void; onLocked?: () => void }) {
  return (
    <div className={`flex min-h-12 items-center gap-2 rounded-2xl border px-3 ${active ? 'border-indigo-300 bg-indigo-50' : 'border-zinc-200'}`}>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left text-xs font-black">{label}</button>
      {onVisible ? <button type="button" onClick={onVisible} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-zinc-400">{visible ? <Eye size={15} /> : <EyeOff size={15} />}</button> : null}
      {onLocked ? <button type="button" onClick={onLocked} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-zinc-400">{locked ? <Lock size={15} /> : <Unlock size={15} />}</button> : null}
    </div>
  );
}

function Range({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <label className="mt-5 block">
      <span className="flex justify-between text-xs font-black text-zinc-600"><span>{label}</span><span>{Math.round(value * 10) / 10}{suffix}</span></span>
      <input type="range" min={min} max={max} step={0.5} value={clamp(value, min, max)} onChange={(event) => onChange(Number(event.target.value))} className="mt-3 w-full accent-indigo-600" />
    </label>
  );
}

function NumberRange({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-black text-zinc-600">{label}</label>
        <span className="flex items-center rounded-xl border border-zinc-200 bg-white px-2">
          <input
            type="number"
            min={min}
            max={max}
            step={0.5}
            value={Math.round(value * 10) / 10}
            onChange={(event) => onChange(clamp(Number(event.target.value || min), min, max))}
            className="h-9 w-20 bg-transparent text-right text-xs font-black outline-none"
          />
          <span className="ml-1 text-xs font-black text-zinc-400">{suffix}</span>
        </span>
      </div>
      <input type="range" min={min} max={max} step={0.5} value={clamp(value, min, max)} onChange={(event) => onChange(Number(event.target.value))} className="mt-3 w-full accent-indigo-600" />
    </div>
  );
}

function Inspector({ element, layout, onUpdate }: { element: ElementName; layout: Layout; onUpdate: (patch: Partial<Box>) => void }) {
  const current = layout.boxes[element];
  const minimumWidth = element === 'simulator' ? 44 : element === 'logo' || element === 'headerSupport' ? 7 : 18;
  return (
    <div className="mt-5">
      <div className="rounded-2xl bg-indigo-50 p-3 text-xs font-bold text-indigo-700">
        {element === 'simulator' ? 'Use a alça superior para mover o simulador e a alça inferior para redimensionar.' : 'Arraste o elemento no Preview e use a alça para redimensionar.'}
      </div>
      <Range label="Posição horizontal" value={current.x} min={0} max={Math.max(0, 100 - current.width)} suffix="%" onChange={(x) => onUpdate({ x })} />
      <Range label="Posição vertical" value={current.y} min={0} max={96} suffix="%" onChange={(y) => onUpdate({ y })} />
      <Range label="Largura" value={current.width} min={minimumWidth} max={100 - current.x} suffix="%" onChange={(width) => onUpdate({ width })} />
    </div>
  );
}

function Asset({ label, value, onUpload, onRemove }: { label: string; value: string; onUpload: () => void; onRemove: () => void }) {
  return (
    <div className="mt-5 rounded-3xl border border-zinc-200 p-3">
      <p className="text-[10px] font-black uppercase text-zinc-400">{label}</p>
      <div className="mt-3 flex min-h-32 items-center justify-center rounded-2xl bg-zinc-100 p-3">
        {value ? <img src={value} alt="Prévia" className="max-h-28 max-w-full object-contain" /> : <ImagePlus size={34} className="text-zinc-300" />}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onUpload} className="min-h-11 flex-1 rounded-xl bg-indigo-600 text-xs font-black text-white"><Upload size={15} className="inline" /> Trocar imagem</button>
        <button type="button" onClick={onRemove} className="h-11 w-11 rounded-xl bg-zinc-100 text-zinc-500"><Trash2 size={15} className="mx-auto" /></button>
      </div>
    </div>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="mt-4 flex min-h-12 items-center gap-3 rounded-2xl border border-zinc-200 px-3">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} />
      <span className="text-xs font-black text-zinc-600">{label}</span>
      <strong className="ml-auto text-xs">{value}</strong>
    </label>
  );
}

function BackgroundPanel({
  device,
  mode,
  source,
  editing,
  inputRef,
  inputId,
  layout,
  onFile,
  onEditing,
  onRemove,
  onRestore,
  onLayout,
  onScaleMode
}: {
  device: Device;
  mode: BackgroundMode;
  source: string;
  editing: boolean;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  inputId: string;
  layout: Layout;
  onFile: (file: File | undefined) => void;
  onEditing: () => void;
  onRemove: () => void;
  onRestore: () => void;
  onLayout: (patch: Partial<Layout>) => void;
  onScaleMode: (mode: 'fit' | 'fill' | 'original') => void;
}) {
  return (
    <>
      <div className="mt-5 rounded-3xl border border-zinc-200 p-3">
        <div className="flex justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-zinc-400">Fundo do {labels[device]}</p>
            <p className="mt-1 text-xs font-black">{mode === 'original' ? 'Imagem original' : mode === 'custom' ? 'Imagem personalizada' : 'Sem imagem'}</p>
          </div>
          <span className={`rounded-full px-3 py-2 text-[9px] font-black uppercase ${editing ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{editing ? 'Edição ativa' : 'Parado'}</span>
        </div>

        <label htmlFor={inputId} className="mt-3 flex min-h-36 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-zinc-100 p-3">
          {source ? <img src={source} alt="Fundo" className="max-h-32 max-w-full object-contain" /> : <div className="text-center text-zinc-400"><ImagePlus size={34} className="mx-auto" /><strong className="mt-2 block text-xs">Clique para adicionar</strong></div>}
        </label>
        <input id={inputId} ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" onChange={(event) => { onFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label htmlFor={inputId} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 text-xs font-black text-white"><Upload size={15} /> Trocar imagem</label>
          <button type="button" disabled={!source} onClick={onEditing} className="min-h-11 rounded-xl bg-indigo-50 text-xs font-black text-indigo-700 disabled:opacity-40"><Move size={15} className="inline" /> {editing ? 'Finalizar' : 'Editar na foto'}</button>
          <button type="button" onClick={onRemove} className="min-h-11 rounded-xl bg-red-50 text-xs font-black text-red-700"><Trash2 size={15} className="inline" /> Remover foto</button>
          <button type="button" onClick={onRestore} className="min-h-11 rounded-xl border border-zinc-200 text-xs font-black text-zinc-600"><RotateCcw size={15} className="inline" /> Restaurar original</button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-indigo-50 p-3 text-xs font-bold text-indigo-700">
        Clique na própria foto, arraste livremente e use a roda do mouse ou o trackpad. A escala vai de 1% a 1000%, preservando a proporção original.
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button type="button" disabled={!source} onClick={() => onScaleMode('fit')} className="min-h-10 rounded-xl bg-zinc-100 px-2 text-[10px] font-black text-zinc-700 disabled:opacity-40">Ajustar</button>
        <button type="button" disabled={!source} onClick={() => onScaleMode('fill')} className="min-h-10 rounded-xl bg-zinc-100 px-2 text-[10px] font-black text-zinc-700 disabled:opacity-40">Preencher</button>
        <button type="button" disabled={!source} onClick={() => onScaleMode('original')} className="min-h-10 rounded-xl bg-zinc-100 px-2 text-[10px] font-black text-zinc-700 disabled:opacity-40">Tamanho original</button>
      </div>

      <NumberRange label="Escala livre" value={layout.backgroundScale} min={1} max={1000} suffix="%" onChange={(backgroundScale) => onLayout({ backgroundScale })} />
      <NumberRange label="Posição horizontal" value={layout.backgroundX} min={-200} max={300} suffix="%" onChange={(backgroundX) => onLayout({ backgroundX })} />
      <NumberRange label="Posição vertical" value={layout.backgroundY} min={-200} max={300} suffix="%" onChange={(backgroundY) => onLayout({ backgroundY })} />
    </>
  );
}
