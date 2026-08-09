create table if not exists public.store_calendar_tasks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  title text not null,
  description text,
  task_type text not null default 'task',
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'pending',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_calendar_tasks_store_starts_idx
on public.store_calendar_tasks (store_id, starts_at);

alter table public.store_calendar_tasks enable row level security;

drop policy if exists store_calendar_tasks_select on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_insert on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_update on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_delete on public.store_calendar_tasks;

create policy store_calendar_tasks_select
on public.store_calendar_tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'master' or u.store_id = store_calendar_tasks.store_id)
  )
);

create policy store_calendar_tasks_insert
on public.store_calendar_tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'master' or u.store_id = store_calendar_tasks.store_id)
  )
);

create policy store_calendar_tasks_update
on public.store_calendar_tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'master' or u.store_id = store_calendar_tasks.store_id)
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'master' or u.store_id = store_calendar_tasks.store_id)
  )
);

create policy store_calendar_tasks_delete
on public.store_calendar_tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'master' or u.store_id = store_calendar_tasks.store_id)
  )
);

