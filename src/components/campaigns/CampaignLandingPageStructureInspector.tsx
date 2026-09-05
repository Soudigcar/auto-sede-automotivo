'use client';

import type { MutableRefObject } from 'react';
import { ArrowDown, ArrowUp, LayoutTemplate, MapPin, Maximize2, Minimize2, MoveVertical, Ruler, Sparkles } from 'lucide-react';
import { Color, Num, Switch } from './CampaignVisualEditorControls';
import type { LandingDraftV3, LandingSection } from './CampaignLandingSectionModel';
import type { Device } from './CampaignVisualEditorModel';

const heroPresets: Record<Device, Record<'compact' | 'normal' | 'wide', number>> = {
  desktop: { compact: 620, normal: 760, wide: 980 },
  tablet: { compact: 720, normal: 900, wide: 1120 },
  mobile: { compact: 820, normal: 1040, wide: 1280 }
};

const deviceLabels: Record<Device, string> = { desktop: 'Desktop 1440', tablet: 'Tablet 768', mobile: 'Mobile 390' };

function sectionLabel(section: LandingSection) {
  if (section.type === 'vehicles') return 'Veículos';
  if (section.type === 'simulation') return 'Simulador';
  if (section.type === 'location') return 'Localização';
  return section.name;
}

type Props = {
  draft: LandingDraftV3;
  device: Device;
  selectedSectionId: string;
  heroRef: MutableRefObject<HTMLElement | null>;
  onSelectSection: (id: string) => void;
  onChange: (draft: LandingDraftV3) => void;
};

