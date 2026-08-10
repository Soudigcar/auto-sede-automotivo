begin;

alter table public.site_vehicles
  add column if not exists manufacture_year integer,
  add column if not exists model_year integer;

alter table public.site_vehicles
  drop constraint if exists site_vehicles_manufacture_year_check,
  drop constraint if exists site_vehicles_model_year_check,
  drop constraint if exists site_vehicles_year_order_check;

alter table public.site_vehicles
  add constraint site_vehicles_manufacture_year_check
    check (manufacture_year is null or manufacture_year between 1886 and 2200),
  add constraint site_vehicles_model_year_check
    check (model_year is null or model_year between 1886 and 2200),
  add constraint site_vehicles_year_order_check
    check (
      manufacture_year is null
      or model_year is null
      or model_year between manufacture_year - 1 and manufacture_year + 2
    );

-- Compatibilidade com os registros atuais:
-- 2010/2011 -> fabricação 2010 e modelo 2011.
-- 2021      -> somente ano-modelo 2021; o ano de fabricação não é inventado.
with parsed as (
  select
    id,
    case
      when btrim(coalesce(year, '')) ~ '([12][0-9]{3})[[:space:]]*[/|_-][[:space:]]*([12][0-9]{3})'
        then ((regexp_match(btrim(year), '([12][0-9]{3})[[:space:]]*[/|_-][[:space:]]*([12][0-9]{3})'))[1])::integer
      else null
    end as parsed_manufacture_year,
    case
      when btrim(coalesce(year, '')) ~ '([12][0-9]{3})[[:space:]]*[/|_-][[:space:]]*([12][0-9]{3})'
        then ((regexp_match(btrim(year), '([12][0-9]{3})[[:space:]]*[/|_-][[:space:]]*([12][0-9]{3})'))[2])::integer
      when btrim(coalesce(year, '')) ~ '([12][0-9]{3})'
        then ((regexp_match(btrim(year), '([12][0-9]{3})'))[1])::integer
      else null
    end as parsed_model_year
  from public.site_vehicles
)
update public.site_vehicles as vehicle
set
  manufacture_year = coalesce(vehicle.manufacture_year, parsed.parsed_manufacture_year),
  model_year = coalesce(vehicle.model_year, parsed.parsed_model_year)
from parsed
where parsed.id = vehicle.id
  and (vehicle.manufacture_year is null or vehicle.model_year is null);

create or replace function public.sync_site_vehicle_year_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  legacy_year text := btrim(coalesce(new.year, ''));
  pair_parts text[];
  single_part text[];
  legacy_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    legacy_changed := new.year is distinct from old.year
      and new.manufacture_year is not distinct from old.manufacture_year
      and new.model_year is not distinct from old.model_year;
  end if;

  if legacy_changed then
    new.manufacture_year := null;
    new.model_year := null;
  end if;

  if new.manufacture_year is null and new.model_year is null and legacy_year <> '' then
    pair_parts := regexp_match(
      legacy_year,
      '([12][0-9]{3})[[:space:]]*[/|_-][[:space:]]*([12][0-9]{3})'
    );

    if pair_parts is not null then
      new.manufacture_year := pair_parts[1]::integer;
      new.model_year := pair_parts[2]::integer;
    else
      single_part := regexp_match(legacy_year, '([12][0-9]{3})');
      if single_part is not null then
        -- Um único ano é tratado como ano-modelo. O ano de fabricação permanece nulo.
        new.model_year := single_part[1]::integer;
      end if;
    end if;
  end if;

  if new.manufacture_year is not null and new.model_year is not null then
    new.year := case
      when new.manufacture_year = new.model_year then new.model_year::text
      else new.manufacture_year::text || '/' || new.model_year::text
    end;
  elsif new.model_year is not null then
    new.year := new.model_year::text;
  elsif new.manufacture_year is not null then
    new.year := new.manufacture_year::text;
  else
    new.year := nullif(legacy_year, '');
  end if;

  return new;
end;
$$;

drop trigger if exists site_vehicles_sync_year_fields on public.site_vehicles;
create trigger site_vehicles_sync_year_fields
before insert or update of year, manufacture_year, model_year
on public.site_vehicles
for each row
execute function public.sync_site_vehicle_year_fields();

create index if not exists site_vehicles_manufacture_year_idx
  on public.site_vehicles (manufacture_year)
  where manufacture_year is not null;

create index if not exists site_vehicles_model_year_idx
  on public.site_vehicles (model_year)
  where model_year is not null;

comment on column public.site_vehicles.manufacture_year is
  'Ano de fabricação do veículo. Pode permanecer nulo quando o anúncio informa apenas o ano-modelo.';
comment on column public.site_vehicles.model_year is
  'Ano-modelo do veículo.';
comment on column public.site_vehicles.year is
  'Campo legado de exibição, mantido sincronizado com manufacture_year e model_year.';

commit;
