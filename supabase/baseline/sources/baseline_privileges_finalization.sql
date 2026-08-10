-- AUTO CONTROLE AUTOMOTIVO
-- FINALIZACAO DE PRIVILEGIOS PARA REPLAY DESCARTAVEL - NAO APLICAR EM PRODUCAO
-- Executar somente depois das 45 migrations no ambiente de teste.

begin;

-- section 10: public.appointments|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.appointments to anon;

-- section 10: public.appointments|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.appointments to authenticated;

-- section 10: public.appointments|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.appointments to service_role;

-- section 10: public.audit_logs|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.audit_logs to anon;

-- section 10: public.audit_logs|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.audit_logs to authenticated;

-- section 10: public.audit_logs|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.audit_logs to service_role;

-- section 10: public.banks|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.banks to anon;

-- section 10: public.banks|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.banks to authenticated;

-- section 10: public.banks|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.banks to service_role;

-- section 10: public.event_lead_routing_state|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.event_lead_routing_state to service_role;

-- section 10: public.event_vehicle_assignments|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.event_vehicle_assignments to anon;

-- section 10: public.event_vehicle_assignments|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.event_vehicle_assignments to authenticated;

-- section 10: public.event_vehicle_assignments|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.event_vehicle_assignments to service_role;

-- section 10: public.events|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.events to anon;

-- section 10: public.events|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.events to authenticated;

-- section 10: public.events|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.events to service_role;

-- section 10: public.financial_entries|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.financial_entries to anon;

-- section 10: public.financial_entries|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.financial_entries to authenticated;

-- section 10: public.financial_entries|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.financial_entries to service_role;

-- section 10: public.inventory|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.inventory to anon;

-- section 10: public.inventory|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.inventory to authenticated;

-- section 10: public.inventory|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.inventory to service_role;

-- section 10: public.lead_activities|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activities to anon;

-- section 10: public.lead_activities|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activities to authenticated;

-- section 10: public.lead_activities|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activities to service_role;

-- section 10: public.lead_activity_logs|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activity_logs to anon;

-- section 10: public.lead_activity_logs|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activity_logs to authenticated;

-- section 10: public.lead_activity_logs|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activity_logs to service_role;

-- section 10: public.lead_assignment_logs|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_assignment_logs to anon;

-- section 10: public.lead_assignment_logs|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_assignment_logs to authenticated;

-- section 10: public.lead_assignment_logs|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_assignment_logs to service_role;

-- section 10: public.lead_commercial_details|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_commercial_details to anon;

-- section 10: public.lead_commercial_details|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_commercial_details to authenticated;

-- section 10: public.lead_commercial_details|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_commercial_details to service_role;

-- section 10: public.lead_ingestion_locks|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_ingestion_locks to anon;

-- section 10: public.lead_ingestion_locks|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_ingestion_locks to authenticated;

-- section 10: public.lead_ingestion_locks|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_ingestion_locks to service_role;

-- section 10: public.lead_notes|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_notes to service_role;

-- section 10: public.lead_routing_state|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_routing_state to anon;

-- section 10: public.lead_routing_state|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_routing_state to authenticated;

-- section 10: public.lead_routing_state|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_routing_state to service_role;

-- section 10: public.leads_base|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads_base to anon;

-- section 10: public.leads_base|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads_base to authenticated;

-- section 10: public.leads_base|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads_base to service_role;

-- section 10: public.leads|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads to anon;

-- section 10: public.leads|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads to authenticated;

-- section 10: public.leads|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads to service_role;

-- section 10: public.losses|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.losses to anon;

-- section 10: public.losses|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.losses to authenticated;

-- section 10: public.losses|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.losses to service_role;

-- section 10: public.marketing_integrations|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.marketing_integrations to anon;

-- section 10: public.marketing_integrations|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.marketing_integrations to authenticated;

-- section 10: public.marketing_integrations|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.marketing_integrations to service_role;

-- section 10: public.portal_settings|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.portal_settings to service_role;

-- section 10: public.prospectors|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.prospectors to anon;

-- section 10: public.prospectors|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.prospectors to authenticated;

-- section 10: public.prospectors|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.prospectors to service_role;

