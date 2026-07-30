-- Fase 2C.3A — cancelamento e perda transacionais.
-- Aplicar após phase-2c3a-02 e somente com autorização explícita.

begin;

create or replace function public.store_cancel_sale_transaction(
  p_lead_id uuid,
  p_store_id uuid,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor public.users%rowtype;
  v_lead public.leads%rowtype;
  v_sale public.sales%rowtype;
  v_now timestamptz := now();
  v_reason text;
  v_actor_name text;
begin
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'Informe o motivo do cancelamento da venda.';
  end if;

  select * into v_actor
  from public.users
  where id = p_actor_user_id and status = 'active';
  if not found or v_actor.role not in ('master', 'store') then
    raise exception 'Somente Gestor da Loja ou Master pode cancelar vendas.';
  end if;
  if v_actor.role <> 'master' and v_actor.store_id is distinct from p_store_id then
    raise exception 'O usuário responsável não pertence a esta loja.';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id and assigned_store_id = p_store_id
  for update;
  if not found then
    raise exception 'Lead não encontrado nesta loja.';
  end if;
  if v_lead.status <> 'sale_confirmed' then
    raise exception 'Este lead não possui uma venda confirmada ativa.';
  end if;

  select * into v_sale
  from public.sales
  where lead_id = v_lead.id and store_id = p_store_id and status = 'confirmed'
  for update;
  if not found then
    raise exception 'Registro ativo da venda não foi encontrado.';
  end if;

  v_actor_name := coalesce(nullif(trim(p_actor_name), ''), nullif(trim(v_actor.full_name), ''), v_actor.email, 'Usuário');

  update public.leads
  set status = 'showed_up',
      updated_at = v_now,
      last_activity_at = v_now,
      last_activity_type = 'sale_cancelled',
      last_activity_label = 'Venda cancelada',
      last_activity_by_name = v_actor_name
  where id = v_lead.id;

  update public.sales
  set status = 'cancelled',
      cancelled_at = v_now,
      cancelled_by = v_actor.id,
      cancellation_reason = v_reason
  where id = v_sale.id;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    v_lead.id, v_lead.assigned_store_id,
    (select store_name from public.stores where id = v_lead.assigned_store_id),
    v_actor.id, v_actor_name, 'sale_cancelled', 'Venda cancelada',
    'sale_confirmed', 'showed_up', v_lead.customer_name, v_lead.customer_phone,
    v_lead.interested_vehicle, v_reason,
    jsonb_build_object('sale_id', v_sale.id, 'vehicle_id', v_sale.vehicle_id, 'transaction', 'store_cancel_sale_transaction')
  );

  insert into public.lead_activities (
    event_id, lead_id, user_id, activity_type, description, metadata
  ) values (
    v_lead.event_id, v_lead.id, v_actor.id, 'sale_cancelled',
    v_actor_name || ' cancelou a venda. Motivo: ' || v_reason || '.',
    jsonb_build_object('sale_id', v_sale.id)
  );

  insert into public.audit_logs (
    event_id, user_id, user_role, action_type, entity_type, entity_id, old_value, new_value
  ) values (
    v_lead.event_id, v_actor.id, v_actor.role, 'sale_cancelled', 'sales', v_sale.id,
    jsonb_build_object('lead_status', 'sale_confirmed', 'sale_status', 'confirmed'),
    jsonb_build_object('lead_status', 'showed_up', 'sale_status', 'cancelled', 'cancellation_reason', v_reason)
  );

  return v_sale.id;
end;
$function$;

