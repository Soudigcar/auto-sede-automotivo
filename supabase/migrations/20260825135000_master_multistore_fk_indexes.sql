-- Cover the two non-unique foreign keys introduced by multistore V1.
-- The canonical/store and lead relationships are already covered by unique/indexed keys.

create index if not exists lead_store_instances_source_base_idx
  on public.lead_store_instances(source_base_lead_id)
  where source_base_lead_id is not null;

create index if not exists lead_store_instances_created_by_idx
  on public.lead_store_instances(created_by)
  where created_by is not null;
