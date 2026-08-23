'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Color, Field, Num, Select, Switch } from './CampaignVisualEditorControls';
import { addLandingBlock, cloneLandingSection, createContentSection, type LandingBlockType, type LandingDraftV3, type LandingSection } from './CampaignLandingSectionModel';
import { optimize } from './CampaignVisualEditorModel';

type Props = {
  draft: LandingDraftV3;
  selectedSectionId: string;
  selectedBlockId: string;
  onSelectSection: (id: string) => void;
  onSelectBlock: (id: string) => void;
  onChange: (draft: LandingDraftV3) => void;
};

const blockLabels: Record<LandingBlockType, string> = { title: 'Título', text: 'Texto', card: 'Card', image: 'Imagem', icon: 'Ícone / imagem pequena', button: 'Botão' };

export function CampaignLandingSectionInspector(props: Props) {
  const sectionIndex = props.draft.sections.findIndex((item) => item.id === props.selectedSectionId);
  const section = props.draft.sections[sectionIndex] || null;
  const blockIndex = section?.blocks.findIndex((item) => item.id === props.selectedBlockId) ?? -1;
  const block = blockIndex >= 0 ? section?.blocks[blockIndex] : null;
  const imageInput = useRef<HTMLInputElement | null>(null);
  const [imageMessage, setImageMessage] = useState('');

  function patchSection(patch: Partial<LandingSection>) {
    if (!section) return;
    const sections = [...props.draft.sections];
    sections[sectionIndex] = { ...section, ...patch };
    props.onChange({ ...props.draft, sections });
  }

  function replaceSections(sections: LandingSection[]) {
    props.onChange({ ...props.draft, sections });
  }

  function patchBlock(patch: Record<string, unknown>) {
    if (!section || !block || blockIndex < 0) return;
    const blocks = [...section.blocks];
    blocks[blockIndex] = { ...block, ...patch } as any;
    patchSection({ blocks });
  }

  function moveSection(delta: number) {
    if (!section) return;
    const target = sectionIndex + delta;
    if (target < 0 || target >= props.draft.sections.length) return;
    const sections = [...props.draft.sections];
    [sections[sectionIndex], sections[target]] = [sections[target], sections[sectionIndex]];
    replaceSections(sections);
  }

  function moveBlock(delta: number) {
    if (!section || !block || blockIndex < 0) return;
    const target = blockIndex + delta;
    if (target < 0 || target >= section.blocks.length) return;
    const blocks = [...section.blocks];
    [blocks[blockIndex], blocks[target]] = [blocks[target], blocks[blockIndex]];
    patchSection({ blocks });
  }

  async function setBlockImage(file?: File) {
    if (!file || !block) return;
    setImageMessage('Otimizando imagem...');
    try {
      const data = await optimize(file, false);
      patchBlock({ image: data, type: 'image' });
      setImageMessage('Imagem aplicada. Salve o rascunho para persistir.');
    } catch (error: any) {
      setImageMessage(error?.message || 'Falha ao processar imagem.');
    }
  }

  if (!section) return <aside className="overflow-y-auto bg-white p-4"><strong>Seções da landing</strong><p className="mt-2 text-xs text-zinc-500">Selecione uma seção na lateral esquerda ou diretamente no preview.</p></aside>;

  return <aside className="overflow-y-auto bg-white p-4">
    <div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase text-fuchsia-600">Seção editável</p><strong>{section.name}</strong></div><div className="flex gap-1"><button onClick={() => moveSection(-1)} className="rounded-lg border p-2" title="Mover para cima"><ArrowUp size={14}/></button><button onClick={() => moveSection(1)} className="rounded-lg border p-2" title="Mover para baixo"><ArrowDown size={14}/></button></div></div>

    <Field label="Nome da seção" value={section.name} onChange={(name: string) => patchSection({ name })}/>
    <Switch label="Exibir seção" value={section.visible} onChange={(visible: boolean) => patchSection({ visible })}/>
    <Switch label="Bloquear estrutura" value={section.locked} onChange={(locked: boolean) => patchSection({ locked })}/>
    <Color label="Cor de fundo" value={section.backgroundColor} onChange={(backgroundColor) => patchSection({ backgroundColor })}/>
    <Color label="Cor de texto padrão" value={section.textColor} onChange={(textColor) => patchSection({ textColor })}/>
    <Num label="Espaçamento vertical" value={section.paddingY} min={0} max={180} suffix="px" onChange={(paddingY: number) => patchSection({ paddingY })}/>

    {section.type === 'vehicles' ? <div className="mt-5 rounded-2xl border bg-slate-50 p-3"><strong className="text-sm">Busca e filtros</strong><p className="mt-1 text-[10px] font-semibold text-slate-500">Escolha o que o cliente poderá usar no catálogo.</p>{([
      ['showSearch','Barra de pesquisa'],['showCategories','Categorias'],['showBrand','Marca'],['showModel','Modelo'],['showPrice','Preço'],['showYear','Ano'],['showTransmission','Câmbio'],['showFuel','Combustível'],['showSort','Ordenação']
    ] as const).map(([key,label]) => <Switch key={key} label={label} value={section.vehicleSettings[key]} onChange={(value: boolean) => patchSection({ vehicleSettings: { ...section.vehicleSettings, [key]: value } })}/>)}</div> : <>
      <Num label="Colunas dos cards" value={section.columns} min={1} max={4} onChange={(columns: number) => patchSection({ columns })}/>
      <div className="mt-6 border-t pt-5"><div className="flex items-center justify-between"><strong className="text-sm">Elementos da seção</strong><span className="text-[10px] font-bold text-zinc-400">{section.blocks.length}</span></div><div className="mt-3 grid grid-cols-2 gap-2">{(Object.keys(blockLabels) as LandingBlockType[]).map((type) => <button key={type} type="button" disabled={section.locked} onClick={() => { const next = addLandingBlock(section, type); patchSection({ blocks: next.blocks }); props.onSelectBlock(next.blocks[next.blocks.length - 1].id); }} className="rounded-xl border bg-white p-2 text-[10px] font-black disabled:opacity-40"><Plus size={12} className="inline"/> {blockLabels[type]}</button>)}</div>
        <div className="mt-3 space-y-2">{section.blocks.map((item, index) => <button key={item.id} onClick={() => props.onSelectBlock(item.id)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-xs font-black ${props.selectedBlockId === item.id ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-800' : 'bg-white'}`}><span>{index + 1}. {blockLabels[item.type]}</span><span className="text-[9px] opacity-50">{item.visible ? 'VISÍVEL' : 'OCULTO'}</span></button>)}</div>
      </div>
    </>}

    {block ? <div className="mt-6 border-t pt-5"><div className="flex items-center justify-between gap-2"><strong className="text-sm">Editar {blockLabels[block.type]}</strong><div className="flex gap-1"><button onClick={() => moveBlock(-1)} className="rounded-lg border p-2"><ArrowUp size={13}/></button><button onClick={() => moveBlock(1)} className="rounded-lg border p-2"><ArrowDown size={13}/></button></div></div>
      <Switch label="Exibir elemento" value={block.visible} onChange={(visible: boolean) => patchBlock({ visible })}/>
      {(block.type === 'title' || block.type === 'card' || block.type === 'icon') ? <Field label="Título" value={block.title} onChange={(title: string) => patchBlock({ title })}/> : null}
      {(block.type === 'text' || block.type === 'card' || block.type === 'icon') ? <Field label="Texto" textarea value={block.text} onChange={(text: string) => patchBlock({ text })}/> : null}
      {block.type === 'icon' ? <Field label="Ícone / emoji" value={block.icon} placeholder="★" onChange={(icon: string) => patchBlock({ icon })}/> : null}
      {block.type === 'button' ? <><Field label="Texto do botão" value={block.label} onChange={(label: string) => patchBlock({ label })}/><Select label="Ação" value={block.action} options={['simulator','vehicles','whatsapp','none']} onChange={(action) => patchBlock({ action })}/></> : null}
      {block.type === 'image' ? <div className="mt-4"><input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void setBlockImage(event.target.files?.[0])}/><button type="button" onClick={() => imageInput.current?.click()} className="w-full rounded-xl bg-indigo-600 px-3 py-3 text-xs font-black text-white"><ImagePlus size={15} className="inline"/> {block.image ? 'Trocar imagem' : 'Adicionar imagem'}</button>{block.image ? <img src={block.image} alt={block.alt || ''} className="mt-3 max-h-44 w-full rounded-xl object-cover"/> : null}<Field label="Texto alternativo" value={block.alt} onChange={(alt: string) => patchBlock({ alt })}/>{imageMessage ? <p className="mt-2 text-[10px] font-bold text-indigo-700">{imageMessage}</p> : null}</div> : null}
      <Select label="Alinhamento" value={block.align} options={['left','center','right']} onChange={(align) => patchBlock({ align })}/>
      <Color label="Cor do texto" value={block.color} onChange={(color) => patchBlock({ color })}/>
      <Color label="Fundo" value={block.backgroundColor} alpha onChange={(backgroundColor) => patchBlock({ backgroundColor })}/>
      <Color label="Borda" value={block.borderColor} alpha onChange={(borderColor) => patchBlock({ borderColor })}/>
      <Num label="Curvatura" value={block.radius} min={0} max={80} suffix="px" onChange={(radius: number) => patchBlock({ radius })}/>
      <Switch label="Ocupar linha inteira" value={block.fullWidth} onChange={(fullWidth: boolean) => patchBlock({ fullWidth })}/>
      <button type="button" disabled={section.locked} onClick={() => { const blocks = section.blocks.filter((item) => item.id !== block.id); patchSection({ blocks }); props.onSelectBlock(blocks[0]?.id || ''); }} className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-black text-red-700 disabled:opacity-40"><Trash2 size={14} className="inline"/> Remover elemento</button>
    </div> : null}

    <div className="mt-6 grid grid-cols-2 gap-2 border-t pt-5"><button type="button" onClick={() => { const copy = cloneLandingSection(section); const sections = [...props.draft.sections]; sections.splice(sectionIndex + 1, 0, copy); replaceSections(sections); props.onSelectSection(copy.id); props.onSelectBlock(copy.blocks[0]?.id || ''); }} className="rounded-xl border p-3 text-[10px] font-black"><Copy size={13} className="inline"/> Duplicar seção</button><button type="button" onClick={() => { const next = createContentSection('Nova seção'); replaceSections([...props.draft.sections, next]); props.onSelectSection(next.id); props.onSelectBlock(next.blocks[0]?.id || ''); }} className="rounded-xl bg-fuchsia-600 p-3 text-[10px] font-black text-white"><Plus size={13} className="inline"/> Nova seção</button></div>
    {section.type !== 'vehicles' ? <button type="button" disabled={section.locked} onClick={() => { const sections = props.draft.sections.filter((item) => item.id !== section.id); replaceSections(sections); props.onSelectSection(sections[0]?.id || ''); props.onSelectBlock(''); }} className="mt-2 w-full rounded-xl border border-red-200 p-3 text-[10px] font-black text-red-700 disabled:opacity-40"><Trash2 size={13} className="inline"/> Remover seção</button> : null}
  </aside>;
}
