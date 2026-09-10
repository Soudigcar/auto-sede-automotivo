-- Audit tags only: these settings do NOT prove database identity.
-- Require a fresh official branch preflight and an explicit verified connection before applying.
-- Isolated project installation only. No operational migrations or integrations.
do $$
declare ref text := current_setting('app.metrics_project_ref',true);
begin
 if current_setting('app.metrics_homologation',true) is distinct from 'synthetic-only'
 or ref is null or ref !~ '^[a-z]{20}$'
 or ref in ('wufikrdgyxrsszlbpfmv','icmwdggbvijexjgrvsbl','azszzdotbrczlhrmhrlw','hfzmzfhuhukmxkxbkxay')
 or current_setting('app.metrics_preflight',true) is distinct from 'branch-metadata-v1'
 then raise exception 'Unverified homologation database'; end if;
end $$;
-- Deterministic synthetic-only records. No Auth API calls or messages.
insert into public.stores(id,store_name,slug) values
 ('10000000-0000-4000-8000-000000000001','Store Alpha','store-alpha'),
 ('10000000-0000-4000-8000-000000000002','Store Beta','store-beta') on conflict(id) do nothing;
insert into public.users(id,store_id,email,full_name,role)
select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=1 then null when n<=5 then '10000000-0000-4000-8000-000000000001'::uuid else '10000000-0000-4000-8000-000000000002'::uuid end,
 'synthetic-'||n||'@metrics.invalid',
 (array['Synthetic Master','Synthetic Manager Alpha','Synthetic Pre Sales Alpha','Synthetic Seller Alpha','Synthetic Prospector Alpha','Synthetic Manager Beta','Synthetic Seller Beta','Synthetic Pre Sales Beta','Synthetic Prospector Beta'])[n],
 (array['master','store','pre_sales','seller','prospector','store','seller','pre_sales','prospector'])[n]
from generate_series(1,9)n on conflict(id) do nothing;
insert into public.leads(id,assigned_store_id,assigned_user_id,seller_user_id,pre_sales_user_id,captured_by_user_id,customer_name,status,created_at,updated_at)
select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('10000000-0000-4000-8000-'||case when n<=552 then '000000000001' else '000000000002' end)::uuid,
 ('20000000-0000-4000-8000-'||case when n<=552 then '000000000004' else '000000000007' end)::uuid,
 case when n in (1,400) then '20000000-0000-4000-8000-000000000004'::uuid end,
 case when n in (1,400) then '20000000-0000-4000-8000-000000000003'::uuid end,
 case when n in (1,400) then '20000000-0000-4000-8000-000000000005'::uuid end,
 'Synthetic Lead '||n,
 case when n in(1,400) then 'sale_confirmed' else (array['new_lead','in_service','scheduled','showed_up','lost','no_show','appointment_cancelled'])[1+n%7] end,
 '2026-01-01T00:00:00Z'::timestamptz-n*interval '1 minute','2026-01-01T00:00:00Z'::timestamptz
from generate_series(1,572)n on conflict(id) do nothing;
insert into public.sales(id,lead_id,store_id,status,seller_user_id,pre_sales_user_id,captured_by_user_id,created_at,confirmed_at)
select id,id,assigned_store_id,'confirmed',seller_user_id,pre_sales_user_id,captured_by_user_id,'2026-01-02T00:00:00Z','2026-01-02T00:00:00Z' from public.leads where id in('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000400') on conflict(id) do nothing;
insert into public.whatsapp_conversations(id,store_id,lead_id,status,last_message_at)
select ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',
 ('30000000-0000-4000-8000-'||lpad((case when n=12 then 1 else n end)::text,12,'0'))::uuid,'open','2026-01-01T00:00:00Z'
