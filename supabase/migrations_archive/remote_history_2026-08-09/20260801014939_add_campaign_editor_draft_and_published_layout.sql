alter table public.site_campaigns
  add column if not exists editor_draft jsonb,
  add column if not exists published_layout jsonb,
  add column if not exists layout_version integer not null default 1,
  add column if not exists draft_updated_at timestamptz,
  add column if not exists published_by uuid references public.users(id) on delete set null;

comment on column public.site_campaigns.editor_draft is 'Rascunho completo do editor visual. Não é exibido publicamente até a publicação.';
comment on column public.site_campaigns.published_layout is 'Snapshot do editor visual utilizado pela landing pública.';
comment on column public.site_campaigns.layout_version is 'Versão do schema JSON do editor visual.';
comment on column public.site_campaigns.draft_updated_at is 'Data da última gravação do rascunho visual.';
comment on column public.site_campaigns.published_by is 'Usuário master que publicou a versão visual atual.';

