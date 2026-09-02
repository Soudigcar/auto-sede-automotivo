-- Financiamento V1: ciclo idempotente e auditável no CRM.
-- Não armazena CPF, CNH, nascimento ou documentos na entidade de simulação.
begin;

create schema if not exists private;

create table if not exists public.lead_financing_simulations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  interested_vehicle_id uuid references public.site_vehicles(id) on delete set null,
  vehicle_name_snapshot text,
  status text not null default 'collecting_data' check (status in ('collecting_data','ready_to_submit','waiting_result','result_available','communicated','scheduling','completed','cancelled','expired')),
  outcome text check (outcome is null or outcome in ('preapproved','approved','declined','needs_review','no_offer')),
  requested_without_down_payment boolean,
  requested_down_payment_value numeric(14,2) check (requested_down_payment_value is null or requested_down_payment_value > 0),
  requested_installment_count integer check (requested_installment_count is null or requested_installment_count between 1 and 120),
  requested_installment_value numeric(14,2) check (requested_installment_value is null or requested_installment_value >= 0),
  requested_financed_amount numeric(14,2) check (requested_financed_amount is null or requested_financed_amount >= 0),
  financing_bank varchar(160),
  banks_consulted_count integer check (banks_consulted_count is null or banks_consulted_count between 0 and 200),
  preapproved_count integer check (preapproved_count is null or preapproved_count >= 0),
  approval_indicator_percent numeric(5,2) check (approval_indicator_percent is null or approval_indicator_percent between 0 and 100),
  approval_indicator_source text,
  approved_amount numeric(14,2) check (approved_amount is null or approved_amount >= 0),
  approved_installment_count integer check (approved_installment_count is null or approved_installment_count between 1 and 120),
  approved_installment_value numeric(14,2) check (approved_installment_value is null or approved_installment_value >= 0),
  result_source text check (result_source is null or result_source in ('manual','external_portal','bank_integration','import')),
  result_reference text,
  sanitized_notes text,
  requested_at timestamptz not null default now(),
  submitted_at timestamptz,
  result_received_at timestamptz,
  communicated_at timestamptz,
  scheduling_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  result_recorded_by uuid references public.users(id) on delete set null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financing_entry_consistency check (requested_without_down_payment is distinct from true or requested_down_payment_value is null),
  constraint financing_preapproved_count_consistency check (banks_consulted_count is null or preapproved_count is null or preapproved_count <= banks_consulted_count),
  constraint financing_indicator_source_required check (approval_indicator_percent is null or nullif(btrim(approval_indicator_source),'') is not null),
  constraint financing_indicator_outcome check (approval_indicator_percent is null or outcome in ('preapproved','approved'))
);

create unique index if not exists lead_financing_simulations_one_active_per_lead_idx
  on public.lead_financing_simulations(lead_id) where status not in ('completed','cancelled','expired');
create index if not exists lead_financing_simulations_store_status_idx
  on public.lead_financing_simulations(store_id,status,updated_at desc);

create table if not exists public.lead_financing_simulation_commands (
  request_id uuid primary key,
  simulation_id uuid not null references public.lead_financing_simulations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  command text not null,
  command_hash text not null check (char_length(command_hash)=32),
  actor_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_financing_simulation_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.lead_financing_simulation_commands(request_id) on delete cascade,
  simulation_id uuid not null references public.lead_financing_simulations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid references public.users(id) on delete set null,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail)='object'),
  created_at timestamptz not null default now()
);

create or replace function private.financing_scrub_text_v1(p_value text,p_limit integer)
returns text language sql immutable set search_path=pg_catalog as $$
  select nullif(btrim(left(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_value,''),
      '[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}','[CPF removido]','g'),
      '(^|[^0-9])[0-9]{11}([^0-9]|$)','\1[identificador removido]\2','g'),
      '[[:alnum:]._%+\-]+@[[:alnum:].\-]+\.[[:alpha:]]{2,}','[e-mail removido]','gi'),
      '[0-9]{2}[/-][0-9]{2}[/-][0-9]{4}','[data removida]','g'),p_limit)),'' )
$$;
revoke all on function private.financing_scrub_text_v1(text,integer) from public,anon,authenticated;

