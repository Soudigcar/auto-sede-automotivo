'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Crop, ImagePlus, Move, Upload, X, ZoomIn } from 'lucide-react';

type PendingCrop = {
  file: File;
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  aspect: number;
  zoom: number;
  focusX: number;
  focusY: number;
};

const MAX_FILE_SIZE = 14 * 1024 * 1024;

function findExactText(root: ParentNode, value: string) {
  return Array.from(root.querySelectorAll<HTMLElement>('p, span, strong, h1, h2, h3, button')).find(
    (element) => element.textContent?.trim() === value
  );
}

function findEditorRoot() {
  const heading = findExactText(document, 'Editor visual completo');
  return heading?.closest<HTMLElement>('.fixed.inset-0') || null;
}

function findBackgroundHeading(editor: HTMLElement) {
  return Array.from(editor.querySelectorAll<HTMLHeadingElement>('h3')).find(
    (heading) => heading.textContent?.trim() === 'Imagem de fundo'
  ) || null;
}

function findHero(editor: HTMLElement) {
  const hint = findExactText(editor, 'Clique no fundo para editar');
  return hint?.closest<HTMLElement>('section') || null;
}

function findOriginalBackgroundInput(editor: HTMLElement) {
  const inputs = Array.from(
    editor.querySelectorAll<HTMLInputElement>('input[type="file"][accept="image/*"]')
  ).filter((input) => input.dataset.backgroundCropNative !== 'true');
  return inputs.at(-1) || null;
}

function currentAspect(editor: HTMLElement) {
  const hero = findHero(editor);
  const rect = hero?.getBoundingClientRect();
  if (rect?.width && rect.height) return rect.width / rect.height;

  const previewLabel = Array.from(editor.querySelectorAll<HTMLElement>('span')).find((element) =>
    /Desktop|Tablet|Mobile/.test(element.textContent || '') && /px/.test(element.textContent || '')
  )?.textContent || '';

  if (previewLabel.includes('Mobile')) return 9 / 16;
  if (previewLabel.includes('Tablet')) return 4 / 5;
  return 16 / 10;
}

function validateFile(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem JPG, PNG ou WEBP.');
  if (file.size > MAX_FILE_SIZE) throw new Error('A imagem deve ter no máximo 14 MB.');
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir a imagem selecionada.'));
    image.src = url;
  });
}

