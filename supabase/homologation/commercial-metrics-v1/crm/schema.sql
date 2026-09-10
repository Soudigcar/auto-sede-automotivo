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
create table if not exists public.stores (
 id uuid primary key, store_name text not null, slug text unique not null, event_id uuid,
 status text not null default 'active', portal_enabled boolean not null default true,
 responsible_name text, responsible_email text, responsible_phone text, website_url text
);
create table if not exists public.users (
 id uuid primary key, auth_user_id uuid unique references auth.users(id), store_id uuid references public.stores(id),
 email text unique not null check(email like '%.invalid'), full_name text not null, phone text,
 role text not null check(role in ('master','store','seller','pre_sales','prospector')),
 status text not null default 'active', must_change_password boolean not null default false
);
create table if not exists public.leads (
 id uuid primary key, assigned_store_id uuid not null references public.stores(id), assigned_user_id uuid references public.users(id),
 seller_user_id uuid references public.users(id),pre_sales_user_id uuid references public.users(id),captured_by_user_id uuid references public.users(id),
 customer_name text not null,customer_phone text,interested_vehicle text,origin text,status text not null,
 notes text,scheduled_at timestamptz,appointment_notes text,appointment_cancelled_at timestamptz,appointment_cancelled_reason text,lost_reason text,
 created_at timestamptz not null,updated_at timestamptz not null
);
create table if not exists public.sales (
 id uuid primary key,lead_id uuid not null references public.leads(id),store_id uuid not null references public.stores(id),status text,
 seller_user_id uuid references public.users(id),pre_sales_user_id uuid references public.users(id),captured_by_user_id uuid references public.users(id),
 created_at timestamptz,confirmed_at timestamptz
);
create table if not exists public.lead_activity_logs (
 id uuid primary key,lead_id uuid references public.leads(id),store_id uuid references public.stores(id),activity_type text,to_status text,created_at timestamptz
);
create table if not exists public.whatsapp_contacts (
 id uuid primary key,store_id uuid references public.stores(id),profile_name text,phone text,metadata jsonb
);
create table if not exists public.whatsapp_conversations (
 id uuid primary key,store_id uuid references public.stores(id),lead_id uuid references public.leads(id),contact_id uuid references public.whatsapp_contacts(id),status text,last_message_at timestamptz
);
create table if not exists public.whatsapp_messages (
 id uuid primary key,store_id uuid references public.stores(id),lead_id uuid references public.leads(id),conversation_id uuid references public.whatsapp_conversations(id),
 wa_message_id text,direction text,status text,message_type text,raw_payload jsonb,sent_at timestamptz,created_at timestamptz not null
);
create table if not exists public.store_whatsapp_integrations (
 id uuid primary key,store_id uuid references public.stores(id),scope text,profile_name text
);
alter table public.stores enable row level security;
revoke all on public.stores from anon,authenticated;
grant select,insert,update,delete on public.stores to service_role;
alter table public.users enable row level security;
revoke all on public.users from anon,authenticated;
grant select,insert,update,delete on public.users to service_role;
alter table public.leads enable row level security;
revoke all on public.leads from anon,authenticated;
grant select,insert,update,delete on public.leads to service_role;
alter table public.sales enable row level security;
revoke all on public.sales from anon,authenticated;
grant select,insert,update,delete on public.sales to service_role;
alter table public.lead_activity_logs enable row level security;
revoke all on public.lead_activity_logs from anon,authenticated;
grant select,insert,update,delete on public.lead_activity_logs to service_role;
alter table public.whatsapp_contacts enable row level security;
revoke all on public.whatsapp_contacts from anon,authenticated;
grant select,insert,update,delete on public.whatsapp_contacts to service_role;
alter table public.whatsapp_conversations enable row level security;
revoke all on public.whatsapp_conversations from anon,authenticated;
grant select,insert,update,delete on public.whatsapp_conversations to service_role;
alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_messages from anon,authenticated;
grant select,insert,update,delete on public.whatsapp_messages to service_role;
alter table public.store_whatsapp_integrations enable row level security;
revoke all on public.store_whatsapp_integrations from anon,authenticated;
grant select,insert,update,delete on public.store_whatsapp_integrations to service_role;
grant select on public.users,public.stores,public.leads to authenticated;
drop policy if exists synthetic_self_read on public.users;
create policy synthetic_self_read on public.users for select to authenticated using(auth_user_id=(select auth.uid()));
drop policy if exists synthetic_store_read on public.stores;
create policy synthetic_store_read on public.stores for select to authenticated using(exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active' and (u.role='master' or u.store_id=stores.id)));
drop policy if exists synthetic_lead_read on public.leads;
create policy synthetic_lead_read on public.leads for select to authenticated using(exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active' and (u.role='master' or (u.store_id=leads.assigned_store_id and (u.role='store' or leads.assigned_user_id=u.id or (leads.status='sale_confirmed' and ((u.role='seller' and leads.seller_user_id=u.id) or (u.role='pre_sales' and leads.pre_sales_user_id=u.id) or (u.role='prospector' and leads.captured_by_user_id=u.id))))))));
-- Authenticated clients cannot UPDATE. A separately authorized fixture controller
-- uses service_role to mutate synthetic leads for Realtime verification only.
do $$ begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='leads') then alter publication supabase_realtime add table public.leads; end if;
end $$;
