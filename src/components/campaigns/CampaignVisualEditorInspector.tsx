'use client';

import { useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { AssetPanel, BoxPanel, Color, Field, Num, Select, Switch } from './CampaignVisualEditorControls';
import type { Action, Align, ContentKey, MediaPosition } from './CampaignVisualEditorModel';
import { clamp, contentKeys, contentNames, defaultHeader, optimize, textFor } from './CampaignVisualEditorModel';

export function CampaignVisualEditorInspector(p: any) {
  const { layer, draft, device, layout, campaign, eventInfo, stores, selectedContent } = p;
  const title = layer === 'background' ? 'Imagem de fundo' : layer === 'header' ? 'Cabeçalho / Apoio' : layer === 'logo' ? 'Logomarca' : layer === 'simulator' ? 'Simulador' : layer === 'footer' ? 'Rodapé oficial' : contentNames[selectedContent as ContentKey];
  const visual = draft.content[selectedContent];
  const mediaInput = useRef<HTMLInputElement | null>(null);
  const [mediaMessage, setMediaMessage] = useState('');
  const resetImage = () => p.patchLayout({ backgroundScale: 100, backgroundX: 50, backgroundY: 50, backgroundRotation: 0, backgroundFlipX: false, backgroundFlipY: false, cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 });
  const rotate = (delta: number) => p.patchLayout({ backgroundRotation: clamp(layout.backgroundRotation + delta, -180, 180) });

  async function applyMedia(file?: File) {
    if (!file) return;
    setMediaMessage('Otimizando imagem...');
    try {
      const data = await optimize(file, false);
      p.commit({ ...draft, showMedia: true, mediaImage: data });
      setMediaMessage('Imagem aplicada. Salve o rascunho para persistir no servidor.');
    } catch (error: any) {
      setMediaMessage(error?.message || 'Não foi possível processar a imagem.');
    }
  }

  return <aside className="overflow-y-auto bg-white p-4">
    <div className="flex items-center gap-2"><Settings2 size={17} /><strong>{title}</strong></div>

    {layer === 'background' ? <>
      <AssetPanel source={p.heroSource} inputRef={p.bgInput} id={`bg-${device}`} onFile={(file: any) => p.asset(file, 'background')} onRemove={() => p.setBackgroundMode('none')} onRestore={() => p.setBackgroundMode('original')} />
      <div className="mt-3 rounded-xl bg-indigo-50 p-3 text-xs font-bold text-indigo-700">Clique na foto para selecionar. Arraste para reposicionar e use a roda do mouse para alterar a escala.</div>
      <Switch label="Edição ativa" value={p.bgEdit} onChange={p.setBgEdit} />
      <Num label="Escala" value={layout.backgroundScale} min={1} max={1000} suffix="%" onChange={(backgroundScale: number) => p.patchLayout({ backgroundScale })} />
      <Num label="Posição horizontal" value={layout.backgroundX} min={-200} max={300} suffix="%" onChange={(backgroundX: number) => p.patchLayout({ backgroundX })} />
      <Num label="Posição vertical" value={layout.backgroundY} min={-200} max={300} suffix="%" onChange={(backgroundY: number) => p.patchLayout({ backgroundY })} />

      <div className="mt-5 border-t pt-5">
        <strong className="text-sm">Recortar, girar e espelhar</strong>
        <p className="mt-1 text-[10px] font-semibold text-zinc-500">A edição é não destrutiva e vale somente para {device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile'}.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => rotate(-90)} className="rounded-xl border bg-white px-3 py-3 text-[10px] font-black">↶ Girar 90°</button>
          <button type="button" onClick={() => rotate(90)} className="rounded-xl border bg-white px-3 py-3 text-[10px] font-black">↷ Girar 90°</button>
          <button type="button" onClick={() => p.patchLayout({ backgroundFlipX: !layout.backgroundFlipX })} className={`rounded-xl border px-3 py-3 text-[10px] font-black ${layout.backgroundFlipX ? 'bg-indigo-600 text-white' : 'bg-white'}`}>Espelhar horizontal</button>
          <button type="button" onClick={() => p.patchLayout({ backgroundFlipY: !layout.backgroundFlipY })} className={`rounded-xl border px-3 py-3 text-[10px] font-black ${layout.backgroundFlipY ? 'bg-indigo-600 text-white' : 'bg-white'}`}>Espelhar vertical</button>
        </div>
        <Num label="Rotação livre" value={layout.backgroundRotation} min={-180} max={180} suffix="°" onChange={(backgroundRotation: number) => p.patchLayout({ backgroundRotation })} />
        <div className="mt-4 rounded-2xl border bg-zinc-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-[.15em] text-zinc-500">Moldura de recorte livre</p>
          <Num label="Recorte pela esquerda" value={layout.cropX} min={0} max={Math.max(0, 100 - layout.cropWidth)} suffix="%" onChange={(cropX: number) => p.patchLayout({ cropX })} />
          <Num label="Recorte pelo topo" value={layout.cropY} min={0} max={Math.max(0, 100 - layout.cropHeight)} suffix="%" onChange={(cropY: number) => p.patchLayout({ cropY })} />
          <Num label="Largura visível" value={layout.cropWidth} min={5} max={Math.max(5, 100 - layout.cropX)} suffix="%" onChange={(cropWidth: number) => p.patchLayout({ cropWidth })} />
          <Num label="Altura visível" value={layout.cropHeight} min={5} max={Math.max(5, 100 - layout.cropY)} suffix="%" onChange={(cropHeight: number) => p.patchLayout({ cropHeight })} />
        </div>
        <button type="button" onClick={resetImage} className="mt-3 w-full rounded-xl bg-zinc-950 px-3 py-3 text-[10px] font-black text-white">Restaurar enquadramento</button>
      </div>
    </> : null}

    {layer === 'header' ? <><AssetPanel source={draft.headerLogo || defaultHeader} inputRef={p.headerInput} id="header-file" onFile={(file: any) => p.asset(file, 'header')} onRemove={() => p.commit({ ...draft, headerLogo: '' })} /><Field label="Texto de apoio" value={draft.headerLabel} onChange={(headerLabel: string) => p.commit({ ...draft, headerLabel })} /><Switch label="Exibir texto" value={draft.showHeaderLabel} onChange={(showHeaderLabel: boolean) => p.commit({ ...draft, showHeaderLabel })} /><BoxPanel box={layout.header} min={7} onChange={(value: any) => p.patchBox('header', value)} /></> : null}

    {layer === 'logo' ? <><AssetPanel source={draft.eventLogo || campaign?.logo_url || ''} inputRef={p.logoInput} id="logo-file" onFile={(file: any) => p.asset(file, 'logo')} onRemove={() => p.commit({ ...draft, eventLogo: '' })} /><BoxPanel box={layout.logo} min={7} onChange={(value: any) => p.patchBox('logo', value)} /></> : null}

    {layer === 'content' ? <>
      <div className="mt-4 grid grid-cols-2 gap-2">{contentKeys.map((key) => <button key={key} onClick={() => p.selectText(key)} className={`rounded-xl p-2 text-[10px] font-black ${selectedContent === key ? 'bg-fuchsia-600 text-white' : 'bg-zinc-100'}`}>{contentNames[key]}</button>)}</div>
      <label className="mt-4 block text-xs font-black">Texto<textarea id={`text-${selectedContent}`} value={visual.text} placeholder={textFor(selectedContent, { ...draft, content: { ...draft.content, [selectedContent]: { ...visual, text: '' } } }, campaign, eventInfo, stores)} onChange={(event) => p.patchVisual(selectedContent, { text: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border p-3" /></label>
      <BoxPanel box={layout.content[selectedContent]} min={selectedContent === 'title' || selectedContent === 'description' ? 12 : 6} onChange={(value: any) => p.patchContentBox(selectedContent, value)} />
      <Num label="Tamanho da fonte" value={visual.fontSize} min={8} max={160} suffix="px" onChange={(fontSize: number) => p.patchVisual(selectedContent, { fontSize })} />
      <Select label="Peso" value={String(visual.weight)} options={['100', '200', '300', '400', '500', '600', '700', '800', '900']} onChange={(value) => p.patchVisual(selectedContent, { weight: Number(value) })} />
      <Select label="Alinhamento" value={visual.align} options={['left', 'center', 'right']} onChange={(value) => p.patchVisual(selectedContent, { align: value as Align })} />
      <Color label="Cor do texto" value={visual.color} onChange={(color) => p.patchVisual(selectedContent, { color })} />
      <Color label="Fundo" value={visual.background} alpha onChange={(background) => p.patchVisual(selectedContent, { background })} />
      <Color label="Borda" value={visual.borderColor} alpha onChange={(borderColor) => p.patchVisual(selectedContent, { borderColor })} />
      <Num label="Opacidade" value={visual.opacity} min={0} max={100} suffix="%" onChange={(opacity: number) => p.patchVisual(selectedContent, { opacity })} />
      <Num label="Altura da linha" value={visual.lineHeight} min={.7} max={3} suffix="x" onChange={(lineHeight: number) => p.patchVisual(selectedContent, { lineHeight })} />
      <Num label="Letras" value={visual.letterSpacing} min={-8} max={30} suffix="px" onChange={(letterSpacing: number) => p.patchVisual(selectedContent, { letterSpacing })} />
      <Num label="Curvatura" value={visual.radius} min={0} max={999} suffix="px" onChange={(radius: number) => p.patchVisual(selectedContent, { radius })} />
      <Num label="Padding horizontal" value={visual.paddingX} min={0} max={80} suffix="px" onChange={(paddingX: number) => p.patchVisual(selectedContent, { paddingX })} />
      <Num label="Padding vertical" value={visual.paddingY} min={0} max={60} suffix="px" onChange={(paddingY: number) => p.patchVisual(selectedContent, { paddingY })} />
      {selectedContent.includes('Button') ? <Select label="Ação" value={visual.action} options={['simulator', 'vehicles', 'whatsapp', 'none']} onChange={(value) => p.patchVisual(selectedContent, { action: value as Action })} /> : null}
    </> : null}

    {layer === 'simulator' ? <>
      <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">Use a alça superior para mover sem bloquear os campos.</div>
      <BoxPanel box={layout.simulator} min={44} onChange={(value: any) => p.patchBox('simulator', value)} />
      <Num label="Curvatura" value={draft.cardRadius} min={0} max={80} suffix="px" onChange={(cardRadius: number) => p.commit({ ...draft, cardRadius })} />

      <div className="mt-6 border-t pt-5">
        <strong className="text-sm">Imagem / Mídia ao lado do simulador</strong>
        <p className="mt-1 text-[10px] font-semibold text-zinc-500">No desktop a mídia fica ao lado do simulador. Em telas menores ela se reposiciona acima para preservar a leitura.</p>
        <Switch label="Exibir mídia" value={draft.showMedia} onChange={(showMedia: boolean) => p.commit({ ...draft, showMedia })} />
        <AssetPanel source={draft.mediaImage || ''} inputRef={mediaInput} id="simulator-media-file" onFile={(file: any) => void applyMedia(file)} onRemove={() => p.commit({ ...draft, mediaImage: '', showMedia: false })} />
        <Field label="Texto alternativo da imagem" value={draft.mediaAlt || ''} placeholder="Ex.: veículo em destaque do evento" onChange={(mediaAlt: string) => p.commit({ ...draft, mediaAlt })} />
        <Select label="Posição no desktop" value={draft.mediaPosition} options={['left', 'right']} onChange={(mediaPosition) => p.commit({ ...draft, mediaPosition: mediaPosition as MediaPosition })} />
        <Num label="Largura da mídia" value={draft.mediaWidth} min={18} max={60} suffix="%" onChange={(mediaWidth: number) => p.commit({ ...draft, mediaWidth })} />
        <Num label="Curvatura da mídia" value={draft.mediaRadius} min={0} max={80} suffix="px" onChange={(mediaRadius: number) => p.commit({ ...draft, mediaRadius })} />
        {mediaMessage ? <div className="mt-3 rounded-xl bg-indigo-50 p-3 text-[10px] font-bold text-indigo-700">{mediaMessage}</div> : null}
      </div>
    </> : null}

    {layer === 'footer' ? <><Switch label="Exibir rodapé" value={draft.footer.visible} onChange={(visible: boolean) => p.commit({ ...draft, footer: { ...draft.footer, visible } })} /><Field label="Aviso principal" value={draft.footer.notice} textarea onChange={(notice: string) => p.commit({ ...draft, footer: { ...draft.footer, notice } })} /><Switch label="Exibir termos" value={draft.footer.showTerms} onChange={(showTerms: boolean) => p.commit({ ...draft, footer: { ...draft.footer, showTerms } })} /><Field label="Termos personalizados" value={draft.footer.termsOverride} textarea placeholder={campaign?.terms_text || 'Sem termos cadastrados.'} onChange={(termsOverride: string) => p.commit({ ...draft, footer: { ...draft.footer, termsOverride } })} /><Color label="Fundo do rodapé" value={draft.footer.backgroundColor} onChange={(backgroundColor) => p.commit({ ...draft, footer: { ...draft.footer, backgroundColor } })} /><Color label="Texto do rodapé" value={draft.footer.textColor} onChange={(textColor) => p.commit({ ...draft, footer: { ...draft.footer, textColor } })} /><Select label="Alinhamento" value={draft.footer.align} options={['left', 'center', 'right']} onChange={(value) => p.commit({ ...draft, footer: { ...draft.footer, align: value as Align })} /><Num label="Fonte" value={draft.footer.fontSize} min={9} max={32} suffix="px" onChange={(fontSize: number) => p.commit({ ...draft, footer: { ...draft.footer, fontSize } })} /><Num label="Largura máxima" value={draft.footer.maxWidth} min={320} max={1800} suffix="px" onChange={(maxWidth: number) => p.commit({ ...draft, footer: { ...draft.footer, maxWidth } })} /><Num label="Espaçamento vertical" value={draft.footer.paddingY} min={12} max={120} suffix="px" onChange={(paddingY: number) => p.commit({ ...draft, footer: { ...draft.footer, paddingY } })} /></> : null}

    <div className="mt-6 border-t pt-5"><strong className="text-sm">Aparência geral</strong><Color label="Cor principal" value={draft.primaryColor} onChange={(primaryColor) => p.commit({ ...draft, primaryColor })} /><Color label="Cor do banner" value={draft.secondaryColor} onChange={(secondaryColor) => p.commit({ ...draft, secondaryColor })} /><Num label="Escurecimento" value={draft.overlay} min={0} max={95} suffix="%" onChange={(overlay: number) => p.commit({ ...draft, overlay })} /><Num label="Altura do banner" value={layout.heroHeight} min={600} max={5000} suffix="px" onChange={(heroHeight: number) => p.patchLayout({ heroHeight })} /></div>
  </aside>;
}
