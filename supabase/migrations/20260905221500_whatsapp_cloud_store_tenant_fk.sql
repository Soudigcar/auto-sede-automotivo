-- Hardening de tenant da WhatsApp Cloud API por loja.
-- Garante no banco que integration_id e store_id sempre apontem para a mesma loja.
-- Fail-closed: se houver qualquer inconsistência pré-existente, a migration aborta sem corrigir dados automaticamente.

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

alter table public.store_whatsapp_cloud_integrations
  add constraint store_whatsapp_cloud_integrations_id_store_key unique (id, store_id);

alter table public.store_whatsapp_message_templates
  add constraint store_whatsapp_message_templates_integration_store_fk
  foreign key (integration_id, store_id)
  references public.store_whatsapp_cloud_integrations(id, store_id)
  on delete cascade;

alter table public.store_whatsapp_flows
  add constraint store_whatsapp_flows_integration_store_fk
  foreign key (integration_id, store_id)
  references public.store_whatsapp_cloud_integrations(id, store_id)
  on delete cascade;

alter table public.store_whatsapp_journeys
  add constraint store_whatsapp_journeys_integration_store_fk
  foreign key (integration_id, store_id)
  references public.store_whatsapp_cloud_integrations(id, store_id)
  on delete set null (integration_id);

alter table public.whatsapp_cloud_webhook_events
  add constraint whatsapp_cloud_webhook_events_integration_store_fk
  foreign key (integration_id, store_id)
  references public.store_whatsapp_cloud_integrations(id, store_id)
  on delete cascade;

alter table public.whatsapp_cloud_audit_events
  add constraint whatsapp_cloud_audit_events_store_required_with_integration
  check (integration_id is null or store_id is not null),
  add constraint whatsapp_cloud_audit_events_integration_store_fk
  foreign key (integration_id, store_id)
  references public.store_whatsapp_cloud_integrations(id, store_id)
  on delete set null (integration_id);
