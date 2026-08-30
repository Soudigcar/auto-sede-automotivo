-- Atomic store configuration save for Smart Follow-up V2.
-- Service-role only. This function does not enable AUTOPILOT, change the Master
-- ceiling, schedule messages, or create any outbound execution path.

-- readMasterFollowUpV2 uses these same disabled defaults when no Master row
-- exists. Persisting the baseline keeps the transactional database validator
-- authoritative without enabling any journey.
insert into public.ai_follow_up_scenarios (
  scope, store_id, scenario_key, title, description, enabled,
  attribution_window_minutes, version
) values
  ('global', null, 'silent_lead', 'Lead ficou em silêncio', 'Retoma quando o cliente para de responder após uma interação comercial elegível.', false, 1440, 1),
  ('global', null, 'simulation_pending', 'Simulação pendente', 'Retoma clientes que pediram simulação e não avançaram na conversa.', false, 2880, 1),
  ('global', null, 'vehicle_interest', 'Interesse em veículo', 'Retoma a conversa usando o veículo de interesse já conhecido pelo contexto.', false, 2880, 1),
  ('global', null, 'visit_confirmation', 'Confirmar visita', 'Confirma a visita antes do horário marcado.', false, 720, 1),
  ('global', null, 'post_visit', 'Pós-visita', 'Retoma somente quando o CRM comprova comparecimento.', false, 2880, 1),
  ('global', null, 'no_show', 'Não compareceu', 'Recupera ausência comprovada e oferece reagendamento.', false, 1440, 1),
  ('global', null, 'callback_requested', 'Retorno solicitado pelo cliente', 'Respeita data e hora explicitamente pedidas pelo cliente; nunca inventa horário.', false, 1440, 1)
on conflict do nothing;

