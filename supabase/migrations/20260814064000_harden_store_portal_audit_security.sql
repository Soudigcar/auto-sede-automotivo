alter view public.store_portal_audit set (security_invoker = true);

revoke all on table public.store_portal_audit from anon;
revoke all on table public.store_portal_audit from authenticated;

grant select on table public.store_portal_audit to service_role;
