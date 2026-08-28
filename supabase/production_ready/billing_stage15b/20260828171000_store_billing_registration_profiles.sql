begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Migration Production-safe: somente estrutura e funcao server-side.
-- Nao contem lojas, usuarios, CNPJ, e-mail, telefone ou qualquer seed.
create table if not exists public.store_billing_registration_profiles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete restrict,
  legal_name text,
  cnpj text,
  financial_email text,
  financial_phone text,
  registration_status text not null default 'incomplete'
    check (registration_status in ('incomplete', 'ready_for_activation')),
  validated_at timestamptz,
  validated_by uuid references public.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_registration_legal_name_format check (
    legal_name is null or char_length(legal_name) between 3 and 180
  ),
  constraint billing_registration_cnpj_format check (
    cnpj is null or cnpj ~ '^[0-9]{14}$'
  ),
  constraint billing_registration_email_format check (
    financial_email is null
    or (
      char_length(financial_email) <= 254
      and financial_email = lower(financial_email)
      and financial_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    )
  ),
  constraint billing_registration_phone_format check (
    financial_phone is null or financial_phone ~ '^[1-9][0-9]{9,10}$'
  ),
  constraint billing_registration_ready_requires_validated_data check (
    registration_status <> 'ready_for_activation'
    or (
      legal_name is not null
      and cnpj is not null
      and financial_email is not null
      and financial_phone is not null
      and validated_at is not null
      and validated_by is not null
    )
  ),
  constraint store_billing_registration_profiles_id_store_key unique (id, store_id)
);

create unique index if not exists store_billing_registration_cnpj_idx
  on public.store_billing_registration_profiles(cnpj)
  where cnpj is not null;

create index if not exists store_billing_registration_status_idx
  on public.store_billing_registration_profiles(registration_status, updated_at desc);

create index if not exists store_billing_registration_validated_by_idx
  on public.store_billing_registration_profiles(validated_by)
  where validated_by is not null;

