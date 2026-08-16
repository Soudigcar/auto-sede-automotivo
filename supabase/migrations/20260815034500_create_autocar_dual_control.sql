alter table public.ai_store_agents
  add column if not exists master_enabled boolean not null default false,
  add column if not exists master_autopilot_allowed boolean not null default false,
  add column if not exists store_selected_mode text not null default 'off'
    check (store_selected_mode in ('off', 'copilot', 'autopilot'));

update public.ai_store_agents
set
  master_enabled = (mode <> 'off'),
  master_autopilot_allowed = (mode = 'autopilot'),
  store_selected_mode = mode;

create or replace function private.enforce_autocar_dual_control()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not new.master_enabled then
    new.mode := 'off';
    new.status := 'inactive';
    return new;
  end if;

  if new.store_selected_mode = 'autopilot' and not new.master_autopilot_allowed then
    new.mode := 'copilot';
  else
    new.mode := new.store_selected_mode;
  end if;

  new.status := case when new.mode = 'off' then 'inactive' else 'active' end;
  return new;
end;
$$;

drop trigger if exists ai_store_agents_dual_control on public.ai_store_agents;
create trigger ai_store_agents_dual_control
before insert or update of master_enabled, master_autopilot_allowed, store_selected_mode
on public.ai_store_agents
for each row execute function private.enforce_autocar_dual_control();

comment on column public.ai_store_agents.master_enabled is 'Master gate: whether the store may use AUTOCAR at all.';
comment on column public.ai_store_agents.master_autopilot_allowed is 'Master gate: whether the store may select AUTOPILOT.';
comment on column public.ai_store_agents.store_selected_mode is 'Mode selected by the store manager. Effective mode remains constrained by Master gates.';
comment on column public.ai_store_agents.mode is 'Effective AUTOCAR mode after Master and store controls are combined.';