-- section 10: public.sales|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.sales to anon;

-- section 10: public.sales|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.sales to authenticated;

-- section 10: public.sales|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.sales to service_role;

-- section 10: public.site_campaign_layouts|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaign_layouts to anon;

-- section 10: public.site_campaign_layouts|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaign_layouts to authenticated;

-- section 10: public.site_campaign_layouts|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaign_layouts to service_role;

-- section 10: public.site_campaigns|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaigns to anon;

-- section 10: public.site_campaigns|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaigns to authenticated;

-- section 10: public.site_campaigns|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaigns to service_role;

-- section 10: public.site_vehicles|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_vehicles to anon;

-- section 10: public.site_vehicles|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_vehicles to authenticated;

-- section 10: public.site_vehicles|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_vehicles to service_role;

-- section 10: public.store_calendar_tasks|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_calendar_tasks to anon;

-- section 10: public.store_calendar_tasks|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_calendar_tasks to authenticated;

-- section 10: public.store_calendar_tasks|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_calendar_tasks to service_role;

-- section 10: public.store_event_participations|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_event_participations to anon;

-- section 10: public.store_event_participations|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_event_participations to authenticated;

-- section 10: public.store_event_participations|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_event_participations to service_role;

-- section 10: public.store_portal_applications|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_applications to anon;

-- section 10: public.store_portal_applications|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_applications to authenticated;

-- section 10: public.store_portal_applications|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_applications to service_role;

-- section 10: public.store_portal_audit|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_audit to anon;

-- section 10: public.store_portal_audit|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_audit to authenticated;

-- section 10: public.store_portal_audit|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_audit to service_role;

-- section 10: public.store_registration_links|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_registration_links to anon;

-- section 10: public.store_registration_links|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_registration_links to authenticated;

-- section 10: public.store_registration_links|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_registration_links to service_role;

-- section 10: public.store_stock_imports|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_stock_imports to anon;

-- section 10: public.store_stock_imports|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_stock_imports to authenticated;

-- section 10: public.store_stock_imports|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_stock_imports to service_role;

-- section 10: public.store_team_registration_links|authenticated
grant SELECT on table public.store_team_registration_links to authenticated;

-- section 10: public.store_team_registration_links|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_team_registration_links to service_role;

-- section 10: public.store_team_routing_state|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_team_routing_state to anon;

-- section 10: public.store_team_routing_state|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_team_routing_state to authenticated;

-- section 10: public.store_team_routing_state|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_team_routing_state to service_role;

-- section 10: public.store_vehicle_link_submissions|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_vehicle_link_submissions to anon;

-- section 10: public.store_vehicle_link_submissions|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_vehicle_link_submissions to authenticated;

-- section 10: public.store_vehicle_link_submissions|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_vehicle_link_submissions to service_role;

-- section 10: public.stores|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.stores to anon;

-- section 10: public.stores|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.stores to authenticated;

-- section 10: public.stores|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.stores to service_role;

-- section 10: public.street_surveys|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.street_surveys to anon;

-- section 10: public.street_surveys|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.street_surveys to authenticated;

-- section 10: public.street_surveys|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.street_surveys to service_role;

-- section 10: public.users|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.users to anon;

-- section 10: public.users|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.users to authenticated;

-- section 10: public.users|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.users to service_role;

-- section 10: public.vehicle_attribute_options|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_attribute_options to anon;

-- section 10: public.vehicle_attribute_options|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_attribute_options to authenticated;

-- section 10: public.vehicle_attribute_options|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_attribute_options to service_role;

-- section 10: public.vehicle_catalog_aliases|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_aliases to anon;

-- section 10: public.vehicle_catalog_aliases|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_aliases to authenticated;

-- section 10: public.vehicle_catalog_aliases|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_aliases to service_role;

-- section 10: public.vehicle_catalog_brands|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_brands to anon;

-- section 10: public.vehicle_catalog_brands|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_brands to authenticated;

-- section 10: public.vehicle_catalog_brands|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_brands to service_role;

-- section 10: public.vehicle_catalog_colors|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_colors to anon;

-- section 10: public.vehicle_catalog_colors|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_colors to authenticated;

