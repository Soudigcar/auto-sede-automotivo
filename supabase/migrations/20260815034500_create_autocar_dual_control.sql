alter table public.ai_store_agents
  add column if not exists master_enabled boolean not null default false,
  add column if not exists master_autopilot_allowed boolean not null default false,
  add column if not exists store_selected_mode text not null default 'off'
    check (store_selected_mode in ('off', 'copilot', 'autopilot'));

update public.ai_store_agents
set
  master_enabled = (mode <> 'off'),
  master_autopilot_allowed = (mode = 'aut