create or replace function private.enforce_lead_financing_simulation_v1()
returns trigger language plpgsql set search_path=pg_catalog,public,private as $$
declare v_store uuid; v_vehicle_store uuid; v_cnh boolean; v_cpf text; v_birth date;
begin
  select assigned_store_id into v_store from public.leads where id=new.lead_id;
  if v_store is null then raise exception 'financing_lead_not_found' using errcode='P0001'; end if;
  if v_store is distinct from new.store_id then raise exception 'financing_store_lead_mismatch' using errcode='P0001'; end if;
  if new.interested_vehicle_id is not null then
    select store_id into v_vehicle_store from public.site_vehicles where id=new.interested_vehicle_id;
    if v_vehicle_store is distinct from new.store_id then raise exception 'financing_vehicle_store_mismatch' using errcode='P0001'; end if;
  end if;
  new.vehicle_name_snapshot:=private.financing_scrub_text_v1(new.vehicle_name_snapshot,300);
  new.approval_indicator_source:=private.financing_scrub_text_v1(new.approval_indicator_source,200);
  new.result_reference:=private.financing_scrub_text_v1(new.result_reference,300);
  new.sanitized_notes:=private.financing_scrub_text_v1(new.sanitized_notes,2000);
  if tg_op='INSERT' then
    if new.status<>'collecting_data' then raise exception 'financing_initial_status_invalid' using errcode='P0001'; end if;
    new.version:=1;
  else
    if new.store_id is distinct from old.store_id or new.lead_id is distinct from old.lead_id then raise exception 'financing_identity_is_immutable' using errcode='P0001'; end if;
    if new.status is distinct from old.status and not (
      (old.status='collecting_data' and new.status in ('ready_to_submit','cancelled','expired')) or
      (old.status='ready_to_submit' and new.status in ('collecting_data','waiting_result','cancelled','expired')) or
      (old.status='waiting_result' and new.status in ('result_available','cancelled','expired')) or
      (old.status='result_available' and new.status in ('communicated','cancelled','expired')) or
      (old.status='communicated' and new.status in ('scheduling','completed','cancelled','expired')) or
      (old.status='scheduling' and new.status in ('completed','cancelled','expired'))
    ) then raise exception 'financing_status_transition_invalid' using errcode='P0001'; end if;
    new.version:=old.version+1;
  end if;
  if new.status='ready_to_submit' then
    select has_driver_license,cpf,birth_date into v_cnh,v_cpf,v_birth from public.lead_commercial_details where lead_id=new.lead_id and store_id=new.store_id;
    if new.interested_vehicle_id is null and nullif(btrim(new.vehicle_name_snapshot),'') is null then raise exception 'financing_vehicle_required' using errcode='P0001'; end if;
    if not (new.requested_without_down_payment is true or (new.requested_without_down_payment is false and new.requested_down_payment_value>0)) then raise exception 'financing_down_payment_decision_required' using errcode='P0001'; end if;
    if new.requested_installment_count is null then raise exception 'financing_installments_required' using errcode='P0001'; end if;
    if v_cnh is null or coalesce(v_cpf,'') !~ '^[0-9]{11}$' or v_birth is null then raise exception 'financing_customer_qualification_incomplete' using errcode='P0001'; end if;
  end if;
  if new.status='waiting_result' then new.submitted_at:=coalesce(new.submitted_at,clock_timestamp()); end if;
  if new.status='result_available' then
    if new.outcome is null or new.result_source is null then raise exception 'financing_result_source_and_outcome_required' using errcode='P0001'; end if;
    if new.outcome in ('preapproved','approved') and nullif(btrim(new.financing_bank),'') is null then raise exception 'financing_bank_required_for_positive_result' using errcode='P0001'; end if;
    new.result_received_at:=coalesce(new.result_received_at,clock_timestamp());
  end if;
  if new.status='communicated' then new.communicated_at:=coalesce(new.communicated_at,clock_timestamp()); end if;
  if new.status='scheduling' then new.scheduling_started_at:=coalesce(new.scheduling_started_at,clock_timestamp()); end if;
  if new.status='completed' then new.completed_at:=coalesce(new.completed_at,clock_timestamp()); end if;
  if new.status='cancelled' then new.cancelled_at:=coalesce(new.cancelled_at,clock_timestamp()); end if;
  if new.status='expired' then new.expired_at:=coalesce(new.expired_at,clock_timestamp()); end if;
  new.updated_at:=clock_timestamp(); return new;
end $$;
revoke all on function private.enforce_lead_financing_simulation_v1() from public,anon,authenticated;
drop trigger if exists lead_financing_simulations_enforce_v1 on public.lead_financing_simulations;
create trigger lead_financing_simulations_enforce_v1 before insert or update on public.lead_financing_simulations for each row execute function private.enforce_lead_financing_simulation_v1();

