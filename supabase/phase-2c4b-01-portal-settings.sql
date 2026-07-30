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

create or replace function public.save_portal_settings_transaction(
  p_actor_user_id uuid,
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.users%rowtype;
  v_old public.portal_settings%rowtype;
  v_new public.portal_settings%rowtype;
begin
  select *
  into v_actor
  from public.users
  where id = p_actor_user_id
    and status = 'active'
    and role = 'master';

  if not found then
    raise exception 'Acesso exclusivo para usuários Master.' using errcode = '42501';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Configuração do portal inválida.' using errcode = '22023';
  end if;

  select *
  into v_old
  from public.portal_settings
  where key = 'official'
  for update;

  insert into public.portal_settings (
    key,
    brand_name,
    brand_tagline,
    logo_url,
    hero_eyebrow,
    hero_title,
    hero_description,
    primary_cta_label,
    secondary_cta_label,
    trust_title,
    trust_description,
    benefits,
    whatsapp_number,
    phone,
    email,
    instagram_url,
    address_text,
    seo_title,
    seo_description,
    og_image_url,
    is_published,
    updated_by,
    updated_at
  ) values (
    'official',
    coalesce(nullif(btrim(p_settings ->> 'brand_name'), ''), 'Auto Sede'),
    coalesce(nullif(btrim(p_settings ->> 'brand_tagline'), ''), 'Portal Automotivo'),
    coalesce(btrim(p_settings ->> 'logo_url'), ''),
    coalesce(nullif(btrim(p_settings ->> 'hero_eyebrow'), ''), 'Auto Sede • veículos de lojas parceiras'),
    coalesce(nullif(btrim(p_settings ->> 'hero_title'), ''), 'Encontre seu próximo carro em um só lugar.'),
    coalesce(nullif(btrim(p_settings ->> 'hero_description'), ''), 'Compare veículos disponíveis, faça uma simulação inicial e fale diretamente com a loja responsável pelo anúncio.'),
    coalesce(nullif(btrim(p_settings ->> 'primary_cta_label'), ''), 'Ver veículos disponíveis'),
    coalesce(nullif(btrim(p_settings ->> 'secondary_cta_label'), ''), 'Entenda o atendimento'),
    coalesce(nullif(btrim(p_settings ->> 'trust_title'), ''), 'Cada veículo permanece ligado à sua loja.'),
    coalesce(nullif(btrim(p_settings ->> 'trust_description'), ''), 'A vitrine publica somente anúncios com proprietário único e loja ativa. Veículos sem vínculo confiável ficam fora do catálogo até a revisão.'),
    case when jsonb_typeof(p_settings -> 'benefits') = 'array' then p_settings -> 'benefits' else '[]'::jsonb end,
    coalesce(btrim(p_settings ->> 'whatsapp_number'), ''),
    coalesce(btrim(p_settings ->> 'phone'), ''),
    lower(coalesce(btrim(p_settings ->> 'email'), '')),
    coalesce(btrim(p_settings ->> 'instagram_url'), ''),
    coalesce(btrim(p_settings ->> 'address_text'), ''),
    coalesce(nullif(btrim(p_settings ->> 'seo_title'), ''), 'Auto Sede | Veículos de lojas parceiras em um só lugar'),
    coalesce(nullif(btrim(p_settings ->> 'seo_description'), ''), 'Encontre veículos disponíveis, compare opções, simule seu financiamento e fale diretamente com a loja responsável pelo anúncio.'),
    coalesce(btrim(p_settings ->> 'og_image_url'), ''),
    coalesce((p_settings ->> 'is_published')::boolean, true),
    v_actor.id,
    now()
  )
  on conflict (key) do update set
    brand_name = excluded.brand_name,
    brand_tagline = excluded.brand_tagline,
    logo_url = excluded.logo_url,
    hero_eyebrow = excluded.hero_eyebrow,
    hero_title = excluded.hero_title,
    hero_description = excluded.hero_description,
    primary_cta_label = excluded.primary_cta_label,
    secondary_cta_label = excluded.secondary_cta_label,
    trust_title = excluded.trust_title,
    trust_description = excluded.trust_description,
    benefits = excluded.benefits,
    whatsapp_number = excluded.whatsapp_number,
    phone = excluded.phone,
    email = excluded.email,
    instagram_url = excluded.instagram_url,
    address_text = excluded.address_text,
    seo_title = excluded.seo_title,
    seo_description = excluded.seo_description,
    og_image_url = excluded.og_image_url,
    is_published = excluded.is_published,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_new;

  insert into public.audit_logs (
    user_id,
    user_role,
    action_type,
    entity_type,
    entity_id,
    old_value,
    new_value
  ) values (
    v_actor.id,
    v_actor.role,
    case when v_new.is_published then 'portal_settings_published' else 'portal_settings_saved_draft' end,
    'portal_settings',
    v_new.id,
    case when v_old.id is null then null else to_jsonb(v_old) end,
    to_jsonb(v_new)
  );

  return to_jsonb(v_new);
end;
$$;

revoke all on function public.save_portal_settings_transaction(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_portal_settings_transaction(uuid, jsonb) to service_role;

comment on table public.portal_settings is 'Configuração singleton do portal público oficial Auto Sede. Acesso somente pelo servidor com service_role.';
comment on column public.portal_settings.is_published is 'Quando falso, o portal público usa a configuração padrão segura até uma nova publicação.';
comment on function public.save_portal_settings_transaction(uuid, jsonb) is 'Salva o CMS do portal e registra auditoria na mesma transação. Execução exclusiva do service_role.';

commit;