create or replace function public.store_register_loss_transaction(
  p_lead_id uuid,
  p_store_id uuid,
  p_reason text,
  p_description text,
  p_actor_user_id uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor public.users%rowtype;
  v_lead public.leads%rowtype;
  v_loss_id uuid;
  v_now timestamptz := now();
  v_reason text;
  v_description text;
  v_actor_name text;
  v_has_access boolean := false;
begin
  v_reason := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'other');
  v_description := nullif(trim(coalesce(p_description, '')), '');
  if v_description is null or length(v_description) < 3 then
    raise exception 'Informe o motivo da perda.';
  end if;

  select * into v_actor
  from public.users
  where id = p_actor_user_id and status = 'active';
  if not found or v_actor.role not in ('master', 'store', 'pre_sales', 'seller', 'prospector') then
    raise exception 'Usuário responsável não possui acesso comercial ativo.';
  end if;
  if v_actor.role <> 'master' and v_actor.store_id is distinct from p_store_id then
    raise exception 'O usuário responsável não pertence a esta loja.';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id and assigned_store_id = p_store_id
  for update;
  if not found then
    raise exception 'Lead não encontrado nesta loja.';
  end if;

  v_has_access := v_actor.role in ('master', 'store')
    or (v_actor.role = 'pre_sales' and (v_lead.pre_sales_user_id = v_actor.id or v_lead.assigned_user_id = v_actor.id))
    or (v_actor.role = 'seller' and (v_lead.seller_user_id = v_actor.id or v_lead.assigned_user_id = v_actor.id))
    or (v_actor.role = 'prospector' and (v_lead.captured_by_user_id = v_actor.id or v_lead.assigned_user_id = v_actor.id));
  if not v_has_access then
    raise exception 'Este lead não pertence à carteira do usuário.';
  end if;

  if v_lead.status in ('sale_confirmed', 'lost', 'deleted') then
    raise exception 'O estado atual do lead não permite registrar perda.';
  end if;

  if exists (
    select 1 from public.sales
    where lead_id = v_lead.id and store_id = p_store_id and status = 'confirmed'
  ) then
    raise exception 'Não é possível registrar perda para um lead com venda ativa.';
  end if;

  v_actor_name := coalesce(nullif(trim(p_actor_name), ''), nullif(trim(v_actor.full_name), ''), v_actor.email, 'Usuário');

  insert into public.losses (
    event_id, lead_id, store_id, reason, description, lost_stage, registered_by, registered_at
  ) values (
    v_lead.event_id, v_lead.id, v_lead.assigned_store_id,
    v_reason, v_description, v_lead.status, v_actor.id, v_now
  ) returning id into v_loss_id;

  perform set_config('app.loss_recorded', 'on', true);

  update public.leads
  set status = 'lost',
      lost_reason = v_description,
      updated_at = v_now,
      last_activity_at = v_now,
      last_activity_type = 'lost_registered',
      last_activity_label = 'Perda registrada',
      last_activity_by_name = v_actor_name
  where id = v_lead.id;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    v_lead.id, v_lead.assigned_store_id,
    (select store_name from public.stores where id = v_lead.assigned_store_id),
    v_actor.id, v_actor_name, 'lost_registered', 'Perda registrada',
    v_lead.status, 'lost', v_lead.customer_name, v_lead.customer_phone,
    v_lead.interested_vehicle, v_description,
    jsonb_build_object('loss_id', v_loss_id, 'reason', v_reason, 'transaction', 'store_register_loss_transaction')
  );

  insert into public.lead_activities (
    event_id, lead_id, user_id, activity_type, description, metadata
  ) values (
    v_lead.event_id, v_lead.id, v_actor.id, 'lost_registered',
    v_actor_name || ' registrou a perda. Motivo: ' || v_description || '.',
    jsonb_build_object('loss_id', v_loss_id, 'reason', v_reason, 'lost_stage', v_lead.status)
  );

  insert into public.audit_logs (
    event_id, user_id, user_role, action_type, entity_type, entity_id, old_value, new_value
  ) values (
    v_lead.event_id, v_actor.id, v_actor.role, 'lost_registered', 'losses', v_loss_id,
    jsonb_build_object('lead_status', v_lead.status),
    jsonb_build_object('lead_status', 'lost', 'lead_id', v_lead.id, 'store_id', v_lead.assigned_store_id, 'reason', v_reason, 'description', v_description)
  );

  return v_loss_id;
end;
$function$;


revoke all on function public.store_cancel_sale_transaction(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.store_cancel_sale_transaction(uuid, uuid, text, uuid, text)
  to service_role;

revoke all on function public.store_register_loss_transaction(uuid, uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.store_register_loss_transaction(uuid, uuid, text, text, uuid, text)
  to service_role;

commit;