-- section 10: public.vehicle_catalog_colors|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_colors to service_role;

-- section 10: public.vehicle_catalog_configurations|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_configurations to anon;

-- section 10: public.vehicle_catalog_configurations|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_configurations to authenticated;

-- section 10: public.vehicle_catalog_configurations|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_configurations to service_role;

-- section 10: public.vehicle_catalog_fuels|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_fuels to anon;

-- section 10: public.vehicle_catalog_fuels|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_fuels to authenticated;

-- section 10: public.vehicle_catalog_fuels|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_fuels to service_role;

-- section 10: public.vehicle_catalog_models|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_models to anon;

-- section 10: public.vehicle_catalog_models|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_models to authenticated;

-- section 10: public.vehicle_catalog_models|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_models to service_role;

-- section 10: public.vehicle_catalog_suggestions|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_suggestions to anon;

-- section 10: public.vehicle_catalog_suggestions|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_suggestions to authenticated;

-- section 10: public.vehicle_catalog_suggestions|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_suggestions to service_role;

-- section 10: public.vehicle_catalog_transmissions|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_transmissions to anon;

-- section 10: public.vehicle_catalog_transmissions|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_transmissions to authenticated;

-- section 10: public.vehicle_catalog_transmissions|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_transmissions to service_role;

-- section 10: public.vehicle_catalog_versions|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_versions to anon;

-- section 10: public.vehicle_catalog_versions|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_versions to authenticated;

-- section 10: public.vehicle_catalog_versions|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_versions to service_role;

-- section 10: public.whatsapp_contacts|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_contacts to anon;

-- section 10: public.whatsapp_contacts|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_contacts to authenticated;

-- section 10: public.whatsapp_contacts|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_contacts to service_role;

-- section 10: public.whatsapp_conversations|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_conversations to anon;

-- section 10: public.whatsapp_conversations|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_conversations to authenticated;

-- section 10: public.whatsapp_conversations|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_conversations to service_role;

-- section 10: public.whatsapp_messages|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_messages to anon;

-- section 10: public.whatsapp_messages|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_messages to authenticated;

-- section 10: public.whatsapp_messages|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_messages to service_role;

-- section 10: public.whatsapp_numbers|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_numbers to anon;

-- section 10: public.whatsapp_numbers|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_numbers to authenticated;

-- section 10: public.whatsapp_numbers|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_numbers to service_role;

-- section 20: private.can_access_lead(p_lead_id uuid)|authenticated
grant execute on function private.can_access_lead(p_lead_id uuid) to authenticated;

-- section 20: private.can_access_lead(p_lead_id uuid)|service_role
grant execute on function private.can_access_lead(p_lead_id uuid) to service_role;

-- section 20: private.can_manage_store(p_store_id uuid)|authenticated
grant execute on function private.can_manage_store(p_store_id uuid) to authenticated;

-- section 20: private.can_manage_store(p_store_id uuid)|service_role
grant execute on function private.can_manage_store(p_store_id uuid) to service_role;

-- section 20: private.is_own_prospector(p_prospector_id uuid)|authenticated
grant execute on function private.is_own_prospector(p_prospector_id uuid) to authenticated;

-- section 20: private.is_own_prospector(p_prospector_id uuid)|service_role
grant execute on function private.is_own_prospector(p_prospector_id uuid) to service_role;

-- section 20: public.assign_lead_to_store_team(p_lead_id uuid, p_role text, p_requested_user_id uuid, p_assignment_mode text, p_assigned_by_user_id uuid, p_notes text)|service_role
grant execute on function public.assign_lead_to_store_team(p_lead_id uuid, p_role text, p_requested_user_id uuid, p_assignment_mode text, p_assigned_by_user_id uuid, p_notes text) to service_role;

-- section 20: public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer)|anon
grant execute on function public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer) to anon;

-- section 20: public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer)|authenticated
grant execute on function public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer) to authenticated;

-- section 20: public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer)|service_role
grant execute on function public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer) to service_role;

