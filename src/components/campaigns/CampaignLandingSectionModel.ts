import type { Draft } from './CampaignVisualEditorModel';
import type { ResponsiveDraft } from './CampaignVisualEditorResponsive';

export type LandingSectionType = 'content' | 'vehicles';
export type LandingBlockType = 'title' | 'text' | 'card' | 'image' | 'icon' | 'button';
export type LandingBlockAction = 'simulator' | 'vehicles' | 'whatsapp' | 'none';
export type LandingBlockAlign = 'left' | 'center' | 'right';
export type LandingView = 'home' | 'vehicles' | 'simulation';

export type LandingNavigationItem = {
  id: LandingView;
  label: string;
  visible: boolean;
};

export type LandingNavigationSettings = {
  items: LandingNavigationItem[];
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  activeColor: string;
  activeTextColor: string;
  width: number;
  height: number;
  radius: number;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  stickyDesktop: boolean;
  mobileButtonBackground: string;
  mobileButtonColor: string;
};

export type LandingSectionBlock = {
  id: string;
  type: LandingBlockType;
  visible: boolean;
  title: string;
  text: string;
  image: string;
  alt: string;
  icon: string;
  label: string;
  action: LandingBlockAction;
  color: string;
  backgroundColor: string;
  borderColor: string;
  align: LandingBlockAlign;
  radius: number;
  fullWidth: boolean;
  imageHeight: number;
};

export type LandingVehicleSettings = {
  showSearch: boolean;
  showCategories: boolean;
  showBrand: boolean;
  showModel: boolean;
  showPrice: boolean;
  showYear: boolean;
  showTransmission: boolean;
  showFuel: boolean;
  showSort: boolean;
  cardColumnsDesktop: number;
  cardGap: number;
  filterPanelBackground: string;
  filterTextColor: string;
  categoryBackground: string;
  categoryTextColor: string;
  categoryActiveBackground: string;
  categoryActiveTextColor: string;
  categoryRadius: number;
  filterRadius: number;
  filterWidth: number;
};

export type LandingSection = {
  id: string;
  name: string;
  type: LandingSectionType;
  visible: boolean;
  locked: boolean;
  backgroundColor: string;
  textColor: string;
  paddingY: number;
  columns: number;
  blocks: LandingSectionBlock[];
  vehicleSettings: LandingVehicleSettings;
};

export type LandingDraftV3 = ResponsiveDraft & {
  layoutVersion: 3;
  navigation: LandingNavigationSettings;
  sections: LandingSection[];
};

export const navigationDefaults: LandingNavigationSettings = {
  items: [
    { id: 'home', label: 'INÍCIO', visible: true },
    { id: 'vehicles', label: 'VEÍCULOS', visible: true },
    { id: 'simulation', label: 'SIMULAÇÃO', visible: true }
  ],
  backgroundColor: '#071020F2',
  textColor: '#FFFFFF',
  borderColor: '#FFFFFF26',
  activeColor: '#DC2626',
  activeTextColor: '#FFFFFF',
  width: 620,
  height: 54,
  radius: 999,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 2,
  stickyDesktop: true,
  mobileButtonBackground: '#071020F2',
  mobileButtonColor: '#FFFFFF'
};