from generate_series(1,12)n on conflict(id) do nothing;
insert into public.whatsapp_messages(id,store_id,lead_id,conversation_id,wa_message_id,direction,status,message_type,raw_payload,sent_at,created_at) values
('50000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','synthetic-10','inbound','received','text','{}'::jsonb,'2026-01-01T00:00:00Z'::timestamptz+interval '0 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','synthetic-11','outbound','sent','text',jsonb_build_object('metric_sender_type','autocar','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004','live_claim_id','60000000-0000-4000-8000-000000000001'),'2026-01-01T00:00:00Z'::timestamptz+interval '1 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','synthetic-20','inbound','received','text','{}'::jsonb,'2026-01-01T00:00:00Z'::timestamptz+interval '0 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','synthetic-21','outbound','sent','text',jsonb_build_object('metric_sender_type','autocar','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004','live_claim_id','60000000-0000-4000-8000-000000000002'),'2026-01-01T00:00:00Z'::timestamptz+interval '1 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','synthetic-22','outbound','sent','text',jsonb_build_object('metric_sender_type','human','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004'),'2026-01-01T00:00:00Z'::timestamptz+interval '5 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000030','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','synthetic-30','inbound','received','text','{}'::jsonb,'2026-01-01T00:00:00Z'::timestamptz+interval '0 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','synthetic-31','outbound','sent','text',jsonb_build_object('metric_sender_type','indeterminate','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004'),'2026-01-01T00:00:00Z'::timestamptz+interval '1 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','synthetic-32','outbound','sent','text',jsonb_build_object('metric_sender_type','human','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004'),'2026-01-01T00:00:00Z'::timestamptz+interval '5 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000040','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004','synthetic-40','inbound','received','text','{}'::jsonb,'2026-01-01T00:00:00Z'::timestamptz+interval '0 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004','synthetic-41','outbound','pending','text',jsonb_build_object('metric_sender_type','human','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004'),'2026-01-01T00:00:00Z'::timestamptz+interval '1 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000050','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000005','synthetic-50','inbound','received','text','{}'::jsonb,'2026-01-01T00:00:00Z'::timestamptz+interval '0 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000051','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000005','synthetic-51','outbound','failed','text',jsonb_build_object('metric_sender_type','human','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004'),'2026-01-01T00:00:00Z'::timestamptz+interval '1 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000060','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000006','40000000-0000-4000-8000-000000000006','synthetic-60','inbound','received','text','{}'::jsonb,'2026-01-01T00:00:00Z'::timestamptz+interval '0 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000070','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000007','40000000-0000-4000-8000-000000000007','synthetic-70','inbound','received','text','{}'::jsonb,'2026-01-01T00:00:00Z'::timestamptz+interval '0 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000071','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000007','40000000-0000-4000-8000-000000000007','synthetic-71','outbound','sent','text',jsonb_build_object('metric_sender_type','human','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004'),'2026-01-01T00:00:00Z'::timestamptz+interval '-1 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000080','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000008','40000000-0000-4000-8000-000000000008','synthetic-80','inbound','received','text','{}'::jsonb,'2026-01-01T00:00:00Z'::timestamptz+interval '0 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000008','40000000-0000-4000-8000-000000000008','synthetic-81','outbound','sent','text',jsonb_build_object('metric_sender_type','human','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004'),'2026-01-01T00:00:00Z'::timestamptz+interval '3 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000090','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000009','synthetic-90','inbound','received','text','{}'::jsonb,'2026-01-01T00:00:00Z'::timestamptz+interval '0 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000009','synthetic-91','outbound','sent','text',jsonb_build_object('metric_sender_type','human','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004'),'2026-01-01T00:00:00Z'::timestamptz+interval '3 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000100','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000010','synthetic-100','inbound','received','text','{}'::jsonb,'2026-01-01T00:00:00Z'::timestamptz+interval '0 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000010','synthetic-101','outbound','sent','text',jsonb_build_object('metric_sender_type','human','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004'),'2026-01-01T00:00:00Z'::timestamptz+interval '3 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000110','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000000011','synthetic-110','inbound','received','text','{}'::jsonb,'2026-01-01T00:00:00Z'::timestamptz+interval '0 minute','2026-01-01T00:00:00Z'),
('50000000-0000-4000-8000-000000000111','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000000011','synthetic-111','outbound','sent','text',jsonb_build_object('metric_sender_type','human','metric_sender_source','crm','metric_sender_user_id','20000000-0000-4000-8000-000000000004'),'2026-01-01T00:00:00Z'::timestamptz+interval '3 minute','2026-01-01T00:00:00Z') on conflict(id) do nothing;
insert into public.whatsapp_messages(id,store_id,lead_id,conversation_id,direction,status,message_type,raw_payload,sent_at,created_at) values('50000000-0000-4000-8000-000000000999','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000012','outbound','sent','text','{"metric_sender_type":"human","metric_sender_source":"crm","metric_sender_user_id":"20000000-0000-4000-8000-000000000004"}','2026-01-01 00:10Z','2026-01-01T00:00:00Z') on conflict(id) do nothing;
insert into public.lead_activity_logs(id,lead_id,store_id,to_status,created_at) values('70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','scheduled','2026-01-01 01:00Z') on conflict(id) do nothing;
