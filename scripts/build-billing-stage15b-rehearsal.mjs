import { readFileSync } from 'node:fs';
import process from 'node:process';

const packageRoot = 'supabase/production_ready/billing_stage15b';
const migrationPaths = [
  `${packageRoot}/20260828170000_billing_foundation_asaas.sql`,
  `${packageRoot}/20260828171000_store_billing_registration_profiles.sql`,
  `${packageRoot}/20260828172000_billing_observe_hardening.sql`,
  `${packageRoot}/20260828173000_billing_webhook_atomicity.sql`
];
const rollbackPath = `${packageRoot}/20260828174000_billing_stage15b_forward_rollback.sql`;
const beforePath = `${packageRoot}/preflight_before_read_only.sql`;
const afterPath = `${packageRoot}/postflight_after_read_only.sql`;

const billingObjects = [
  'billing_plans',
  'store_billing_subscriptions',
  'billing_payments',
  'billing_webhook_events',
  'billing_audit_log',
  'store_billing_registration_profiles',
  'store_billing_registration_audit',
  'start_store_billing_trial',
  'save_store_billing_registration_profile',
  'claim_billing_webhook_event',
  'complete_billing_webhook_event',
  'apply_asaas_subscription_webhook_event',
  'apply_asaas_payment_webhook_event'
];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function stripTransaction(sql) {
  return sql
    .replace(/^\s*begin;\s*/i, '')
    .replace(/\s*commit;\s*$/i, '')
    .trim();
}

function rewriteSchema(sql, schema, catalogAware = false) {
  let rewritten = sql;
  for (const object of billingObjects) {
    rewritten = rewritten.replaceAll(`public.${object}`, `${schema}.${object}`);
  }
  rewritten = rewritten.replaceAll('public.%I', `${schema}.%I`);
  if (catalogAware) {
    rewritten = rewritten
      .replaceAll("n.nspname = 'public'", `n.nspname = '${schema}'`)
      .replaceAll("table_schema = 'public'", `table_schema = '${schema}'`);
  }
  return rewritten;
}