create or replace function private.prevent_financing_ledger_change_v1()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'financing_audit_ledger_is_immutable' using errcode='P0001'; end $$;
drop trigger if exists lead_financing_commands_immutable_v1 on public.lead_financing_simulation_commands;
create trigger lead_financing_commands_immutable_v1 before update or delete on public.lead_financing_simulation_commands for each row execute function private.prevent_financing_ledger_change_v1();
drop trigger if exists lead_financing_events_immutable_v1 on public.lead_financing_simulation_events;
create trigger lead_financing_events_immutable_v1 before update or delete on public.lead_financing_simulation_events for each row execute function private.prevent_financing_ledger_change_v1();

create or replace function public.apply_lead_financing_simulation_command_v1(
  p_store_id uuid,p_lead_id uuid,p_simulation_id uuid,p_command text,p_request_id uuid,p_expected_version integer,p_payload jsonb,p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_actor record; v_lead record; v_existing record; v_sim public.lead_financing_simulations%rowtype; v_from text; v_hash text; v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
begin
  if jsonb_typeof(v_payload)<>'object' then raise exception 'financing_payload_must_be_object' using errcode='22023'; end if;
  if p_command not in ('start','update_request','mark_ready','submit','record_result','mark_communicated','start_scheduling','complete','cancel','expire') then raise exception 'financing_command_invalid' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||'|'||p_lead_id::text,1));
  v_hash:=md5(p_store_id::text||'|'||p_lead_id::text||'|'||coalesce(p_simulation_id::text,'')||'|'||p_command||'|'||coalesce(p_expected_version::text,'')||'|'||v_payload::text);
  select * into v_existing from public.lead_financing_simulation_commands where request_id=p_request_id;
  if found then
    if v_existing.command_hash is distinct from v_hash then raise exception 'financing_idempotency_key_collision' using errcode='23505'; end if;
    select * into v_sim from public.lead_financing_simulations where id=v_existing.simulation_id;
    return jsonb_build_object('simulation_id',v_sim.id,'status',v_sim.status,'version',v_sim.version,'idempotent_replay',true);
  end if;
  select id,role,status,store_id into v_actor from public.users where id=p_actor_user_id;
  if not found or v_actor.status<>'active' then raise exception 'financing_actor_not_active' using errcode='42501'; end if;
  select id,assigned_store_id,assigned_user_id,interested_vehicle_id,interested_vehicle into v_lead from public.leads where id=p_lead_id for update;
  if not found or v_lead.assigned_store_id is distinct from p_store_id then raise exception 'financing_lead_not_in_store' using errcode='42501'; end if;
  if v_actor.role<>'master' then
    if v_actor.store_id is distinct from p_store_id then raise exception 'financing_actor_store_mismatch' using errcode='42501'; end if;
    if v_actor.role<>'store' and v_lead.assigned_user_id is distinct from v_actor.id then raise exception 'financing_lead_outside_actor_portfolio' using errcode='42501'; end if;
  end if;
  if p_command='record_result' and v_actor.role not in ('master','store','seller') then raise exception 'financing_result_role_not_allowed' using errcode='42501'; end if;
  if p_command='expire' and v_actor.role not in ('master','store') then raise exception 'financing_expire_role_not_allowed' using errcode='42501'; end if;
  if p_command='start' then
    select * into v_sim from public.lead_financing_simulations where lead_id=p_lead_id and status not in ('completed','cancelled','expired') limit 1 for update;
    if not found then
      insert into public.lead_financing_simulations(store_id,lead_id,interested_vehicle_id,vehicle_name_snapshot,requested_without_down_payment,requested_down_payment_value,requested_installment_count,requested_installment_value,requested_financed_amount,created_by,updated_by)
      values(p_store_id,p_lead_id,v_lead.interested_vehicle_id,v_lead.interested_vehicle,nullif(v_payload->>'requested_without_down_payment','')::boolean,nullif(v_payload->>'requested_down_payment_value','')::numeric,nullif(v_payload->>'requested_installment_count','')::integer,nullif(v_payload->>'requested_installment_value','')::numeric,nullif(v_payload->>'requested_financed_amount','')::numeric,p_actor_user_id,p_actor_user_id) returning * into v_sim;
    end if;
  else
    select * into v_sim from public.lead_financing_simulations where id=p_simulation_id and store_id=p_store_id and lead_id=p_lead_id for update;
    if not found then raise exception 'financing_simulation_not_found' using errcode='P0002'; end if;
    if p_expected_version is not null and v_sim.version<>p_expected_version then raise exception 'financing_version_conflict' using errcode='40001'; end if;
    v_from:=v_sim.status;
    if p_command='update_request' then update public.lead_financing_simulations set requested_without_down_payment=nullif(v_payload->>'requested_without_down_payment','')::boolean,requested_down_payment_value=nullif(v_payload->>'requested_down_payment_value','')::numeric,requested_installment_count=nullif(v_payload->>'requested_installment_count','')::integer,requested_installment_value=nullif(v_payload->>'requested_installment_value','')::numeric,requested_financed_amount=nullif(v_payload->>'requested_financed_amount','')::numeric,updated_by=p_actor_user_id where id=v_sim.id returning * into v_sim;
    elsif p_command='mark_ready' then update public.lead_financing_simulations set status='ready_to_submit',updated_by=p_actor_user_id where id=v_sim.id returning * into v_sim;
    elsif p_command='submit' then update public.lead_financing_simulations set status='waiting_result',updated_by=p_actor_user_id where id=v_sim.id returning * into v_sim;
    elsif p_command='record_result' then update public.lead_financing_simulations set status='result_available',outcome=nullif(v_payload->>'outcome',''),result_source=nullif(v_payload->>'result_source',''),financing_bank=nullif(btrim(v_payload->>'financing_bank'),''),banks_consulted_count=nullif(v_payload->>'banks_consulted_count','')::integer,preapproved_count=nullif(v_payload->>'preapproved_count','')::integer,approval_indicator_percent=nullif(v_payload->>'approval_indicator_percent','')::numeric,approval_indicator_source=nullif(btrim(v_payload->>'approval_indicator_source'),''),approved_amount=nullif(v_payload->>'approved_amount','')::numeric,approved_installment_count=nullif(v_payload->>'approved_installment_count','')::integer,approved_installment_value=nullif(v_payload->>'approved_installment_value','')::numeric,result_reference=nullif(btrim(v_payload->>'result_reference'),''),sanitized_notes=nullif(btrim(v_payload->>'sanitized_notes'),''),result_recorded_by=p_actor_user_id,updated_by=p_actor_user_id where id=v_sim.id returning * into v_sim;
    elsif p_command='mark_communicated' then update public.lead_financing_simulations set status='communicated',updated_by=p_actor_user_id where id=v_sim.id returning * into v_sim;
    elsif p_command='start_scheduling' then update public.lead_financing_simulations set status='scheduling',updated_by=p_actor_user_id where id=v_sim.id returning * into v_sim;
    elsif p_command='complete' then update public.lead_financing_simulations set status='completed',updated_by=p_actor_user_id where id=v_sim.id returning * into v_sim;
    elsif p_command='cancel' then update public.lead_financing_simulations set status='cancelled',updated_by=p_actor_user_id where id=v_sim.id returning * into v_sim;
    elsif p_command='expire' then update public.lead_financing_simulations set status='expired',updated_by=p_actor_user_id where id=v_sim.id returning * into v_sim;
    end if;
  end if;
  insert into public.lead_financing_simulation_commands(request_id,simulation_id,store_id,lead_id,command,command_hash,actor_user_id) values(p_request_id,v_sim.id,p_store_id,p_lead_id,p_command,v_hash,p_actor_user_id);
  insert into public.lead_financing_simulation_events(request_id,simulation_id,store_id,lead_id,event_type,from_status,to_status,actor_user_id,detail) values(p_request_id,v_sim.id,p_store_id,p_lead_id,p_command,v_from,v_sim.status,p_actor_user_id,jsonb_strip_nulls(jsonb_build_object('version',v_sim.version,'outcome',v_sim.outcome,'result_source',v_sim.result_source,'financing_bank',v_sim.financing_bank,'banks_consulted_count',v_sim.banks_consulted_count,'preapproved_count',v_sim.preapproved_count,'approval_indicator_percent',v_sim.approval_indicator_percent)));
  return jsonb_build_object('simulation_id',v_sim.id,'status',v_sim.status,'version',v_sim.version,'idempotent_replay',false);
end $$;

revoke all on function public.apply_lead_financing_simulation_command_v1(uuid,uuid,uuid,text,uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.apply_lead_financing_simulation_command_v1(uuid,uuid,uuid,text,uuid,integer,jsonb,uuid) to service_role;
alter table public.lead_financing_simulations enable row level security;
alter table public.lead_financing_simulation_commands enable row level security;
alter table public.lead_financing_simulation_events enable row level security;
revoke all on public.lead_financing_simulations from public,anon,authenticated;
revoke all on public.lead_financing_simulation_commands from public,anon,authenticated;
revoke all on public.lead_financing_simulation_events from public,anon,authenticated;
grant select on public.lead_financing_simulations,public.lead_financing_simulation_commands,public.lead_financing_simulation_events to service_role;

commit;