export function CampaignLandingPageStructureInspector(props: Props) {
  const selectedIndex = props.draft.sections.findIndex((section) => section.id === props.selectedSectionId);
  const selected = props.draft.sections[selectedIndex] || props.draft.sections[0];
  const layout = props.draft.devices[props.device];

  function patchHeroHeight(heroHeight: number) {
    const safeHeight = Math.max(420, Math.min(2200, Math.round(heroHeight)));
    props.onChange({
      ...props.draft,
      devices: {
        ...props.draft.devices,
        [props.device]: { ...layout, heroHeight: safeHeight }
      }
    });
  }

  function fitHeroToContent() {
    const hero = props.heroRef.current;
    if (!hero) {
      patchHeroHeight(heroPresets[props.device].compact);
      return;
    }
    const heroRect = hero.getBoundingClientRect();
    if (!heroRect.height) {
      patchHeroHeight(heroPresets[props.device].compact);
      return;
    }
    const nodes = Array.from(hero.querySelectorAll<HTMLElement>('[data-editor-element]'))
      .filter((node) => node.dataset.editorElement !== 'simulator');
    let required = props.device === 'desktop' ? 520 : props.device === 'tablet' ? 620 : 720;
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (!rect.height || rect.bottom < heroRect.top || rect.top > heroRect.bottom) continue;
      const yRatio = Math.max(0, Math.min(0.94, (rect.top - heroRect.top) / heroRect.height));
      const candidate = (rect.height + (props.device === 'mobile' ? 64 : 52)) / Math.max(0.06, 1 - yRatio);
      required = Math.max(required, candidate);
    }
    patchHeroHeight(required);
  }

  function patchSection(patch: Partial<LandingSection>) {
    if (!selected) return;
    const sections = [...props.draft.sections];
    sections[selectedIndex] = { ...selected, ...patch };
    props.onChange({ ...props.draft, sections });
  }

  function moveSection(delta: number) {
    if (!selected || selectedIndex < 0) return;
    const target = selectedIndex + delta;
    if (target < 0 || target >= props.draft.sections.length) return;
    const sections = [...props.draft.sections];
    [sections[selectedIndex], sections[target]] = [sections[target], sections[selectedIndex]];
    props.onChange({ ...props.draft, sections });
    props.onSelectSection(selected.id);
  }

  return <div className="space-y-5">
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"><LayoutTemplate size={17}/></div>
        <div><strong className="text-sm text-indigo-950">Estrutura da página</strong><p className="mt-1 text-[10px] font-semibold leading-4 text-indigo-700">Menu → Hero → Vantagens → Veículos → Simulador → Localização → Rodapé. Cada faixa tem tamanho próprio.</p></div>
      </div>
    </div>

    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[.15em] text-zinc-400">Hero / capa</p><strong className="text-sm">{deviceLabels[props.device]}</strong></div><Ruler size={17} className="text-zinc-400"/></div>
      <p className="mt-2 text-[10px] font-semibold leading-4 text-zinc-500">O Hero não precisa mais reservar espaço para o simulador. Ajuste a altura ao conteúdo ou use um tamanho fixo.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => patchHeroHeight(heroPresets[props.device].compact)} className="rounded-xl border bg-white px-2 py-3 text-[9px] font-black"><Minimize2 size={13} className="mx-auto mb-1"/> Compacto</button>
        <button type="button" onClick={() => patchHeroHeight(heroPresets[props.device].normal)} className="rounded-xl border bg-white px-2 py-3 text-[9px] font-black"><MoveVertical size={13} className="mx-auto mb-1"/> Normal</button>
        <button type="button" onClick={() => patchHeroHeight(heroPresets[props.device].wide)} className="rounded-xl border bg-white px-2 py-3 text-[9px] font-black"><Maximize2 size={13} className="mx-auto mb-1"/> Amplo</button>
      </div>
      <button type="button" onClick={fitHeroToContent} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-3 py-3 text-[10px] font-black text-white"><Sparkles size={14}/> Ajustar ao conteúdo</button>
      <Num label="Altura personalizada" value={layout.heroHeight} min={420} max={2200} suffix="px" onChange={patchHeroHeight}/>
      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-[10px] font-semibold leading-4 text-amber-800">Você também pode arrastar a alça na borda inferior do Hero diretamente no canvas.</div>
    </div>

    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[.15em] text-zinc-400">Ordem das seções</p><strong className="text-sm">Componentes da Landing</strong></div><MapPin size={17} className="text-zinc-400"/></div>
      <div className="mt-3 space-y-2">{props.draft.sections.map((section, index) => <button key={section.id} type="button" onClick={() => props.onSelectSection(section.id)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left ${selected?.id === section.id ? 'border-fuchsia-500 bg-fuchsia-50' : 'bg-white'}`}><span className="text-[10px] font-black">{index + 1}. {sectionLabel(section)}</span><span className="text-[8px] font-black uppercase text-zinc-400">{section.type}</span></button>)}</div>
    </div>

    {selected ? <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.15em] text-fuchsia-600">Seção selecionada</p><strong className="text-sm">{sectionLabel(selected)}</strong></div><div className="flex gap-1"><button type="button" onClick={() => moveSection(-1)} className="rounded-lg border p-2"><ArrowUp size={13}/></button><button type="button" onClick={() => moveSection(1)} className="rounded-lg border p-2"><ArrowDown size={13}/></button></div></div>
      <Switch label="Exibir seção" value={selected.visible} onChange={(visible: boolean) => patchSection({ visible })}/>
      <Num label="Largura máxima do conteúdo" value={selected.maxWidth} min={320} max={1800} suffix="px" onChange={(maxWidth: number) => patchSection({ maxWidth })}/>
      <Num label="Espaçamento vertical" value={selected.paddingY} min={0} max={180} suffix="px" onChange={(paddingY: number) => patchSection({ paddingY })}/>
      <Num label="Altura mínima" value={selected.minHeight} min={0} max={1800} suffix="px" onChange={(minHeight: number) => patchSection({ minHeight })}/>
      <Color label="Fundo da seção" value={selected.backgroundColor} onChange={(backgroundColor) => patchSection({ backgroundColor })}/>
      <Color label="Cor de texto" value={selected.textColor} onChange={(textColor) => patchSection({ textColor })}/>
      {selected.type === 'simulation' ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-[10px] font-semibold leading-4 text-emerald-800">O simulador agora é independente do Hero. Aparência do formulário continua no painel “Simulador”; aqui você controla a faixa onde ele é encaixado.</p> : null}
      {selected.type === 'location' ? <p className="mt-3 rounded-xl bg-slate-950 p-3 text-[10px] font-semibold leading-4 text-white">A localização usa automaticamente nome, endereço, cidade/UF e datas do evento, com botão “Como chegar”.</p> : null}
    </div> : null}
  </div>;
}
