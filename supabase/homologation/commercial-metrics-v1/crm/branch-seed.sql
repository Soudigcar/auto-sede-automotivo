-- Hosted development branch seed. Synthetic-only; no external integrations or executors.
set local app.lead_routing_explicit = 'on';

insert into public.stores(id,store_name,responsible_name,slug,status,portal_enabled)
values
 ('10000000-0000-4000-8000-000000000001','Store Alpha','Synthetic Responsible Alpha','store-alpha','active',true),
 ('10000000-0000-4000-8000-000000000002','Store Beta','Synthetic Responsible Beta','store-beta','active',true);

insert into public.users(id,store_id,email,full_name,role,status,receives_leads,routing_order)
select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=1 then null when n<=5 then '10000000-0000-4000-8000-000000000001'::uuid else '10000000-0000-4000-8000-000000000002'::uuid end,
 'synthetic-'||n||'@metrics.invalid',
 (array['Synthetic Master','Synthetic Manager Alpha','Synthetic Pre Sales Alpha','Synthetic Seller Alpha','Synthetic Prospector Alpha','Synthetic Manager Beta','Synthetic Seller Beta','Synthetic Pre Sales Beta','Synthetic Prospector Beta'])[n],
 (array['master','store','pre_sales','seller','prospector','store','seller','pre_sales','prospector'])[n],
 'active',false,n
from generate_series(1,9) n;

insert into public.leads(
 id,assigned_store_id,assigned_user_id,assigned_user_role,seller_user_id,pre_sales_user_id,captured_by_user_id,
 customer_name,origin,status,created_at,updated_at
)
select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n<=552 then '10000000-0000-4000-8000-000000000001'::uuid else '10000000-0000-4000-8000-000000000002'::uuid end,
 case when n<=552 then '20000000-0000-4000-8000-000000000004'::uuid else '20000000-0000-4000-8000-000000000007'::uuid end,
 'seller',
 case when n<=552 then '20000000-0000-4000-8000-000000000004'::uuid else '20000000-0000-4000-8000-000000000007'::uuid end,
 case when n in (1,400) then '20000000-0000-4000-8000-000000000003'::uuid end,
 case when n in (1,400) then '20000000-0000-4000-8000-000000000005'::uuid end,
 'Synthetic Lead '||n,'manual',
 case when n in(1,400) then 'sale_confirmed' else (array['new_lead','in_service','scheduled','showed_up','lost','no_show','appointment_cancelled'])[1+n%7] end,
 '2026-01-01T00:00:00Z'::timestamptz-n*interval '1 minute','2026-01-01T00:00:00Z'::timestamptz
from generate_series(1,572) n;

insert into public.sales(
 id,lead_id,store_id,seller_name,financing_bank,payment_type,status,seller_user_id,pre_sales_user_id,captured_by_user_id,created_at,confirmed_at
)
select id,id,assigned_store_id,'Synthetic Seller Alpha','Synthetic Bank','synthetic','confirmed',seller_user_id,pre_sales_user_id,captured_by_user_id,
 '2026-01-02T00:00:00Z','2026-01-02T00:00:00Z'
from public.leads where id in ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000400');

insert into public.whatsapp_conversations(id,store_id,lead_id,status,last_message_at)
select ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '10000000-0000-4000-8000-000000000001'::uuid,
 ('30000000-0000-4000-8000-'||lpad((case when n=12 then 1 else n end)::text,12,'0'))::uuid,
 'open','2026-01-01T00:00:00Z'::timestamptz
from generate_series(1,12) n;

insert into public.whatsapp_messages(id,store_id,lead_id,conversation_id,wa_message_id,direction,status,message_type,raw_payload,sent_at,created_at)
values
 ('50000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','synthetic-10','inbound','received','text','{}','2026-01-01 00:00Z','2026-01-01 00:00Z'),
 ('50000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','synthetic-11','outbound','sent','text',jsonb_build_object('metric_sender_type','autocar','metric_sender_source','crm','live_claim_id','60000000-0000-4000-8000-000000000001'),'2026-01-01 00:01Z','2026-01-01 00:01Z'),
 ('50000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','synthetic-20','inbound','received','text','{}','2026-01-01 00:00Z','2026-01-01 00:00Z'),
 ('50000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','synthetic-21','outbound','sent','text',jsonb_build_object('metric_sender_type','autocar','metric_sender_source','crm','live_claim_id','60000000-0000-4000-8000-000000000002'),'2026-01-01 00:01Z','2026-01-01 00:01Z'),
 ('50000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','synthetic-22','outbound','sent','text',jsonb_build_object('metric_sender_type','human','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004'),'2026-01-01 00:05Z','2026-01-01 00:05Z');

insert into public.lead_activity_logs(id,lead_id,store_id,activity_type,activity_label,to_status,created_at)
values ('70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','schedule_created','Synthetic appointment','scheduled','2026-01-01 01:00Z');
