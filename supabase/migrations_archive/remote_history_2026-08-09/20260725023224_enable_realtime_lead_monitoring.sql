alter table public.leads
  add column if not exists first_viewed_at timestamptz,
  add column if not exists first_viewed_by_user_id uuid,
  add column if not exists first_viewed_by_name text,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists last_viewed_by_user_id uuid,
  add column if not exists last_viewed_by_name text,
  add column if not exists first_whatsapp_clicked_at timestamptz,
  add column if not exists last_whatsapp_clicked_at timestamptz,
  add column if not exists stage_entered_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists last_activity_type text,
  add column if not exists last_activity_label text,
  add column if not exists last_activity_by_name text;

update public.leads
set
  stage_entered_at = coalesce(stage_entered_at, updated_at, created_at, now()),
  last_activity_at = coalesce(last_activity_at, updated_at, created_at, now()),
  last_activity_type = coalesce(last_activity_type, 'lead_created'),
  last_activity_label = coalesce(last_activity_label, 'Lead criado no pipeline da loja')
where stage_entered_at is null
   or last_activity_at is null
   or last_activity_type is null
   or last_activity_label is null;

create index if not exists idx_leads_first_viewed_at on public.leads(first_viewed_at);
create index if not exists idx_leads_last_activity_at on public.leads(last_activity_at desc);
create index if not exists idx_leads_stage_entered_at on public.leads(stage_entered_at);
create index if not exists idx_lead_activity_logs_lead_created on public.lead_activity_logs(lead_id, created_at desc);
create index if not exists idx_lead_activity_logs_store_created on public.lead_activity_logs(store_id, created_at desc);

alter table public.leads replica identity full;
alter table public.lead_activity_logs replica identity full;
alter table public.leads_base replica identity full;

alter table public.lead_activity_logs enable row level security;

drop policy if exists lead_activity_logs_select_master_or_store on public.lead_activity_logs;
create policy lead_activity_logs_select_master_or_store
on public.lead_activity_logs
for select
to authenticated
using (
  public.is_master()
  or store_id = public.current_app_store_id()
);

create or replace function public.log_lead_activity_from_leads()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_store_name text;
  v_user_id uuid;
  v_user_name text;
  v_activity_type text;
  v_activity_label text;
  v_notes text;
  v_base_status text;
begin
  if tg_op = 'DELETE' then
    select store_name into v_store_name
    from public.stores
    where id = old.assigned_store_id;

    select id, full_name into v_user_id, v_user_name
    from public.users
    where auth_user_id = auth.uid()
       or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    order by case when auth_user_id = auth.uid() then 0 else 1 end
    limit 1;

    insert into public.lead_activity_logs (
      lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
      from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
    ) values (
      old.id, old.assigned_store_id, coalesce(v_store_name, ''), v_user_id, v_user_name,
      'lead_deleted', 'Loja excluiu o lead', old.status, null, old.customer_name,
      old.customer_phone, old.interested_vehicle, old.notes,
      jsonb_build_object('operation', tg_op, 'origin', old.origin)
    );

    return old;
  end if;

  select store_name into v_store_name
  from public.stores
  where id = new.assigned_store_id;

  select id, full_name into v_user_id, v_user_name
  from public.users
  where auth_user_id = auth.uid()
     or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  if tg_op = 'INSERT' then
    v_activity_type := 'lead_created';
    v_activity_label := 'Lead criado no pipeline da loja';
  elsif tg_op = 'UPDATE' then
    if coalesce(old.status, '') is distinct from coalesce(new.status, '') then
      v_activity_type := case new.status
        when 'in_service' then 'status_changed'
        when 'scheduled' then 'schedule_created'
        when 'appointment_cancelled' then 'schedule_cancelled'
        when 'no_show' then 'no_show_marked'
        when 'showed_up' then 'showed_up_marked'
        when 'sale_confirmed' then 'sale_confirmed'
        when 'lost' then 'lost_registered'
        else 'status_changed'
      end;

      v_activity_label := case new.status
        when 'in_service' then 'Loja iniciou atendimento'
        when 'scheduled' then 'Loja agendou atendimento'
        when 'appointment_cancelled' then 'Loja cancelou agendamento'
        when 'no_show' then 'Loja marcou não compareceu'
        when 'showed_up' then 'Loja marcou compareceu'
        when 'sale_confirmed' then 'Loja confirmou venda'
        when 'lost' then 'Loja registrou perda'
        else 'Loja alterou etapa do lead'
      end;

      if old.status = 'sale_confirmed' and new.status <> 'sale_confirmed' then
        v_activity_type := 'sale_cancelled';
        v_activity_label := 'Loja cancelou/reabriu venda';
      elsif old.status = 'lost' and new.status <> 'lost' then
        v_activity_type := 'lead_reopened';
        v_activity_label := 'Loja reabriu lead perdido';
      end if;
    elsif old.customer_name is distinct from new.customer_name
       or old.customer_phone is distinct from new.customer_phone
       or old.interested_vehicle is distinct from new.interested_vehicle
       or old.origin is distinct from new.origin
       or old.notes is distinct from new.notes
       or old.scheduled_at is distinct from new.scheduled_at
       or old.appointment_notes is distinct from new.appointment_notes
       or old.lost_reason is distinct from new.lost_reason then
      v_activity_type := 'lead_edited';
      v_activity_label := 'Loja editou informações do lead';
    else
      return new;
    end if;
  end if;

  v_notes := case
    when v_activity_type = 'schedule_created' then coalesce(new.appointment_notes, '')
    when v_activity_type = 'schedule_cancelled' then coalesce(new.appointment_cancelled_reason, '')
    when v_activity_type = 'lost_registered' then coalesce(new.lost_reason, '')
    else coalesce(new.notes, '')
  end;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    new.id, new.assigned_store_id, coalesce(v_store_name, ''), v_user_id, v_user_name,
    v_activity_type, v_activity_label,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status, new.customer_name, new.customer_phone, new.interested_vehicle, v_notes,
    jsonb_build_object(
      'operation', tg_op,
      'scheduled_at', new.scheduled_at,
      'appointment_cancelled_at', new.appointment_cancelled_at,
      'origin', new.origin
    )
  );

  update public.leads
  set
    stage_entered_at = case
      when tg_op = 'INSERT' or coalesce(old.status, '') is distinct from coalesce(new.status, '') then now()
      else stage_entered_at
    end,
    last_activity_at = now(),
    last_activity_type = v_activity_type,
    last_activity_label = v_activity_label,
    last_activity_by_name = v_user_name
  where id = new.id;

  if tg_op = 'INSERT' or coalesce(old.status, '') is distinct from coalesce(new.status, '') then
    v_base_status := case new.status
      when 'new_lead' then 'Novo lead'
      when 'sale_confirmed' then 'Venda concluída'
      when 'lost' then 'Perdido'
      else 'Em atendimento'
    end;

    update public.leads_base
    set status = v_base_status, updated_at = now()
    where routed_lead_id = new.id;
  end if;

  return new;
end;
$function$;

do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_activity_logs'
  ) then
    alter publication supabase_realtime add table public.lead_activity_logs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads_base'
  ) then
    alter publication supabase_realtime add table public.leads_base;
  end if;
end
$do$;

