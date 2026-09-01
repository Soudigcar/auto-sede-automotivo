-- AUTO CONTROLE AUTOMOTIVO
-- Migração aditiva e reversível da credencial Meta Cloud para Supabase Vault.
-- Não migra nem remove valores existentes automaticamente.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise exception 'supabase_vault extension is required';
  end if;
end;
$$;

alter table public.whatsapp_numbers
  add column if not exists access_token_secret_id uuid;

comment on column public.whatsapp_numbers.access_token_secret_id is
  'Referência interna ao Supabase Vault para o access token da Meta Cloud. Nunca expor na Data API.';

-- O webhook atual usa WHATSAPP_VERIFY_TOKEN no servidor. A coluna legada
-- permanece por compatibilidade com registros Evolution, onde guarda apenas
-- um marcador técnico managed:<instância>, e não uma credencial.
alter table public.whatsapp_numbers
  alter column verify_token set default 'server_env';

create or replace function public.get_whatsapp_access_token(p_whatsapp_number_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_legacy_token text;
  v_phone_number_id text;
  v_settings jsonb;
  v_token text;
begin
  select access_token_secret_id, access_token, phone_number_id, settings
    into v_secret_id, v_legacy_token, v_phone_number_id, v_settings
  from public.whatsapp_numbers
  where id = p_whatsapp_number_id;

  if not found then
    return null;
  end if;

  if lower(coalesce(v_settings->>'provider', '')) = 'evolution'
     or coalesce(v_phone_number_id, '') like 'evolution:%' then
    return null;
  end if;

  if v_secret_id is not null then
    select nullif(btrim(decrypted_secret), '')
      into v_token
    from vault.decrypted_secrets
    where id = v_secret_id;

    -- Referência existente sem segredo correspondente falha fechada. O texto
    -- legado só volta a ser usado se o rollback limpar explicitamente a referência.
    return v_token;
  end if;

  return nullif(btrim(v_legacy_token), '');
end;
$$;

create or replace function public.has_whatsapp_access_token(p_whatsapp_number_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_legacy_token text;
  v_phone_number_id text;
  v_settings jsonb;
begin
  select access_token_secret_id, access_token, phone_number_id, settings
    into v_secret_id, v_legacy_token, v_phone_number_id, v_settings
  from public.whatsapp_numbers
  where id = p_whatsapp_number_id;

  if not found
     or lower(coalesce(v_settings->>'provider', '')) = 'evolution'
     or coalesce(v_phone_number_id, '') like 'evolution:%' then
    return false;
  end if;

  if v_secret_id is not null then
    return exists (
      select 1
      from vault.decrypted_secrets
      where id = v_secret_id
        and nullif(btrim(decrypted_secret), '') is not null
    );
  end if;

  return nullif(btrim(v_legacy_token), '') is not null;
end;
$$;

create or replace function public.save_whatsapp_meta_number(
  p_id uuid,
  p_store_id uuid,
  p_label text,
  p_phone_number text,
  p_phone_number_id text,
  p_waba_id text,
  p_graph_version text,
  p_routing_mode text,
  p_is_active boolean,
  p_auto_create_lead boolean,
  p_auto_route_to_store boolean,
  p_created_by uuid,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '30s'
as $$
declare
  v_row public.whatsapp_numbers%rowtype;
  v_secret_id uuid;
  v_token text := nullif(btrim(coalesce(p_access_token, '')), '');
  v_secret_name text;
begin
  if nullif(btrim(coalesce(p_label, '')), '') is null then
    raise exception 'WhatsApp label is required';
  end if;

  if nullif(btrim(coalesce(p_phone_number_id, '')), '') is null
     or p_phone_number_id like 'evolution:%' then
    raise exception 'A valid Meta Phone Number ID is required';
  end if;

  if p_id is null then
    insert into public.whatsapp_numbers (
      store_id,
      label,
      phone_number,
      phone_number_id,
      waba_id,
      verify_token,
      graph_version,
      routing_mode,
      is_active,
      status,
      settings,
      created_by,
      updated_at
    ) values (
      p_store_id,
      btrim(p_label),
      nullif(btrim(coalesce(p_phone_number, '')), ''),
      btrim(p_phone_number_id),
      nullif(btrim(coalesce(p_waba_id, '')), ''),
      'server_env',
      coalesce(nullif(btrim(p_graph_version), ''), 'v20.0'),
      coalesce(nullif(btrim(p_routing_mode), ''), 'store_pipeline'),
      coalesce(p_is_active, false),
      case when coalesce(p_is_active, false) then 'connected' else 'pending' end,
      jsonb_build_object(
        'provider', 'meta_cloud',
        'auto_create_lead', coalesce(p_auto_create_lead, true),
        'auto_route_to_store', coalesce(p_auto_route_to_store, true)
      ),
      p_created_by,
      now()
    )
    returning * into v_row;
  else
    select * into v_row
    from public.whatsapp_numbers
    where id = p_id
    for update;

    if not found then
      raise exception 'WhatsApp number not found';
    end if;

    if lower(coalesce(v_row.settings->>'provider', '')) = 'evolution'
       or coalesce(v_row.phone_number_id, '') like 'evolution:%' then
      raise exception 'Evolution numbers cannot be changed by the Meta credential function';
    end if;

    update public.whatsapp_numbers
    set store_id = p_store_id,
        label = btrim(p_label),
        phone_number = nullif(btrim(coalesce(p_phone_number, '')), ''),
        phone_number_id = btrim(p_phone_number_id),
        waba_id = nullif(btrim(coalesce(p_waba_id, '')), ''),
        verify_token = 'server_env',
        graph_version = coalesce(nullif(btrim(p_graph_version), ''), 'v20.0'),
        routing_mode = coalesce(nullif(btrim(p_routing_mode), ''), 'store_pipeline'),
        is_active = coalesce(p_is_active, false),
        status = case when coalesce(p_is_active, false) then 'connected' else 'pending' end,
        settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
          'provider', 'meta_cloud',
          'auto_create_lead', coalesce(p_auto_create_lead, true),
          'auto_route_to_store', coalesce(p_auto_route_to_store, true)
        ),
        updated_at = now()
    where id = p_id
    returning * into v_row;
  end if;

  if v_token is not null then
    v_secret_id := v_row.access_token_secret_id;
    v_secret_name := format('whatsapp_meta_access_token_%s', v_row.id);

    if v_secret_id is null then
      v_secret_id := vault.create_secret(
        v_token,
        v_secret_name,
        'Meta Cloud access token for whatsapp_numbers ' || v_row.id::text,
        null
      );
    else
      perform vault.update_secret(
        v_secret_id,
        v_token,
        v_secret_name,
        'Meta Cloud access token for whatsapp_numbers ' || v_row.id::text,
        null
      );
    end if;

    -- Cópia temporária para rollback durante a fase dual. Uma migration futura,
    -- após observação e rotação, deve zerar access_token.
    update public.whatsapp_numbers
    set access_token_secret_id = v_secret_id,
        access_token = v_token,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;
  end if;

  if coalesce(p_is_active, false)
     and not public.has_whatsapp_access_token(v_row.id) then
    raise exception 'An active Meta WhatsApp number requires an access token';
  end if;

  return (to_jsonb(v_row) - 'access_token' - 'verify_token' - 'access_token_secret_id')
    || jsonb_build_object('has_access_token', public.has_whatsapp_access_token(v_row.id));
end;
$$;

create or replace function public.migrate_whatsapp_access_token_to_vault(p_whatsapp_number_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '30s'
as $$
declare
  v_row public.whatsapp_numbers%rowtype;
  v_secret_id uuid;
begin
  select * into v_row
  from public.whatsapp_numbers
  where id = p_whatsapp_number_id
  for update;

  if not found
     or lower(coalesce(v_row.settings->>'provider', '')) = 'evolution'
     or coalesce(v_row.phone_number_id, '') like 'evolution:%'
     or nullif(btrim(v_row.access_token), '') is null then
    return false;
  end if;

  if v_row.access_token_secret_id is null then
    v_secret_id := vault.create_secret(
      v_row.access_token,
      format('whatsapp_meta_access_token_%s', v_row.id),
      'Meta Cloud access token for whatsapp_numbers ' || v_row.id::text,
      null
    );

    update public.whatsapp_numbers
    set access_token_secret_id = v_secret_id,
        updated_at = now()
    where id = v_row.id;
  end if;

  return true;
end;
$$;

revoke all on function public.get_whatsapp_access_token(uuid) from public, anon, authenticated;
revoke all on function public.has_whatsapp_access_token(uuid) from public, anon, authenticated;
revoke all on function public.save_whatsapp_meta_number(uuid, uuid, text, text, text, text, text, text, boolean, boolean, boolean, uuid, text) from public, anon, authenticated;
revoke all on function public.migrate_whatsapp_access_token_to_vault(uuid) from public, anon, authenticated;

grant execute on function public.get_whatsapp_access_token(uuid) to service_role;
grant execute on function public.has_whatsapp_access_token(uuid) to service_role;
grant execute on function public.save_whatsapp_meta_number(uuid, uuid, text, text, text, text, text, text, boolean, boolean, boolean, uuid, text) to service_role;
grant execute on function public.migrate_whatsapp_access_token_to_vault(uuid) to service_role;

-- O schema Vault permanece fora da API pública do projeto. O service_role é a
-- fronteira administrativa do Supabase e conserva os grants internos mantidos
-- pela extensão; o aplicativo acessa a credencial somente pelos RPCs acima.

commit;
