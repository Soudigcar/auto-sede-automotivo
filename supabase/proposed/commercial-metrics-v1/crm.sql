-- PROPOSAL ONLY. Do not apply without the separate database authorization.
-- CRM database only. SECURITY INVOKER does not constrain a service-role caller.
begin;
create or replace function public.read_store_commercial_metrics_v1(
  p_store_id uuid, p_actor_profile_id uuid, p_subject_user_id uuid default null,
  p_as_of timestamptz default now(), p_card_ids uuid[] default '{}'
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  actor public.users%rowtype;
  subject public.users%rowtype;
  result jsonb;
begin
  select * into actor from public.users where id=p_actor_profile_id and status='active';
  if actor.id is null or actor.role not in ('master','store','seller','pre_sales','prospector')
    or (actor.role <> 'master' and actor.store_id is distinct from p_store_id)
    or not exists(select 1 from public.stores where id=p_store_id and status='active' and portal_enabled=true)
    or p_as_of is null or p_as_of > now() + interval '1 minute'
    or cardinality(p_card_ids)>200 then
    raise exception 'Invalid metrics scope' using errcode='42501';
  end if;
  if actor.role not in ('master','store') and p_subject_user_id is distinct from actor.id then
    raise exception 'Metrics scope cannot be expanded' using errcode='42501';
  end if;
  if p_subject_user_id is not null then
    select * into subject from public.users where id=p_subject_user_id and store_id=p_store_id
      and status='active' and role in ('store','seller','pre_sales','prospector');
    if subject.id is null then raise exception 'Invalid subject' using errcode='42501'; end if;
  end if;
  with
  scoped as materialized (
    select l.* from public.leads l
    where l.assigned_store_id=p_store_id and l.status<>'deleted' and l.created_at<=p_as_of
      and (p_subject_user_id is null or l.assigned_user_id=p_subject_user_id or
        (l.status='sale_confirmed' and (
          (subject.role='seller' and l.seller_user_id=p_subject_user_id) or
          (subject.role='pre_sales' and l.pre_sales_user_id=p_subject_user_id) or
          (subject.role='prospector' and l.captured_by_user_id=p_subject_user_id))))
  ), sales as materialized (
    select s.* from public.sales s join scoped l on l.id=s.lead_id
    where s.store_id=p_store_id and s.status='confirmed' and coalesce(s.confirmed_at,s.created_at)<=p_as_of
  ), showed as (
    select id as lead_id from scoped where status='showed_up'
    union select a.lead_id from public.lead_activity_logs a join scoped l on l.id=a.lead_id
      where a.store_id=p_store_id and a.created_at<=p_as_of
        and (a.activity_type='showed_up_marked' or a.to_status='showed_up')
  ), raw_messages as (
    select m.*,c.lead_id as canonical_lead_id,coalesce(m.sent_at,m.created_at) as message_at,
      case when m.sent_at is null then 'created_at_fallback' else 'sent_at' end as time_source,
      case when lower(m.message_type) in ('system','internal') or m.raw_payload->>'metric_sender_type' in ('system','internal') then 'system'
        when m.raw_payload->>'metric_sender_type'='autocar' or exists(
          select 1 from jsonb_each(case when jsonb_typeof(m.raw_payload)='object' then m.raw_payload else '{}'::jsonb end) e
          where e.key like 'autocar\_%' escape '\' and e.value not in ('false'::jsonb,'null'::jsonb)) then 'autocar'
        when m.raw_payload->>'metric_sender_type'='human' and m.raw_payload->>'metric_sender_source'='crm'
          and nullif(trim(m.raw_payload->>'metric_sender_user_id'),'') is not null then 'human'
        else 'indeterminate' end as author_type,
      row_number() over(partition by m.conversation_id,coalesce(nullif(m.wa_message_id,''),m.id::text)
        order by case when lower(m.status) in ('sent','delivered','read') then 0 else 1 end,
          coalesce(m.sent_at,m.created_at),m.id) as duplicate_rank
    from public.whatsapp_messages m
    join public.whatsapp_conversations c on c.id=m.conversation_id and c.store_id=p_store_id
    join scoped l on l.id=c.lead_id
    where m.store_id=p_store_id and (m.lead_id is null or m.lead_id=c.lead_id)
      and coalesce(m.sent_at,m.created_at)<=p_as_of
  ), messages as materialized (select * from raw_messages where duplicate_rank=1),
  inbound as (
    select canonical_lead_id as lead_id,min(message_at) as first_at
    from messages where direction='inbound' and author_type<>'system'
      and coalesce(lower(status),'unknown') not in ('failed','pending') group by canonical_lead_id
  ), human as (
    select i.lead_id,i.first_at,min(m.message_at) as human_at
    from inbound i left join messages m on m.canonical_lead_id=i.lead_id and m.direction='outbound'
      and m.message_at>=i.first_at and m.author_type='human' and lower(m.status) in ('sent','delivered','read')
    group by i.lead_id,i.first_at
  ), measurements as materialized (
    select h.*,exists(select 1 from messages m where m.canonical_lead_id=h.lead_id and m.direction='outbound'
      and m.message_at>=h.first_at and (h.human_at is null or m.message_at<=h.human_at)
      and coalesce(lower(m.status),'unknown') not in ('failed','pending')
      and (m.author_type='indeterminate' or (m.author_type='human' and coalesce(lower(m.status),'unknown') not in ('sent','delivered','read')))) as indeterminate
    from human h
  ), groups as (
    select null::uuid as member_id
    union all select u.id from public.users u where u.store_id=p_store_id and u.status='active'
      and u.role in ('store','seller','pre_sales','prospector')
      and (actor.role in ('master','store') or u.id=actor.id)
  ), group_leads as (
    select g.member_id,l.* from groups g join scoped l on g.member_id is null or l.assigned_user_id=g.member_id
  ), response as (
    select g.member_id,count(m.lead_id) as eligible,
      count(m.lead_id) filter(where m.human_at is not null and not m.indeterminate) as measured,
      count(m.lead_id) filter(where m.indeterminate) as indeterminate,
      avg(extract(epoch from(m.human_at-m.first_at))/60) filter(where not m.indeterminate) as average,
      percentile_cont(.5) within group(order by extract(epoch from(m.human_at-m.first_at))/60) filter(where not m.indeterminate) as median,
      percentile_cont(.9) within group(order by extract(epoch from(m.human_at-m.first_at))/60) filter(where not m.indeterminate) as p90
    from groups g left join group_leads l on l.member_id is not distinct from g.member_id
      left join measurements m on m.lead_id=l.id group by g.member_id
  ), summaries as (
    select g.member_id,jsonb_build_object(
      'total',count(l.id),'active',count(l.id) filter(where l.status not in ('sale_confirmed','lost','deleted')),
      'new_leads',count(l.id) filter(where l.status='new_lead'),'in_service',count(l.id) filter(where l.status='in_service'),
      'scheduled',count(l.id) filter(where l.status='scheduled'),
      'cancelled',count(l.id) filter(where l.status='appointment_cancelled'),
      'appointment_cancelled',count(l.id) filter(where l.status='appointment_cancelled'),
      'no_show',count(l.id) filter(where l.status='no_show'),
      'showed_up',count(l.id) filter(where exists(select 1 from showed a where a.lead_id=l.id)),
      'sold',count(l.id) filter(where exists(select 1 from sales s where s.lead_id=l.id)),
      'lost',count(l.id) filter(where l.status='lost'),
      'conversion_rate',coalesce(100.0*count(l.id) filter(where exists(select 1 from sales s where s.lead_id=l.id))/nullif(count(l.id),0),0),
      'assignment_coverage_percent',coalesce(100.0*count(l.id) filter(where l.assigned_user_id is not null)/nullif(count(l.id),0),0)
    ) as metrics from groups g left join group_leads l on l.member_id is not distinct from g.member_id group by g.member_id
  ), combined as (
    select s.member_id,s.metrics || jsonb_build_object('response',jsonb_build_object(
      'eligible_leads',r.eligible,'measured_leads',r.measured,'unanswered_leads',r.eligible-r.measured-r.indeterminate,
      'indeterminate_leads',r.indeterminate,'coverage_percent',coalesce(100.0*r.measured/nullif(r.eligible,0),0),
      'classification_coverage_percent',coalesce(100.0*(r.eligible-r.indeterminate)/nullif(r.eligible,0),0),
      'history_complete',true,'definition_version','human_first_response_lead_v1','as_of',p_as_of,
      'average_minutes',r.average,'median_minutes',r.median,'p50',r.median,'p90_minutes',r.p90
    )) as metrics from summaries s join response r on r.member_id is not distinct from s.member_id
  ) select jsonb_build_object(
    'definition_version','commercial_metrics_v1','as_of',p_as_of,
    'metrics',(select metrics from combined where member_id is null),
    'stage_totals',(select coalesce(jsonb_object_agg(status,n),'{}') from(select status,count(*) n from scoped group by status)t),
    'team',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'full_name',u.full_name,'role',u.role,
      'role_label',case u.role when 'seller' then 'Vendedor' when 'pre_sales' then 'Pré-vendas' when 'prospector' then 'Prospectador' else 'Gestor' end,
      'leads',c.metrics->'total','active_leads',c.metrics->'active','converted_leads',c.metrics->'sold',
      'conversion_rate',null,'conversion_basis','historical_denominator_unavailable','response',c.metrics->'response',
      'seller_participation',(select count(distinct lead_id) from sales where seller_user_id=u.id),
      'pre_sales_participation',(select count(distinct lead_id) from sales where pre_sales_user_id=u.id),
      'prospector_participation',(select count(distinct lead_id) from sales where captured_by_user_id=u.id)
    ) order by u.full_name),'[]') from combined c join public.users u on u.id=c.member_id and u.store_id=p_store_id),
    'card_responses',(select coalesce(jsonb_object_agg(m.lead_id,jsonb_build_object(
      'response_minutes',case when not m.indeterminate then extract(epoch from(m.human_at-m.first_at))/60 end,
      'first_inbound_at',m.first_at,'first_human_response_at',m.human_at,
      'classification',case when m.indeterminate then 'indeterminate' when m.human_at is not null then 'measured' else 'unanswered' end
    )),'{}') from measurements m where m.lead_id=any(p_card_ids))
  ) into result;
  return result;
end;
$$;
revoke all on function public.read_store_commercial_metrics_v1(uuid,uuid,uuid,timestamptz,uuid[]) from public,anon,authenticated;
grant execute on function public.read_store_commercial_metrics_v1(uuid,uuid,uuid,timestamptz,uuid[]) to service_role;
commit;