-- section 20: public.create_event_landing_lead(p_name text, p_phone text, p_cpf text, p_email text, p_campaign_id uuid, p_vehicle_id uuid, p_down_payment numeric, p_financed_amount numeric, p_installments integer, p_estimated_installment numeric, p_interest_rate numeric, p_notes text, p_metadata jsonb)|service_role
grant execute on function public.create_event_landing_lead(p_name text, p_phone text, p_cpf text, p_email text, p_campaign_id uuid, p_vehicle_id uuid, p_down_payment numeric, p_financed_amount numeric, p_installments integer, p_estimated_installment numeric, p_interest_rate numeric, p_notes text, p_metadata jsonb) to service_role;

-- section 20: public.create_marketplace_lead(p_name text, p_phone text, p_cpf text, p_email text, p_vehicle_id uuid, p_down_payment numeric, p_installments integer)|service_role
grant execute on function public.create_marketplace_lead(p_name text, p_phone text, p_cpf text, p_email text, p_vehicle_id uuid, p_down_payment numeric, p_installments integer) to service_role;

-- section 20: public.current_app_role()|anon
grant execute on function public.current_app_role() to anon;

-- section 20: public.current_app_role()|authenticated
grant execute on function public.current_app_role() to authenticated;

-- section 20: public.current_app_role()|service_role
grant execute on function public.current_app_role() to service_role;

-- section 20: public.current_app_store_id()|anon
grant execute on function public.current_app_store_id() to anon;

-- section 20: public.current_app_store_id()|authenticated
grant execute on function public.current_app_store_id() to authenticated;

-- section 20: public.current_app_store_id()|service_role
grant execute on function public.current_app_store_id() to service_role;

-- section 20: public.current_app_user()|anon
grant execute on function public.current_app_user() to anon;

-- section 20: public.current_app_user()|authenticated
grant execute on function public.current_app_user() to authenticated;

-- section 20: public.current_app_user()|service_role
grant execute on function public.current_app_user() to service_role;

-- section 20: public.current_app_user_id()|anon
grant execute on function public.current_app_user_id() to anon;

-- section 20: public.current_app_user_id()|authenticated
grant execute on function public.current_app_user_id() to authenticated;

-- section 20: public.current_app_user_id()|service_role
grant execute on function public.current_app_user_id() to service_role;

-- section 20: public.is_commercial_team()|anon
grant execute on function public.is_commercial_team() to anon;

-- section 20: public.is_commercial_team()|authenticated
grant execute on function public.is_commercial_team() to authenticated;

-- section 20: public.is_commercial_team()|service_role
grant execute on function public.is_commercial_team() to service_role;

-- section 20: public.is_master()|anon
grant execute on function public.is_master() to anon;

-- section 20: public.is_master()|authenticated
grant execute on function public.is_master() to authenticated;

-- section 20: public.is_master()|service_role
grant execute on function public.is_master() to service_role;

-- section 20: public.is_store_user()|anon
grant execute on function public.is_store_user() to anon;

-- section 20: public.is_store_user()|authenticated
grant execute on function public.is_store_user() to authenticated;

-- section 20: public.is_store_user()|service_role
grant execute on function public.is_store_user() to service_role;

-- section 20: public.log_lead_activity_from_leads()|service_role
grant execute on function public.log_lead_activity_from_leads() to service_role;

-- section 20: public.pick_next_lead_store(p_routing_key text)|service_role
grant execute on function public.pick_next_lead_store(p_routing_key text) to service_role;

-- section 20: public.rls_auto_enable()|anon
grant execute on function public.rls_auto_enable() to anon;

-- section 20: public.rls_auto_enable()|authenticated
grant execute on function public.rls_auto_enable() to authenticated;

-- section 20: public.rls_auto_enable()|service_role
grant execute on function public.rls_auto_enable() to service_role;

-- section 20: public.save_portal_settings_transaction(p_actor_user_id uuid, p_settings jsonb)|service_role
grant execute on function public.save_portal_settings_transaction(p_actor_user_id uuid, p_settings jsonb) to service_role;

-- section 20: public.slugify_store_name(input text)|anon
grant execute on function public.slugify_store_name(input text) to anon;

-- section 20: public.slugify_store_name(input text)|authenticated
grant execute on function public.slugify_store_name(input text) to authenticated;

-- section 20: public.slugify_store_name(input text)|service_role
grant execute on function public.slugify_store_name(input text) to service_role;

