'use client';

import { useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import { AssetPanel, Color, Field, Num, Select, Switch } from './CampaignVisualEditorControls';
import { optimize } from './CampaignVisualEditorModel';
import type { MediaPosition } from './CampaignVisualEditorModel';

export function CampaignSimulatorAppearanceInspector(p: any) {
  const { draft } = p;
  const mediaInput = useRef<HTMLInputElement | null>(null);
  const [mediaMessage, setMediaMessage] = useState('');

  async function applyMedia(file?: File) {
    if (!file) return;
    setMediaMessage('Otimizando imagem...');
    try {
      const data = await optimize(file, false);
      p.commit({ ...draft, showMedia: true, mediaImage: data });
      setMediaMessage('Imagem aplicada ao simulador.');
    } catch (error: any) {
      setMediaMessage(error?.message || 'Não foi possível processar a imagem.');
    }
  }

  return <aside className="overflow-y-auto bg-white p-4">
    <div className="flex items-center gap-2"><Palette size={17}/><div><strong>Simulador — aparência</strong><p className="mt-1 text-[9px] font-bold uppercase tracking-[.12em] text-emerald-600">Posição fica no Page Builder</p></div></div>
    <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-[10px] font-semibold leading-4 text-emerald-800">Este painel altera somente o visual do simulador. Para mover, reordenar, duplicar ou usar Modo Livre, abra <strong>PÁGINA → Simulador</strong>.</div>
    <Num label="Curvatura" value={draft.cardRadius} min={0} max={80} suffix="px" onChange={(cardRadius: number) => p.commit({ ...draft, cardRadius })}/>
    <div className="mt-5 rounded-2xl border bg-zinc-50 p-3"><strong className="text-xs">Cores do simulador</strong><Color label="Fundo do card" value={draft.simulatorBackground} onChange={(simulatorBackground) => p.commit({ ...draft, simulatorBackground })}/><Color label="Fundo do resumo" value={draft.simulatorSummaryBackground} onChange={(simulatorSummaryBackground) => p.commit({ ...draft, simulatorSummaryBackground })}/></div>
    <div className="mt-6 border-t pt-5"><strong className="text-sm">Imagem / mídia do componente</strong><p className="mt-1 text-[10px] font-semibold text-zinc-500">A mídia pertence ao visual do simulador e acompanha as versões reutilizadas.</p><Switch label="Exibir mídia" value={draft.showMedia} onChange={(showMedia: boolean) => p.commit({ ...draft, showMedia })}/><AssetPanel source={draft.mediaImage || ''} inputRef={mediaInput} id="simulator-appearance-media" onFile={(file: any) => void applyMedia(file)} onRemove={() => p.commit({ ...draft, mediaImage: '', showMedia: false })}/><Field label="Texto alternativo" value={draft.mediaAlt || ''} placeholder="Ex.: veículo em destaque" onChange={(mediaAlt: string) => p.commit({ ...draft, mediaAlt })}/><Select label="Posição da mídia" value={draft.mediaPosition} options={['left','right']} onChange={(mediaPosition) => p.commit({ ...draft, mediaPosition: mediaPosition as MediaPosition })}/><Num label="Largura da mídia" value={draft.mediaWidth} min={18} max={60} suffix="%" onChange={(mediaWidth: number) => p.commit({ ...draft, mediaWidth })}/><Num label="Curvatura da mídia" value={draft.mediaRadius} min={0} max={80} suffix="px" onChange={(mediaRadius: number) => p.commit({ ...draft, mediaRadius })}/>{mediaMessage ? <div className="mt-3 rounded-xl bg-indigo-50 p-3 text-[10px] font-bold text-indigo-700">{mediaMessage}</div> : null}</div>
  </aside>;
}
