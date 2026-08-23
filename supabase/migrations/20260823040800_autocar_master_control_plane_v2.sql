create table if not exists public.ai_global_capability_policies (
  capability text primary key,
  effect text not null check (effect in ('allow','deny','approval','handoff')),
  reason text,
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_global_capability_policies_capability_check check (capability in (
    'respond_first_contact','qualify_lead','consult_stock','send_vehicles','send_photos','send_location',
    'respond_audio_with_audio','schedule_visit','schedule_test_drive','set_active_vehicle_interest',
    'create_follow_up','transfer_lead','alter_pipeline','negotiate_price','grant_discount',
    'alter_stock_price','confirm_sale','promise_credit_approval','final_trade_appraisal'
  ))
);

create table if not exists public.ai_model_pricing (
  model text primary key,
  input_brl_per_million numeric,
  output_brl_per_million numeric,
  audio_brl_per_minute numeric,
  image_brl_per_unit numeric,
  source_note text,
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_model_pricing_nonnegative_check check (
    (input_brl_per_million is null or input_brl_per_million >= 0)
    and (output_brl_per_million is null or output_brl_per_million >= 0)
    and (audio_brl_per_minute is null or audio_brl_per_minute >= 0)
    and (image_brl_per_unit is null or image_brl_per_unit >= 0)
  )
);

create table if not exists public.ai_master_control_plane_audit (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('global_policy','model_pricing')),
  record_key text not null,
  previous_value jsonb,
  new_value jsonb not null,
  actor_profile_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists ai_master_control_plane_audit_created_idx
  on public.ai_master_control_plane_audit(created_at desc);

create or replace function private.touch_autocar_master_control_plane()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.audit_autocar_master_control_plane()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.ai_master_control_plane_audit (
    area, record_key, previous_value, new_value, actor_profile_id
  ) values (
    case when tg_table_name = 'ai_global_capability_policies' then 'global_policy' else 'model_pricing' end,
    case when tg_table_name = 'ai_global_capability_policies' then new.capability else new.model end,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    coalesce(new.updated_by_profile_id, new.created_by_profile_id)
  );
  return new;
end;
$$;

create or replace function private.prevent_autocar_master_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  raise exception using errcode = '42501', message = 'AUTOCAR Master Control Plane audit is append-only.';
end;
$$;

drop trigger if exists ai_global_capability_policies_updated_at on public.ai_global_capability_policies;
create trigger ai_global_capability_policies_updated_at
before update on public.ai_global_capability_policies
for each row execute function private.touch_autocar_master_control_plane();

drop trigger if exists ai_model_pricing_updated_at on public.ai_model_pricing;
create trigger ai_model_pricing_updated_at
before update on public.ai_model_pricing
for each row execute function private.touch_autocar_master_control_plane();

drop trigger if exists ai_global_capability_policies_audit on public.ai_global_capability_policies;
create trigger ai_global_capability_policies_audit
after insert or update on public.ai_global_capability_policies
for each row execute function private.audit_autocar_master_control_plane();

drop trigger if exists ai_model_pricing_audit on public.ai_model_pricing;
create trigger ai_model_pricing_audit
after insert or update on public.ai_model_pricing
for each row execute function private.audit_autocar_master_control_plane();

drop trigger if exists ai_master_control_plane_audit_append_only on public.ai_master_control_plane_audit;
create trigger ai_master_control_plane_audit_append_only
before update or delete on public.ai_master_control_plane_audit
for each row execute function private.prevent_autocar_master_audit_mutation();

create or replace function private.enforce_autocar_global_capability_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  master_effect text;
begin
  if coalesce(new.direction, '') <> 'outbound'
    or coalesce(new.status, '') not in ('claimed','ready')
    or new.policy_capability is null
    or coalesce(new.purpose, '') not like 'live_%'
  then
    return new;
  end if;

  -- SAFE CORE: human handoff is a safety path and cannot be disabled by commercial governance.
  if new.policy_capability = 'transfer_lead' and new.purpose = 'live_human_handoff' then
    return new;
  end if;

  select p.effect into master_effect
  from public.ai_global_capability_policies p
  where p.capability = new.policy_capability
    and p.is_active = true
  limit 1;

  if master_effect is null or master_effect = 'allow' then
    return new;
  end if;

  raise exception using
    errcode = '42501',
    message = format(
      'AUTOCAR global Master policy blocked LIVE execution: capability=%s effect=%s',
      new.policy_capability,
      master_effect
    );
end;
$$;

drop trigger if exists ai_runtime_message_claims_global_capability_ceiling
  on public.ai_runtime_message_claims;
create trigger ai_runtime_message_claims_global_capability_ceiling
before insert or update of direction, status, policy_capability, purpose
on public.ai_runtime_message_claims
for each row execute function private.enforce_autocar_global_capability_ceiling();

alter table public.ai_global_capability_policies enable row level security;
alter table public.ai_model_pricing enable row level security;
alter table public.ai_master_control_plane_audit enable row level security;

create policy service_only_deny_client_access on public.ai_global_capability_policies
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy service_only_deny_client_access on public.ai_model_pricing
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy service_only_deny_client_access on public.ai_master_control_plane_audit
  as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on table public.ai_global_capability_policies from anon, authenticated;
revoke all on table public.ai_model_pricing from anon, authenticated;
revoke all on table public.ai_master_control_plane_audit from anon, authenticated;
revoke all on table public.ai_global_capability_policies from service_role;
revoke all on table public.ai_model_pricing from service_role;
revoke all on table public.ai_master_control_plane_audit from service_role;
grant select, insert, update on table public.ai_global_capability_policies to service_role;
grant select, insert, update on table public.ai_model_pricing to service_role;
grant select, insert on table public.ai_master_control_plane_audit to service_role;

revoke execute on function private.touch_autocar_master_control_plane() from public, anon, authenticated;
revoke execute on function private.audit_autocar_master_control_plane() from public, anon, authenticated;
revoke execute on function private.prevent_autocar_master_audit_mutation() from public, anon, authenticated;
revoke execute on function private.enforce_autocar_global_capability_ceiling() from public, anon, authenticated;

comment on table public.ai_global_capability_policies is
  'Master ceiling for AUTOCAR capabilities. Hard SAFE CORE policies remain authoritative above these rows.';
comment on table public.ai_model_pricing is
  'Versioned Master-governed internal AI cost table. Commercial billing and credits remain in CRM/SaaS.';
comment on table public.ai_master_control_plane_audit is
  'Append-only audit trail for Master global policy and model pricing changes.';
comment on function private.enforce_autocar_global_capability_ceiling() is
  'Fail-closed claim-boundary guard. Blocks LIVE outbound execution when the Master ceiling is not allow; SAFE CORE human handoff remains available.';
