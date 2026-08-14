-- AUTO CONTROLE AUTOMOTIVO
-- Restrict sensitive SECURITY DEFINER RPCs to service_role only.

revoke execute on function public.claim_lead_ingestion_lock(text, text, integer) from public;
revoke execute on function public.claim_lead_ingestion_lock(text, text, integer) from anon;
revoke execute on function public.claim_lead_ingestion_lock(text, text, integer) from authenticated;
grant execute on function public.claim_lead_ingestion_lock(text, text, integer) to service_role;

revoke execute on function public.pick_next_lead_store_by_event(uuid, text) from public;
revoke execute on function public.pick_next_lead_store_by_event(uuid, text) from anon;
revoke execute on function public.pick_next_lead_store_by_event(uuid, text) from authenticated;
grant execute on function public.pick_next_lead_store_by_event(uuid, text) to service_role;