-- section 20: public.slugify_text(input text)|anon
grant execute on function public.slugify_text(input text) to anon;

-- section 20: public.slugify_text(input text)|authenticated
grant execute on function public.slugify_text(input text) to authenticated;

-- section 20: public.slugify_text(input text)|service_role
grant execute on function public.slugify_text(input text) to service_role;

-- section 20: public.store_cancel_sale_transaction(p_lead_id uuid, p_store_id uuid, p_reason text, p_actor_user_id uuid, p_actor_name text)|service_role
grant execute on function public.store_cancel_sale_transaction(p_lead_id uuid, p_store_id uuid, p_reason text, p_actor_user_id uuid, p_actor_name text) to service_role;

-- section 20: public.store_confirm_sale_transaction(p_lead_id uuid, p_store_id uuid, p_seller_user_id uuid, p_vehicle_mode text, p_vehicle_id uuid, p_vehicle_name text, p_payment_type text, p_financing_bank text, p_has_trade_in boolean, p_sale_value numeric, p_installment_count integer, p_has_down_payment boolean, p_down_payment_value numeric, p_financed_amount numeric, p_installment_value numeric, p_actor_user_id uuid, p_actor_name text)|service_role
grant execute on function public.store_confirm_sale_transaction(p_lead_id uuid, p_store_id uuid, p_seller_user_id uuid, p_vehicle_mode text, p_vehicle_id uuid, p_vehicle_name text, p_payment_type text, p_financing_bank text, p_has_trade_in boolean, p_sale_value numeric, p_installment_count integer, p_has_down_payment boolean, p_down_payment_value numeric, p_financed_amount numeric, p_installment_value numeric, p_actor_user_id uuid, p_actor_name text) to service_role;

-- section 20: public.store_register_loss_transaction(p_lead_id uuid, p_store_id uuid, p_reason text, p_description text, p_actor_user_id uuid, p_actor_name text)|service_role
grant execute on function public.store_register_loss_transaction(p_lead_id uuid, p_store_id uuid, p_reason text, p_description text, p_actor_user_id uuid, p_actor_name text) to service_role;

-- section 20: public.store_update_commercial_transaction(p_lead_id uuid, p_store_id uuid, p_payment_type text, p_financing_bank text, p_sale_value numeric, p_installment_count integer, p_has_down_payment boolean, p_down_payment_value numeric, p_financed_amount numeric, p_installment_value numeric, p_has_trade_in boolean, p_actor_user_id uuid, p_actor_name text)|service_role
grant execute on function public.store_update_commercial_transaction(p_lead_id uuid, p_store_id uuid, p_payment_type text, p_financing_bank text, p_sale_value numeric, p_installment_count integer, p_has_down_payment boolean, p_down_payment_value numeric, p_financed_amount numeric, p_installment_value numeric, p_has_trade_in boolean, p_actor_user_id uuid, p_actor_name text) to service_role;

-- section 20: public.sync_event_inventory(p_event_id uuid)|service_role
grant execute on function public.sync_event_inventory(p_event_id uuid) to service_role;

-- section 20: public.sync_leads_base_event_scope()|service_role
grant execute on function public.sync_leads_base_event_scope() to service_role;

-- section 20: public.sync_new_vehicle_to_events_trigger()|service_role
grant execute on function public.sync_new_vehicle_to_events_trigger() to service_role;

-- section 20: public.sync_participation_inventory_trigger()|service_role
grant execute on function public.sync_participation_inventory_trigger() to service_role;

-- section 20: public.sync_sale_vehicle_from_lead()|service_role
grant execute on function public.sync_sale_vehicle_from_lead() to service_role;

-- section 20: public.sync_site_vehicle_sale_lifecycle()|service_role
grant execute on function public.sync_site_vehicle_sale_lifecycle() to service_role;

-- section 20: public.sync_site_vehicle_year_fields()|anon
grant execute on function public.sync_site_vehicle_year_fields() to anon;

-- section 20: public.sync_site_vehicle_year_fields()|authenticated
grant execute on function public.sync_site_vehicle_year_fields() to authenticated;

