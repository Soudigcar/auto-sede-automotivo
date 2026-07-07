create index if not exists idx_stores_event_id on public.stores(event_id);
create index if not exists idx_stores_responsible_email on public.stores(responsible_email);
create index if not exists idx_sales_store_id on public.sales(store_id);
create index if not exists idx_sales_store_event on public.sales(store_id, event_id);
create index if not exists idx_inventory_store_event on public.inventory(store_id, event_id);
