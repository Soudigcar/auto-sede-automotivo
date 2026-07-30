export type PortalBenefit = {
  title: string;
  description: string;
};

export type PortalSettings = {
  id: string | null;
  key: 'official';
  brand_name: string;
  brand_tagline: string;
  logo_url: string;
  hero_eyebrow: string;
  hero_title: string;
  hero_description: string;
  primary_cta_label: string;
  secondary_cta_label: string;
  trust_title: string;
  trust_description: string;
  benefits: PortalBenefit[];
  whatsapp_number: string;
  phone: string;
  email: string;
  instagram_url: string;
  address_text: string;
  seo_title: string;
  seo_description: string;
  og_image_url: string;
  is_published: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

const fallbackBenefit: PortalBenefit = {
  title: 'Estoque validado',
  description: 'Somente veículos disponíveis e vinculados a lojas habilitadas.'
};

const defaultBenefits: PortalBenefit[] = [
  fallbackBenefit,
  { title: 'Atendimento direto', description: 'Seu interesse segue para a loja responsável pelo anúncio escolhido.' },
  { title: 'Simulação inicial', description: 'Visualize uma estimativa antes de solicitar o atendimento comercial.' }
];

export const defaultPortalSettings: PortalSettings = {
  id: null,
  key: 'official',
  brand_name: 'Auto Sede',
  brand_tagline: 'Portal Automotivo',
  logo_url: '',
  hero_eyebrow: 'Auto Sede • veículos de lojas parceiras',
  hero_title: 'Encontre seu próximo carro em um só lugar.',
  hero_description: 'Compare veículos disponíveis, faça uma simulação inicial e fale diretamente com a loja responsável pelo anúncio.',
  primary_cta_label: 'Ver veículos disponíveis',
  secondary_cta_label: 'Entenda o atendimento',
  trust_title: 'Cada veículo permanece ligado à sua loja.',
  trust_description: 'A vitrine publica somente anúncios com proprietário único e loja ativa. Veículos sem vínculo confiável ficam fora do catálogo até a revisão.',
  benefits: defaultBenefits.map((benefit) => ({ ...benefit })),
  whatsapp_number: '',
  phone: '',
  email: '',
  instagram_url: '',
  address_text: '',
  seo_title: 'Auto Sede | Veículos de lojas parceiras em um só lugar',
  seo_description: 'Encontre veículos disponíveis, compare opções, simule seu financiamento e fale diretamente com a loja responsável pelo anúncio.',
  og_image_url: '',
  is_published: true,
  updated_at: null,
  updated_by: null
};

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, fallback: string, maxLength: number) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  return normalized || fallback;
}

function optionalText(value: unknown, maxLength: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeBenefits(value: unknown): PortalBenefit[] {
  const input = Array.isArray(value) ? value.slice(0, 6) : [];
  const normalized: PortalBenefit[] = [];

  input.forEach((rawItem, index) => {
    const item = toRecord(rawItem);
    const fallback = defaultBenefits[index] || fallbackBenefit;
    normalized.push({
      title: requiredText(item.title, fallback.title, 90),
      description: requiredText(item.description, fallback.description, 260)
    });
  });

  return normalized.length ? normalized : defaultBenefits.map((benefit) => ({ ...benefit }));
}

export function normalizePortalSettings(value: unknown): PortalSettings {
  const source = toRecord(value);

  return {
    id: optionalText(source.id, 80) || null,
    key: 'official',
    brand_name: requiredText(source.brand_name, defaultPortalSettings.brand_name, 100),
    brand_tagline: requiredText(source.brand_tagline, defaultPortalSettings.brand_tagline, 120),
    logo_url: optionalText(source.logo_url, 800),
    hero_eyebrow: requiredText(source.hero_eyebrow, defaultPortalSettings.hero_eyebrow, 180),
    hero_title: requiredText(source.hero_title, defaultPortalSettings.hero_title, 220),
    hero_description: requiredText(source.hero_description, defaultPortalSettings.hero_description, 600),
    primary_cta_label: requiredText(source.primary_cta_label, defaultPortalSettings.primary_cta_label, 80),
    secondary_cta_label: requiredText(source.secondary_cta_label, defaultPortalSettings.secondary_cta_label, 80),
    trust_title: requiredText(source.trust_title, defaultPortalSettings.trust_title, 220),
    trust_description: requiredText(source.trust_description, defaultPortalSettings.trust_description, 600),
    benefits: normalizeBenefits(source.benefits),
    whatsapp_number: optionalText(source.whatsapp_number, 40),
    phone: optionalText(source.phone, 40),
    email: optionalText(source.email, 180).toLowerCase(),
    instagram_url: optionalText(source.instagram_url, 800),
    address_text: optionalText(source.address_text, 300),
    seo_title: requiredText(source.seo_title, defaultPortalSettings.seo_title, 180),
    seo_description: requiredText(source.seo_description, defaultPortalSettings.seo_description, 320),
    og_image_url: optionalText(source.og_image_url, 800),
    is_published: source.is_published !== false,
    updated_at: optionalText(source.updated_at, 80) || null,
    updated_by: optionalText(source.updated_by, 80) || null
  };
}