-- section 20: public.sync_site_vehicle_year_fields()|service_role
grant execute on function public.sync_site_vehicle_year_fields() to service_role;

-- section 20: public.touch_store_team_registration_links_updated_at()|anon
grant execute on function public.touch_store_team_registration_links_updated_at() to anon;

-- section 20: public.touch_store_team_registration_links_updated_at()|authenticated
grant execute on function public.touch_store_team_registration_links_updated_at() to authenticated;

-- section 20: public.touch_store_team_registration_links_updated_at()|service_role
grant execute on function public.touch_store_team_registration_links_updated_at() to service_role;

-- section 20: public.unaccent(regdictionary, text)|anon
grant execute on function public.unaccent(regdictionary, text) to anon;

-- section 20: public.unaccent(regdictionary, text)|authenticated
grant execute on function public.unaccent(regdictionary, text) to authenticated;

-- section 20: public.unaccent(regdictionary, text)|service_role
grant execute on function public.unaccent(regdictionary, text) to service_role;

-- section 20: public.unaccent(text)|anon
grant execute on function public.unaccent(text) to anon;

-- section 20: public.unaccent(text)|authenticated
grant execute on function public.unaccent(text) to authenticated;

-- section 20: public.unaccent(text)|service_role
grant execute on function public.unaccent(text) to service_role;

-- section 20: public.unaccent_init(internal)|anon
grant execute on function public.unaccent_init(internal) to anon;

-- section 20: public.unaccent_init(internal)|authenticated
grant execute on function public.unaccent_init(internal) to authenticated;

-- section 20: public.unaccent_init(internal)|service_role
grant execute on function public.unaccent_init(internal) to service_role;

-- section 20: public.unaccent_lexize(internal, internal, internal, internal)|anon
grant execute on function public.unaccent_lexize(internal, internal, internal, internal) to anon;

-- section 20: public.unaccent_lexize(internal, internal, internal, internal)|authenticated
grant execute on function public.unaccent_lexize(internal, internal, internal, internal) to authenticated;

-- section 20: public.unaccent_lexize(internal, internal, internal, internal)|service_role
grant execute on function public.unaccent_lexize(internal, internal, internal, internal) to service_role;

-- section 20: public.validate_lead_team_assignment()|service_role
grant execute on function public.validate_lead_team_assignment() to service_role;

-- section 20: public.vehicle_catalog_normalize_text(input_text text)|anon
grant execute on function public.vehicle_catalog_normalize_text(input_text text) to anon;

-- section 20: public.vehicle_catalog_normalize_text(input_text text)|authenticated
grant execute on function public.vehicle_catalog_normalize_text(input_text text) to authenticated;

-- section 20: public.vehicle_catalog_normalize_text(input_text text)|service_role
grant execute on function public.vehicle_catalog_normalize_text(input_text text) to service_role;

-- section 20: public.vehicle_catalog_remove_target_aliases()|anon
grant execute on function public.vehicle_catalog_remove_target_aliases() to anon;

-- section 20: public.vehicle_catalog_remove_target_aliases()|authenticated
grant execute on function public.vehicle_catalog_remove_target_aliases() to authenticated;

-- section 20: public.vehicle_catalog_remove_target_aliases()|service_role
grant execute on function public.vehicle_catalog_remove_target_aliases() to service_role;

-- section 20: public.vehicle_catalog_touch_updated_at()|anon
grant execute on function public.vehicle_catalog_touch_updated_at() to anon;

-- section 20: public.vehicle_catalog_touch_updated_at()|authenticated
grant execute on function public.vehicle_catalog_touch_updated_at() to authenticated;

-- section 20: public.vehicle_catalog_touch_updated_at()|service_role
grant execute on function public.vehicle_catalog_touch_updated_at() to service_role;

-- section 20: public.vehicle_catalog_validate_alias_target()|anon
grant execute on function public.vehicle_catalog_validate_alias_target() to anon;

-- section 20: public.vehicle_catalog_validate_alias_target()|authenticated
grant execute on function public.vehicle_catalog_validate_alias_target() to authenticated;

-- section 20: public.vehicle_catalog_validate_alias_target()|service_role
grant execute on function public.vehicle_catalog_validate_alias_target() to service_role;

commit;

