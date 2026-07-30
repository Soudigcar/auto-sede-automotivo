begin;

create table if not exists public.portal_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique default 'official',
  brand_name text not null default 'Auto Sede',
  brand_tagline text not null default 'Portal Automotivo',
  logo_url text not null default '',
  hero_eyebrow text not null default 'Auto Sede • veículos de lojas parceiras',
  hero_title text not null default 'Encontre seu próximo carro em um só lugar.',
  hero_description text not null default 'Compare veículos disponíveis, faça uma simulação inicial e fale diretamente com a loja responsável pelo anúncio.',
  primary_cta_label text not null default 'Ver veículos disponíveis',
  secondary_cta_label text not null default 'Entenda o atendimento',
  trust_title text not null default 'Cada veículo permanece ligado à sua loja.',
  trust_description text not null default 'A vitrine publica somente anúncios com proprietário único e loja ativa. Veículos sem vínculo confiável ficam fora do catálogo até a revisão.',
  benefits jsonb not null default '[{"title":"Estoque validado","description":"Somente veículos disponíveis e vinculados a lojas habilitadas."},{"title":"Atendimento direto","description":"Seu interesse segue para a loja responsável pelo anúncio escolhido."},{"title":"Simulação inicial","description":"Visualize uma estimativa antes de solicitar o atendimento comercial."}]'::jsonb,
  whatsapp_number text not null default '',
  phone text not null default '',
  email text not null default '',
  instagram_url text not null default '',
  address_text text not null default '',
  seo_title text not null default 'Auto Sede | Veículos de lojas parceiras em um só lugar',
  seo_description text not null default 'Encontre veículos disponíveis, compare opções, simule seu financiamento e fale diretamente com a loja responsável pelo anúncio.',
  og_image_url text not null default '',
  is_published boolean not null default true,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_settings_singleton_key check (key = 'official'),
  constraint portal_settings_benefits_array check (jsonb_typeof(benefits) = 'array')
);

alter table public.portal_settings enable row level security;

revoke all on table public.portal_settings from anon, authenticated;
grant select, insert, update on table public.portal_settings to service_role;

insert into public.portal_settings (key)
values ('official')
on conflict (key) do nothing;

comment on table public.portal_settings is 'Configuração singleton do portal público oficial Auto Sede. Acesso somente pelo servidor com service_role.';
comment on column public.portal_settings.is_published is 'Quando falso, o portal público usa a configuração padrão segura até uma nova publicação.';

commit;