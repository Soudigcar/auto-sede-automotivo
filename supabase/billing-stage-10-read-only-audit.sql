begin transaction read only;
set local statement_timeout = '20s';

-- This script deliberately reads only technical identifiers, store names and
-- aggregate usage signals. It never reads lead, WhatsApp or customer content.
with user_stats as (
  select
    profile.store_id,
    count(*) filter (where profile.status = 'active') as active_profiles,
    count(*) filter (
      where profile.status = 'active'
        and profile.auth_user_id is not null
        and auth_user.id is not null
    ) as active_auth_profiles,
    count(*) filter (
      where profile.status = 'active'
        and auth_user.last_sign_in_at >= now() - interval '90 days'
    ) as signed_in_90d,
    max(auth_user.last_sign_in_at) filter (
      where profile.status = 'active'
    ) as last_sign_in_at
  from public.users profile
  left join auth.users auth_user on auth_user.id = profile.auth_user_id
  where profile.store_id is not null
  group by profile.store_id
),
activity as (
  select assigned_store_id as store_id, greatest(created_at, updated_at) as occurred_at
  from public.leads where assigned_store_id is not null
  union all
  select store_id, created_at
  from public.whatsapp_messages where store_id is not null
  union all
  select store_id, greatest(created_at, updated_at)
  from public.inventory where store_id is not null
  union all
  select store_id, greatest(created_at, updated_at)
  from public.store_calendar_tasks where store_id is not null
  union all
  select store_id, greatest(created_at, updated_at)
  from public.appointments where store_id is not null
  union all
  select store_id, created_at
  from public.sales where store_id is not null
),
activity_stats as (
  select
    store_id,
    count(*) filter (where occurred_at >= now() - interval '90 days') as activity_90d,
    max(occurred_at) as last_operational_activity_at
  from activity
  group by store_id
)
select
  store_row.id as store_id,
  store_row.store_name,
  store_row.slug,
  store_row.status,
  store_row.portal_enabled,
  coalesce(user_stats.active_profiles, 0) as active_profiles,
  coalesce(user_stats.active_auth_profiles, 0) as active_auth_profiles,
  coalesce(user_stats.signed_in_90d, 0) as signed_in_90d,
  user_stats.last_sign_in_at,
  coalesce(activity_stats.activity_90d, 0) as activity_90d,
  activity_stats.last_operational_activity_at,
  case
    when store_row.status = 'active'
      and coalesce(user_stats.active_auth_profiles, 0) > 0
      and (
        coalesce(user_stats.signed_in_90d, 0) > 0
        or coalesce(activity_stats.activity_90d, 0) > 0
      ) then 'confirmed_saas'
    when store_row.status = 'active'
      and coalesce(user_stats.active_profiles, 0) > 0 then 'manual_review'
    when store_row.status = 'active'
      and store_row.portal_enabled = true
      and coalesce(user_stats.active_profiles, 0) = 0 then 'portal_only'
    else 'excluded'
  end as classification
from public.stores store_row
left join user_stats on user_stats.store_id = store_row.id
left join activity_stats on activity_stats.store_id = store_row.id
order by classification, store_row.store_name;

select
  count(*) filter (where status = 'active') as active_stores,
  count(*) filter (where status = 'active' and portal_enabled) as active_portal_stores,
  count(*) filter (
    where status = 'active'
      and length(nullif(regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g'), '')) = 14
  ) as cnpj_ready,
  count(*) filter (
    where status = 'active'
      and coalesce(length(nullif(regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g'), '')), 0) <> 14
  ) as cnpj_missing_or_invalid
from public.stores;

select
  to_regclass('public.billing_plans') is not null as billing_plans_exists,
  to_regclass('public.store_billing_subscriptions') is not null as subscriptions_exists,
  to_regclass('public.billing_payments') is not null as payments_exists,
  to_regclass('public.billing_webhook_events') is not null as webhook_events_exists,
  to_regclass('public.billing_audit_log') is not null as audit_log_exists,
  to_regprocedure('public.start_store_billing_trial(uuid,text,uuid,text)') is not null as trial_function_exists;

rollback;
