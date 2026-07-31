'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye,
  EyeOff,
  Grip,
  ImagePlus,
  Lock,
  Move,
  RotateCcw,
  Save,
  Settings2,
  Unlock,
  Upload,
  X
} from 'lucide-react';

type Device = 'desktop' | 'tablet' | 'mobile';

type HeaderBox = {
  x: number;
  y: number;
  width: number;
  visible: boolean;
  locked: boolean;
};

type HeaderDraft = {
  source: string;
  label: string;
  showLabel: boolean;
  devices: Record<Device, HeaderBox>;
};

type PointerAction = {
  pointerId: number;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  origin: HeaderBox;
} | null;

const DEFAULT_SOURCE = '/campaign-assets/auto-sede-logo-cropped.png';

const DEFAULT_DRAFT: HeaderDraft = {
  source: DEFAULT_SOURCE,
  label: 'APOIO',
  showLabel: true,
  devices: {
    desktop: { x: 1.4, y: 2.5, width: 15, visible: true, locked: false },
    tablet: { x: 3, y: 2.5, width: 25, visible: true, locked: false },
    mobile: { x: 5, y: 2.2, width: 46, visible: true, locked: false }
  }
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function getDevice(hero: HTMLElement): Device {
  if (hero.clientWidth <= 430) return 'mobile';
  if (hero.clientWidth <= 820) return 'tablet';
  return 'desktop';
}

function findTextElement(root: ParentNode, text: string) {
  return Array.from(root.querySelectorAll<HTMLElement>('span, p, h1, h2, h3, button')).find(
    (element) => element.textContent?.trim() === text
  );
}

function findEditorRoot() {
  const heading = findTextElement(document, 'Editor visual de landings');
  return heading?.closest<HTMLElement>('.fixed.inset-0') || null;
}

function findHero(editor: HTMLElement) {
  const hint = findTextElement(editor, 'Clique no fundo para editar');
  return hint?.closest<HTMLElement>('section') || null;
}

function findLayerContainer(editor: HTMLElement) {
  const title = Array.from(editor.querySelectorAll<HTMLElement>('h3')).find((element) =>
    element.textContent?.trim().startsWith('Camadas —')
  );
  const panel = title?.parentElement?.parentElement;
  return panel?.querySelector<HTMLElement>('.mt-3.space-y-2') || null;
}

function readStoredDraft(key: string): HeaderDraft {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null') as Partial<HeaderDraft> | null;
    if (!stored) return structuredClone(DEFAULT_DRAFT);
    return {
      ...DEFAULT_DRAFT,
      ...stored,
      source: stored.source || DEFAULT_SOURCE,
      label: typeof stored.label === 'string' ? stored.label : DEFAULT_DRAFT.label,
      devices: {
        desktop: { ...DEFAULT_DRAFT.devices.desktop, ...(stored.devices?.desktop || {}) },
        tablet: { ...DEFAULT_DRAFT.devices.tablet, ...(stored.devices?.tablet || {}) },
        mobile: { ...DEFAULT_DRAFT.devices.mobile, ...(stored.devices?.mobile || {}) }
      }
    };
  } catch {
    return structuredClone(DEFAULT_DRAFT);
  }
}

function getCampaignId(editor: HTMLElement | null) {
  if (!editor) return 'default';
  const selects = Array.from(editor.querySelectorAll<HTMLSelectElement>('select'));
  return selects.find((select) => select.value)?.value || 'default';
}

function storageKey(campaignId: string) {
  return `auto-sede:landing-visual:header-support:${campaignId}:v1`;
}

