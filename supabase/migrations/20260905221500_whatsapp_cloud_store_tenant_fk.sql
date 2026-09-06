-- Hardening de tenant da WhatsApp Cloud API por loja.
-- Garante no banco que integration_id e store_id sempre apontem para a mesma loja.
-- Fail-closed: se houver qualquer inconsistência pré-existente, a migration aborta sem corrigir dados automaticamente.
-- Auditoria append-only preserva os IDs históricos e valida referências somente no INSERT,
-- evitando conflito entre imutabilidade e ações referenciais ON DELETE SET NULL.

do $$
begin
  if exists (
    select 1
    from public.store_whatsapp_message_templates child
    join public.store_whatsapp_cloud_integrations parent on parent.id = child.integration_id
    where child.store_id is distinct from parent.store_id
  ) then
    raise exception 'Tenant mismatch em store_whatsapp_message_templates';
  end if;

  if exists (
    select 1
    from public.store_whatsapp_flows child
    join public.store_whatsapp_cloud_integrations parent on parent.id = child.integration_id
    where child.store_id is distinct from parent.store_id
  ) then
    raise exception 'Tenant mismatch em store_whatsapp_flows';
  end if;

  if exists (
    select 1
    from public.store_whatsapp_journeys child
    join public.store_whatsapp_cloud_integrations parent on parent.id = child.integration_id
    where child.integration_id is not null
      and child.store_id is distinct from parent.store_id
  ) then
    raise exception 'Tenant mismatch em store_whatsapp_journeys';
  end if;

  if exists (
    select 1
    from public.whatsapp_cloud_webhook_events child
    join public.store_whatsapp_cloud_integrations parent on parent.id = child.integration_id
    where child.store_id is distinct from parent.store_id
  ) then
    raise exception 'Tenant mismatch em whatsapp_cloud_webhook_events';
  end if;

  if exists (
    select 1
    from public.whatsapp_cloud_audit_events child
    left join public.store_whatsapp_cloud_integrations parent on parent.id = child.integration_id
    where child.integration_id is not null
      and (child.store_id is null or parent.id is null or child.store_id is distinct from parent.store_id)
  ) then
    raise exception 'Tenant mismatch em whatsapp_cloud_audit_events';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'store_whatsapp_cloud_integrations_id_store_key'
      and conrelid = 'public.store_whatsapp_cloud_integrations'::regclass
  ) then
    alter table public.store_whatsapp_cloud_integrations
      add constraint store_whatsapp_cloud_integrations_id_store_key unique (id, store_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'store_whatsapp_message_templates_integration_store_fk'
      and conrelid = 'public.store_whatsapp_message_templates'::regclass
  ) then
    alter table public.store_whatsapp_message_templates
      add constraint store_whatsapp_message_templates_integration_store_fk
      foreign key (integration_id, store_id)
      references public.store_whatsapp_cloud_integrations(id, store_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'store_whatsapp_flows_integration_store_fk'
      and conrelid = 'public.store_whatsapp_flows'::regclass
  ) then
    alter table public.store_whatsapp_flows
      add constraint store_whatsapp_flows_integration_store_fk
      foreign key (integration_id, store_id)
      references public.store_whatsapp_cloud_integrations(id, store_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'store_whatsapp_journeys_integration_store_fk'
      and conrelid = 'public.store_whatsapp_journeys'::regclass
  ) then
    alter table public.store_whatsapp_journeys
      add constraint store_whatsapp_journeys_integration_store_fk
      foreign key (integration_id, store_id)
      references public.store_whatsapp_cloud_integrations(id, store_id)
      on delete set null (integration_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_cloud_webhook_events_integration_store_fk'
      and conrelid = 'public.whatsapp_cloud_webhook_events'::regclass
  ) then
    alter table public.whatsapp_cloud_webhook_events
      add constraint whatsapp_cloud_webhook_events_integration_store_fk
      foreign key (integration_id, store_id)
      references public.store_whatsapp_cloud_integrations(id, store_id)
      on delete cascade;
  end if;
end $$;

-- A auditoria é histórica/append-only. Referências com ON DELETE SET NULL seriam
-- incompatíveis com o trigger de imutabilidade porque o PostgreSQL precisaria
-- executar UPDATE na linha de auditoria quando o pai fosse apagado.
alter table public.whatsapp_cloud_audit_events
  drop constraint if exists whatsapp_cloud_audit_events_store_id_fkey,
  drop constraint if exists whatsapp_cloud_audit_events_integration_id_fkey,
  drop constraint if exists whatsapp_cloud_audit_events_actor_user_id_fkey,
  drop constraint if exists whatsapp_cloud_audit_events_integration_store_fk;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_cloud_audit_events_store_required_with_integration'
      and conrelid = 'public.whatsapp_cloud_audit_events'::regclass
  ) then
    alter table public.whatsapp_cloud_audit_events
      add constraint whatsapp_cloud_audit_events_store_required_with_integration
      check (integration_id is null or store_id is not null);
  end if;
end $$;

create or replace function public.whatsapp_cloud_audit_validate_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_integration_store_id uuid;
begin
  if new.store_id is not null and not exists (
    select 1 from public.stores s where s.id = new.store_id
  ) then
    raise exception 'Audit store not found';
  end if;

  if new.actor_user_id is not null and not exists (
    select 1 from public.users u where u.id = new.actor_user_id
  ) then
    raise exception 'Audit actor not found';
  end if;

  if new.integration_id is not null then
    if new.store_id is null then
      raise exception 'Audit store_id is required when integration_id is present';
    end if;

    select i.store_id
      into v_integration_store_id
      from public.store_whatsapp_cloud_integrations i
     where i.id = new.integration_id;

    if not found then
      raise exception 'Audit integration not found';
    end if;

    if v_integration_store_id is distinct from new.store_id then
      raise exception 'Tenant mismatch em whatsapp_cloud_audit_events';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists whatsapp_cloud_audit_events_validate_insert
  on public.whatsapp_cloud_audit_events;
create trigger whatsapp_cloud_audit_events_validate_insert
before insert on public.whatsapp_cloud_audit_events
for each row execute function public.whatsapp_cloud_audit_validate_insert();
