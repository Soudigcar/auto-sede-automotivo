-- Motor configuravel de roteamento de leads por loja.
-- Fase estrutural do rollout: cria apenas schema/indices/RLS.
-- IMPORTANTE: nenhum trigger de roteamento e habilitado nesta migration.
-- Os gatilhos so sao criados pela migration final de hardening, eliminando a janela
-- em que o schema estaria parcialmente instalado e ja processando leads.

create table if not exists public.lead_routing_rules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'active' check (status in ('active','paused','archived')),
  priority integer not null default 100 check (priority between 1 and 10000),
  match_type text not null default 'default' check (match_type in ('event','campaign','source','default')),
  event_id uuid references public.events(id) on delete cascade,
  campaign_id uuid,
  campaign_key text,
  source_key text,
  strategy text not null default 'round_robin' check (strategy in ('round_robin','fixed')),
  target_roles text[] not null default '{}',
  target_member_ids uuid[] not null default '{}',
  excluded_member_ids uuid[] not null default '{}',
  fixed_user_id uuid references public.users(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_routing_rule_period check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint lead_routing_rule_match check (
    (match_type = 'event' and event_id is not null)
    or (match_type = 'campaign' and (campaign_id is not null or nullif(btrim(campaign_key),'') is not null))
    or (match_type = 'source' and nullif(btrim(source_key),'') is not null)
    or match_type = 'default'
  ),
  constraint lead_routing_rule_fixed check (strategy <> 'fixed' or fixed_user_id is not null)
);

create index if not exists lead_routing_rules_match_idx
  on public.lead_routing_rules(store_id,status,match_type,priority);
create index if not exists lead_routing_rules_event_idx
  on public.lead_routing_rules(event_id)
  where event_id is not null;

create table if not exists public.lead_routing_rule_state (
  rule_id uuid primary key references public.lead_routing_rules(id) on delete cascade,
  last_user_id uuid references public.users(id) on delete set null,
  last_position integer not null default -1,
  routed_count bigint not null default 0,
  last_routed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_routing_decisions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  rule_id uuid references public.lead_routing_rules(id) on delete set null,
  outcome text not null check (outcome in ('assigned','unassigned','no_rule','already_assigned')),
  selected_user_id uuid references public.users(id) on delete set null,
  selected_role text,
  strategy text,
  eligible_user_ids uuid[] not null default '{}',
  excluded_user_ids uuid[] not null default '{}',
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists lead_routing_decisions_lead_idx
  on public.lead_routing_decisions(lead_id,created_at desc);
create index if not exists lead_routing_decisions_store_idx
  on public.lead_routing_decisions(store_id,created_at desc);

create table if not exists public.lead_unassigned_queue (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  rule_id uuid references public.lead_routing_rules(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'
);

create index if not exists lead_unassigned_queue_store_idx
  on public.lead_unassigned_queue(store_id,status,last_seen_at desc);

alter table public.lead_routing_rules enable row level security;
alter table public.lead_routing_rule_state enable row level security;
alter table public.lead_routing_decisions enable row level security;
alter table public.lead_unassigned_queue enable row level security;

revoke all on table public.lead_routing_rules from anon, authenticated;
revoke all on table public.lead_routing_rule_state from anon, authenticated;
revoke all on table public.lead_routing_decisions from anon, authenticated;
revoke all on table public.lead_unassigned_queue from anon, authenticated;

-- Fail-closed de rollout: se esta migration for reaplicada sobre um ambiente de teste
-- antigo, ela tambem garante que nenhum gatilho fique ativo antes do hardening final.
drop trigger if exists leads_auto_route_by_rules on public.leads;
drop trigger if exists leads_base_auto_route_by_rules on public.leads_base;
