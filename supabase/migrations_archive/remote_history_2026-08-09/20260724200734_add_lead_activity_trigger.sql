create or replace function public.log_lead_activity_from_leads()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_name text;
  v_user_id uuid;
  v_user_name text;
  v_activity_type text;
  v_activity_label text;
  v_notes text;
begin
  if tg_op = 'DELETE' then
    select store_name into v_store_name from public.stores where id = old.assigned_store_id;

    insert into public.lead_activity_logs (
      lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
      from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
    ) values (
      old.id, old.assigned_store_id, coalesce(v_store_name, ''), auth.uid(), null,
      'lead_deleted', 'Loja excluiu o lead', old.status, null, old.customer_name,
      old.customer_phone, old.interested_vehicle, old.notes, jsonb_build_object('operation', tg_op)
    );

    return old;
  end if;

  select store_name into v_store_name from public.stores where id = new.assigned_store_id;
  v_user_id := auth.uid();

  if v_user_id is not null then
    select name into v_user_name from public.users where auth_user_id = v_user_id limit 1;
  end if;

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
    v_activity_type, v_activity_label, case when tg_op = 'UPDATE' then old.status else null end,
    new.status, new.customer_name, new.customer_phone, new.interested_vehicle, v_notes,
    jsonb_build_object('operation', tg_op, 'scheduled_at', new.scheduled_at, 'appointment_cancelled_at', new.appointment_cancelled_at, 'origin', new.origin)
  );

  return new;
end;
$$;

drop trigger if exists trg_log_lead_activity_from_leads on public.leads;
create trigger trg_log_lead_activity_from_leads
after insert or update or delete on public.leads
for each row execute function public.log_lead_activity_from_leads();

