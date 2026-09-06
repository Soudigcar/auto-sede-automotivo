-- Índices de cobertura para as foreign keys da WhatsApp Cloud API por loja.
-- Escopo: somente tabelas da V1 Cloud. Sem alteração de dados, constraints, RLS, grants ou funções.
-- Idempotente: permite reaplicação segura em ambientes de homologação.

create index if not exists store_whatsapp_cloud_integrations_created_by_idx
  on public.store_whatsapp_cloud_integrations (created_by);

create index if not exists store_whatsapp_cloud_integrations_updated_by_idx
  on public.store_whatsapp_cloud_integrations (updated_by);

create index if not exists whatsapp_message_template_blueprints_created_by_idx
  on public.whatsapp_message_template_blueprints (created_by);

create index if not exists whatsapp_message_template_blueprints_updated_by_idx
  on public.whatsapp_message_template_blueprints (updated_by);

create index if not exists store_whatsapp_message_templates_blueprint_id_idx
  on public.store_whatsapp_message_templates (blueprint_id);

create index if not exists store_whatsapp_message_templates_created_by_idx
  on public.store_whatsapp_message_templates (created_by);

create index if not exists store_whatsapp_message_templates_integration_store_idx
  on public.store_whatsapp_message_templates (integration_id, store_id);

create index if not exists store_whatsapp_message_templates_store_id_idx
  on public.store_whatsapp_message_templates (store_id);

create index if not exists store_whatsapp_message_templates_updated_by_idx
  on public.store_whatsapp_message_templates (updated_by);

create index if not exists store_whatsapp_flows_created_by_idx
  on public.store_whatsapp_flows (created_by);

create index if not exists store_whatsapp_flows_integration_store_idx
  on public.store_whatsapp_flows (integration_id, store_id);

create index if not exists store_whatsapp_flows_store_id_idx
  on public.store_whatsapp_flows (store_id);

create index if not exists store_whatsapp_flows_updated_by_idx
  on public.store_whatsapp_flows (updated_by);

create index if not exists store_whatsapp_journeys_created_by_idx
  on public.store_whatsapp_journeys (created_by);

create index if not exists store_whatsapp_journeys_integration_store_idx
  on public.store_whatsapp_journeys (integration_id, store_id);

create index if not exists store_whatsapp_journeys_store_id_idx
  on public.store_whatsapp_journeys (store_id);

create index if not exists store_whatsapp_journeys_updated_by_idx
  on public.store_whatsapp_journeys (updated_by);

create index if not exists whatsapp_cloud_webhook_events_integration_store_idx
  on public.whatsapp_cloud_webhook_events (integration_id, store_id);

create index if not exists whatsapp_cloud_webhook_events_store_id_idx
  on public.whatsapp_cloud_webhook_events (store_id);

create index if not exists whatsapp_cloud_audit_events_actor_user_id_idx
  on public.whatsapp_cloud_audit_events (actor_user_id);

create index if not exists whatsapp_cloud_audit_events_integration_store_idx
  on public.whatsapp_cloud_audit_events (integration_id, store_id);

create index if not exists whatsapp_cloud_audit_events_store_id_idx
  on public.whatsapp_cloud_audit_events (store_id);
