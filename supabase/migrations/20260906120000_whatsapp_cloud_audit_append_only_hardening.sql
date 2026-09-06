-- Hardening incremental da auditoria append-only da WhatsApp Cloud API.
-- Mantem IDs historicos sem FKs com ON DELETE SET NULL, que exigiriam UPDATE
-- em uma tabela deliberadamente imutavel. Referencias passam a ser validadas
-- somente no INSERT. Fail-closed: qualquer inconsistencia historica aborta.

do $$
begin
  if exists (
    select 1
    from public.whatsapp_cloud_audit_events a
    left join public.stores s on s.id = a.store_id
    where a.store_id is not null and s.id is null
  ) then
    raise exception 'Audit store not found in historical rows';
  end if;

  if exists (
    select 1
    from public.whatsapp_cloud_audit_events a
    left join public.users u on u.id = a.actor_user_id
    where a.actor_user_id is not null and u.id is null
  ) then
    raise exception 'Audit actor not found in historical rows';
  end if;

  if exists (
    select 1
    from public.whatsapp_cloud_audit_events a
    left join public.store_whatsapp_cloud_integrations i on i.id = a.integration_id
    where a.integration_id is not null
      and (a.store_id is null or i.id is null or i.store_id is distinct from a.store_id)
  ) then
    raise exception 'Tenant mismatch em whatsapp_cloud_audit_events historical rows';
  end if;
end $$;

alter table public.whatsapp_cloud_audit_events
  drop constraint if exists whatsapp_cloud_audit_events_store_id_fkey,
  drop constraint if exists whatsapp_cloud_audit_events_integration_id_fkey,
  drop constraint if exists whatsapp_cloud_audit_events_actor_user_id_fkey,
  drop constraint if exists whatsapp_cloud_audit_events_integration_store_fk;

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
