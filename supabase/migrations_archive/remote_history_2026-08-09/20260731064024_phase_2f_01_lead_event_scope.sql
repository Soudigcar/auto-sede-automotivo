begin;

alter table public.leads_base
  add column if not exists event_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_base_event_id_fkey'
      and conrelid = 'public.leads_base'::regclass
  ) then
    alter table public.leads_base
      add constraint leads_base_event_id_fkey
      foreign key (event_id)
      references public.events(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_leads_base_event_created_at
  on public.leads_base(event_id, created_at desc);

update public.leads_base as base
set event_id = operational.event_id
from public.leads as operational
where base.event_id is null
  and base.routed_lead_id = operational.id
  and operational.event_id is not null;

update public.leads_base as base
set event_id = campaign.event_id
from public.site_campaigns as campaign
where base.event_id is null
  and base.campaign_id = campaign.id
  and campaign.event_id is not null;

create or replace function public.sync_leads_base_event_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_event_id uuid;
  metadata_event_id text;
begin
  resolved_event_id := null;

  if new.routed_lead_id is not null then
    select lead.event_id
      into resolved_event_id
    from public.leads as lead
    where lead.id = new.routed_lead_id;
  end if;

  if resolved_event_id is null and new.campaign_id is not null then
    select campaign.event_id
      into resolved_event_id
    from public.site_campaigns as campaign
    where campaign.id = new.campaign_id;
  end if;

  if resolved_event_id is null and new.metadata is not null then
    metadata_event_id := new.metadata ->> 'event_id';

    if metadata_event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select event.id
        into resolved_event_id
      from public.events as event
      where event.id = metadata_event_id::uuid;
    end if;
  end if;

  if resolved_event_id is not null then
    new.event_id := resolved_event_id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_leads_base_event_scope() from public, anon, authenticated;

drop trigger if exists trg_sync_leads_base_event_scope on public.leads_base;
create trigger trg_sync_leads_base_event_scope
before insert or update of routed_lead_id, campaign_id, metadata, event_id
on public.leads_base
for each row
execute function public.sync_leads_base_event_scope();

comment on column public.leads_base.event_id is
  'Evento operacional do lead. Nulo representa campanhas gerais ou histórico sem vínculo confiável.';

commit;

