-- Fase 2C.3A — transações comerciais seguras.
-- Esta migration deve ser aplicada somente após validação e autorização explícita.

begin;

-- As assinaturas legadas serão removidas somente no último passo, após a criação dos novos RPCs.

-- O trigger continua responsável por sincronizar leads_base e por registrar
-- alterações legadas. Quando o chamador já fornece auditoria explícita, ele não
-- duplica lead_activity_logs nem sobrescreve a identidade do ator.
create or replace function public.log_lead_activity_from_leads()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_store_name text;
  v_user_id uuid;
  v_user_name text;
  v_activity_type text;
  v_activity_label text;
  v_notes text;
  v_base_status text;
  v_status_changed boolean := false;
  v_caller_managed_audit boolean := false;
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

  select id, coalesce(nullif(full_name, ''), email) into v_user_id, v_user_name
  from public.users
  where auth_user_id = auth.uid()
     or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  if v_user_id is null and nullif(trim(coalesce(new.last_activity_by_name, '')), '') is not null then
    select id, coalesce(nullif(full_name, ''), email) into v_user_id, v_user_name
    from public.users
    where (new.assigned_store_id is null or store_id = new.assigned_store_id or role = 'master')
      and (
        lower(coalesce(full_name, '')) = lower(new.last_activity_by_name)
        or lower(coalesce(email, '')) = lower(new.last_activity_by_name)
      )
    order by case when role = 'master' then 1 else 0 end
    limit 1;
  end if;

  if tg_op = 'INSERT' then
    v_status_changed := true;
    v_activity_type := 'lead_created';
    v_activity_label := 'Lead criado no pipeline da loja';
  elsif tg_op = 'UPDATE' then
    v_caller_managed_audit :=
      old.last_activity_at is distinct from new.last_activity_at
      and nullif(trim(coalesce(new.last_activity_type, '')), '') is not null
      and nullif(trim(coalesce(new.last_activity_label, '')), '') is not null;

    if coalesce(old.status, '') is distinct from coalesce(new.status, '') then
      v_status_changed := true;
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

  -- Proteção de compatibilidade: qualquer transição legada para perdido também
  -- ganha um registro estruturado. O RPC transacional sinaliza quando já inseriu.
  if tg_op = 'UPDATE'
     and old.status is distinct from 'lost'
     and new.status = 'lost'
     and coalesce(current_setting('app.loss_recorded', true), '') <> 'on' then
    insert into public.losses (
      event_id, lead_id, store_id, reason, description, lost_stage, registered_by, registered_at
    ) values (
      new.event_id,
      new.id,
      new.assigned_store_id,
      'other',
      nullif(trim(coalesce(new.lost_reason, '')), ''),
      old.status,
      v_user_id,
      now()
    );
  end if;

  if not v_caller_managed_audit then
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
  end if;

  update public.leads
  set
    stage_entered_at = case when v_status_changed then now() else stage_entered_at end,
    last_activity_at = case when v_caller_managed_audit then new.last_activity_at else now() end,
    last_activity_type = case when v_caller_managed_audit then new.last_activity_type else v_activity_type end,
    last_activity_label = case when v_caller_managed_audit then new.last_activity_label else v_activity_label end,
    last_activity_by_name = case when v_caller_managed_audit then new.last_activity_by_name else v_user_name end
  where id = new.id;

  if v_status_changed then
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


-- Funções de trigger não são endpoints públicos.
revoke execute on function public.log_lead_activity_from_leads() from public, anon, authenticated;
revoke execute on function public.sync_sale_vehicle_from_lead() from public, anon, authenticated;
revoke execute on function public.sync_site_vehicle_sale_lifecycle() from public, anon, authenticated;
revoke execute on function public.validate_lead_team_assignment() from public, anon, authenticated;

commit;
