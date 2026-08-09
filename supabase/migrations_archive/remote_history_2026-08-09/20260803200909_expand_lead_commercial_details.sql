alter table public.lead_commercial_details
  add column if not exists has_driver_license boolean,
  add column if not exists cpf text,
  add column if not exists birth_date date,
  add column if not exists trade_vehicle_configuration_id uuid,
  add column if not exists trade_vehicle_name text,
  add column if not exists trade_vehicle_manufacture_year integer,
  add column if not exists trade_vehicle_model_year integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lead_commercial_details_trade_vehicle_configuration_id_fkey'
      and conrelid = 'public.lead_commercial_details'::regclass
  ) then
    alter table public.lead_commercial_details
      add constraint lead_commercial_details_trade_vehicle_configuration_id_fkey
      foreign key (trade_vehicle_configuration_id)
      references public.vehicle_catalog_configurations(id)
      on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lead_commercial_details_cpf_format_check'
      and conrelid = 'public.lead_commercial_details'::regclass
  ) then
    alter table public.lead_commercial_details
      add constraint lead_commercial_details_cpf_format_check
      check (cpf is null or cpf ~ '^[0-9]{11}$');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lead_commercial_details_birth_date_check'
      and conrelid = 'public.lead_commercial_details'::regclass
  ) then
    alter table public.lead_commercial_details
      add constraint lead_commercial_details_birth_date_check
      check (birth_date is null or (birth_date >= date '1900-01-01' and birth_date <= current_date));
  end if;
end
$$;

create index if not exists idx_lead_commercial_details_trade_vehicle_configuration_id
  on public.lead_commercial_details (trade_vehicle_configuration_id);

comment on column public.lead_commercial_details.has_driver_license is
  'Indica se o cliente declarou possuir CNH.';
comment on column public.lead_commercial_details.cpf is
  'CPF do cliente normalizado com 11 dígitos. A API deve restringir acesso e não registrar o valor em logs.';
comment on column public.lead_commercial_details.birth_date is
  'Data de nascimento declarada pelo cliente.';
comment on column public.lead_commercial_details.trade_vehicle_configuration_id is
  'Configuração do catálogo Master selecionada para o veículo recebido na troca.';
comment on column public.lead_commercial_details.trade_vehicle_name is
  'Snapshot legível do veículo selecionado para troca.';

