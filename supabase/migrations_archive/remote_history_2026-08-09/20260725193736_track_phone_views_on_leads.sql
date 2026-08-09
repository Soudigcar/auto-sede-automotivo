alter table public.leads
  add column if not exists first_phone_viewed_at timestamptz,
  add column if not exists first_phone_viewed_by_user_id uuid,
  add column if not exists first_phone_viewed_by_name text,
  add column if not exists last_phone_viewed_at timestamptz,
  add column if not exists last_phone_viewed_by_user_id uuid,
  add column if not exists last_phone_viewed_by_name text;

create index if not exists idx_leads_first_phone_viewed_at
  on public.leads(first_phone_viewed_at);

comment on column public.leads.first_phone_viewed_at is 'Primeira vez em que um usuário autorizado revelou o telefone do lead no pipeline.';
comment on column public.leads.last_phone_viewed_at is 'Última vez em que um usuário autorizado revelou o telefone do lead no pipeline.';

