begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Fail closed: este rollback so pode ser usado antes da primeira ativacao e
-- exige uma confirmacao explicita na mesma transacao.
do $$
begin
  if current_setting('app.billing_stage14_rollback_confirm', true) <> 'true' then
    raise exception 'Rollback bloqueado: defina app.billing_stage14_rollback_confirm=true localmente.'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.store_billing_subscriptions limit 1)
    or exists (select 1 from public.billing_payments limit 1)
    or exists (select 1 from public.billing_webhook_events limit 1)
    or exists (select 1 from public.billing_audit_log limit 1)
    or exists (select 1 from public.store_billing_registration_profiles limit 1)
    or exists (select 1 from public.store_billing_registration_audit limit 1) then
    raise exception 'Rollback destrutivo recusado: o billing ja possui dados operacionais.'
      using errcode = '55000';
  end if;
end;
$$;

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
