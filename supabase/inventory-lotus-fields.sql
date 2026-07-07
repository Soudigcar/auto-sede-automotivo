alter table public.inventory add column if not exists vehicle_code varchar(100);
alter table public.inventory add column if not exists location text;
alter table public.inventory add column if not exists mileage integer;
alter table public.inventory add column if not exists fuel varchar(50);
alter table public.inventory add column if not exists fipe_price numeric(12,2);
alter table public.inventory add column if not exists web_price numeric(12,2);

create index if not exists idx_inventory_vehicle_code on public.inventory(vehicle_code);
create index if not exists idx_inventory_plate on public.inventory(plate);