export function CampaignVisualEditorHeaderPatch() {
  const [editor, setEditor] = useState<HTMLElement | null>(null);
  const [hero, setHero] = useState<HTMLElement | null>(null);
  const [layerContainer, setLayerContainer] = useState<HTMLElement | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [campaignId, setCampaignId] = useState('default');
  const [draft, setDraft] = useState<HeaderDraft>(() => structuredClone(DEFAULT_DRAFT));
  const [selected, setSelected] = useState(false);
  const [message, setMessage] = useState('');
  const interactionRef = useRef<PointerAction>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const currentBox = draft.devices[device];
  const currentKey = useMemo(() => storageKey(campaignId), [campaignId]);

  useEffect(() => {
    const locate = () => {
      const nextEditor = findEditorRoot();
      const nextHero = nextEditor ? findHero(nextEditor) : null;
      setEditor(nextEditor);
      setHero(nextHero);
      setLayerContainer(nextEditor ? findLayerContainer(nextEditor) : null);
      if (nextHero) setDevice(getDevice(nextHero));
      setCampaignId(getCampaignId(nextEditor));

      if (nextHero) {
        const originalLogo = nextHero.querySelector<HTMLImageElement>('img[alt="Auto Sede"]');
        if (originalLogo) {
          originalLogo.dataset.headerPatchOriginal = 'true';
          originalLogo.style.opacity = '0';
          originalLogo.style.pointerEvents = 'none';
        }

        const hint = findTextElement(nextHero, 'Clique no fundo para editar');
        if (hint) {
          hint.style.pointerEvents = 'auto';
          hint.style.cursor = 'pointer';
          hint.setAttribute('role', 'button');
          hint.setAttribute('tabindex', '0');
        }
      }
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', locate);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', locate);
      document.querySelectorAll<HTMLImageElement>('img[data-header-patch-original="true"]').forEach((image) => {
        image.style.opacity = '';
        image.style.pointerEvents = '';
        delete image.dataset.headerPatchOriginal;
      });
    };
  }, []);

  useEffect(() => {
    setDraft(readStoredDraft(currentKey));
    setSelected(false);
    setMessage('');
  }, [currentKey]);

  useEffect(() => {
    if (!hero || !editor) return;

    const activateBackgroundEditor = () => {
      const openRight = editor.querySelector<HTMLButtonElement>('button[aria-label="Abrir painel direito"]');
      openRight?.click();

      const openLeft = editor.querySelector<HTMLButtonElement>('button[aria-label="Abrir painel esquerdo"]');
      openLeft?.click();

      window.setTimeout(() => {
        const backgroundLayer = Array.from(editor.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
          button.textContent?.includes('Imagem de fundo')
        );
        backgroundLayer?.click();
      }, 60);
      setSelected(false);
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-header-support-layer="true"]')) return;
      if (target.closest('button, input, select, textarea')) {
        if (target.textContent?.includes('Clique no fundo para editar')) activateBackgroundEditor();
        return;
      }
      if (target.closest('.cursor-move, .cursor-nwse-resize')) return;
      activateBackgroundEditor();
    };

    const hint = findTextElement(hero, 'Clique no fundo para editar');
    const hintHandler = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      activateBackgroundEditor();
    };

    hero.addEventListener('click', handleClick, true);
    hint?.addEventListener('click', hintHandler, true);
    hint?.addEventListener('dblclick', () => {
      activateBackgroundEditor();
      window.setTimeout(() => {
        const uploadButton = Array.from(editor.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
          button.textContent?.trim() === 'Trocar imagem' || button.textContent?.trim() === 'Enviar imagem'
        );
        uploadButton?.click();
      }, 100);
    });

    return () => {
      hero.removeEventListener('click', handleClick, true);
      hint?.removeEventListener('click', hintHandler, true);
    };
  }, [editor, hero]);

  function updateBox(patch: Partial<HeaderBox>) {
    setDraft((current) => ({
      ...current,
      devices: {
        ...current.devices,
        [device]: { ...current.devices[device], ...patch }
      }
    }));
  }

  function save(next = draft) {
    try {
      localStorage.setItem(currentKey, JSON.stringify(next));
      setMessage('Cabeçalho salvo neste navegador.');
    } catch {
      setMessage('Não foi possível salvar. Use uma imagem menor.');
    }
  }

  function beginPointer(event: React.PointerEvent<HTMLElement>, mode: 'move' | 'resize') {
    if (currentBox.locked || !hero) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...currentBox }
    };
    setSelected(true);
  }

  function movePointer(event: React.PointerEvent<HTMLElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || !hero) return;
    const rect = hero.getBoundingClientRect();
    const dx = ((event.clientX - interaction.startX) / rect.width) * 100;
    const dy = ((event.clientY - interaction.startY) / rect.height) * 100;

    if (interaction.mode === 'move') {
      updateBox({
        x: clamp(interaction.origin.x + dx, 0, 100 - interaction.origin.width),
        y: clamp(interaction.origin.y + dy, 0, 92)
      });
    } else {
      updateBox({ width: clamp(interaction.origin.width + dx, 7, 100 - interaction.origin.x) });
    }
  }

  function endPointer(event: React.PointerEvent<HTMLElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    window.setTimeout(() => save(), 0);
  }

  async function handleUpload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Selecione uma imagem válida.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMessage('A imagem deve ter no máximo 8 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const source = String(reader.result || '');
      const next = { ...draft, source };
      setDraft(next);
      save(next);
      setMessage('Nova logo aplicada ao Cabeçalho/Apoio.');
    };
    reader.onerror = () => setMessage('Não foi possível ler a imagem.');
    reader.readAsDataURL(file);
  }

  function resetCurrentDevice() {
    const next = {
      ...draft,
      devices: {
        ...draft.devices,
        [device]: { ...DEFAULT_DRAFT.devices[device] }
      }
    };
    setDraft(next);
    save(next);
  }

  if (!hero || !editor) return null;

  const layer = currentBox.visible ? createPortal(
    <div
      data-header-support-layer="true"
      className={`absolute z-[85] select-none ${currentBox.locked ? 'cursor-default' : 'cursor-move'}`}
      style={{ left: `${currentBox.x}%`, top: `${currentBox.y}%`, width: `${currentBox.width}%` }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setSelected(true);
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        uploadRef.current?.click();
      }}
      onPointerDown={(event) => beginPointer(event, 'move')}
      onPointerMove={movePointer}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <div className={`relative flex items-center gap-[6%] rounded-xl p-1 ${selected ? 'outline outline-2 outline-amber-400 outline-offset-4' : ''}`}>
        {draft.showLabel ? (
          <span className="shrink-0 text-[clamp(8px,0.75vw,15px)] font-black uppercase tracking-[0.08em] text-white drop-shadow-lg">
            {draft.label || 'APOIO'}
          </span>
        ) : null}
        <img src={draft.source || DEFAULT_SOURCE} alt="Logo de apoio editável" draggable={false} className="min-w-0 flex-1 object-contain drop-shadow-2xl" />

        {selected ? (
          <>
            <span className="pointer-events-none absolute -left-1 -top-9 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-950 shadow-lg">
              <Move size={11} /> Cabeçalho / Apoio
            </span>
            {!currentBox.locked ? (
              <button
                type="button"
                aria-label="Redimensionar Cabeçalho/Apoio"
                className="absolute -bottom-4 -right-4 z-50 flex h-9 w-9 touch-none items-center justify-center rounded-full border-2 border-white bg-amber-500 text-zinc-950 shadow-xl cursor-nwse-resize"
                onPointerDown={(event) => beginPointer(event, 'resize')}
                onPointerMove={movePointer}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
              >
                <Grip size={15} />
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>,
    hero
  ) : null;

  const layerRow = layerContainer ? createPortal(
    <button
      type="button"
      data-header-support-layer="true"
      onClick={() => setSelected(true)}
      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 text-left text-xs font-black ${selected ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-zinc-200 bg-white text-zinc-700'}`}
    >
      <span className="inline-flex items-center gap-2"><Settings2 size={15} /> Cabeçalho / Apoio</span>
      <span className="inline-flex items-center gap-1 text-zinc-400">
        {currentBox.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        {currentBox.locked ? <Lock size={14} /> : <Unlock size={14} />}
      </span>
    </button>,
    layerContainer
  ) : null;

  const inspector = selected ? createPortal(
    <aside
      data-header-support-layer="true"
      className="absolute right-[1.5%] top-[11%] z-[95] w-[min(310px,42%)] rounded-2xl border border-white/20 bg-zinc-950/95 p-4 text-white shadow-2xl backdrop-blur-xl"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400">Camada selecionada</p>
          <h3 className="mt-1 text-sm font-black">Cabeçalho / Apoio</h3>
        </div>
        <button type="button" onClick={() => setSelected(false)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10" aria-label="Fechar painel"><X size={15} /></button>
      </div>

      <button type="button" onClick={() => uploadRef.current?.click()} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 text-xs font-black text-zinc-950">
        <Upload size={14} /> Trocar logomarca
      </button>

      <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-zinc-400">
        Texto de apoio
        <input
          value={draft.label}
          onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
          onBlur={() => save()}
          className="mt-2 h-10 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-bold text-white outline-none"
        />
      </label>

      <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3 text-xs font-black">
        <span>Exibir texto “APOIO”</span>
        <input type="checkbox" checked={draft.showLabel} onChange={(event) => {
          const next = { ...draft, showLabel: event.target.checked };
          setDraft(next);
          save(next);
        }} className="h-4 w-4 accent-amber-500" />
      </label>

      <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-zinc-400">
        Largura: {Math.round(currentBox.width)}%
        <input type="range" min={7} max={60} value={currentBox.width} onChange={(event) => updateBox({ width: Number(event.target.value) })} onMouseUp={() => save()} className="mt-2 w-full accent-amber-500" />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => {
          const next = { ...currentBox, locked: !currentBox.locked };
          updateBox(next);
          window.setTimeout(() => save(), 0);
        }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/10 text-[11px] font-black">
          {currentBox.locked ? <Unlock size={14} /> : <Lock size={14} />} {currentBox.locked ? 'Desbloquear' : 'Bloquear'}
        </button>
        <button type="button" onClick={() => {
          const nextDraft = {
            ...draft,
            devices: { ...draft.devices, [device]: { ...currentBox, visible: false } }
          };
          setDraft(nextDraft);
          save(nextDraft);
          setSelected(false);
        }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/10 text-[11px] font-black">
          <EyeOff size={14} /> Ocultar
        </button>
      </div>

      <button type="button" onClick={resetCurrentDevice} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/15 text-[11px] font-black text-zinc-300">
        <RotateCcw size={14} /> Restaurar posição
      </button>

      {message ? <p className="mt-3 rounded-xl bg-emerald-500/15 p-2 text-[10px] font-bold leading-relaxed text-emerald-200">{message}</p> : null}
      <p className="mt-3 text-[9px] font-semibold leading-relaxed text-zinc-500">Arraste a camada diretamente. Use a alça inferior para redimensionar. Dê dois cliques na logo para trocar a imagem.</p>
    </aside>,
    hero
  ) : null;

  return (
    <>
      <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => {
        void handleUpload(event.target.files?.[0]);
        event.currentTarget.value = '';
      }} />
      {layer}
      {layerRow}
      {inspector}
      {!currentBox.visible && layerContainer ? createPortal(
        <button type="button" data-header-support-layer="true" onClick={() => {
          const next = { ...draft, devices: { ...draft.devices, [device]: { ...currentBox, visible: true } } };
          setDraft(next);
          save(next);
          setSelected(true);
        }} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 text-xs font-black text-amber-800">
          <ImagePlus size={14} /> Reexibir Cabeçalho / Apoio
        </button>,
        layerContainer
      ) : null}
    </>
  );
}
