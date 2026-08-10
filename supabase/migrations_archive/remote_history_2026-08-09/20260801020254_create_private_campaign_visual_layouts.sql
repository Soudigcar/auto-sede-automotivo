create table if not exists public.site_campaign_layouts (
  campaign_id uuid primary key references public.site_campaigns(id) on delete cascade,
  editor_draft jsonb,
  published_layout jsonb,
  layout_version integer not null default 2,
  draft_updated_at timestamptz,
  published_at timestamptz,
  published_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_campaign_layouts enable row level security;

comment on table public.site_campaign_layouts is 'Layouts visuais privados das landings. Acesso somente por APIs de servidor com service_role.';
comment on column public.site_campaign_layouts.editor_draft is 'Rascunho privado do editor visual.';
comment on column public.site_campaign_layouts.published_layout is 'Snapshot visual liberado para a landing pública.';

