-- Phase 2E.2: harden event landing storage and trigger functions.

-- Public buckets serve object URLs without a broad storage.objects SELECT policy.
drop policy if exists campaign_assets_public_select on storage.objects;

-- Trigger functions are internal database implementation details and must not be callable through RPC.
revoke all on function public.sync_participation_inventory_trigger() from public, anon, authenticated;
revoke all on function public.sync_new_vehicle_to_events_trigger() from public, anon, authenticated;