-- Auditoria sem duplicar os dados financeiros pessoais.
create table if not exists public.store_billing_registration_audit (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.store_billing_registration_profiles(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null check (action in (
    'registration_created', 'registration_updated', 'registration_revalidated'
  )),
  previous_status text check (
    previous_status is null or previous_status in ('incomplete', 'ready_for_activation')
  ),
  new_status text not null check (new_status in ('incomplete', 'ready_for_activation')),
  changed_fields text[] not null default '{}'::text[],
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  constraint billing_registration_audit_changed_fields check (
    changed_fields <@ array[
      'legal_name', 'cnpj', 'financial_email', 'financial_phone', 'registration_status'
    ]::text[]
  ),
  constraint billing_registration_audit_profile_store_fkey
    foreign key (profile_id, store_id)
    references public.store_billing_registration_profiles(id, store_id)
    on delete restrict
);

create index if not exists store_billing_registration_audit_store_idx
  on public.store_billing_registration_audit(store_id, created_at desc);

create index if not exists store_billing_registration_audit_profile_idx
  on public.store_billing_registration_audit(profile_id, store_id, created_at desc);

create index if not exists store_billing_registration_audit_actor_idx
  on public.store_billing_registration_audit(actor_user_id, created_at desc);

alter table public.store_billing_registration_profiles enable row level security;
alter table public.store_billing_registration_audit enable row level security;

revoke all on table public.store_billing_registration_profiles
  from public, anon, authenticated, service_role;
revoke all on table public.store_billing_registration_audit
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.store_billing_registration_profiles
  to service_role;
grant select, insert on table public.store_billing_registration_audit
  to service_role;

create or replace function public.save_store_billing_registration_profile(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_legal_name text,
  p_cnpj text,
  p_financial_email text,
  p_financial_phone text,
  p_idempotency_key uuid
)
returns table (
  profile_id uuid,
  store_id uuid,
  registration_status text,
  profile_version integer,
  persisted boolean,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.store_billing_registration_profiles%rowtype;
  v_previous public.store_billing_registration_profiles%rowtype;
  v_legal_name text := nullif(regexp_replace(trim(coalesce(p_legal_name, '')), '[[:space:]]+', ' ', 'g'), '');
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
  v_email text := lower(trim(coalesce(p_financial_email, '')));
  v_phone text := regexp_replace(coalesce(p_financial_phone, ''), '[^0-9]', '', 'g');
  v_changed_fields text[] := '{}'::text[];
  v_sum integer;
  v_remainder integer;
  v_first_digit integer;
  v_second_digit integer;
  v_weights_first integer[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  v_weights_second integer[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  v_index integer;
  v_action text;
begin
  if p_idempotency_key is null then
    raise exception 'Chave de idempotencia obrigatoria.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.users actor
    where actor.id = p_actor_user_id
      and actor.role = 'master'
      and actor.status = 'active'
  ) then
    raise exception 'Acesso restrito ao Master.' using errcode = '42501';
  end if;

  perform 1
  from public.stores store_row
  where store_row.id = p_store_id
    and store_row.status = 'active'
  for update;

  if not found then
    raise exception 'Loja SaaS ativa nao encontrada.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.users store_user
    where store_user.store_id = p_store_id
      and store_user.status = 'active'
      and store_user.role in ('store', 'pre_sales', 'seller', 'prospector')
  ) then
    raise exception 'Loja sem usuario SaaS ativo.' using errcode = '42501';
  end if;

  select profile_row.*
    into v_profile
  from public.store_billing_registration_audit audit_row
  join public.store_billing_registration_profiles profile_row
    on profile_row.id = audit_row.profile_id
  where audit_row.idempotency_key = p_idempotency_key;

  if found then
    if v_profile.store_id <> p_store_id then
      raise exception 'Chave de idempotencia ja utilizada por outra loja.' using errcode = '23505';
    end if;
    return query select
      v_profile.id,
      v_profile.store_id,
      v_profile.registration_status,
      v_profile.version,
      false,
      true;
    return;
  end if;

  if v_legal_name is null or char_length(v_legal_name) not between 3 and 180 then
    raise exception 'Razao social invalida.' using errcode = '22023';
  end if;

  if v_cnpj !~ '^[0-9]{14}$' or v_cnpj ~ '^([0-9])\1{13}$' then
    raise exception 'CNPJ invalido.' using errcode = '22023';
  end if;

  v_sum := 0;
  for v_index in 1..12 loop
    v_sum := v_sum + substring(v_cnpj from v_index for 1)::integer * v_weights_first[v_index];
  end loop;
  v_remainder := v_sum % 11;
  v_first_digit := case when v_remainder < 2 then 0 else 11 - v_remainder end;

  v_sum := 0;
  for v_index in 1..13 loop
    v_sum := v_sum + substring(v_cnpj from v_index for 1)::integer * v_weights_second[v_index];
  end loop;
  v_remainder := v_sum % 11;
  v_second_digit := case when v_remainder < 2 then 0 else 11 - v_remainder end;

  if right(v_cnpj, 2) <> v_first_digit::text || v_second_digit::text then
    raise exception 'CNPJ invalido.' using errcode = '22023';
  end if;

  if char_length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or split_part(v_email, '@', 2) ~ '(\.invalid|\.local|\.localhost)$' then
    raise exception 'E-mail financeiro invalido.' using errcode = '22023';
  end if;

  if v_phone !~ '^[1-9][0-9]{9,10}$' or v_phone ~ '^([0-9])\1+$' then
    raise exception 'Telefone financeiro invalido.' using errcode = '22023';
  end if;

  select profile_row.*
    into v_previous
  from public.store_billing_registration_profiles profile_row
  where profile_row.store_id = p_store_id
  for update;

  if not found then
    insert into public.store_billing_registration_profiles (
      store_id,
      legal_name,
      cnpj,
      financial_email,
      financial_phone,
      registration_status,
      validated_at,
      validated_by
    ) values (
      p_store_id,
      v_legal_name,
      v_cnpj,
      v_email,
      v_phone,
      'ready_for_activation',
      clock_timestamp(),
      p_actor_user_id
    )
    returning * into v_profile;

    v_changed_fields := array[
      'legal_name', 'cnpj', 'financial_email', 'financial_phone', 'registration_status'
    ]::text[];
    v_action := 'registration_created';
  else
    if v_previous.legal_name is distinct from v_legal_name then
      v_changed_fields := array_append(v_changed_fields, 'legal_name');
    end if;
    if v_previous.cnpj is distinct from v_cnpj then
      v_changed_fields := array_append(v_changed_fields, 'cnpj');
    end if;
    if v_previous.financial_email is distinct from v_email then
      v_changed_fields := array_append(v_changed_fields, 'financial_email');
    end if;
    if v_previous.financial_phone is distinct from v_phone then
      v_changed_fields := array_append(v_changed_fields, 'financial_phone');
    end if;
    if v_previous.registration_status is distinct from 'ready_for_activation' then
      v_changed_fields := array_append(v_changed_fields, 'registration_status');
    end if;

    update public.store_billing_registration_profiles
    set legal_name = v_legal_name,
        cnpj = v_cnpj,
        financial_email = v_email,
        financial_phone = v_phone,
        registration_status = 'ready_for_activation',
        validated_at = clock_timestamp(),
        validated_by = p_actor_user_id,
        version = case
          when cardinality(v_changed_fields) > 0 then version + 1
          else version
        end,
        updated_at = clock_timestamp()
    where id = v_previous.id
    returning * into v_profile;

    v_action := case
      when cardinality(v_changed_fields) > 0 then 'registration_updated'
      else 'registration_revalidated'
    end;
  end if;

  insert into public.store_billing_registration_audit (
    profile_id,
    store_id,
    actor_user_id,
    action,
    previous_status,
    new_status,
    changed_fields,
    idempotency_key
  ) values (
    v_profile.id,
    p_store_id,
    p_actor_user_id,
    v_action,
    v_previous.registration_status,
    v_profile.registration_status,
    v_changed_fields,
    p_idempotency_key
  );

  return query select
    v_profile.id,
    v_profile.store_id,
    v_profile.registration_status,
    v_profile.version,
    true,
    false;
end;
$$;

revoke all on function public.save_store_billing_registration_profile(
  uuid, uuid, text, text, text, text, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.save_store_billing_registration_profile(
  uuid, uuid, text, text, text, text, uuid
) to service_role;

comment on table public.store_billing_registration_profiles is
  'Cadastro financeiro SaaS separado de stores e acessivel somente pelas APIs server-side.';
comment on table public.store_billing_registration_audit is
  'Auditoria cadastral sem duplicacao de CNPJ, e-mail, telefone ou razao social.';
comment on function public.save_store_billing_registration_profile(uuid, uuid, text, text, text, text, uuid) is
  'Persiste cadastro financeiro validado de loja SaaS ativa, com autorizacao Master e idempotencia.';

commit;