async function createCroppedFile(crop: PendingCrop) {
  const image = await loadImage(crop.url);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const sourceAspect = sourceWidth / sourceHeight;

  let baseWidth: number;
  let baseHeight: number;

  if (sourceAspect > crop.aspect) {
    baseHeight = sourceHeight;
    baseWidth = sourceHeight * crop.aspect;
  } else {
    baseWidth = sourceWidth;
    baseHeight = sourceWidth / crop.aspect;
  }

  const cropWidth = Math.max(1, baseWidth / crop.zoom);
  const cropHeight = Math.max(1, baseHeight / crop.zoom);
  const maxX = Math.max(0, sourceWidth - cropWidth);
  const maxY = Math.max(0, sourceHeight - cropHeight);
  const sourceX = maxX * (crop.focusX / 100);
  const sourceY = maxY * (crop.focusY / 100);

  const outputWidth = crop.aspect >= 1 ? 2000 : Math.max(720, Math.round(1800 * crop.aspect));
  const outputHeight = crop.aspect >= 1 ? Math.max(720, Math.round(outputWidth / crop.aspect)) : 1800;
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Seu navegador não conseguiu processar o recorte.');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Não foi possível gerar a imagem recortada.')),
      'image/jpeg',
      0.9
    );
  });

  const baseName = crop.file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 80) || 'fundo';
  return new File([blob], `${baseName}-recortado.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

function sendFileToIntegratedEditor(editor: HTMLElement, file: File) {
  const input = findOriginalBackgroundInput(editor);
  if (!input) throw new Error('O campo interno de imagem de fundo não foi localizado.');

  const transfer = new DataTransfer();
  transfer.items.add(file);
  try {
    input.files = transfer.files;
  } catch {
    Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
  }
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function BackgroundUploadCropBridge() {
  const inputId = `background-upload-${useId().replace(/:/g, '')}`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUrlRef = useRef('');
  const [editor, setEditor] = useState<HTMLElement | null>(null);
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingCrop | null>(null);
  const [status, setStatus] = useState('Clique ou arraste uma imagem para recortar antes de aplicar.');
  const [processing, setProcessing] = useState(false);

  function releasePendingUrl() {
    if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
    pendingUrlRef.current = '';
  }

  useEffect(() => () => releasePendingUrl(), []);

  useEffect(() => {
    const locate = () => {
      const nextEditor = findEditorRoot();
      setEditor((current) => current === nextEditor ? current : nextEditor);

      if (!nextEditor) {
        setPanelHost(null);
        return;
      }

      const heading = findBackgroundHeading(nextEditor);
      if (!heading) {
        setPanelHost(null);
        return;
      }

      const existing = nextEditor.querySelector<HTMLElement>('[data-background-upload-crop-host="true"]');
      if (existing) {
        setPanelHost((current) => current === existing ? current : existing);
        return;
      }

      const host = document.createElement('div');
      host.dataset.backgroundUploadCropHost = 'true';
      heading.parentElement?.insertAdjacentElement('afterend', host);
      setPanelHost(host);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', locate);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', locate);
      document.querySelectorAll('[data-background-upload-crop-host="true"]').forEach((node) => node.remove());
    };
  }, []);

  useEffect(() => {
    if (!editor) return;

    const openNativePicker = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();
      fileInputRef.current?.click();
    };

    const handleClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('button');
      if (!button || button.dataset.backgroundCropNative === 'true') return;
      if (button.textContent?.trim() !== 'Trocar imagem') return;

      const backgroundHeading = findBackgroundHeading(editor);
      if (!backgroundHeading) return;
      if (button.closest('aside') !== backgroundHeading.closest('aside')) return;
      openNativePicker(event);
    };

    const handleDoubleClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-editor-element]')) return;
      const hero = findHero(editor);
      if (!hero || !hero.contains(target)) return;
      openNativePicker(event);
    };

    editor.addEventListener('click', handleClickCapture, true);
    editor.addEventListener('dblclick', handleDoubleClickCapture, true);
    return () => {
      editor.removeEventListener('click', handleClickCapture, true);
      editor.removeEventListener('dblclick', handleDoubleClickCapture, true);
    };
  }, [editor]);

  async function beginCrop(file?: File) {
    if (!file || !editor) return;
    try {
      validateFile(file);
      setStatus('Preparando recorte...');
      releasePendingUrl();
      const url = URL.createObjectURL(file);
      pendingUrlRef.current = url;
      const image = await loadImage(url);
      setPending({
        file,
        url,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        aspect: currentAspect(editor),
        zoom: 1,
        focusX: 50,
        focusY: 50
      });
      setStatus('Ajuste o enquadramento e confirme o recorte.');
    } catch (error: any) {
      setStatus(error?.message || 'Não foi possível abrir a imagem.');
    }
  }

  function cancelCrop() {
    setPending(null);
    releasePendingUrl();
    setStatus('Selecione outra imagem quando precisar.');
  }

  async function applyCrop() {
    if (!pending || !editor) return;
    setProcessing(true);
    setStatus('Gerando e aplicando a imagem recortada...');
    try {
      const croppedFile = await createCroppedFile(pending);
      sendFileToIntegratedEditor(editor, croppedFile);
      setPending(null);
      releasePendingUrl();
      setStatus('Imagem recortada aplicada ao preview. Clique em Salvar rascunho para mantê-la neste navegador.');
    } catch (error: any) {
      setStatus(error?.message || 'Não foi possível aplicar o recorte.');
    } finally {
      setProcessing(false);
    }
  }

  const uploadCard = panelHost ? createPortal(
    <div className="mt-4 rounded-3xl border border-indigo-200 bg-indigo-50/70 p-3" data-background-crop-native="true">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Upload confiável com recorte</p>
      <label
        htmlFor={inputId}
        className={`relative mt-3 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center transition ${dragging ? 'border-indigo-600 bg-indigo-100' : 'border-indigo-300 bg-white hover:border-indigo-500'}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void beginCrop(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          id={inputId}
          ref={fileInputRef}
          data-background-crop-native="true"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => {
            void beginCrop(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg"><ImagePlus size={22} /></span>
        <strong className="mt-3 text-sm font-black text-zinc-900">Clique ou arraste a imagem aqui</strong>
        <span className="mt-1 text-xs font-semibold text-zinc-500">JPG, PNG ou WEBP • até 14 MB</span>
        <span className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white"><Upload size={15} /> Selecionar e recortar</span>
      </label>
      <p className="mt-3 text-xs font-bold leading-relaxed text-indigo-700">{status}</p>
    </div>,
    panelHost
  ) : null;

  const cropModal = pending ? createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" data-background-crop-native="true">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[30px] bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4 sm:px-7">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Imagem de fundo</p>
            <h2 className="mt-1 text-xl font-black text-zinc-950">Recortar e enquadrar</h2>
          </div>
          <button type="button" onClick={cancelCrop} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600" aria-label="Fechar recorte"><X size={20} /></button>
        </header>

        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_310px]">
          <div>
            <div
              className="relative mx-auto w-full overflow-hidden rounded-3xl bg-zinc-950 shadow-inner"
              style={{ aspectRatio: String(pending.aspect) }}
            >
              <img
                src={pending.url}
                alt="Prévia do recorte"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover select-none"
                style={{
                  objectPosition: `${pending.focusX}% ${pending.focusY}%`,
                  transform: `scale(${pending.zoom})`,
                  transformOrigin: `${pending.focusX}% ${pending.focusY}%`
                }}
              />
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, index) => <span key={index} className="border border-white/20" />)}
              </div>
              <span className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-2 rounded-xl bg-black/60 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur"><Crop size={14} /> Área final</span>
            </div>
            <p className="mt-3 text-center text-xs font-semibold text-zinc-500">Prévia do recorte para o dispositivo selecionado no editor.</p>
          </div>

          <aside className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="rounded-2xl bg-white p-3 text-xs font-bold leading-relaxed text-zinc-600">
              Imagem original: {pending.naturalWidth} × {pending.naturalHeight}px. Ajuste o zoom e o ponto central antes de aplicar.
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-xs font-black text-zinc-700"><ZoomIn size={15} /> Zoom</span><strong className="text-xs text-indigo-600">{pending.zoom.toFixed(2)}×</strong></div>
              <input type="range" min="1" max="3" step="0.05" value={pending.zoom} onChange={(event) => setPending((current) => current ? { ...current, zoom: Number(event.target.value) } : current)} className="mt-3 w-full accent-indigo-600" />
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-xs font-black text-zinc-700"><Move size={15} /> Horizontal</span><strong className="text-xs text-indigo-600">{Math.round(pending.focusX)}%</strong></div>
              <input type="range" min="0" max="100" value={pending.focusX} onChange={(event) => setPending((current) => current ? { ...current, focusX: Number(event.target.value) } : current)} className="mt-3 w-full accent-indigo-600" />
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-xs font-black text-zinc-700"><Move size={15} /> Vertical</span><strong className="text-xs text-indigo-600">{Math.round(pending.focusY)}%</strong></div>
              <input type="range" min="0" max="100" value={pending.focusY} onChange={(event) => setPending((current) => current ? { ...current, focusY: Number(event.target.value) } : current)} className="mt-3 w-full accent-indigo-600" />
            </div>

            <div className="mt-5">
              <p className="text-xs font-black text-zinc-700">Proporção do recorte</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  ['Tela atual', currentAspect(editor || document.body)],
                  ['16:9', 16 / 9],
                  ['4:5', 4 / 5],
                  ['9:16', 9 / 16]
                ].map(([label, value]) => (
                  <button
                    key={String(label)}
                    type="button"
                    onClick={() => setPending((current) => current ? { ...current, aspect: Number(value) } : current)}
                    className={`min-h-10 rounded-xl border px-3 text-xs font-black ${Math.abs(pending.aspect - Number(value)) < 0.01 ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-zinc-200 bg-white text-zinc-600'}`}
                  >
                    {String(label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-2">
              <button type="button" disabled={processing} onClick={() => void applyCrop()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 text-sm font-black text-white shadow-lg disabled:opacity-50"><Check size={18} /> {processing ? 'Processando...' : 'Aplicar recorte'}</button>
              <button type="button" disabled={processing} onClick={cancelCrop} className="min-h-11 rounded-2xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-600 disabled:opacity-50">Cancelar</button>
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return <>{uploadCard}{cropModal}</>;
}
