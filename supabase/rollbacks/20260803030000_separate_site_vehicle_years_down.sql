begin;

-- O campo legado public.site_vehicles.year já contém a representação combinada,
-- portanto a reversão remove somente a estrutura nova sem apagar a exibição existente.
drop trigger if exists site_vehicles_sync_year_fields on public.site_vehicles;
drop function if exists public.sync_site_vehicle_year_fields();

drop index if exists public.site_vehicles_manufacture_year_idx;
drop index if exists public.site_vehicles_model_year_idx;

alter table public.site_vehicles
  drop constraint if exists site_vehicles_manufacture_year_check,
  drop constraint if exists site_vehicles_model_year_check,
  drop constraint if exists site_vehicles_year_order_check,
  drop column if exists manufacture_year,
  drop column if exists model_year;

commit;
