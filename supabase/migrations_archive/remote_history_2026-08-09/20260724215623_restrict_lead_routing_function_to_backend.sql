revoke all on function public.pick_next_lead_store(text) from public;
revoke all on function public.pick_next_lead_store(text) from anon;
revoke all on function public.pick_next_lead_store(text) from authenticated;
grant execute on function public.pick_next_lead_store(text) to service_role;

