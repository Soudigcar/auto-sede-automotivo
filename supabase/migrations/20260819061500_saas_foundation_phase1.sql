-- SaaS foundation phase 1
-- IMPORTANT: this migration is intentionally additive and backward-compatible.
-- It must be validated in an isolated CRM development branch before Production.

create table if not exists public.store_memberships (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  auth_user_id uuid,
  role text not null check (role in ('store','pre_sales','seller','prospector')),
  status text not null default 'active' check (status in ('invited','active','suspended','revoked')),
  is_owner boolean not null default false,
  mfa_required boolean not null default false,
  joined_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, user_id)
);

create index if not exists idx_store_memberships_store_id on public.store_memberships(store_id);
create index if not exists idx_store_memberships_user_id on public.store_memberships(user_id);
create index if not exists idx_store_memberships_auth_user_id on public.store_memberships(auth_user_id);
create index if not exists idx_store_memberships_active_auth on public.store_memberships(auth_user_id, status) where status = 'active';

alter table public.store_memberships enable row level security;

drop policy if exists store_memberships_select on public.store_memberships;
create policy store_memberships_select
on public.store_memberships
for select
to authenticated
using (
  private.is_master()
  or auth_user_id = auth.uid()
  or private.can_manage_store(store_id)
);

drop policy if exists store_memberships_service_role_all on public.store_memberships;
create policy store_memberships_service_role_all
on public.store_memberships
for all
to service_role
using (true)
with check (true);

-- Backfill existing single-store users. This preserves the legacy users.store_id model
-- while introducing the future many-to-many membership layer.
insert into public.store_memberships (
  store_id,
  user_id,
  auth_user_id,
  role,
  status,
  is_owner,
  mfa_required,
  joined_at
)
select
  u.store_id,
  u.id,
  u.auth_user_id,
  u.role,
  case when u.status = 'active' then 'active' else 'suspended' end,
  (u.role = 'store'),
  (u.role = 'store'),
  coalesce(u.created_at, now())
from public.users u
where u.store_id is not null
  and u.role in ('store','pre_sales','seller','prospector')
on conflict (store_id, user_id) do update set
  auth_user_id = excluded.auth_user_id,
  role = excluded.role,
  status = excluded.status,
  is_owner = excluded.is_owner,
  mfa_required = excluded.mfa_required,
  updated_at = now();

create table if not exists public.saas_onboarding (
  id uuid primary key default gen_random_uuid(),
  normalized_email text not null,
  responsible_name text,
  responsible_phone text,
  store_name text,
  legal_name text,
  cnpj text,
  state text,
  city text,
  address_text text,
  website_url text,
  instagram_url text,
  status text not null default 'started' check (
    status in (
      'started',
      'email_verification_pending',
      'email_verified',
      'company_completed',
      'plan_selected',
      'payment_pending',
      'ready_to_provision',
      'active',
      'canceled',
      'expired'
    )
  ),
  selected_plan_code text,
  auth_user_id uuid,
  store_id uuid references public.stores(id) on delete set null,
  privacy_notice_version text,
  privacy_acknowledged_at timestamptz,
  terms_version text,
  terms_accepted_at timestamptz,
  expires_at timestamptz,
  activated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saas_onboarding_email on public.saas_onboarding(lower(normalized_email));
create index if not exists idx_saas_onboarding_status on public.saas_onboarding(status);
create index if not exists idx_saas_onboarding_store_id on public.saas_onboarding(store_id);

alter table public.saas_onboarding enable row level security;

drop policy if exists saas_onboarding_master_select on public.saas_onboarding;
create policy saas_onboarding_master_select
on public.saas_onboarding
for select
to authenticated
using (private.is_master());

drop policy if exists saas_onboarding_master_update on public.saas_onboarding;
create policy saas_onboarding_master_update
on public.saas_onboarding
for update
to authenticated
using (private.is_master())
with check (private.is_master());

drop policy if exists saas_onboarding_service_role_all on public.saas_onboarding;
create policy saas_onboarding_service_role_all
on public.saas_onboarding
for all
to service_role
using (true)
with check (true);

create table if not exists public.identity_security_requirements (
  user_id uuid primary key references public.users(id) on delete cascade,
  mfa_required boolean not null default false,
  reauthentication_required boolean not null default true,
  sensitive_actions jsonb not null default '["billing","owner_change","admin_change","integration_secret","master_override"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.identity_security_requirements enable row level security;

drop policy if exists identity_security_requirements_select on public.identity_security_requirements;
create policy identity_security_requirements_select
on public.identity_security_requirements
for select
to authenticated
using (
  private.is_master()
  or exists (
    select 1
    from public.users u
    where u.id = identity_security_requirements.user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists identity_security_requirements_service_role_all on public.identity_security_requirements;
create policy identity_security_requirements_service_role_all
on public.identity_security_requirements
for all
to service_role
using (true)
with check (true);

insert into public.identity_security_requirements (user_id, mfa_required)
select u.id, (u.role in ('master','store'))
from public.users u
on conflict (user_id) do update set
  mfa_required = excluded.mfa_required,
  updated_at = now();

comment on table public.store_memberships is 'SaaS tenant membership layer. users.store_id remains the compatibility source during phase 1.';
comment on table public.saas_onboarding is 'Server-managed SaaS onboarding state. No anonymous direct table writes.';
comment on table public.identity_security_requirements is 'MFA and reauthentication requirements. Enforcement is introduced gradually after enrollment UX is validated.';
