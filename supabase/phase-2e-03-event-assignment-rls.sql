-- Phase 2E.3: public landing reads assignments through the server API with service_role.
-- Direct anonymous table reads are unnecessary and create redundant permissive RLS evaluation.

drop policy if exists event_vehicle_assignments_public_select on public.event_vehicle_assignments;
