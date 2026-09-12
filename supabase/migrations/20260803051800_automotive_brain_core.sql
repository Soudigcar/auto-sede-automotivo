-- Migration 1: Automotive Brain core
-- Project: Auto Controle Automotivo / Master environment
-- Status: DRAFT FOR REVIEW - NOT APPLIED TO PRODUCTION
-- PostgreSQL 17 / Supabase

-- -----------------------------------------------------------------------------
-- 1. Rules and immutable rule versions
-- -----------------------------------------------------------------------------

create table public.automotive_brain_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  rule_type text not null,
  match_type text not null,
  pattern text not null,
  output_payload jsonb not null default '{}'::jsonb,
  brand_id uuid references public.vehicle_catalog_brands(id),
  model_id uuid references public.vehicle_catalog_models(id),
  version_id uuid references public.vehicle_catalog_versions(id),
  priority integer not null default 100,
  minimum_confidence numeric(5,2) not null default 80,
  status text not null default 'draft',
  version_number integer not null default 1,
  valid_from timestamptz,
  valid_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint automotive_brain_rules_code_not_blank
    check (btrim(code) <> ''),
  constraint automotive_brain_rules_name_not_blank
    check (btrim(name) <> ''),
  constraint automotive_brain_rules_pattern_not_blank
    check (btrim(pattern) <> ''),
  constraint automotive_brain_rules_rule_type_check
    check (rule_type in (
      'abbreviation',
      'equivalence',
      'validation',
      'transformation',
      'inference_guard'
    )),
  constraint automotive_brain_rules_match_type_check
    check (match_type in (
      'exact',
      'starts_with',
      'ends_with',
      'contains',
      'regex',
      'contextual',
      'composite'
    )),
  constraint automotive_brain_rules_status_check
    check (status in (
      'draft',
      'under_review',
      'approved',
      'rejected',
      'revoked'
    )),
  constraint automotive_brain_rules_priority_check
    check (priority between 0 and 1000),
  constraint automotive_brain_rules_confidence_check
    check (minimum_confidence between 0 and 100),
  constraint automotive_brain_rules_version_check
    check (version_number >= 1),
  constraint automotive_brain_rules_payload_object_check
    check (jsonb_typeof(output_payload) = 'object'),
  constraint automotive_brain_rules_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint automotive_brain_rules_validity_check
    check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint automotive_brain_rules_approval_check
    check (
      status <> 'approved'
      or (approved_by is not null and approved_at is not null)
    )
);

comment on table public.automotive_brain_rules is
  'Regras estruturadas e versionadas do Cerebro Automotivo. Aprovacao exclusiva do Master.';
comment on column public.automotive_brain_rules.output_payload is
  'Resultado estruturado da regra, como motor, cambio, combustivel ou ano normalizado.';
comment on column public.automotive_brain_rules.metadata is
  'Metadados auxiliares. Pode conter change_reason durante uma alteracao revisada.';

create table public.automotive_brain_rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automotive_brain_rules(id) on delete cascade,
  version_number integer not null,
  rule_snapshot jsonb not null,
  change_reason text,
  changed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint automotive_brain_rule_versions_version_check
    check (version_number >= 1),
  constraint automotive_brain_rule_versions_snapshot_object_check
    check (jsonb_typeof(rule_snapshot) = 'object'),
  constraint automotive_brain_rule_versions_unique
    unique (rule_id, version_number)
);

comment on table public.automotive_brain_rule_versions is
  'Historico imutavel de todas as versoes das regras do Cerebro Automotivo.';

-- -----------------------------------------------------------------------------
-- 2. Source priorities
-- -----------------------------------------------------------------------------

