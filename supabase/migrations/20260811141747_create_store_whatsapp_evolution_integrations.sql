create table if not exists public.store_whatsapp_integrations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  provider text not null default 'evolution' check (provider in ('evolution')),
  instance_name text not null unique,
  crm_number_id uuid unique references public.whatsapp_numbers(id) on delete set null,
  status text not null default 'pending' check (
    status in ('pending', 'qrcode', 'connecting', 'connected', 'disconnected', 'error')
  ),
  phone_number text,
  profile_name text,
  profile_picture_url text,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  last_webhook_at timestamptz,
  last_error text,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_whatsapp_integrations_created_by_idx
  on public.store_whatsapp_integrations(created_by);
create index if not exists store_whatsapp_integrations_updated_by_idx
  on public.store_whatsapp_integrations(updated_by);

alter table public.store_whatsapp_integrations enable row level security;

drop policy if exists store_whatsapp_integrations_manager_select
  on public.store_whatsapp_integrations;
create policy store_whatsapp_integrations_manager_select
  on public.store_whatsapp_integrations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = (select auth.uid())
        and u.status = 'active'
        and (
          u.role = 'master'
          or (u.role = 'store' and u.store_id = store_whatsapp_integrations.store_id)
        )
    )
  );

drop policy if exists store_whatsapp_integrations_service_role_all
  on public.store_whatsapp_integrations;
create policy store_whatsapp_integrations_service_role_all
  on public.store_whatsapp_integrations
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.store_whatsapp_integrations from anon, authenticated;
grant select (
  id,
  store_id,
  provider,
  instance_name,
  crm_number_id,
  status,
  phone_number,
  profile_name,
  profile_picture_url,
  last_connected_at,
  last_disconnected_at,
  last_webhook_at,
  last_error,
  created_at,
  updated_at
) on public.store_whatsapp_integrations to authenticated;
grant select, insert, update, delete on table public.store_whatsapp_integrations to service_role;

comment on table public.store_whatsapp_integrations is
  'Conexoes WhatsApp por loja gerenciadas no servidor pela Evolution API; nenhuma credencial da Evolution e armazenada nesta tabela.';
comment on column public.store_whatsapp_integrations.instance_name is
  'Identificador tecnico unico da instancia Evolution vinculada a loja.';
comment on column public.store_whatsapp_integrations.crm_number_id is
  'Numero logico do WhatsApp CRM reutilizado por mensagens Meta Cloud ou Evolution.';
