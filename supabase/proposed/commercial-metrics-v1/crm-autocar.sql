-- PROPOSAL ONLY: CRM reconciliation, never a cross-database join.
begin;
create or replace function public.read_store_autocar_metrics_v1(
 p_store_id uuid,p_actor_profile_id uuid,p_subject_user_id uuid,p_as_of timestamptz,p_evidence jsonb
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; actor public.users%rowtype; subject public.users%rowtype;
begin
 select * into actor from public.users where id=p_actor_profile_id and status='active';
 if actor.id is null or actor.role not in ('master','store','seller','pre_sales','prospector')
   or (actor.role<>'master' and actor.store_id is distinct from p_store_id)
   or (actor.role not in ('master','store') and p_subject_user_id is distinct from actor.id)
   or not exists(select 1 from public.stores where id=p_store_id and status='active' and portal_enabled=true)
   or p_evidence->>'store_id' is distinct from p_store_id::text
   or p_evidence->>'definition_version' is distinct from 'autocar_evidence_v1'
   or (p_evidence->>'as_of')::timestamptz is distinct from p_as_of then
   raise exception 'Invalid metrics scope' using errcode='42501';
 end if;
 if p_subject_user_id is not null then
   select * into subject from public.users where id=p_subject_user_id and store_id=p_store_id and status='active';
   if subject.id is null then raise exception 'Invalid subject' using errcode='42501'; end if;
 end if;
 with leads as materialized (
   select l.* from public.leads l where l.assigned_store_id=p_store_id and l.status<>'deleted' and l.created_at<=p_as_of
     and (p_subject_user_id is null or l.assigned_user_id=p_subject_user_id or (l.status='sale_confirmed' and (
       (subject.role='seller' and l.seller_user_id=p_subject_user_id) or
       (subject.role='pre_sales' and l.pre_sales_user_id=p_subject_user_id) or
       (subject.role='prospector' and l.captured_by_user_id=p_subject_user_id))))
 ), conversations as materialized (
   select c.* from public.whatsapp_conversations c join leads l on l.id=c.lead_id where c.store_id=p_store_id
 ), sent as materialized (
   select distinct on(c.id,coalesce(nullif(m.wa_message_id,''),m.id::text))
     m.id,c.id as conversation_id,c.lead_id,coalesce(m.sent_at,m.created_at) at
   from public.whatsapp_messages m join conversations c on c.id=m.conversation_id
   where m.store_id=p_store_id and (m.lead_id is null or m.lead_id=c.lead_id)
     and m.direction='outbound' and lower(m.status) in ('sent','delivered','read')
     and coalesce(m.sent_at,m.created_at)<=p_as_of
     and exists(select 1 from jsonb_array_elements(p_evidence->'claims') e
       where e->>'id'=m.raw_payload->>'live_claim_id' and e->>'conversation_id'=c.id::text)
   order by c.id,coalesce(nullif(m.wa_message_id,''),m.id::text),coalesce(m.sent_at,m.created_at),m.id
 ), inbound as (
   select c.lead_id,min(coalesce(m.sent_at,m.created_at)) at
   from conversations c join public.whatsapp_messages m on m.conversation_id=c.id and m.store_id=p_store_id
   where m.direction='inbound' and (m.lead_id is null or m.lead_id=c.lead_id)
     and coalesce(lower(m.message_type),'') not in ('system','internal')
     and coalesce(lower(m.status),'unknown') not in ('pending','failed') and coalesce(m.sent_at,m.created_at)<=p_as_of
   group by c.lead_id
 ), first_response as (
   select i.lead_id,extract(epoch from(min(s.at)-i.at))/60 as minutes
   from inbound i join sent s on s.lead_id=i.lead_id and s.at>=i.at group by i.lead_id,i.at
 ) select jsonb_build_object('available',true,'definition_version','autocar_metrics_v1',
   'crm_as_of',p_as_of,'autocar_as_of',p_evidence->'as_of','atomic_snapshot',false,
   'answered_leads',(select count(distinct lead_id) from sent),
   'answered_conversations',(select count(distinct conversation_id) from sent),
   'sent_messages',(select count(*) from sent),
   'first_response',jsonb_build_object('measured_leads',(select count(*) from first_response),
     'p50_minutes',(select percentile_cont(.5) within group(order by minutes) from first_response),
     'p90_minutes',(select percentile_cont(.9) within group(order by minutes) from first_response)),
   'currently_active_conversations',(select count(*) from conversations c join leads l on l.id=c.lead_id
     where coalesce(c.status,'')<>'closed' and l.status not in ('sale_confirmed','lost','deleted')
       and exists(select 1 from jsonb_array_elements(p_evidence->'active') e
         where e->>'conversation_id'=c.id::text and e->>'lead_id'=c.lead_id::text)),
   'appointments_with_participation',(select count(distinct l.id) from leads l where
     exists(select 1 from public.lead_activity_logs a where a.store_id=p_store_id and a.lead_id=l.id
       and a.to_status='scheduled' and a.created_at<=p_as_of and exists(select 1 from sent s where s.lead_id=l.id and s.at<a.created_at))),
   'sales_with_participation',(select count(distinct s.lead_id) from public.sales s join leads l on l.id=s.lead_id
     where s.store_id=p_store_id and s.status='confirmed' and s.confirmed_at<=p_as_of
       and exists(select 1 from sent m where m.lead_id=s.lead_id and m.at<s.confirmed_at))
 ) into result;
 return result;
end;
$$;
revoke all on function public.read_store_autocar_metrics_v1(uuid,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.read_store_autocar_metrics_v1(uuid,uuid,uuid,timestamptz,jsonb) to service_role;
commit;
