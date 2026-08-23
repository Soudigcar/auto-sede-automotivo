'use client';

import { Color, Field, Num, Select, Switch } from './CampaignVisualEditorControls';
import type { LandingDraftV3, LandingView } from './CampaignLandingSectionModel';

type Props = { draft: LandingDraftV3; onChange: (draft: LandingDraftV3) => void };

export function CampaignLandingNavigationInspector({ draft, onChange }: Props) {
  const nav = draft.navigation;
  const patch = (value: Partial<typeof nav>) => onChange({ ...draft, navigation: { ...nav, ...value } });
  const patchItem = (id: LandingView, value: Record<string, unknown>) => patch({ items: nav.items.map((item) => item.id === id ? { ...item, ...value } : item) });

  return <div>
    <p className="text-[10px] font-black uppercase tracking-[.14em] text-indigo-600">Menu da landing</p>
    <h3 className="mt-1 text-sm font-black">Navegação independente</h3>
    <p className="mt-1 text-[10px] font-semibold leading-4 text-zinc-500">Cada item abre uma tela da campanha. No Mobile, o menu aparece no botão fixo de três pontos.</p>

    <div className="mt-4 rounded-2xl border bg-zinc-50 p-3">
      {nav.items.map((item) => <div key={item.id} className="mb-3 rounded-xl border bg-white p-3 last:mb-0">
        <Field label={item.id === 'home' ? 'Botão Início' : item.id === 'vehicles' ? 'Botão Veículos' : 'Botão Simulação'} value={item.label} onChange={(label: string) => patchItem(item.id, { label })} />
        <Switch label="Exibir botão" value={item.visible} onChange={(visible: boolean) => patchItem(item.id, { visible })} />
      </div>)}
    </div>

    <Num label="Largura do menu" value={nav.width} min={260} max={1200} suffix="px" onChange={(width: number) => patch({ width })} />
    <Num label="Altura do menu" value={nav.height} min={40} max={100} suffix="px" onChange={(height: number) => patch({ height })} />
    <Num label="Tamanho da fonte" value={nav.fontSize} min={9} max={30} suffix="px" onChange={(fontSize: number) => patch({ fontSize })} />
    <Select label="Peso da fonte" value={String(nav.fontWeight)} options={['100','200','300','400','500','600','700','800','900']} onChange={(value) => patch({ fontWeight: Number(value) })} />
    <Num label="Espaço entre letras" value={nav.letterSpacing} min={-4} max={16} suffix="px" onChange={(letterSpacing: number) => patch({ letterSpacing })} />
    <Num label="Curvatura" value={nav.radius} min={0} max={999} suffix="px" onChange={(radius: number) => patch({ radius })} />
    <Color label="Fundo" value={nav.backgroundColor} alpha onChange={(backgroundColor) => patch({ backgroundColor })} />
    <Color label="Texto" value={nav.textColor} onChange={(textColor) => patch({ textColor })} />
    <Color label="Borda" value={nav.borderColor} alpha onChange={(borderColor) => patch({ borderColor })} />
    <Color label="Botão ativo" value={nav.activeColor} onChange={(activeColor) => patch({ activeColor })} />
    <Color label="Texto ativo" value={nav.activeTextColor} onChange={(activeTextColor) => patch({ activeTextColor })} />
    <Switch label="Fixar menu no topo (Desktop)" value={nav.stickyDesktop} onChange={(stickyDesktop: boolean) => patch({ stickyDesktop })} />
    <div className="mt-5 border-t pt-4">
      <strong className="text-xs">Botão de três pontos no Mobile</strong>
      <Color label="Fundo do botão" value={nav.mobileButtonBackground} alpha onChange={(mobileButtonBackground) => patch({ mobileButtonBackground })} />
      <Color label="Cor dos três pontos" value={nav.mobileButtonColor} onChange={(mobileButtonColor) => patch({ mobileButtonColor })} />
    </div>
  </div>;
}