export const vehicleDefaults: LandingVehicleSettings = {
  showSearch: true,
  showCategories: true,
  showBrand: true,
  showModel: true,
  showPrice: true,
  showYear: true,
  showTransmission: true,
  showFuel: true,
  showSort: true,
  cardColumnsDesktop: 6,
  cardGap: 14,
  filterPanelBackground: '#071020',
  filterTextColor: '#FFFFFF',
  categoryBackground: '#FFFFFF0F',
  categoryTextColor: '#FFFFFF',
  categoryActiveBackground: '#DC2626',
  categoryActiveTextColor: '#FFFFFF',
  categoryRadius: 999,
  filterRadius: 24,
  filterWidth: 260
};

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createLandingBlock(type: LandingBlockType, seed: Partial<LandingSectionBlock> = {}): LandingSectionBlock {
  const defaults: Record<LandingBlockType, Partial<LandingSectionBlock>> = {
    title: { title: 'Título da seção', color: '#0F172A', fullWidth: true },
    text: { text: 'Adicione seu texto aqui.', color: '#475569', fullWidth: true },
    card: { title: 'Novo destaque', text: 'Descreva este benefício.', backgroundColor: '#FFFFFF', color: '#0F172A' },
    image: { alt: 'Imagem da seção', backgroundColor: '#F8FAFC', imageHeight: 220 },
    icon: { icon: '★', title: 'Destaque', text: 'Adicione uma pequena mensagem.', backgroundColor: '#FFFFFF', color: '#0F172A', imageHeight: 64 },
    button: { label: 'Saiba mais', action: 'none', backgroundColor: '#DC2626', color: '#FFFFFF' }
  };
  return {
    id: seed.id || id(`block-${type}`),
    type,
    visible: seed.visible !== false,
    title: '', text: '', image: '', alt: '', icon: '', label: '', action: 'none',
    color: '#0F172A', backgroundColor: '#00000000', borderColor: '#E2E8F0', align: 'left',
    radius: 24, fullWidth: false, imageHeight: 180,
    ...defaults[type], ...seed
  };
}

export function createContentSection(name = 'Nova seção'): LandingSection {
  return {
    id: id('section'), name, type: 'content', visible: true, locked: false,
    backgroundColor: '#FFFFFF', textColor: '#0F172A', paddingY: 64, columns: 3,
    blocks: [createLandingBlock('title', { title: name })],
    vehicleSettings: { ...vehicleDefaults }
  };
}

function defaultSections(source: any): LandingSection[] {
  return [
    {
      id: 'advantages', name: 'Vantagens do evento', type: 'content', visible: true, locked: false,
      backgroundColor: String(source?.advantagesBackground || '#FFFFFF'), textColor: '#0F172A', paddingY: 64, columns: 3,
      vehicleSettings: { ...vehicleDefaults },
      blocks: [
        createLandingBlock('title', { id: 'advantages-title', title: 'Vantagens do evento', fullWidth: true }),
        createLandingBlock('card', { id: 'adv-quick', title: 'Simulação rápida', text: 'Faça uma estimativa inicial de financiamento em poucos passos.' }),
        createLandingBlock('card', { id: 'adv-stock', title: 'Estoque conectado', text: 'Consulte os veículos disponíveis das lojas participantes.' }),
        createLandingBlock('card', { id: 'adv-service', title: 'Atendimento responsável', text: 'Receba atendimento das lojas participantes do evento.' })
      ]
    },
    {
      id: 'vehicles', name: 'Veículos', type: 'vehicles', visible: true, locked: false,
      backgroundColor: String(source?.vehiclesBackground || '#F1F5F9'), textColor: '#0F172A', paddingY: 24, columns: 1,
      vehicleSettings: { ...vehicleDefaults }, blocks: []
    }
  ];
}

function cleanNavigation(raw: any): LandingNavigationSettings {
  const incoming = raw || {};
  const items = navigationDefaults.items.map((fallback) => {
    const found = Array.isArray(incoming.items) ? incoming.items.find((item: any) => item?.id === fallback.id) : null;
    return { ...fallback, ...(found || {}), id: fallback.id, label: String(found?.label || fallback.label), visible: found?.visible !== false };
  });
  return {
    ...navigationDefaults, ...incoming, items,
    width: Math.max(260, Math.min(1200, Number(incoming.width ?? navigationDefaults.width))),
    height: Math.max(40, Math.min(100, Number(incoming.height ?? navigationDefaults.height))),
    radius: Math.max(0, Math.min(999, Number(incoming.radius ?? navigationDefaults.radius))),
    fontSize: Math.max(9, Math.min(30, Number(incoming.fontSize ?? navigationDefaults.fontSize))),
    fontWeight: Math.max(100, Math.min(900, Number(incoming.fontWeight ?? navigationDefaults.fontWeight))),
    letterSpacing: Math.max(-4, Math.min(16, Number(incoming.letterSpacing ?? navigationDefaults.letterSpacing)))
  };
}