export function buildRehearsalSql(schema) {
  if (!/^[a-z][a-z0-9_]{0,40}$/.test(schema)) {
    throw new Error('Schema isolado invalido. Use somente letras minusculas, numeros e underscore.');
  }

  const migrations = migrationPaths.map((path) => rewriteSchema(
    stripTransaction(readFileSync(path, 'utf8')),
    schema
  ));
  const rollback = rewriteSchema(stripTransaction(readFileSync(rollbackPath, 'utf8')), schema);
  const before = rewriteSchema(readFileSync(beforePath, 'utf8'), schema, true);
  const after = rewriteSchema(readFileSync(afterPath, 'utf8'), schema, true);

  return `begin;
set local lock_timeout = '5s';
set local statement_timeout = '45s';
create schema ${schema};

${before}

-- Ensaio de estado parcial: somente a fundacao existe quando o rollback roda.
${migrations[0]}
select set_config('app.billing_stage15b_rollback_confirm', 'true', true);
${rollback}

do $stage15b_partial$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = '${schema}' and c.relkind in ('r', 'p')
  ) then
    raise exception 'O rollback parcial deixou tabelas no schema isolado.';
  end if;
end;
$stage15b_partial$;

-- Ensaio completo do pacote.
${migrations.join('\n\n')}

${after}

do $stage15b_assertions$
declare
  v_store_id uuid;
  v_other_store_id uuid;
  v_master_id uuid;
  v_plan_id uuid;
  v_subscription_id uuid;
  v_event_id uuid;
  v_trial_end timestamptz := date_trunc('second', clock_timestamp()) + interval '7 days';
  v_count integer;
  v_claim record;
  v_payment record;
  v_completed boolean;
begin
  select count(*) into v_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = '${schema}'
    and c.relkind in ('r', 'p')
    and c.relname in (
      'billing_plans', 'store_billing_subscriptions', 'billing_payments',
      'billing_webhook_events', 'billing_audit_log',
      'store_billing_registration_profiles', 'store_billing_registration_audit'
    );
  if v_count <> 7 then
    raise exception 'Quantidade inesperada de tabelas billing: %.', v_count;
  end if;

  select count(*) into v_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = '${schema}'
    and c.relname in (
      'billing_plans', 'store_billing_subscriptions', 'billing_payments',
      'billing_webhook_events', 'billing_audit_log',
      'store_billing_registration_profiles', 'store_billing_registration_audit'
    )
    and c.relrowsecurity;
  if v_count <> 7 then
    raise exception 'RLS nao esta habilitado nas sete tabelas.';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = '${schema}'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'Foi encontrado grant client-side no schema isolado.';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = '${schema}'
    and p.proname in (
      'start_store_billing_trial', 'save_store_billing_registration_profile',
      'claim_billing_webhook_event', 'complete_billing_webhook_event',
      'apply_asaas_subscription_webhook_event', 'apply_asaas_payment_webhook_event'
    )
    and not p.prosecdef
    and array_to_string(p.proconfig, ',') like '%search_path=%';
  if v_count <> 6 then
    raise exception 'Configuracao de seguranca inesperada nas funcoes: %.', v_count;
  end if;

  if exists (
    select 1
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace n on n.oid = table_row.relnamespace
    where n.nspname = '${schema}'
      and constraint_row.contype = 'f'
      and not exists (
        select 1
        from pg_index index_row
        where index_row.indrelid = constraint_row.conrelid
          and constraint_row.conkey <@ index_row.indkey::smallint[]
      )
  ) then
    raise exception 'Existe chave estrangeira de billing sem indice de cobertura.';
  end if;

  select s.id into v_store_id
  from public.stores s
  where s.status = 'active'
    and exists (
      select 1 from public.users u
      where u.store_id = s.id
        and u.status = 'active'
        and u.role in ('store', 'pre_sales', 'seller', 'prospector')
    )
  order by s.id
  limit 1;

  select s.id into v_other_store_id
  from public.stores s
  where s.id <> v_store_id and s.status = 'active'
  order by s.id
  limit 1;

  select u.id into v_master_id
  from public.users u
  where u.role = 'master' and u.status = 'active'
  order by u.id
  limit 1;

  if v_store_id is null or v_other_store_id is null or v_master_id is null then
    raise exception 'Fixtures reais somente leitura insuficientes para o ensaio isolado.';
  end if;

  select p.id into v_plan_id
  from ${schema}.billing_plans p
  where p.code = 'professional';

  insert into ${schema}.store_billing_subscriptions (
    store_id, plan_id, status, access_enforcement_mode, activation_source,
    master_authorized_by, master_authorized_at, trial_started_at, trial_ends_at,
    external_reference
  ) values (
    v_store_id, v_plan_id, 'trialing', 'observe', 'master_authorization',
    v_master_id, clock_timestamp(), v_trial_end - interval '7 days', v_trial_end,
    'stage15b:isolated:' || gen_random_uuid()::text
  ) returning id into v_subscription_id;

  begin
    insert into ${schema}.billing_payments (
      subscription_id, store_id, provider_payment_id, provider_status, amount_cents
    ) values (
      v_subscription_id, v_other_store_id, 'stage15b-mismatch', 'PENDING', 149700
    );
    raise exception 'A FK composta aceitou store_id divergente.';
  exception
    when foreign_key_violation then null;
  end;

  insert into ${schema}.billing_webhook_events (
    provider_event_id, event_type, provider_object_type, provider_object_id
  ) values (
    'stage15b-claim-' || gen_random_uuid()::text,
    'PAYMENT_CONFIRMED', 'payment', 'stage15b-payment'
  ) returning id into v_event_id;

  select * into v_claim
  from ${schema}.claim_billing_webhook_event(v_event_id, 120);
  if v_claim.processing_token is null or v_claim.processing_status <> 'processing' then
    raise exception 'Primeiro claim nao adquiriu token exclusivo.';
  end if;

  select count(*) into v_count
  from ${schema}.claim_billing_webhook_event(v_event_id, 120);
  if v_count <> 0 then
    raise exception 'Segundo claim concorrente recebeu o mesmo evento.';
  end if;

  select ${schema}.complete_billing_webhook_event(
    v_event_id, gen_random_uuid(), 'processed', null
  ) into v_completed;
  if v_completed then
    raise exception 'Token incorreto finalizou o webhook.';
  end if;

  select ${schema}.complete_billing_webhook_event(
    v_event_id, v_claim.processing_token, 'processed', null
  ) into v_completed;
  if not v_completed then
    raise exception 'Token proprietario nao finalizou o webhook.';
  end if;

  select * into v_payment
  from ${schema}.apply_asaas_payment_webhook_event(
    v_subscription_id, v_store_id, 'stage15b-confirmed', 'stage15b-payment',
    'PAYMENT_CONFIRMED', 'CONFIRMED', 149700,
    v_trial_end, v_trial_end, 'stage15b', 'stage15b-subscription', 'stage15b-customer'
  );
  if v_payment.payment_status <> 'CONFIRMED' or v_payment.subscription_status <> 'active' then
    raise exception 'Confirmacao atomica nao ativou assinatura e pagamento.';
  end if;

  select * into v_payment
  from ${schema}.apply_asaas_payment_webhook_event(
    v_subscription_id, v_store_id, 'stage15b-overdue-late', 'stage15b-payment',
    'PAYMENT_OVERDUE', 'OVERDUE', 149700,
    v_trial_end, null, 'stage15b', 'stage15b-subscription', 'stage15b-customer'
  );
  if v_payment.payment_status <> 'CONFIRMED'
    or v_payment.subscription_status <> 'active'
    or not v_payment.stale_transition_ignored then
    raise exception 'Evento atrasado regrediu o estado financeiro atomico.';
  end if;
end;
$stage15b_assertions$;

delete from ${schema}.billing_audit_log;
delete from ${schema}.billing_payments;
delete from ${schema}.billing_webhook_events;
delete from ${schema}.store_billing_registration_audit;
delete from ${schema}.store_billing_registration_profiles;
delete from ${schema}.store_billing_subscriptions;

select set_config('app.billing_stage15b_rollback_confirm', 'true', true);
${rollback}

do $stage15b_final$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = '${schema}' and c.relkind in ('r', 'p')
  ) then
    raise exception 'O rollback completo deixou tabelas no schema isolado.';
  end if;
end;
$stage15b_final$;

rollback;`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(buildRehearsalSql(argument('--schema') || 'billing_stage15b_rehearsal'));
}
