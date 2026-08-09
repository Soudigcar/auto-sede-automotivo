begin;

create index if not exists store_portal_applications_approved_store_idx
  on public.store_portal_applications (approved_store_id)
  where approved_store_id is not null;

create index if not exists store_portal_applications_reviewed_by_idx
  on public.store_portal_applications (reviewed_by)
  where reviewed_by is not null;

commit;