function cleanBlock(raw: any): LandingSectionBlock {
  const type: LandingBlockType = ['title','text','card','image','icon','button'].includes(raw?.type) ? raw.type : 'text';
  return createLandingBlock(type, {
    id: String(raw?.id || id(`block-${type}`)), visible: raw?.visible !== false,
    title: String(raw?.title || ''), text: String(raw?.text || ''), image: String(raw?.image || ''), alt: String(raw?.alt || ''),
    icon: String(raw?.icon || ''), label: String(raw?.label || ''),
    action: ['simulator','vehicles','whatsapp','none'].includes(raw?.action) ? raw.action : 'none',
    color: String(raw?.color || '#0F172A'), backgroundColor: String(raw?.backgroundColor || '#00000000'), borderColor: String(raw?.borderColor || '#E2E8F0'),
    align: ['left','center','right'].includes(raw?.align) ? raw.align : 'left',
    radius: Math.max(0, Math.min(80, Number(raw?.radius ?? 24))), fullWidth: raw?.fullWidth === true,
    imageHeight: Math.max(40, Math.min(600, Number(raw?.imageHeight ?? (type === 'image' ? 220 : 180))))
  });
}

function cleanVehicleSettings(raw: any): LandingVehicleSettings {
  const incoming = raw || {};
  return {
    ...vehicleDefaults, ...incoming,
    cardColumnsDesktop: Math.max(1, Math.min(6, Number(incoming.cardColumnsDesktop ?? 6))),
    cardGap: Math.max(4, Math.min(40, Number(incoming.cardGap ?? 14))),
    categoryRadius: Math.max(0, Math.min(999, Number(incoming.categoryRadius ?? 999))),
    filterRadius: Math.max(0, Math.min(80, Number(incoming.filterRadius ?? 24))),
    filterWidth: Math.max(200, Math.min(420, Number(incoming.filterWidth ?? 260)))
  };
}

function cleanSection(raw: any, fallback: LandingSection): LandingSection {
  const type: LandingSectionType = raw?.type === 'vehicles' ? 'vehicles' : 'content';
  return {
    id: String(raw?.id || fallback.id || id('section')), name: String(raw?.name || fallback.name || 'Seção'), type,
    visible: raw?.visible !== false, locked: raw?.locked === true,
    backgroundColor: String(raw?.backgroundColor || fallback.backgroundColor || '#FFFFFF'), textColor: String(raw?.textColor || fallback.textColor || '#0F172A'),
    paddingY: Math.max(0, Math.min(180, Number(raw?.paddingY ?? fallback.paddingY ?? 64))),
    columns: Math.max(1, Math.min(6, Number(raw?.columns ?? fallback.columns ?? 3))),
    blocks: Array.isArray(raw?.blocks) ? raw.blocks.map(cleanBlock) : fallback.blocks.map(cleanBlock),
    vehicleSettings: cleanVehicleSettings(raw?.vehicleSettings || fallback.vehicleSettings)
  };
}

export function upgradeLandingDraft(source: ResponsiveDraft | Draft | any, campaign?: any): LandingDraftV3 {
  const fallbacks = defaultSections(source);
  const rawSections = Array.isArray(source?.sections) ? source.sections : null;
  const sections = rawSections?.length
    ? rawSections.map((section: any, index: number) => cleanSection(section, fallbacks[index] || createContentSection(section?.name || 'Seção')))
    : fallbacks;
  return { ...source, layoutVersion: 3, navigation: cleanNavigation(source?.navigation), sections } as LandingDraftV3;
}

export function cloneLandingSection(section: LandingSection): LandingSection {
  return { ...section, id: id('section'), name: `${section.name} — cópia`, locked: false,
    blocks: section.blocks.map((block) => ({ ...block, id: id(`block-${block.type}`) })),
    vehicleSettings: { ...section.vehicleSettings } };
}

export function addLandingBlock(section: LandingSection, type: LandingBlockType): LandingSection {
  return { ...section, blocks: [...section.blocks, createLandingBlock(type)] };
}