create table public.automotive_brain_source_priorities (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  field_key text not null,
  weight numeric(5,2) not null default 50,
  minimum_confidence numeric(5,2) not null default 0,
  can_fill_missing boolean not null default true,
  can_override_explicit boolean not null default false,
  requires_review_on_conflict boolean not null default true,
  brand_id uuid references public.vehicle_catalog_brands(id),
  model_id uuid references public.vehicle_catalog_models(id),
  version_id uuid references public.vehicle_catalog_versions(id),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint automotive_brain_source_priorities_source_not_blank
    check (btrim(source_key) <> ''),
  constraint automotive_brain_source_priorities_field_not_blank
    check (btrim(field_key) <> ''),
  constraint automotive_brain_source_priorities_weight_check
    check (weight between 0 and 100),
  constraint automotive_brain_source_priorities_confidence_check
    check (minimum_confidence between 0 and 100),
  constraint automotive_brain_source_priorities_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.automotive_brain_source_priorities is
  'Peso e comportamento de cada fonte por campo, com escopo global ou por marca/modelo/versao.';

create unique index automotive_brain_source_priorities_scope_uidx
  on public.automotive_brain_source_priorities (
    source_key,
    field_key,
    brand_id,
    model_id,
    version_id
  ) nulls not distinct;

-- -----------------------------------------------------------------------------
-- 3. Analysis runs
-- -----------------------------------------------------------------------------

create table public.automotive_brain_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null,
  status text not null default 'queued',
  scope jsonb not null default '{}'::jsonb,
  config_snapshot jsonb not null default '{}'::jsonb,
  initiated_by uuid references public.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  processed_records integer not null default 0,
  successful_records integer not null default 0,
  conflict_records integer not null default 0,
  error_records integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint automotive_brain_analysis_runs_trigger_check
    check (trigger_type in (
      'manual',
      'scheduled',
      'vehicle_import',
      'market_collection',
      'catalog_review',
      'store_correction'
    )),
  constraint automotive_brain_analysis_runs_status_check
    check (status in (
      'queued',
      'running',
      'completed',
      'partial',
      'failed',
      'cancelled'
    )),
  constraint automotive_brain_analysis_runs_scope_object_check
    check (jsonb_typeof(scope) = 'object'),
  constraint automotive_brain_analysis_runs_config_object_check
    check (jsonb_typeof(config_snapshot) = 'object'),
  constraint automotive_brain_analysis_runs_summary_object_check
    check (jsonb_typeof(summary) = 'object'),
  constraint automotive_brain_analysis_runs_errors_object_check
    check (jsonb_typeof(error_details) = 'object'),
  constraint automotive_brain_analysis_runs_counts_check
    check (
      processed_records >= 0
      and successful_records >= 0
      and conflict_records >= 0
      and error_records >= 0
    ),
  constraint automotive_brain_analysis_runs_dates_check
    check (finished_at is null or started_at is null or finished_at >= started_at)
);

comment on table public.automotive_brain_analysis_runs is
  'Cada execucao manual ou automatica do motor de analise do Cerebro Automotivo.';

-- -----------------------------------------------------------------------------
-- 4. Field decisions and their evidence
-- -----------------------------------------------------------------------------

