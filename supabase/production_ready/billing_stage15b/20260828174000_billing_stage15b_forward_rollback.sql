begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Esta e uma migration forward de reversao. Ela deve ser aplicada pelo mesmo
-- mecanismo que registra as migrations de entrada; nunca apague ou marque
-- manualmente uma versao anterior como reverted.
do $$
declare
  v_table text;
  v_has_rows boolean;
  v_operational_tables constant text[] := array[
    'store_billing_subscriptions',
    'billing_payments',
    'billing_webhook_events',
    'billing_audit_log',
    'store_billing_registration_profiles',
    'store_billing_registration_audit'
  ];
begin
  if current_setting('app.billing_stage15b_rollback_confirm', true) <> 'true' then
    raise exception 'Rollback bloqueado: defina app.billing_stage15b_rollback_confirm=true localmente.'
      using errcode = '42501';
  end if;

  foreach v_table in array v_operational_tables loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    execute format(
      'select exists (select 1 from public.%I limit 1)',
      v_table
    ) into v_has_rows;

    if v_has_rows then
      raise exception 'Rollback destrutivo recusado: a tabela public.% possui dados operacionais.',
        v_table using errcode = '55000';
    end if;
  end loop;

  if to_regclass('public.billing_plans') is not null then
    execute $query$
      select exists (
        select 1
        from public.billing_plans
        where code <> 'professional'
          or name <> 'Profissional'
          or amount_cents <> 149700
          or billing_cycle <> 'monthly'
          or included_users <> 5
          or ai_included is not true
      )
    $query$ into v_has_rows;

    if v_has_rows then
      raise exception 'Rollback destrutivo recusado: o catalogo de planos foi alterado.'
        using errcode = '55000';
    end if;
  end if;
end;
$$;

drop function if exists public.apply_asaas_payment_webhook_event(
  uuid, uuid, text, text, text, text, bigint, timestamptz, timestamptz, text, text, text
);
drop function if exists public.apply_asaas_subscription_webhook_event(
  uuid, text, text, text, text
);
drop function if exists public.complete_billing_webhook_event(uuid, uuid, text, text);
drop function if exists public.claim_billing_webhook_event(uuid, integer);
drop function if exists public.save_store_billing_registration_profile(
  uuid, uuid, text, text, text, text, uuid
);
drop function if exists public.start_store_billing_trial(uuid, text, uuid, text);

drop table if exists public.store_billing_registration_audit;
drop table if exists public.store_billing_registration_profiles;
drop table if exists public.billing_audit_log;
drop table if exists public.billing_webhook_events;
drop table if exists public.billing_payments;
drop table if exists public.store_billing_subscriptions;
drop table if exists public.billing_plans;

commit;
