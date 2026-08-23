begin;

create table if not exists public.lead_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.users(id) on delete restrict,
  file_name text not null check (char_length(file_name) between 1 and 240),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  event_id uuid references public.events(id) on delete set null,
  selected_store_ids uuid[] not null default '{}',
  assignee_ids uuid[] not null default '{}',
  chunk_index integer not null default 1 check (chunk_index > 0),
  chunk_count integer not null default 1 check (chunk_count >= chunk_index),
  total_rows integer not null default 0 check (total_rows >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  distributed_count integer not null default 0 check (distributed_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  status text not null default 'completed' check (status in ('completed', 'completed_with_errors')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);

comment on table public.lead_import_batches is
  'Auditoria de lotes de importação de leads executados exclusivamente pelo Master.';

create table if not exists public.lead_import_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.lead_import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  result_status text not null check (result_status in ('inserted', 'updated', 'duplicate', 'conflict', 'error')),
  lead_base_id uuid references public.leads_base(id) on delete set null,
  routed_lead_id uuid references public.leads(id) on delete set null,
  matched_by text[] not null default '{}',
  assigned_store_id uuid references public.stores(id) on delete set null,
  assigned_user_id uuid references public.users(id) on delete set null,
  message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

comment on table public.lead_import_batch_items is
  'Resultado por linha, sem armazenar novamente os dados pessoais enviados no arquivo.';

alter table public.lead_import_batches enable row level security;
alter table public.lead_import_batch_items enable row level security;

revoke all on table public.lead_import_batches from public, anon, authenticated;
revoke all on table public.lead_import_batch_items from public, anon, authenticated;
grant select, insert, update on table public.lead_import_batches to service_role;
grant select, insert, update on table public.lead_import_batch_items to service_role;

create index if not exists lead_import_batches_created_by_idx
  on public.lead_import_batches(created_by, created_at desc);
create index if not exists lead_import_batches_file_hash_idx
  on public.lead_import_batches(file_sha256, created_at desc);
create index if not exists lead_import_batch_items_batch_status_idx
  on public.lead_import_batch_items(batch_id, result_status, row_number);

create index if not exists leads_base_normalized_phone_import_idx
  on public.leads_base ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')))
  where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') <> '';
create index if not exists leads_base_normalized_cpf_import_idx
  on public.leads_base ((regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g')))
  where regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') <> '';
create index if not exists leads_base_normalized_email_import_idx
  on public.leads_base ((lower(btrim(coalesce(email, '')))))
  where btrim(coalesce(email, '')) <> '';

create or replace function public.master_import_leads_batch(
  p_rows jsonb,
  p_event_id uuid,
  p_selected_store_ids uuid[],
  p_assignee_ids uuid[],
  p_file_name text,
  p_file_sha256 text,
  p_actor_user_id uuid,
  p_chunk_index integer default 1,
  p_chunk_count integer default 1,
  p_distribution_offset integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_batch_id uuid;
  v_input record;
  v_payload jsonb;
  v_row_number integer;
  v_name text;
  v_phone text;
  v_cpf text;
  v_email text;
  v_birth_date text;
  v_city text;
  v_source text;
  v_campaign_name text;
  v_vehicle_name text;
  v_notes text;
  v_match_ids uuid[];
  v_matched_by text[];
  v_base public.leads_base%rowtype;
  v_routed public.leads%rowtype;
  v_base_id uuid;
  v_routed_id uuid;
  v_assignee_id uuid;
  v_assignee_store_id uuid;
  v_assignee_role text;
  v_assignee_name text;
  v_assignee_store_name text;
  v_metadata jsonb;
  v_changed boolean;
  v_assignment_applied boolean;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_distributed integer := 0;
  v_duplicates integer := 0;
  v_conflicts integer := 0;
  v_errors integer := 0;
  v_total integer;
  v_assignee_count integer;
  v_item_status text;
  v_item_message text;
  v_items jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'As linhas da importação devem ser uma lista.' using errcode = '22023';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total < 1 or v_total > 500 then
    raise exception 'Cada lote deve conter entre 1 e 500 linhas.' using errcode = '22023';
  end if;
  if p_file_name is null or char_length(btrim(p_file_name)) not between 1 and 240 then
    raise exception 'Nome do arquivo inválido.' using errcode = '22023';
  end if;
  if p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash do arquivo inválido.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_selected_store_ids), 0) < 1 then
    raise exception 'Selecione ao menos uma loja.' using errcode = '22023';
  end if;
  if p_chunk_index < 1 or p_chunk_count < p_chunk_index or p_distribution_offset < 0 then
    raise exception 'Controle de lotes inválido.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.users actor
    where actor.id = p_actor_user_id and actor.role = 'master' and actor.status = 'active'
  ) then
    raise exception 'Acesso restrito ao Master.' using errcode = '42501';
  end if;

  if (
    select count(distinct store.id)
    from public.stores store
    where store.id = any(p_selected_store_ids) and store.status = 'active'
  ) <> cardinality(p_selected_store_ids) then
    raise exception 'Uma ou mais lojas selecionadas são inválidas ou inativas.' using errcode = '22023';
  end if;

  if p_event_id is not null then
    if not exists (select 1 from public.events event where event.id = p_event_id and event.status <> 'deleted') then
      raise exception 'Evento inválido.' using errcode = '22023';
    end if;
    if (
      select count(distinct participation.store_id)
      from public.store_event_participations participation
      where participation.event_id = p_event_id
        and participation.store_id = any(p_selected_store_ids)
        and participation.status in ('active', 'inactive')
    ) <> cardinality(p_selected_store_ids) then
      raise exception 'Uma ou mais lojas não participam do evento selecionado.' using errcode = '22023';
    end if;
  end if;

  v_assignee_count := coalesce(cardinality(p_assignee_ids), 0);
  if v_assignee_count > 0 and (
    select count(distinct member.id)
    from public.users member
    where member.id = any(p_assignee_ids)
      and member.store_id = any(p_selected_store_ids)
      and member.status = 'active'
      and member.role in ('pre_sales', 'seller', 'prospector')
  ) <> v_assignee_count then
    raise exception 'Uma ou mais pessoas selecionadas não podem receber estes leads.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('master_import_leads_batch', 0));

  insert into public.lead_import_batches (
    created_by, file_name, file_sha256, event_id, selected_store_ids, assignee_ids,
    chunk_index, chunk_count, total_rows, metadata
  ) values (
    p_actor_user_id, btrim(p_file_name), p_file_sha256, p_event_id,
    p_selected_store_ids, coalesce(p_assignee_ids, '{}'), p_chunk_index, p_chunk_count,
    v_total, jsonb_build_object('distribution_offset', p_distribution_offset)
  ) returning id into v_batch_id;

  for v_input in
    select value as payload, ordinality
    from jsonb_array_elements(p_rows) with ordinality
  loop
    begin
      v_payload := v_input.payload;
      v_row_number := case
        when coalesce(v_payload ->> 'row_number', '') ~ '^[0-9]+$'
          then greatest((v_payload ->> 'row_number')::integer, 1)
        else v_input.ordinality::integer + 1
      end;
      v_name := left(btrim(coalesce(v_payload ->> 'name', '')), 240);
      v_phone := left(regexp_replace(coalesce(v_payload ->> 'phone', ''), '[^0-9]', '', 'g'), 15);
      v_cpf := left(regexp_replace(coalesce(v_payload ->> 'cpf', ''), '[^0-9]', '', 'g'), 11);
      v_email := left(lower(btrim(coalesce(v_payload ->> 'email', ''))), 320);
      v_birth_date := left(btrim(coalesce(v_payload ->> 'birth_date', '')), 10);
      v_city := left(btrim(coalesce(v_payload ->> 'city', '')), 160);
      v_source := left(btrim(coalesce(v_payload ->> 'source', '')), 120);
      v_campaign_name := left(btrim(coalesce(v_payload ->> 'campaign_name', '')), 240);
      v_vehicle_name := left(btrim(coalesce(v_payload ->> 'vehicle_name', '')), 240);
      v_notes := left(btrim(coalesce(v_payload ->> 'notes', '')), 2000);

      if char_length(v_name) < 1 or (v_phone = '' and v_cpf = '' and v_email = '') then
        raise exception 'Nome e pelo menos um identificador são obrigatórios.' using errcode = '22023';
      end if;
      if v_phone <> '' and char_length(v_phone) not between 10 and 15 then
        raise exception 'Telefone inválido.' using errcode = '22023';
      end if;
      if v_cpf <> '' and char_length(v_cpf) <> 11 then
        raise exception 'CPF inválido.' using errcode = '22023';
      end if;

      select coalesce(array_agg(distinct matched.id), '{}')
        into v_match_ids
      from (
        select base.id from public.leads_base base
        where v_cpf <> '' and regexp_replace(coalesce(base.cpf, ''), '[^0-9]', '', 'g') = v_cpf
        union
        select base.id from public.leads_base base
        where v_phone <> '' and regexp_replace(coalesce(base.phone, ''), '[^0-9]', '', 'g') = v_phone
        union
        select base.id from public.leads_base base
        where v_email <> '' and lower(btrim(coalesce(base.email, ''))) = v_email
      ) matched;

      if cardinality(v_match_ids) > 1 then
        v_conflicts := v_conflicts + 1;
        insert into public.lead_import_batch_items (
          batch_id, row_number, result_status, message, metadata
        ) values (
          v_batch_id, v_row_number, 'conflict',
          'CPF, telefone ou e-mail apontam para leads diferentes. Nenhum dado foi alterado.',
          jsonb_build_object('matching_lead_count', cardinality(v_match_ids))
        );
        continue;
      end if;

      v_assignment_applied := false;
      v_changed := false;
      v_assignee_id := null;
      v_assignee_store_id := null;
      v_assignee_role := null;
      v_assignee_name := null;
      v_assignee_store_name := null;
      v_routed_id := null;
      v_base_id := null;
      v_matched_by := '{}';
      v_item_message := null;

      if cardinality(v_match_ids) = 1 then
        v_duplicates := v_duplicates + 1;
        select * into v_base from public.leads_base where id = v_match_ids[1] for update;
        v_base_id := v_base.id;
        v_routed_id := v_base.routed_lead_id;
        v_matched_by := array_remove(array[
          case when v_cpf <> '' and regexp_replace(coalesce(v_base.cpf, ''), '[^0-9]', '', 'g') = v_cpf then 'cpf' end,
          case when v_phone <> '' and regexp_replace(coalesce(v_base.phone, ''), '[^0-9]', '', 'g') = v_phone then 'phone' end,
          case when v_email <> '' and lower(btrim(coalesce(v_base.email, ''))) = v_email then 'email' end
        ], null);

        v_metadata := coalesce(v_base.metadata, '{}');
        if v_city <> '' and btrim(coalesce(v_metadata ->> 'city', '')) = '' then
          v_metadata := jsonb_set(v_metadata, '{city}', to_jsonb(v_city), true);
          v_changed := true;
        end if;
        if v_birth_date <> '' and btrim(coalesce(v_metadata ->> 'birth_date', '')) = '' then
          v_metadata := jsonb_set(v_metadata, '{birth_date}', to_jsonb(v_birth_date), true);
          v_changed := true;
        end if;
        v_changed := v_changed
          or (btrim(coalesce(v_base.name, '')) = '' and v_name <> '')
          or (btrim(coalesce(v_base.phone, '')) = '' and v_phone <> '')
          or (btrim(coalesce(v_base.cpf, '')) = '' and v_cpf <> '')
          or (btrim(coalesce(v_base.email, '')) = '' and v_email <> '')
          or (btrim(coalesce(v_base.source, '')) = '' and v_source <> '')
          or (btrim(coalesce(v_base.campaign_name, '')) = '' and v_campaign_name <> '')
          or (btrim(coalesce(v_base.vehicle_name, '')) = '' and v_vehicle_name <> '')
          or (btrim(coalesce(v_base.notes, '')) = '' and v_notes <> '')
          or (v_base.event_id is null and p_event_id is not null);

        if v_changed then
          update public.leads_base base set
            name = case when btrim(coalesce(base.name, '')) = '' and v_name <> '' then v_name else base.name end,
            phone = case when btrim(coalesce(base.phone, '')) = '' and v_phone <> '' then v_phone else base.phone end,
            cpf = case when btrim(coalesce(base.cpf, '')) = '' and v_cpf <> '' then v_cpf else base.cpf end,
            email = case when btrim(coalesce(base.email, '')) = '' and v_email <> '' then v_email else base.email end,
            source = case when btrim(coalesce(base.source, '')) = '' and v_source <> '' then v_source else base.source end,
            campaign_name = case when btrim(coalesce(base.campaign_name, '')) = '' and v_campaign_name <> '' then v_campaign_name else base.campaign_name end,
            vehicle_name = case when btrim(coalesce(base.vehicle_name, '')) = '' and v_vehicle_name <> '' then v_vehicle_name else base.vehicle_name end,
            notes = case when btrim(coalesce(base.notes, '')) = '' and v_notes <> '' then v_notes else base.notes end,
            event_id = coalesce(base.event_id, p_event_id),
            metadata = v_metadata,
            updated_at = now()
          where base.id = v_base.id
          returning * into v_base;
        end if;

        if v_assignee_count > 0
          and v_base.assigned_store_id is null
          and v_base.assigned_consultant_id is null
          and (v_base.event_id is null or v_base.event_id = p_event_id) then
          v_assignee_id := p_assignee_ids[1 + mod(p_distribution_offset + v_distributed, v_assignee_count)];
          select member.store_id, member.role, member.full_name, store.store_name
            into v_assignee_store_id, v_assignee_role, v_assignee_name, v_assignee_store_name
          from public.users member join public.stores store on store.id = member.store_id
          where member.id = v_assignee_id;

          if v_routed_id is not null then
            select * into v_routed from public.leads where id = v_routed_id for update;
          end if;
          if v_routed_id is null then
            insert into public.leads (
              event_id, customer_name, customer_phone, customer_bank, interested_vehicle,
              vehicle_category_interest, origin, assigned_store_id, captured_by_user_id,
              pre_sales_user_id, pre_sales_assigned_at, seller_user_id, seller_assigned_at,
              assigned_user_id, assigned_user_role, assigned_user_at, assignment_source,
              status, notes, created_at, updated_at
            ) values (
              v_base.event_id, v_base.name, nullif(v_base.phone, ''), '', coalesce(v_base.vehicle_name, ''),
              '', 'manual', v_assignee_store_id,
              case when v_assignee_role = 'prospector' then v_assignee_id end,
              case when v_assignee_role = 'pre_sales' then v_assignee_id end,
              case when v_assignee_role = 'pre_sales' then now() end,
              case when v_assignee_role = 'seller' then v_assignee_id end,
              case when v_assignee_role = 'seller' then now() end,
              v_assignee_id, v_assignee_role, now(), 'master_import',
              'new_lead', coalesce(nullif(v_base.notes, ''), 'Lead importado pela Base Master.'), now(), now()
            ) returning id into v_routed_id;
            v_assignment_applied := true;
          elsif v_routed.assigned_store_id is null and v_routed.assigned_user_id is null then
            update public.leads lead set
              assigned_store_id = v_assignee_store_id,
              captured_by_user_id = case when v_assignee_role = 'prospector' then v_assignee_id else lead.captured_by_user_id end,
              pre_sales_user_id = case when v_assignee_role = 'pre_sales' then v_assignee_id else lead.pre_sales_user_id end,
              pre_sales_assigned_at = case when v_assignee_role = 'pre_sales' then now() else lead.pre_sales_assigned_at end,
              seller_user_id = case when v_assignee_role = 'seller' then v_assignee_id else lead.seller_user_id end,
              seller_assigned_at = case when v_assignee_role = 'seller' then now() else lead.seller_assigned_at end,
              assigned_user_id = v_assignee_id,
              assigned_user_role = v_assignee_role,
              assigned_user_at = now(),
              assignment_source = 'master_import',
              updated_at = now()
            where lead.id = v_routed_id;
            v_assignment_applied := true;
          end if;

          if v_assignment_applied then
            v_changed := true;
            update public.leads_base base set
              assigned_store_id = v_assignee_store_id,
              assigned_store_name = v_assignee_store_name,
              assigned_consultant_id = v_assignee_id,
              assigned_at = now(),
              routed_lead_id = v_routed_id,
              routing_strategy = 'master_import_equal',
              metadata = coalesce(base.metadata, '{}') || jsonb_build_object(
                'import_batch_id', v_batch_id,
                'routing', jsonb_build_object(
                  'strategy', 'master_import_equal',
                  'assigned_store_id', v_assignee_store_id,
                  'assigned_store_name', v_assignee_store_name,
                  'assigned_user_id', v_assignee_id,
                  'assigned_user_name', v_assignee_name,
                  'assigned_role', v_assignee_role,
                  'assigned_at', now(),
                  'routed_lead_id', v_routed_id
                )
              ),
              updated_at = now()
            where base.id = v_base.id;
          end if;
        end if;

        if v_changed then
          v_updated := v_updated + 1;
          v_item_status := 'updated';
        else
          v_item_status := 'duplicate';
          v_item_message := 'Lead já existente; nenhum campo preenchido foi alterado.';
        end if;
      else
        if v_assignee_count > 0 then
          v_assignee_id := p_assignee_ids[1 + mod(p_distribution_offset + v_distributed, v_assignee_count)];
          select member.store_id, member.role, member.full_name, store.store_name
            into v_assignee_store_id, v_assignee_role, v_assignee_name, v_assignee_store_name
          from public.users member join public.stores store on store.id = member.store_id
          where member.id = v_assignee_id;

          insert into public.leads (
            event_id, customer_name, customer_phone, customer_bank, interested_vehicle,
            vehicle_category_interest, origin, assigned_store_id, captured_by_user_id,
            pre_sales_user_id, pre_sales_assigned_at, seller_user_id, seller_assigned_at,
            assigned_user_id, assigned_user_role, assigned_user_at, assignment_source,
            status, notes, created_at, updated_at
          ) values (
            p_event_id, v_name, nullif(v_phone, ''), '', v_vehicle_name,
            '', 'manual', v_assignee_store_id,
            case when v_assignee_role = 'prospector' then v_assignee_id end,
            case when v_assignee_role = 'pre_sales' then v_assignee_id end,
            case when v_assignee_role = 'pre_sales' then now() end,
            case when v_assignee_role = 'seller' then v_assignee_id end,
            case when v_assignee_role = 'seller' then now() end,
            v_assignee_id, v_assignee_role, now(), 'master_import',
            'new_lead', coalesce(nullif(v_notes, ''), 'Lead importado pela Base Master.'), now(), now()
          ) returning id into v_routed_id;
          v_assignment_applied := true;
        end if;

        v_metadata := jsonb_strip_nulls(jsonb_build_object(
          'city', nullif(v_city, ''),
          'birth_date', nullif(v_birth_date, ''),
          'import_batch_id', v_batch_id,
          'import_file_sha256', p_file_sha256,
          'routing', case when v_assignment_applied then jsonb_build_object(
            'strategy', 'master_import_equal',
            'assigned_store_id', v_assignee_store_id,
            'assigned_store_name', v_assignee_store_name,
            'assigned_user_id', v_assignee_id,
            'assigned_user_name', v_assignee_name,
            'assigned_role', v_assignee_role,
            'assigned_at', now(),
            'routed_lead_id', v_routed_id
          ) else null end
        ));

        insert into public.leads_base (
          event_id, name, phone, cpf, email, source, campaign_name, vehicle_name,
          status, assigned_store_id, assigned_store_name, assigned_consultant_id,
          assigned_at, routed_lead_id, routing_strategy, notes, metadata, created_at, updated_at
        ) values (
          p_event_id, v_name, v_phone, nullif(v_cpf, ''), nullif(v_email, ''),
          coalesce(nullif(v_source, ''), 'Importação Master'), nullif(v_campaign_name, ''), nullif(v_vehicle_name, ''),
          'Novo lead', v_assignee_store_id, v_assignee_store_name, v_assignee_id,
          case when v_assignment_applied then now() end, v_routed_id,
          case when v_assignment_applied then 'master_import_equal' else 'master_import_unassigned' end,
          nullif(v_notes, ''), v_metadata, now(), now()
        ) returning id into v_base_id;

        v_inserted := v_inserted + 1;
        v_item_status := 'inserted';
      end if;

      if v_assignment_applied then
        insert into public.lead_assignment_logs (
          lead_id, store_id, assignment_role, from_user_id, to_user_id,
          assignment_mode, assigned_by_user_id, notes, metadata
        ) values (
          v_routed_id, v_assignee_store_id, v_assignee_role, null, v_assignee_id,
          'system', p_actor_user_id, 'Distribuição igual da importação Master.',
          jsonb_build_object('batch_id', v_batch_id, 'row_number', v_row_number, 'strategy', 'master_import_equal')
        );
      end if;

      insert into public.lead_import_batch_items (
        batch_id, row_number, result_status, lead_base_id, routed_lead_id,
        matched_by, assigned_store_id, assigned_user_id, message,
        metadata
      ) values (
        v_batch_id, v_row_number, v_item_status, v_base_id, v_routed_id,
        coalesce(v_matched_by, '{}'), v_assignee_store_id, v_assignee_id, v_item_message,
        jsonb_build_object('assignment_applied', v_assignment_applied)
      );

      if v_assignment_applied then
        v_distributed := v_distributed + 1;
      end if;
    exception when others then
      v_errors := v_errors + 1;
      insert into public.lead_import_batch_items (
        batch_id, row_number, result_status, message
      ) values (
        v_batch_id,
        coalesce(v_row_number, v_input.ordinality::integer + 1),
        'error',
        left(case when sqlstate in ('22023', '23503', '23505', '23514') then sqlerrm else 'A linha não pôde ser processada com segurança.' end, 500)
      ) on conflict (batch_id, row_number) do update
        set result_status = 'error', message = excluded.message;
    end;
  end loop;

  select
    count(*) filter (where item.result_status = 'inserted'),
    count(*) filter (where item.result_status = 'updated'),
    count(*) filter (where item.metadata ->> 'assignment_applied' = 'true'),
    count(*) filter (where item.result_status in ('updated', 'duplicate')),
    count(*) filter (where item.result_status = 'conflict'),
    count(*) filter (where item.result_status = 'error')
  into v_inserted, v_updated, v_distributed, v_duplicates, v_conflicts, v_errors
  from public.lead_import_batch_items item
  where item.batch_id = v_batch_id;

  update public.lead_import_batches batch set
    inserted_count = v_inserted,
    updated_count = v_updated,
    distributed_count = v_distributed,
    duplicate_count = v_duplicates,
    conflict_count = v_conflicts,
    error_count = v_errors,
    status = case when v_errors > 0 or v_conflicts > 0 then 'completed_with_errors' else 'completed' end,
    completed_at = now()
  where batch.id = v_batch_id;

  insert into public.audit_logs (
    event_id, user_id, user_role, action_type, entity_type, entity_id, new_value
  ) values (
    p_event_id, p_actor_user_id, 'master', 'master_lead_import_completed',
    'lead_import_batches', v_batch_id,
    jsonb_build_object(
      'file_sha256', p_file_sha256,
      'chunk_index', p_chunk_index,
      'chunk_count', p_chunk_count,
      'total_rows', v_total,
      'inserted', v_inserted,
      'updated', v_updated,
      'distributed', v_distributed,
      'duplicates', v_duplicates,
      'conflicts', v_conflicts,
      'errors', v_errors
    )
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'row_number', item.row_number,
    'status', item.result_status,
    'message', item.message
  ) order by item.row_number), '[]'::jsonb)
  into v_items
  from public.lead_import_batch_items item
  where item.batch_id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'total_rows', v_total,
    'inserted', v_inserted,
    'updated', v_updated,
    'distributed', v_distributed,
    'duplicates', v_duplicates,
    'conflicts', v_conflicts,
    'errors', v_errors,
    'items', v_items
  );
end;
$function$;

revoke all on function public.master_import_leads_batch(
  jsonb, uuid, uuid[], uuid[], text, text, uuid, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.master_import_leads_batch(
  jsonb, uuid, uuid[], uuid[], text, text, uuid, integer, integer, integer
) to service_role;

commit;