create table public.automotive_brain_decisions (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null
    references public.automotive_brain_analysis_runs(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  inventory_id uuid,
  site_vehicle_id uuid,
  market_listing_id uuid,
  target_snapshot jsonb not null default '{}'::jsonb,
  field_name text not null,
  original_value jsonb,
  proposed_value jsonb not null,
  final_value jsonb,
  confidence_score numeric(5,2) not null,
  decision_status text not null default 'suggested',
  primary_source text,
  rule_id uuid references public.automotive_brain_rules(id) on delete set null,
  explanation text,
  resolution_notes text,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint automotive_brain_decisions_target_check
    check (num_nonnulls(inventory_id, site_vehicle_id, market_listing_id) = 1),
  constraint automotive_brain_decisions_field_not_blank
    check (btrim(field_name) <> ''),
  constraint automotive_brain_decisions_confidence_check
    check (confidence_score between 0 and 100),
  constraint automotive_brain_decisions_status_check
    check (decision_status in (
      'suggested',
      'automatically_accepted',
      'waiting_review',
      'accepted',
      'rejected',
      'overridden',
      'cancelled'
    )),
  constraint automotive_brain_decisions_snapshot_object_check
    check (jsonb_typeof(target_snapshot) = 'object'),
  constraint automotive_brain_decisions_resolution_check
    check (
      decision_status not in ('accepted', 'rejected', 'overridden', 'cancelled')
      or resolved_at is not null
    )
);

comment on table public.automotive_brain_decisions is
  'Decisoes por campo, incluindo valor original, sugestao, valor final, confianca e explicacao.';
comment on column public.automotive_brain_decisions.market_listing_id is
  'Identificador logico de anuncio externo. A FK sera adicionada na migration de mercado.';
comment on column public.automotive_brain_decisions.inventory_id is
  'Identificador historico do registro em inventory; sem FK para preservar auditoria apos exclusao da origem.';
comment on column public.automotive_brain_decisions.site_vehicle_id is
  'Identificador historico do registro em site_vehicles; sem FK para preservar auditoria apos exclusao da origem.';

create unique index automotive_brain_decisions_run_target_field_uidx
  on public.automotive_brain_decisions (
    analysis_run_id,
    field_name,
    inventory_id,
    site_vehicle_id,
    market_listing_id
  ) nulls not distinct;

create table public.automotive_brain_evidence (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null
    references public.automotive_brain_decisions(id) on delete cascade,
  source_key text not null,
  source_reference text,
  raw_excerpt text,
  normalized_value jsonb,
  evidence_strength numeric(5,2) not null default 50,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint automotive_brain_evidence_source_not_blank
    check (btrim(source_key) <> ''),
  constraint automotive_brain_evidence_strength_check
    check (evidence_strength between 0 and 100),
  constraint automotive_brain_evidence_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.automotive_brain_evidence is
  'Evidencias imutaveis usadas para justificar cada decisao do Cerebro Automotivo.';

-- -----------------------------------------------------------------------------
-- 5. Conflicts / divergences
-- -----------------------------------------------------------------------------

create table public.automotive_brain_conflicts (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null
    references public.automotive_brain_analysis_runs(id) on delete cascade,
  decision_id uuid references public.automotive_brain_decisions(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  inventory_id uuid,
  site_vehicle_id uuid,
  market_listing_id uuid,
  target_snapshot jsonb not null default '{}'::jsonb,
  field_name text not null,
  conflict_type text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  values_by_source jsonb not null default '{}'::jsonb,
  recommended_value jsonb,
  confidence_score numeric(5,2),
  assigned_to uuid references public.users(id) on delete set null,
  resolution_payload jsonb not null default '{}'::jsonb,
  resolution_notes text,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint automotive_brain_conflicts_target_check
    check (num_nonnulls(inventory_id, site_vehicle_id, market_listing_id) = 1),
  constraint automotive_brain_conflicts_field_not_blank
    check (btrim(field_name) <> ''),
  constraint automotive_brain_conflicts_type_not_blank
    check (btrim(conflict_type) <> ''),
  constraint automotive_brain_conflicts_severity_check
    check (severity in ('critical', 'high', 'medium', 'low')),
  constraint automotive_brain_conflicts_status_check
    check (status in (
      'open',
      'under_review',
      'waiting_store',
      'resolved',
      'ignored',
      'converted_to_learning'
    )),
  constraint automotive_brain_conflicts_confidence_check
    check (confidence_score is null or confidence_score between 0 and 100),
  constraint automotive_brain_conflicts_snapshot_object_check
    check (jsonb_typeof(target_snapshot) = 'object'),
  constraint automotive_brain_conflicts_values_object_check
    check (jsonb_typeof(values_by_source) = 'object'),
  constraint automotive_brain_conflicts_resolution_object_check
    check (jsonb_typeof(resolution_payload) = 'object'),
  constraint automotive_brain_conflicts_resolution_date_check
    check (
      status not in ('resolved', 'ignored', 'converted_to_learning')
      or resolved_at is not null
    )
);

comment on table public.automotive_brain_conflicts is
  'Central Master de divergencias entre anuncio, catalogo, FIPE, loja, regras e IA.';
comment on column public.automotive_brain_conflicts.market_listing_id is
  'Identificador logico de anuncio externo. A FK sera adicionada na migration de mercado.';

create unique index automotive_brain_conflicts_run_target_type_uidx
  on public.automotive_brain_conflicts (
    analysis_run_id,
    field_name,
    conflict_type,
    inventory_id,
    site_vehicle_id,
    market_listing_id
  ) nulls not distinct;

-- -----------------------------------------------------------------------------
-- 6. Validation, versioning and audit trigger functions
-- -----------------------------------------------------------------------------

create or replace function public.automotive_brain_validate_catalog_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  expected_model_id uuid;
  expected_brand_id uuid;
begin
  if new.version_id is not null then
    select v.model_id, m.brand_id
      into expected_model_id, expected_brand_id
    from public.vehicle_catalog_versions v
    join public.vehicle_catalog_models m on m.id = v.model_id
    where v.id = new.version_id;

    if not found then
      raise exception 'Versao de catalogo inexistente: %', new.version_id;
    end if;

    if new.model_id is not null and new.model_id <> expected_model_id then
      raise exception 'A versao informada nao pertence ao modelo informado';
    end if;

    if new.brand_id is not null and new.brand_id <> expected_brand_id then
      raise exception 'A versao informada nao pertence a marca informada';
    end if;

    new.model_id := expected_model_id;
    new.brand_id := expected_brand_id;

  elsif new.model_id is not null then
    select m.brand_id
      into expected_brand_id
    from public.vehicle_catalog_models m
    where m.id = new.model_id;

    if not found then
      raise exception 'Modelo de catalogo inexistente: %', new.model_id;
    end if;

    if new.brand_id is not null and new.brand_id <> expected_brand_id then
      raise exception 'O modelo informado nao pertence a marca informada';
    end if;

    new.brand_id := expected_brand_id;
  end if;

  return new;
end;
$$;

create or replace function public.automotive_brain_prepare_rule_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version_number := old.version_number + 1;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.automotive_brain_snapshot_rule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.automotive_brain_rule_versions (
    rule_id,
    version_number,
    rule_snapshot,
    change_reason,
    changed_by
  ) values (
    new.id,
    new.version_number,
    to_jsonb(new),
    coalesce(
      new.metadata ->> 'change_reason',
      case when tg_op = 'INSERT' then 'initial_creation' else 'rule_updated' end
    ),
    coalesce(new.updated_by, new.created_by, public.current_app_user_id())
  );

  return new;
end;
$$;

create or replace function public.automotive_brain_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.automotive_brain_write_audit_log()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_user_id uuid;
  request_headers jsonb;
  entity_uuid uuid;
  old_payload jsonb;
  new_payload jsonb;
begin
  actor_user_id := public.current_app_user_id();

  -- Automated service-role processing is recorded in analysis tables and is not
  -- duplicated into audit_logs. Human Master actions are audited here.
  if actor_user_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  old_payload := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_payload := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  entity_uuid := coalesce(
    nullif(new_payload ->> 'id', '')::uuid,
    nullif(old_payload ->> 'id', '')::uuid
  );

  request_headers := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );

  insert into public.audit_logs (
    user_id,
    user_role,
    action_type,
    entity_type,
    entity_id,
    old_value,
    new_value,
    ip_address,
    user_agent
  ) values (
    actor_user_id,
    public.current_app_role(),
    'automotive_brain_' || lower(tg_op),
    tg_table_name,
    entity_uuid,
    old_payload,
    new_payload,
    nullif(split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1), ''),
    request_headers ->> 'user-agent'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Triggers
-- -----------------------------------------------------------------------------

create trigger automotive_brain_rules_10_validate_scope
before insert or update of brand_id, model_id, version_id
on public.automotive_brain_rules
for each row execute function public.automotive_brain_validate_catalog_scope();

create trigger automotive_brain_rules_20_prepare_update
before update
on public.automotive_brain_rules
for each row execute function public.automotive_brain_prepare_rule_update();

create trigger automotive_brain_rules_30_snapshot
  after insert or update
  on public.automotive_brain_rules
  for each row execute function public.automotive_brain_snapshot_rule();

create trigger automotive_brain_rules_90_audit
  after insert or update
  on public.automotive_brain_rules
  for each row execute function public.automotive_brain_write_audit_log();

create trigger automotive_brain_source_priorities_10_validate_scope
  before insert or update of brand_id, model_id, version_id
  on public.automotive_brain_source_priorities
  for each row execute function public.automotive_brain_validate_catalog_scope();

create trigger automotive_brain_source_priorities_20_touch_updated_at
  before update
  on public.automotive_brain_source_priorities
  for each row execute function public.automotive_brain_touch_updated_at();

create trigger automotive_brain_source_priorities_90_audit
  after insert or update
  on public.automotive_brain_source_priorities
  for each row execute function public.automotive_brain_write_audit_log();

create trigger automotive_brain_analysis_runs_20_touch_updated_at
  before update
  on public.automotive_brain_analysis_runs
  for each row execute function public.automotive_brain_touch_updated_at();

create trigger automotive_brain_analysis_runs_90_audit
  after insert or update
  on public.automotive_brain_analysis_runs
  for each row execute function public.automotive_brain_write_audit_log();

create trigger automotive_brain_decisions_20_touch_updated_at
  before update
  on public.automotive_brain_decisions
  for each row execute function public.automotive_brain_touch_updated_at();

create trigger automotive_brain_decisions_90_audit
  after insert or update
  on public.automotive_brain_decisions
  for each row execute function public.automotive_brain_write_audit_log();

create trigger automotive_brain_conflicts_20_touch_updated_at
  before update
  on public.automotive_brain_conflicts
  for each row execute function public.automotive_brain_touch_updated_at();

create trigger automotive_brain_conflicts_90_audit
  after insert or update
  on public.automotive_brain_conflicts
  for each row execute function public.automotive_brain_write_audit_log();

-- -----------------------------------------------------------------------------
-- 8. Query indexes
-- -----------------------------------------------------------------------------

create index automotive_brain_rules_status_priority_idx
  on public.automotive_brain_rules (status, priority desc, updated_at desc);

create index automotive_brain_rules_scope_idx
  on public.automotive_brain_rules (brand_id, model_id, version_id)
  where status = 'approved';

create index automotive_brain_rules_pattern_lower_idx
  on public.automotive_brain_rules (lower(pattern));

create index automotive_brain_rule_versions_rule_idx
  on public.automotive_brain_rule_versions (rule_id, version_number desc);

create index automotive_brain_source_priorities_lookup_idx
  on public.automotive_brain_source_priorities (field_key, source_key, weight desc)
  where is_active = true;

create index automotive_brain_analysis_runs_status_created_idx
  on public.automotive_brain_analysis_runs (status, created_at desc);

create index automotive_brain_decisions_run_status_idx
  on public.automotive_brain_decisions (analysis_run_id, decision_status, created_at desc);

create index automotive_brain_decisions_store_status_idx
  on public.automotive_brain_decisions (store_id, decision_status, created_at desc);

create index automotive_brain_decisions_inventory_idx
  on public.automotive_brain_decisions (inventory_id)
  where inventory_id is not null;

create index automotive_brain_decisions_site_vehicle_idx
  on public.automotive_brain_decisions (site_vehicle_id)
  where site_vehicle_id is not null;

create index automotive_brain_decisions_market_listing_idx
  on public.automotive_brain_decisions (market_listing_id)
  where market_listing_id is not null;

create index automotive_brain_evidence_decision_source_idx
  on public.automotive_brain_evidence (decision_id, source_key, evidence_strength desc);

create index automotive_brain_conflicts_status_severity_idx
  on public.automotive_brain_conflicts (status, severity, created_at desc);

create index automotive_brain_conflicts_store_status_idx
  on public.automotive_brain_conflicts (store_id, status, created_at desc);

create index automotive_brain_conflicts_assigned_idx
  on public.automotive_brain_conflicts (assigned_to, status, created_at desc)
  where assigned_to is not null;

create index automotive_brain_conflicts_values_gin_idx
  on public.automotive_brain_conflicts using gin (values_by_source);

-- -----------------------------------------------------------------------------
-- 9. RLS: Master-only access
-- -----------------------------------------------------------------------------

alter table public.automotive_brain_rules enable row level security;
alter table public.automotive_brain_rule_versions enable row level security;
alter table public.automotive_brain_source_priorities enable row level security;
alter table public.automotive_brain_analysis_runs enable row level security;
alter table public.automotive_brain_decisions enable row level security;
alter table public.automotive_brain_evidence enable row level security;
alter table public.automotive_brain_conflicts enable row level security;

create policy automotive_brain_rules_select_master
  on public.automotive_brain_rules for select to authenticated
  using ((select public.is_master()));

create policy automotive_brain_rules_insert_master
  on public.automotive_brain_rules for insert to authenticated
  with check ((select public.is_master()));

create policy automotive_brain_rules_update_master
  on public.automotive_brain_rules for update to authenticated
  using ((select public.is_master()))
  with check ((select public.is_master()));

create policy automotive_brain_rule_versions_select_master
  on public.automotive_brain_rule_versions for select to authenticated
  using ((select public.is_master()));

create policy automotive_brain_rule_versions_insert_master
  on public.automotive_brain_rule_versions for insert to authenticated
  with check ((select public.is_master()));

create policy automotive_brain_source_priorities_select_master
  on public.automotive_brain_source_priorities for select to authenticated
  using ((select public.is_master()));

create policy automotive_brain_source_priorities_insert_master
  on public.automotive_brain_source_priorities for insert to authenticated
  with check ((select public.is_master()));

create policy automotive_brain_source_priorities_update_master
  on public.automotive_brain_source_priorities for update to authenticated
  using ((select public.is_master()))
  with check ((select public.is_master()));

create policy automotive_brain_analysis_runs_select_master
  on public.automotive_brain_analysis_runs for select to authenticated
  using ((select public.is_master()));

create policy automotive_brain_analysis_runs_insert_master
  on public.automotive_brain_analysis_runs for insert to authenticated
  with check ((select public.is_master()));

create policy automotive_brain_analysis_runs_update_master
  on public.automotive_brain_analysis_runs for update to authenticated
  using ((select public.is_master()))
  with check ((select public.is_master()));

create policy automotive_brain_decisions_select_master
  on public.automotive_brain_decisions for select to authenticated
  using ((select public.is_master()));

create policy automotive_brain_decisions_insert_master
  on public.automotive_brain_decisions for insert to authenticated
  with check ((select public.is_master()));

create policy automotive_brain_decisions_update_master
  on public.automotive_brain_decisions for update to authenticated
  using ((select public.is_master()))
  with check ((select public.is_master()));

create policy automotive_brain_evidence_select_master
  on public.automotive_brain_evidence for select to authenticated
  using ((select public.is_master()));

create policy automotive_brain_evidence_insert_master
  on public.automotive_brain_evidence for insert to authenticated
  with check ((select public.is_master()));

create policy automotive_brain_conflicts_select_master
  on public.automotive_brain_conflicts for select to authenticated
  using ((select public.is_master()));

create policy automotive_brain_conflicts_insert_master
  on public.automotive_brain_conflicts for insert to authenticated
  with check ((select public.is_master()));

create policy automotive_brain_conflicts_update_master
  on public.automotive_brain_conflicts for update to authenticated
  using ((select public.is_master()))
  with check ((select public.is_master()));

-- -----------------------------------------------------------------------------
-- 10. Explicit grants
-- -----------------------------------------------------------------------------

revoke all on table public.automotive_brain_rules from public, anon, authenticated;
revoke all on table public.automotive_brain_rule_versions from public, anon, authenticated;
revoke all on table public.automotive_brain_source_priorities from public, anon, authenticated;
revoke all on table public.automotive_brain_analysis_runs from public, anon, authenticated;
revoke all on table public.automotive_brain_decisions from public, anon, authenticated;
revoke all on table public.automotive_brain_evidence from public, anon, authenticated;
revoke all on table public.automotive_brain_conflicts from public, anon, authenticated;

grant select, insert, update on table public.automotive_brain_rules to authenticated;
grant select, insert on table public.automotive_brain_rule_versions to authenticated;
grant select, insert, update on table public.automotive_brain_source_priorities to authenticated;
grant select, insert, update on table public.automotive_brain_analysis_runs to authenticated;
grant select, insert, update on table public.automotive_brain_decisions to authenticated;
grant select, insert on table public.automotive_brain_evidence to authenticated;
grant select, insert, update on table public.automotive_brain_conflicts to authenticated;

grant all on table public.automotive_brain_rules to service_role;
grant all on table public.automotive_brain_rule_versions to service_role;
grant all on table public.automotive_brain_source_priorities to service_role;
grant all on table public.automotive_brain_analysis_runs to service_role;
grant all on table public.automotive_brain_decisions to service_role;
grant all on table public.automotive_brain_evidence to service_role;
grant all on table public.automotive_brain_conflicts to service_role;

revoke all on function public.automotive_brain_validate_catalog_scope() from public, anon, authenticated;
revoke all on function public.automotive_brain_prepare_rule_update() from public, anon, authenticated;
revoke all on function public.automotive_brain_snapshot_rule() from public, anon, authenticated;
revoke all on function public.automotive_brain_touch_updated_at() from public, anon, authenticated;
revoke all on function public.automotive_brain_write_audit_log() from public, anon, authenticated;

grant execute on function public.automotive_brain_validate_catalog_scope() to service_role;
grant execute on function public.automotive_brain_prepare_rule_update() to service_role;
grant execute on function public.automotive_brain_snapshot_rule() to service_role;
grant execute on function public.automotive_brain_touch_updated_at() to service_role;
grant execute on function public.automotive_brain_write_audit_log() to service_role;
