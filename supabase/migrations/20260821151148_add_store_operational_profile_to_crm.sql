-- Version reconciled with the migration history already recorded in CRM Production.
-- The DDL below was applied to project wufikrdgyxrsszlbpfmv under version 20260821151148.
-- This file preserves repository/database parity; it must not be reapplied manually.

alter table public.stores
  add column timezone text not null default 'America/Sao_Paulo',
  add column postal_code text,
  add column location_label text,
  add column latitude numeric(9,6),
  add column longitude numeric(9,6),
  add column maps_url text,
  add column waze_url text,
  add column weekly_hours jsonb not null default '{}'::jsonb,
  add column special_hours jsonb not null default '[]'::jsonb,
  add column default_visit_duration_minutes integer not null default 60,
  add column operational_profile_updated_at timestamptz,
  add column operational_profile_updated_by uuid;

alter table public.stores
  add constraint stores_timezone_nonempty_check
    check (length(btrim(timezone)) > 0),
  add constraint stores_latitude_check
    check (latitude is null or (latitude >= -90 and latitude <= 90)),
  add constraint stores_longitude_check
    check (longitude is null or (longitude >= -180 and longitude <= 180)),
  add constraint stores_weekly_hours_object_check
    check (jsonb_typeof(weekly_hours) = 'object'),
  add constraint stores_special_hours_array_check
    check (jsonb_typeof(special_hours) = 'array'),
  add constraint stores_default_visit_duration_check
    check (default_visit_duration_minutes between 15 and 480);

comment on column public.stores.timezone is 'IANA timezone used for store operating hours and scheduling.';
comment on column public.stores.weekly_hours is 'Canonical weekly operating intervals keyed by weekday.';
comment on column public.stores.special_hours is 'Canonical dated closures or exceptional operating intervals.';
comment on column public.stores.default_visit_duration_minutes is 'Default duration used when checking visit/test-drive availability.';
comment on column public.stores.operational_profile_updated_by is 'Application profile UUID that last updated the operational profile; intentionally not cross-constrained.';
