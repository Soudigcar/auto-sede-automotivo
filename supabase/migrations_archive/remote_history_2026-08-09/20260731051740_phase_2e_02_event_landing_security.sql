drop policy if exists campaign_assets_public_select on storage.objects;
revoke all on function public.sync_participation_inventory_trigger() from public, anon, authenticated;
revoke all on function public.sync_new_vehicle_to_events_trigger() from public, anon, authenticated;

