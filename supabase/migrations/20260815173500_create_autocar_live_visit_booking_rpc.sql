-- AGENDAMENTO LIVE V1 da AUTOCAR.
-- Escopo piloto: somente A4 Multimarcas, somente visita, chamada server-side via service_role.

begin;

create or replace function public.autocar_schedule_visit_transaction(
  p_store_id uuid,
  p_lead_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer default 60,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_a4_store_id constant uuid := '239755c3-a2d4-4cdd-9502-f1595031c924'::uuid;
  v_lead public.leads%rowtype;
  v_duration integer;
  v_ends_at timestamptz;
  v_conflict jsonb;
  v_now timestamptz := now();
  v_day_key text;
begin
  if p_store_id is null or p_store_id <> v_a4_store_id then
    return jsonb_build_object(
      'success', false,
      'code', 'store_not_authorized',
      'message', 'AGENDAMENTO LIVE V1 está restrito à A4 Multimarcas.'
    );
  end if;

  if p_lead_id is null or p_starts_at is null then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_input',
      'message', 'Lead, data e horário são obrigatórios.'
    );
  end if;

  if p_starts_at <= v_now then
    return jsonb_build_object(
      'success', false,
      'code', 'past_datetime',
      'message', 'Não é permitido agendar visita em horário passado.'
    );
  end if;

  v_duration := greatest(15, least(480, coalesce(p_duration_minutes, 60)));
  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  v_day_key := to_char(p_starts_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');

  -- Serializa criações de agenda da AUTOCAR para a mesma loja/dia.
  -- O lock por dia também protege contra duas solicitações com horários sobrepostos,
  -- ainda que os horários de início não sejam idênticos.
  perform pg_advisory_xact_lock(
    hashtextextended('autocar-live-visit:' || p_store_id::text || ':' || v_day_key, 0)
  );

  select *
  into v_lead
  from public.leads
  where id = p_lead_id
    and assigned_store_id = p_store_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'lead_not_found',
      'message', 'Lead canônico não encontrado na loja piloto.'
    );
  end if;

  if v_lead.status = 'scheduled' then
    if v_lead.scheduled_at = p_starts_at then
      return jsonb_build_object(
        'success', true,
        'code', 'already_scheduled',
        'idempotent', true,
        'lead_id', v_lead.id,
        'store_id', p_store_id,
        'scheduled_at', v_lead.scheduled_at,
        'duration_minutes', v_duration,
        'appointment_type', coalesce(v_lead.appointment_type, 'visit')
      );
    end if;

    return jsonb_build_object(
      'success', false,
      'code', 'lead_already_scheduled',
      'message', 'Este lead já possui outro agendamento e não será remarcado automaticamente.',
      'scheduled_at', v_lead.scheduled_at
    );
  end if;

  if coalesce(v_lead.status, '') not in ('new_lead', 'in_service', 'appointment_cancelled', 'no_show') then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_lead_state',
      'message', 'O estado atual do lead não permite criação automática de visita.',
      'lead_status', v_lead.status
    );
  end if;

  select to_jsonb(conflict_row)
  into v_conflict
  from (
    select
      'lead'::text as source,
      l.id::text as id,
      coalesce(nullif(l.customer_name, ''), 'Agendamento de lead')::text as title,
      l.scheduled_at as starts_at,
      l.scheduled_at + interval '60 minutes' as ends_at
    from public.leads l
    where l.assigned_store_id = p_store_id
      and l.id <> p_lead_id
      and l.scheduled_at is not null
      and coalesce(l.status, '') not in ('appointment_cancelled', 'lost', 'deleted', 'no_show')
      and l.scheduled_at < v_ends_at
      and (l.scheduled_at + interval '60 minutes') > p_starts_at

    union all

    select
      'task'::text as source,
      t.id::text as id,
      coalesce(nullif(t.title, ''), 'Tarefa da loja')::text as title,
      t.starts_at as starts_at,
      coalesce(t.ends_at, t.starts_at + interval '60 minutes') as ends_at
    from public.store_calendar_tasks t
    where t.store_id = p_store_id
      and coalesce(t.status, '') not in ('completed', 'cancelled', 'done')
      and t.starts_at < v_ends_at
      and coalesce(t.ends_at, t.starts_at + interval '60 minutes') > p_starts_at

    order by starts_at
    limit 1
  ) conflict_row;

  if v_conflict is not null then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_unavailable',
      'message', 'O horário ficou indisponível na revalidação transacional.',
      'conflict', v_conflict,
      'requested_starts_at', p_starts_at,
      'requested_ends_at', v_ends_at
    );
  end if;

  update public.leads
  set
    status = 'scheduled',
    scheduled_at = p_starts_at,
    appointment_type = 'visit',
    appointment_notes = left(
      coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'Visita agendada pela AUTOCAR.'),
      3000
    ),
    appointment_cancelled_at = null,
    appointment_cancelled_reason = null,
    lost_reason = null,
    updated_at = v_now
  where id = v_lead.id
    and assigned_store_id = p_store_id;

  return jsonb_build_object(
    'success', true,
    'code', 'scheduled',
    'idempotent', false,
    'lead_id', v_lead.id,
    'store_id', p_store_id,
    'scheduled_at', p_starts_at,
    'ends_at', v_ends_at,
    'duration_minutes', v_duration,
    'appointment_type', 'visit'
  );
end;
$function$;

revoke all on function public.autocar_schedule_visit_transaction(uuid, uuid, timestamptz, integer, text) from public;
revoke all on function public.autocar_schedule_visit_transaction(uuid, uuid, timestamptz, integer, text) from anon;
revoke all on function public.autocar_schedule_visit_transaction(uuid, uuid, timestamptz, integer, text) from authenticated;
grant execute on function public.autocar_schedule_visit_transaction(uuid, uuid, timestamptz, integer, text) to service_role;

comment on function public.autocar_schedule_visit_transaction(uuid, uuid, timestamptz, integer, text)
is 'AGENDAMENTO LIVE V1 AUTOCAR: transação restrita à A4 para criar visita no lead canônico, com lock por loja/dia, idempotência e revalidação de conflitos. Server-side service_role only.';

commit;
