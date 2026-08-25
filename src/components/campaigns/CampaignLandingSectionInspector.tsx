'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ImagePlus, Layers3, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Color, Field, Num, Select, Switch } from './CampaignVisualEditorControls';
import { addLandingBlock, cloneLandingSection, createAdvantagesTemplateSection, createContentSection, createHomeTemplateSection, createSimulationTemplateSection, createVehiclesTemplateSection, type LandingBlockType, type LandingDraftV3, type LandingSection } from './CampaignLandingSectionModel';
import { optimize } from './CampaignVisualEditorModel';

type Props = { draft: LandingDraftV3; selectedSectionId: string; selectedBlockId: string; onSelectSection: (id: string) => void; onSelectBlock: (id: string) => void; onChange: (draft: LandingDraftV3) => void };
const blockLabels: Record<LandingBlockType, string> = { title: 'Título', text: 'Texto', card: 'Card', image: 'Imagem', icon: 'Ícone / imagem pequena', button: 'Botão' };

export function CampaignLandingSectionInspector(props: Props) {
  const sectionIndex = props.draft.sections.findIndex((item) => item.id === props.selectedSectionId);
  const section = props.draft.sections[sectionIndex] || null;
  const blockIndex = section?.blocks.findIndex((item) => item.id === props.selectedBlockId) ?? -1;
  const block = blockIndex >= 0 ? section?.blocks[blockIndex] : null;
  const imageInput = useRef<HTMLInputElement | null>(null);
  const [imageMessage, setImageMessage] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  function patchSection(patch: Partial<LandingSection>) { if (!section) return; const sections = [...props.draft.sections]; sections[sectionIndex] = { ...section, ...patch }; props.onChange({ ...props.draft, sections }); }
  function replaceSections(sections: LandingSection[]) { props.onChange({ ...props.draft, sections }); }
  function patchBlock(patch: Record<string, unknown>) { if (!section || !block || blockIndex < 0) return; const blocks = [...section.blocks]; blocks[blockIndex] = { ...block, ...patch } as any; patchSection({ blocks }); }
  function moveSection(delta: number) { if (!section) return; const target = sectionIndex + delta; if (target < 0 || target >= props.draft.sections.length) return; const sections = [...props.draft.sections]; [sections[sectionIndex], sections[target]] = [sections[target], sections[sectionIndex]]; replaceSections(sections); }
  function moveBlock(delta: number) { if (!section || !block || blockIndex < 0) return; const target = blockIndex + delta; if (target < 0 || target >= section.blocks.length) return; const blocks = [...section.blocks]; [blocks[blockIndex], blocks[target]] = [blocks[target], blocks[blockIndex]]; patchSection({ blocks }); }
  function appendSection(next: LandingSection) { replaceSections([...props.draft.sections, next]); props.onSelectSection(next.id); props.onSelectBlock(next.blocks[0]?.id || ''); setAddOpen(false); }

  async function setBlockImage(file?: File) {
    if (!file || !block) return;
    setImageMessage('Otimizando imagem...');
    try {
      const data = await optimize(file, false);
      patchBlock({ image: data });
      setImageMessage('Imagem aplicada ao elemento. Salve o rascunho quando quiser persistir.');
    } catch (error: any) { setImageMessage(error?.message || 'Falha ao processar imagem.'); }
  }

  if (!section) return <div><strong>Seções da landing</strong><p className="mt-2 text-xs text-zinc-500">Selecione uma seção.</p></div>;
  const vs = section.vehicleSettings;

  return <div>
    <div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase text-fuchsia-600">Seção editável</p><strong>{section.name}</strong><p className="mt-1 text-[9px] font-bold uppercase text-zinc-400">{section.type === 'vehicles' ? 'Estoque' : section.type === 'simulation' ? 'Simulação' : 'Conteúdo'}</p></div><div className="flex gap-1"><button onClick={() => moveSection(-1)} className="rounded-lg border p-2"><ArrowUp size={14}/></button><button onClick={() => moveSection(1)} className="rounded-lg border p-2"><ArrowDown size={14}/></button></div></div>
    <Field label="Nome da seção" value={section.name} onChange={(name: string) => patchSection({ name })}/>
    <Switch label="Exibir seção" value={section.visible} onChange={(visible: boolean) => patchSection({ visible })}/>
    <Switch label="Bloquear estrutura" value={section.locked} onChange={(locked: boolean) => patchSection({ locked })}/>
    <Color label="Cor de fundo" value={section.backgroundColor} onChange={(backgroundColor) => patchSection({ backgroundColor })}/>
    <Color label="Cor de texto padrão" value={section.textColor} onChange={(textColor) => patchSection({ textColor })}/>
    <Num label="Espaçamento vertical" value={section.paddingY} min={0} max={180} suffix="px" onChange={(paddingY: number) => patchSection({ paddingY })}/>

    {section.type === 'vehicles' ? <>
      <div className="mt-5 rounded-2xl border bg-slate-50 p-3">
        <strong className="text-sm">Busca e filtros</strong>
        {([['showSearch','Barra de pesquisa'],['showCategories','Categorias'],['showBrand','Marca'],['showModel','Modelo'],['showPrice','Preço'],['showYear','Ano'],['showTransmission','Câmbio'],['showFuel','Combustível'],['showSort','Ordenação']] as const).map(([key,label]) => <Switch key={key} label={label} value={vs[key]} onChange={(value: boolean) => patchSection({ vehicleSettings: { ...vs, [key]: value } })}/>)}
      </div>
      <div className="mt-5 rounded-2xl border bg-indigo-50 p-3">
        <strong className="text-sm text-indigo-950">Visual premium do estoque</strong>
        <Num label="Veículos por linha no Desktop" value={vs.cardColumnsDesktop} min={1} max={6} onChange={(cardColumnsDesktop: number) => patchSection({ vehicleSettings: { ...vs, cardColumnsDesktop } })}/>
        <Num label="Espaço entre cards" value={vs.cardGap} min={4} max={40} suffix="px" onChange={(cardGap: number) => patchSection({ vehicleSettings: { ...vs, cardGap } })}/>
        <Num label="Largura do filtro lateral" value={vs.filterWidth} min={200} max={420} suffix="px" onChange={(filterWidth: number) => patchSection({ vehicleSettings: { ...vs, filterWidth } })}/>
        <Num label="Curvatura do filtro" value={vs.filterRadius} min={0} max={80} suffix="px" onChange={(filterRadius: number) => patchSection({ vehicleSettings: { ...vs, filterRadius } })}/>
        <Num label="Curvatura das categorias" value={vs.categoryRadius} min={0} max={999} suffix="px" onChange={(categoryRadius: number) => patchSection({ vehicleSettings: { ...vs, categoryRadius } })}/>
        <Color label="Fundo do painel" value={vs.filterPanelBackground} alpha onChange={(filterPanelBackground) => patchSection({ vehicleSettings: { ...vs, filterPanelBackground } })}/>
        <Color label="Texto do painel" value={vs.filterTextColor} onChange={(filterTextColor) => patchSection({ vehicleSettings: { ...vs, filterTextColor } })}/>
        <Color label="Categoria" value={vs.categoryBackground} alpha onChange={(categoryBackground) => patchSection({ vehicleSettings: { ...vs, categoryBackground } })}/>
        <Color label="Texto da categoria" value={vs.categoryTextColor} onChange={(categoryTextColor) => patchSection({ vehicleSettings: { ...vs, categoryTextColor } })}/>
        <Color label="Categoria ativa" value={vs.categoryActiveBackground} onChange={(categoryActiveBackground) => patchSection({ vehicleSettings: { ...vs, categoryActiveBackground } })}/>
        <Color label="Texto ativo" value={vs.categoryActiveTextColor} onChange={(categoryActiveTextColor) => patchSection({ vehicleSettings: { ...vs, categoryActiveTextColor } })}/>
      </div>
    </> : section.type === 'simulation' ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-900">Esta é uma seção reutilizável do simulador. Ela usa o simulador atual da campanha e pode ter fundo, espaçamento, posição e ordem próprios. A cópia é independente da seção original.</div> : <>
      <Num label="Colunas dos elementos" value={section.columns} min={1} max={6} onChange={(columns: number) => patchSection({ columns })}/>
      <div className="mt-6 border-t pt-5"><strong className="text-sm">Elementos da seção</strong><p className="mt-1 text-[10px] text-zinc-500">Adicione, remova, deixe caixas vazias ou misture texto, card, imagem, ícone e botão.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">{(Object.keys(blockLabels) as LandingBlockType[]).map((type) => <button key={type} type="button" disabled={section.locked} onClick={() => { const next = addLandingBlock(section, type); patchSection({ blocks: next.blocks }); props.onSelectBlock(next.blocks[next.blocks.length - 1].id); }} className="rounded-xl border bg-white p-2 text-[10px] font-black disabled:opacity-40"><Plus size={12} className="inline"/> {blockLabels[type]}</button>)}</div>
        <div className="mt-3 space-y-2">{section.blocks.map((item, index) => <button key={item.id} onClick={() => props.onSelectBlock(item.id)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-xs font-black ${props.selectedBlockId === item.id ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-800' : 'bg-white'}`}><span>{index + 1}. {blockLabels[item.type]}</span><span className="text-[9px] opacity-50">{item.visible ? 'VISÍVEL' : 'OCULTO'}</span></button>)}</div>
      </div>
    </>}

    {section.type === 'content' && block ? <div className="mt-6 border-t pt-5">
      <div className="flex items-center justify-between"><strong className="text-sm">Editar {blockLabels[block.type]}</strong><div className="flex gap-1"><button onClick={() => moveBlock(-1)} className="rounded-lg border p-2"><ArrowUp size={13}/></button><button onClick={() => moveBlock(1)} className="rounded-lg border p-2"><ArrowDown size={13}/></button></div></div>
      <Switch label="Exibir elemento" value={block.visible} onChange={(visible: boolean) => patchBlock({ visible })}/>
      {(block.type === 'title' || block.type === 'card' || block.type === 'icon') ? <Field label="Título" value={block.title} onChange={(title: string) => patchBlock({ title })}/> : null}
      {(block.type === 'text' || block.type === 'card' || block.type === 'icon') ? <Field label="Texto" textarea value={block.text} onChange={(text: string) => patchBlock({ text })}/> : null}
      {block.type === 'icon' ? <Field label="Ícone / emoji" value={block.icon} placeholder="★" onChange={(icon: string) => patchBlock({ icon })}/> : null}
      {block.type === 'button' ? <><Field label="Texto do botão" value={block.label} onChange={(label: string) => patchBlock({ label })}/><Select label="Ação" value={block.action} options={['simulator','vehicles','whatsapp','none']} onChange={(action) => patchBlock({ action })}/></> : null}

      {(block.type === 'image' || block.type === 'card' || block.type === 'icon') ? <div className="mt-4 rounded-2xl border bg-zinc-50 p-3">
        <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void setBlockImage(event.target.files?.[0])}/>
        <button type="button" onClick={() => imageInput.current?.click()} className="w-full rounded-xl bg-indigo-600 px-3 py-3 text-xs font-black text-white"><ImagePlus size={15} className="inline"/> {block.image ? 'Trocar imagem' : 'Adicionar imagem'}</button>
        {block.image ? <><img src={block.image} alt={block.alt || ''} className="mt-3 max-h-44 w-full rounded-xl object-cover"/><button type="button" onClick={() => patchBlock({ image: '' })} className="mt-2 w-full rounded-xl border border-red-200 bg-white p-2 text-[10px] font-black text-red-700">Remover imagem</button></> : null}
        <Field label="Texto alternativo" value={block.alt} onChange={(alt: string) => patchBlock({ alt })}/>
        <Num label="Altura da imagem" value={block.imageHeight} min={40} max={600} suffix="px" onChange={(imageHeight: number) => patchBlock({ imageHeight })}/>
        {imageMessage ? <p className="mt-2 text-[10px] font-bold text-indigo-700">{imageMessage}</p> : null}
      </div> : null}

      <Select label="Alinhamento" value={block.align} options={['left','center','right']} onChange={(align) => patchBlock({ align })}/>
      <Color label="Cor do texto" value={block.color} onChange={(color) => patchBlock({ color })}/>
      <Color label="Fundo" value={block.backgroundColor} alpha onChange={(backgroundColor) => patchBlock({ backgroundColor })}/>
      <Color label="Borda" value={block.borderColor} alpha onChange={(borderColor) => patchBlock({ borderColor })}/>
      <Num label="Curvatura" value={block.radius} min={0} max={80} suffix="px" onChange={(radius: number) => patchBlock({ radius })}/>
      <Switch label="Ocupar linha inteira" value={block.fullWidth} onChange={(fullWidth: boolean) => patchBlock({ fullWidth })}/>
      <button type="button" onClick={() => patchBlock({ title: '', text: '', image: '', icon: '', label: '' })} className="mt-4 w-full rounded-xl border bg-zinc-50 p-3 text-xs font-black text-zinc-700"><RotateCcw size={14} className="inline"/> Limpar conteúdo da caixa</button>
      <button type="button" disabled={section.locked} onClick={() => { const blocks = section.blocks.filter((item) => item.id !== block.id); patchSection({ blocks }); props.onSelectBlock(blocks[0]?.id || ''); }} className="mt-2 w-full rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-black text-red-700 disabled:opacity-40"><Trash2 size={14} className="inline"/> Remover elemento</button>
    </div> : null}

    <div className="mt-6 border-t pt-5">
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => appendSection(cloneLandingSection(section))} className="rounded-xl border p-3 text-[10px] font-black"><Copy size={13} className="inline"/> Duplicar atual</button><button type="button" onClick={() => setAddOpen((value) => !value)} className="rounded-xl bg-fuchsia-600 p-3 text-[10px] font-black text-white"><Plus size={13} className="inline"/> Adicionar seção</button></div>

      {addOpen ? <div className="mt-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-3">
        <div className="flex items-center gap-2"><Layers3 size={14} className="text-fuchsia-700"/><strong className="text-xs text-fuchsia-950">Escolha um modelo</strong></div>
        <p className="mt-1 text-[9px] font-semibold text-fuchsia-700">Cada nova seção recebe um ID próprio e pode ser editada sem alterar a original.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => appendSection(createContentSection('Nova seção em branco'))} className="rounded-xl border bg-white p-3 text-[10px] font-black">Em branco</button>
          <button type="button" onClick={() => appendSection(createHomeTemplateSection(props.draft))} className="rounded-xl border bg-white p-3 text-[10px] font-black">Início</button>
          <button type="button" onClick={() => appendSection(createVehiclesTemplateSection(props.draft.sections.find((item) => item.type === 'vehicles')))} className="rounded-xl border bg-white p-3 text-[10px] font-black">Veículos</button>
          <button type="button" onClick={() => appendSection(createSimulationTemplateSection(props.draft.sections.find((item) => item.type === 'simulation')))} className="rounded-xl border bg-white p-3 text-[10px] font-black">Simulação</button>
          <button type="button" onClick={() => appendSection(createAdvantagesTemplateSection(props.draft.sections.find((item) => item.id === 'advantages')))} className="col-span-2 rounded-xl border bg-white p-3 text-[10px] font-black">Vantagens do evento</button>
        </div>
        <div className="mt-4 border-t border-fuchsia-200 pt-3"><p className="text-[9px] font-black uppercase text-fuchsia-700">Duplicar qualquer seção existente</p><div className="mt-2 space-y-2">{props.draft.sections.map((item) => <button key={item.id} type="button" onClick={() => appendSection(cloneLandingSection(item))} className="flex w-full items-center justify-between rounded-xl border bg-white px-3 py-2 text-left text-[10px] font-black"><span>{item.name}</span><span className="text-[8px] uppercase text-zinc-400">{item.type}</span></button>)}</div></div>
      </div> : null}
    </div>

    {section.id !== 'vehicles' && section.id !== 'advantages' ? <button type="button" disabled={section.locked} onClick={() => { const sections = props.draft.sections.filter((item) => item.id !== section.id); replaceSections(sections); props.onSelectSection(sections[0]?.id || ''); props.onSelectBlock(''); }} className="mt-2 w-full rounded-xl border border-red-200 p-3 text-[10px] font-black text-red-700 disabled:opacity-40"><Trash2 size={13} className="inline"/> Remover seção</button> : null}
  </div>;
}
