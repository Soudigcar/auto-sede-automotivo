-- Minimal synthetic contracts; no production data or credentials.
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.stores(id uuid primary key,status text,portal_enabled boolean);
create table public.users(id uuid primary key,store_id uuid,status text,role text,full_name text);
create table public.leads(id uuid primary key,assigned_store_id uuid,status text,created_at timestamptz,
 assigned_user_id uuid,seller_user_id uuid,pre_sales_user_id uuid,captured_by_user_id uuid);
create table public.sales(id uuid primary key,lead_id uuid,store_id uuid,status text,created_at timestamptz,confirmed_at timestamptz,
 seller_user_id uuid,pre_sales_user_id uuid,captured_by_user_id uuid);
create table public.lead_activity_logs(id uuid primary key,lead_id uuid,store_id uuid,activity_type text,to_status text,created_at timestamptz);
create table public.whatsapp_conversations(id uuid primary key,lead_id uuid,store_id uuid,status text);
create table public.whatsapp_messages(id uuid primary key,store_id uuid,conversation_id uuid,lead_id uuid,
 wa_message_id text,direction text,status text,message_type text,raw_payload jsonb,sent_at timestamptz,created_at timestamptz not null);
grant select on all tables in schema public to service_role;