create or replace function public.save_autocar_follow_up_store_config_v2(
  p_store_id uuid,
  p_settings jsonb,
  p_scenarios jsonb,
  p_previous_value jsonb,
  p_new_value jsonb,
  p_actor_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_master public.ai_follow_up_global_settings%rowtype;
  v_store_version integer;
  v_mode text := coalesce(p_settings ->> 'mode', 'off');
  v_enabled boolean := coalesce((p_settings ->> 'enabled')::boolean, false);
  v_allowed_start time := (p_settings ->> 'allowed_start')::time;
  v_allowed_end time := (p_settings ->> 'allowed_end')::time;
  v_max_per_lead_per_day integer := (p_settings ->> 'max_per_lead_per_day')::integer;
  v_max_per_sequence integer := (p_settings ->> 'max_per_sequence')::integer;
  v_max_sequence_days integer := (p_settings ->> 'max_sequence_days')::integer;
  v_min_interval_minutes integer := (p_settings ->> 'min_interval_minutes')::integer;
  v_scenario jsonb;
  v_step jsonb;
  v_scenario_key text;
  v_scenario_id uuid;
  v_master_scenario public.ai_follow_up_scenarios%rowtype;
  v_attribution integer;
  v_delay integer;
  v_previous_delay integer;
  v_step_order integer;
  v_enabled_steps integer;
  v_scenario_count integer;
  v_distinct_scenario_count integer;
begin
  if p_settings is null or p_scenarios is null
    or jsonb_typeof(p_settings) <> 'object' or jsonb_typeof(p_scenarios) <> 'array' then
    raise exception using errcode = '22023', message = 'Configuração transacional do Follow-up inválida.';
  end if;

  if not exists (select 1 from public.ai_store_refs where store_id = p_store_id) then
    raise exception using errcode = '23503', message = 'Loja não está registrada no AUTOCAR.';
  end if;

  select * into v_master
  from public.ai_follow_up_global_settings
  where id = 'primary'
  for share;

  if not found then
    raise exception using errcode = '55000', message = 'Teto Master do Follow-up não está disponível.';
  end if;

  if v_mode not in ('off', 'copilot', 'autopilot') then
    raise exception using errcode = '22023', message = 'Modo do Follow-up inválido.';
  end if;
  if v_mode = 'autopilot' and p_store_id <> '239755c3-a2d4-4cdd-9502-f1595031c924'::uuid then
    raise exception using errcode = '42501', message = 'AUTOPILOT do Follow-up permanece restrito ao canário A4.';
  end if;
  if v_enabled and not v_master.enabled then
    raise exception using errcode = '42501', message = 'O Master não habilitou o Follow-up.';
  end if;
  if v_mode = 'autopilot' and v_master.mode <> 'autopilot' then
    raise exception using errcode = '42501', message = 'O Master não liberou AUTOPILOT para o Follow-up.';
  end if;
  if v_allowed_start >= v_allowed_end then
    raise exception using errcode = '22023', message = 'A janela de envio da loja é inválida.';
  end if;
  if v_max_per_lead_per_day not between 1 and 5 then
    raise exception using errcode = '22023', message = 'Máximo diário da loja precisa ficar entre 1 e 5.';
  end if;
  if v_max_per_sequence not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Máximo por sequência da loja precisa ficar entre 1 e 10.';
  end if;
  if v_max_sequence_days not between 1 and 30 then
    raise exception using errcode = '22023', message = 'Duração da loja precisa ficar entre 1 e 30 dias.';
  end if;
  if v_min_interval_minutes < 15 then
    raise exception using errcode = '22023', message = 'Intervalo mínimo da loja precisa ser de pelo menos 15 minutos.';
  end if;

  select count(*), count(distinct value ->> 'key')
    into v_scenario_count, v_distinct_scenario_count
  from jsonb_array_elements(p_scenarios);
  if v_scenario_count <> 7 or v_distinct_scenario_count <> 7 then
    raise exception using errcode = '22023', message = 'As sete jornadas do Follow-up devem ser enviadas uma única vez.';
  end if;

  select version into v_store_version
  from public.ai_follow_up_store_settings
  where store_id = p_store_id
  for update;

  insert into public.ai_follow_up_store_settings (
    store_id, enabled, mode, allowed_start, allowed_end,
    max_per_lead_per_day, max_per_sequence, max_sequence_days,
    min_interval_minutes, version, updated_by_profile_id, updated_at
  ) values (
    p_store_id, v_enabled, v_mode, v_allowed_start, v_allowed_end,
    v_max_per_lead_per_day, v_max_per_sequence, v_max_sequence_days,
    v_min_interval_minutes, coalesce(v_store_version, 0) + 1,
    p_actor_profile_id, now()
  )
  on conflict (store_id) do update set
    enabled = excluded.enabled,
    mode = excluded.mode,
    allowed_start = excluded.allowed_start,
    allowed_end = excluded.allowed_end,
    max_per_lead_per_day = excluded.max_per_lead_per_day,
    max_per_sequence = excluded.max_per_sequence,
    max_sequence_days = excluded.max_sequence_days,
    min_interval_minutes = excluded.min_interval_minutes,
    version = excluded.version,
    updated_by_profile_id = excluded.updated_by_profile_id,
    updated_at = excluded.updated_at;

  for v_scenario in select value from jsonb_array_elements(p_scenarios)
  loop
    v_scenario_key := v_scenario ->> 'key';
    v_attribution := (v_scenario ->> 'attributionWindowMinutes')::integer;
    if v_attribution not between 15 and 10080 then
      raise exception using errcode = '22023', message = format('Janela de atribuição inválida para %s.', v_scenario_key);
    end if;

    select * into v_master_scenario
    from public.ai_follow_up_scenarios
    where scope = 'global' and store_id is null and scenario_key = v_scenario_key
    for share;
    if not found then
      raise exception using errcode = '22023', message = format('Jornada não autorizada pelo Master: %s.', v_scenario_key);
    end if;

    if jsonb_typeof(coalesce(v_scenario -> 'steps', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = '22023', message = format('Etapas inválidas para %s.', v_scenario_key);
    end if;

    select count(*) into v_enabled_steps
    from jsonb_array_elements(coalesce(v_scenario -> 'steps', '[]'::jsonb)) step
    where coalesce((step.value ->> 'enabled')::boolean, true);
    if v_scenario_key = 'callback_requested' and v_enabled_steps <> 0 then
      raise exception using errcode = '22023', message = 'Retorno solicitado usa somente o horário explícito do cliente.';
    end if;
    if v_scenario_key <> 'callback_requested'
      and coalesce((v_scenario ->> 'enabled')::boolean, false)
      and v_enabled_steps = 0 then
      raise exception using errcode = '22023', message = format('Jornada %s precisa de ao menos uma etapa.', v_scenario_key);
    end if;
    if v_enabled_steps > v_max_per_sequence then
      raise exception using errcode = '22023', message = format('Jornada %s excede o máximo por sequência.', v_scenario_key);
    end if;

    v_previous_delay := null;
    v_step_order := 0;
    for v_step in select value from jsonb_array_elements(coalesce(v_scenario -> 'steps', '[]'::jsonb))
    loop
      v_step_order := v_step_order + 1;
      v_delay := (v_step ->> 'delayMinutes')::integer;
      if v_delay = 0
        or (v_scenario_key = 'visit_confirmation' and v_delay >= 0)
        or (v_scenario_key <> 'visit_confirmation' and v_delay <= 0) then
        raise exception using errcode = '22023', message = format('Direção temporal inválida na jornada %s.', v_scenario_key);
      end if;
      if v_previous_delay is not null and v_delay <= v_previous_delay then
        raise exception using errcode = '22023', message = format('Etapas fora de ordem na jornada %s.', v_scenario_key);
      end if;
      v_previous_delay := v_delay;
    end loop;

    v_scenario_id := null;
    select id into v_scenario_id
    from public.ai_follow_up_scenarios
    where scope = 'store' and store_id = p_store_id and scenario_key = v_scenario_key
    for update;

    if v_scenario_id is null then
      insert into public.ai_follow_up_scenarios (
        scope, store_id, scenario_key, title, description, enabled,
        attribution_window_minutes, version, updated_by_profile_id, updated_at
      ) values (
        'store', p_store_id, v_scenario_key, v_master_scenario.title, v_master_scenario.description,
        coalesce((v_scenario ->> 'enabled')::boolean, false),
        v_attribution, 1, p_actor_profile_id, now()
      ) returning id into v_scenario_id;
    else
      update public.ai_follow_up_scenarios set
        title = v_master_scenario.title,
        description = v_master_scenario.description,
        enabled = coalesce((v_scenario ->> 'enabled')::boolean, false),
        attribution_window_minutes = v_attribution,
        version = version + 1,
        updated_by_profile_id = p_actor_profile_id,
        updated_at = now()
      where id = v_scenario_id;
    end if;

    delete from public.ai_follow_up_scenario_steps where scenario_id = v_scenario_id;
    v_step_order := 0;
    for v_step in select value from jsonb_array_elements(coalesce(v_scenario -> 'steps', '[]'::jsonb))
    loop
      v_step_order := v_step_order + 1;
      v_delay := (v_step ->> 'delayMinutes')::integer;
      insert into public.ai_follow_up_scenario_steps (
        scenario_id, step_order, delay_minutes, label, enabled
      ) values (
        v_scenario_id,
        v_step_order,
        v_delay,
        left(coalesce(nullif(v_step ->> 'label', ''), format('%s minutos', abs(v_delay))), 120),
        coalesce((v_step ->> 'enabled')::boolean, true)
      );
    end loop;
  end loop;

  insert into public.ai_follow_up_config_audit (
    scope, record_key, previous_value, new_value, actor_profile_id
  ) values (
    'store', p_store_id::text, p_previous_value, p_new_value, p_actor_profile_id
  );

  return jsonb_build_object('saved', true, 'store_id', p_store_id, 'atomic', true);
end;
$$;

revoke all on function public.save_autocar_follow_up_store_config_v2(uuid, jsonb, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.save_autocar_follow_up_store_config_v2(uuid, jsonb, jsonb, jsonb, jsonb, uuid)
  to service_role;

comment on function public.save_autocar_follow_up_store_config_v2(uuid, jsonb, jsonb, jsonb, jsonb, uuid) is
  'Atomically validates and saves one store Smart Follow-up V2 preference set; effective execution remains clamped by the Master; service-role only.';
