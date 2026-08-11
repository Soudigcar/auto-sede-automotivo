alter table public.store_whatsapp_integrations
  add column if not exists scope text;

update public.store_whatsapp_integrations
set scope = 'store'
where scope is null;

alter table public.store_whatsapp_integrations
  alter column scope set default 'store',
  alter column scope set not null,
  alter column store_id drop not null;

alter table public.store_whatsapp_integrations
  drop constraint if exists store_whatsapp_integrations_store_id_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_whatsapp_integrations_scope_check'
      and conrelid = 'public.store_whatsapp_integrations'::regclass
  ) then
    alter table public.store_whatsapp_integrations
      add constraint store_whatsapp_integrations_scope_check
      check (scope in ('master', 'store'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_whatsapp_integrations_scope_store_check'
      and conrelid = 'public.store_whatsapp_integrations'::regclass
  ) then
    alter table public.store_whatsapp_integrations
      add constraint store_whatsapp_integrations_scope_store_check
      check (
        (scope = 'master' and store_id is null)
        or (scope = 'store' and store_id is not null)
      );
  end if;
end
$$;

create unique index if not exists store_whatsapp_integrations_master_scope_key
  on public.store_whatsapp_integrations(scope)
  where scope = 'master';

create unique index if not exists store_whatsapp_integrations_store_scope_key
  on public.store_whatsapp_integrations(store_id)
  where scope = 'store';

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
          or (
            store_whatsapp_integrations.scope = 'store'
            and u.role = 'store'
            and u.store_id = store_whatsapp_integrations.store_id
          )
        )
    )
  );

grant select (scope)
  on public.store_whatsapp_integrations
  to authenticated;

comment on table public.store_whatsapp_integrations is
  'Conexoes WhatsApp Evolution gerenciadas no servidor nos escopos Master e Loja; nenhuma credencial da Evolution e armazenada nesta tabela.';
comment on column public.store_whatsapp_integrations.scope is
  'Escopo isolado da instancia: master para o numero central ou store para um numero exclusivo de loja.';
comment on column public.store_whatsapp_integrations.store_id is
  'Loja proprietaria quando scope=store; obrigatoriamente nulo quando scope=master.';
