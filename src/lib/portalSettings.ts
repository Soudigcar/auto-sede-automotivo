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

export const defaultPortalSettings: PortalSettings = {
  id: null,
  key: 'official',
  brand_name: 'Auto Sede',
  brand_tagline: 'Portal Automotivo',
  logo_url: '',
  hero_eyebrow: 'Auto Sede - veículos de lojas parceiras',
  hero_title: 'Encontre seu próximo carro em um só lugar.',
  hero_description: 'Compare veículos disponíveis, faça uma simulação inicial e fale diretamente com a loja responsável pelo anúncio.',
  primary_cta_label: 'Ver veículos disponíveis',
  secondary_cta_label: 'Entenda o atendimento',
  trust_title: 'Cada veículo permanece ligado à sua loja.',
  trust_description: 'A vitrine publica somente anúncios com proprietário único e loja ativa. Veículos sem vínculo confiável ficam fora do catálogo até a revisão.',
  benefits: [
    { title: 'Estoque validado', description: 'Somente veículos disponíveis e vinculados a lojas habilitadas.' },
    { title: 'Atendimento direto', description: 'Seu interesse segue para a loja responsável pelo anúncio escolhido.' },
    { title: 'Simulação inicial', description: 'Visualize uma estimativa antes de solicitar o atendimento comercial.' }
  ],
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

export function normalizePortalSettings(_value: unknown): PortalSettings {
  return {
    ...defaultPortalSettings,
    benefits: defaultPortalSettings.benefits.map((benefit) => ({ ...benefit }))
  };
}
