import { NextResponse } from 'next/server';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { isStoreTeamRole } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

const MAX_MANUAL_SELECTION = 2000;
const MAX_FILTERED_SELECTION = 10000;
const EXECUTION_BATCH_SIZE = 100;
const QUERY_PAGE_SIZE = 400;
const FINAL_BASE_STATUSES = new Set(['Venda concluída', 'Perdido']);

type RoutedLeadRow = {
  id: string;
  assigned_user_id?: string | null;
};

type SelectionFilters = {
  event_filter: string;
  query: string;
  status: string;
  source: string;
  store_filter: string;
  birth_date_filter: string;
  city_filter: string;
};

class SelectionTooLargeError extends Error {}

function cleanText(value: unknown, max = 240) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, max);
}

function uuid(value: unknown) {
  const text = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : '';
}

function uuidList(value: unknown, max = MAX_FILTERED_SELECTION) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(uuid).filter(Boolean))).slice(0, max);
}

function routingMigrationMissing(error: any) {
  const code = String(error?.code || '');
  return code === '42P01' || code === '42883' || code === 'PGRST205' || code === 'PGRST202';
}

function normalizeFilters(value: any): SelectionFilters {
  return {
    event_filter: cleanText(value?.event_filter, 80) || 'all',
    query: cleanText(value?.query, 240),
    status: cleanText(value?.status, 80) || 'all',
    source: cleanText(value?.source, 160) || 'all',
    store_filter: cleanText(value?.store_filter, 180) || 'all',
    birth_date_filter: cleanText(value?.birth_date_filter, 20),
    city_filter: cleanText(value?.city_filter, 160) || 'all'
  };
}

function leadCity(lead: any) {
  return String(
    lead?.metadata?.city
      || lead?.metadata?.cidade
      || lead?.metadata?.address?.city
      || lead?.metadata?.raw_meta_lead?.city
      || ''
  ).trim();
}

function assignedStoreName(lead: any) {
  return String(lead?.assigned_store_name || lead?.metadata?.routing?.assigned_store_name || '').trim();
}

function birthDateValue(lead: any) {
  return String(lead?._birth_date || lead?.metadata?.birth_date || '').slice(0, 10);
}

function leadCpf(lead: any) {
  return String(lead?._commercial_cpf || '').trim();
}

function baseLeadMatchesFilters(lead: any, filters: SelectionFilters, eventNames: Map<string, string>) {
  if (filters.status !== 'all' && String(lead.status || '') !== filters.status) return false;
  if (filters.source !== 'all' && String(lead.source || '') !== filters.source) return false;
  if (filters.store_filter !== 'all' && assignedStoreName(lead) !== filters.store_filter) return false;
  if (filters.city_filter !== 'all' && leadCity(lead) !== filters.city_filter) return false;
  if (filters.birth_date_filter && birthDateValue(lead) !== filters.birth_date_filter) return false;

  const term = filters.query.toLowerCase().trim();
  if (!term) return true;
  const eventName = lead.event_id ? eventNames.get(String(lead.event_id)) || '' : 'Sem evento';
  return [
    lead.id,
    lead.name,
    lead.phone,
    leadCpf(lead),
    lead.email,
    lead.campaign_name,
    lead.vehicle_name,
    lead.source,
    assignedStoreName(lead),
    eventName,
    leadCity(lead),
    birthDateValue(lead)
  ].some((item) => String(item || '').toLowerCase().includes(term));
}

function matchingRoutingRule(rules: any[], lead: any) {
  const source = String(lead?.source || '').trim().toLowerCase();
  const campaignName = String(lead?.campaign_name || '').trim().toLowerCase();
  return rules.find((rule) => {
    if (rule.match_type === 'event') return Boolean(lead.event_id && String(rule.event_id || '') === String(lead.event_id));
    if (rule.match_type === 'campaign') {
      return Boolean(
        (rule.campaign_id && lead.campaign_id && String(rule.campaign_id) === String(lead.campaign_id))
        || (!rule.campaign_id && String(rule.campaign_key || '').trim().toLowerCase() === campaignName)
      );
    }
    if (rule.match_type === 'source') return String(rule.source_key || '').trim().toLowerCase() === source;
    return rule.match_type === 'default';
  });
}

async function loadStoreContext(supabase: any, storeId: string) {
  const [{ data: store, error: storeError }, membersResult, rulesResult] = await Promise.all([
    supabase.from('stores').select('id,store_name,status,portal_enabled').eq('id', storeId).maybeSingle(),
    supabase
      .from('users')
      .select('id,full_name,role,store_id,status,receives_leads,routing_order,max_open_leads')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .in('role', ['pre_sales', 'seller', 'prospector'])
      .order('routing_order')
      .order('full_name'),
    supabase
      .from('lead_routing_rules')
      .select('id,name,status,priority,match_type,event_id,campaign_id,campaign_key,source_key,strategy,target_roles,target_member_ids,excluded_member_ids,fixed_user_id,starts_at,ends_at')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .order('priority')
      .order('created_at')
  ]);

  if (storeError) throw storeError;
  if (membersResult.error) throw membersResult.error;

  const migrationRequired = Boolean(rulesResult.error && routingMigrationMissing(rulesResult.error));
  if (rulesResult.error && !migrationRequired) throw rulesResult.error;

  const storeStatus = String(store?.status || '').toLowerCase();
  if (!store || storeStatus !== 'active') return null;

  const members = (membersResult.data || []).filter((member: any) => isStoreTeamRole(member.role));
  const now = Date.now();
  const rules = migrationRequired ? [] : (rulesResult.data || []).filter((rule: any) => {
    const startsAt = rule.starts_at ? new Date(rule.starts_at).getTime() : null;
    const endsAt = rule.ends_at ? new Date(rule.ends_at).getTime() : null;
    return (startsAt == null || startsAt <= now) && (endsAt == null || endsAt > now);
  });

  return {
    store,
    members,
    rules,
    migration_required: migrationRequired,
    routing_configured: rules.length > 0
  };
}

async function fetchRowsByIds(supabase: any, table: string, select: string, ids: string[]) {
  const rows: any[] = [];
  for (let index = 0; index < ids.length; index += QUERY_PAGE_SIZE) {
    const batch = ids.slice(index, index + QUERY_PAGE_SIZE);
    if (!batch.length) continue;
    const result = await supabase.from(table).select(select).in('id', batch);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }
  return rows;
}

async function resolveAllFilteredLeadIds(supabase: any, filters: SelectionFilters, excludedLeadIds: string[]) {
  const excluded = new Set(excludedLeadIds);
  let activeEventIds: string[] = [];
  if (filters.event_filter === 'active') {
    const activeEvents = await supabase.from('events').select('id').eq('status', 'active');
    if (activeEvents.error) throw activeEvents.error;
    activeEventIds = (activeEvents.data || []).map((item: any) => String(item.id));
    if (!activeEventIds.length) return [];
  }

  const eventNames = new Map<string, string>();
  if (filters.query) {
    const eventResult = await supabase.from('events').select('id,event_name').neq('status', 'deleted');
    if (eventResult.error) throw eventResult.error;
    for (const event of eventResult.data || []) eventNames.set(String(event.id), String(event.event_name || ''));
  }

  const matches: string[] = [];
  for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
    let queryBuilder = supabase
      .from('leads_base')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + QUERY_PAGE_SIZE - 1);

    if (filters.event_filter === 'active') queryBuilder = queryBuilder.in('event_id', activeEventIds);
    else if (filters.event_filter === 'unassigned') queryBuilder = queryBuilder.is('event_id', null);
    else if (uuid(filters.event_filter)) queryBuilder = queryBuilder.eq('event_id', filters.event_filter);
    if (filters.status !== 'all') queryBuilder = queryBuilder.eq('status', filters.status);
    if (filters.source !== 'all') queryBuilder = queryBuilder.eq('source', filters.source);

    const pageResult = await queryBuilder;
    if (pageResult.error) throw pageResult.error;
    const page = pageResult.data || [];
    if (!page.length) break;

    const routedIds = Array.from(new Set(page.map((lead: any) => uuid(lead.routed_lead_id)).filter(Boolean)));
    const commercialMap = new Map<string, any>();
    for (let index = 0; index < routedIds.length; index += QUERY_PAGE_SIZE) {
      const batch = routedIds.slice(index, index + QUERY_PAGE_SIZE);
      const commercial = await supabase.from('lead_commercial_details').select('lead_id,birth_date,cpf').in('lead_id', batch);
      if (commercial.error) throw commercial.error;
      for (const item of commercial.data || []) commercialMap.set(String(item.lead_id), item);
    }

    for (const lead of page) {
      const commercial = lead.routed_lead_id ? commercialMap.get(String(lead.routed_lead_id)) : null;
      const enriched = {
        ...lead,
        _birth_date: commercial?.birth_date || lead.metadata?.birth_date || null,
        _commercial_cpf: commercial?.cpf || null
      };
      if (!excluded.has(String(lead.id)) && baseLeadMatchesFilters(enriched, filters, eventNames)) {
        matches.push(String(lead.id));
        if (matches.length > MAX_FILTERED_SELECTION) {
          throw new SelectionTooLargeError(`O filtro retornou mais de ${MAX_FILTERED_SELECTION} leads. Refine os filtros antes de distribuir.`);
        }
      }
    }

    if (page.length < QUERY_PAGE_SIZE) break;
  }
  return matches;
}

async function resolveSelection(supabase: any, body: any, dryRun: boolean) {
  const selection = body?.selection && typeof body.selection === 'object' ? body.selection : {};
  const allFiltered = selection.all_filtered === true;
  const explicitIds = uuidList(selection.lead_ids ?? body?.lead_ids, MAX_FILTERED_SELECTION);

  if (allFiltered && explicitIds.length) throw new Error('Use seleção manual ou todos os filtrados, não os dois ao mesmo tempo.');
  if (allFiltered && !dryRun) throw new Error('Todos os filtrados devem passar pela pré-validação antes do processamento em lotes.');

  if (allFiltered) {
    const filters = normalizeFilters(selection.filters);
    const excludedIds = uuidList(selection.excluded_lead_ids, MAX_FILTERED_SELECTION);
    return resolveAllFilteredLeadIds(supabase, filters, excludedIds);
  }

  if (explicitIds.length > MAX_MANUAL_SELECTION && dryRun) {
    throw new SelectionTooLargeError(`Selecione no máximo ${MAX_MANUAL_SELECTION} leads manualmente por pré-validação.`);
  }
  if (explicitIds.length > EXECUTION_BATCH_SIZE && !dryRun) {
    throw new SelectionTooLargeError(`A execução aceita no máximo ${EXECUTION_BATCH_SIZE} leads por lote.`);
  }
  return explicitIds;
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });

    const storeId = uuid(new URL(request.url).searchParams.get('store_id'));
    if (!storeId) return NextResponse.json({ error: 'Selecione uma loja válida.' }, { status: 400 });

    const context = await loadStoreContext(supabase, storeId);
    if (!context) return NextResponse.json({ error: 'Loja ativa não encontrada.' }, { status: 404 });

    return NextResponse.json({
      store: context.store,
      members: context.members,
      rules: context.rules,
      migration_required: context.migration_required,
      routing_configured: context.routing_configured,
      preview_read_only: process.env.VERCEL_ENV === 'preview'
    });
  } catch (error: any) {
    if (routingMigrationMissing(error)) {
      return NextResponse.json({
        error: 'O Motor de Roteamento ainda não está disponível neste ambiente.',
        migration_required: true
      }, { status: 503 });
    }
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar a equipe da loja.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const storeId = uuid(body.store_id);
    const memberIds = uuidList(body.member_ids, 500);
    const dryRun = body.dry_run !== false;
    const mode = cleanText(body.mode, 40) || 'configured_rotation';
    const memberOffsetRaw = Number(body.member_offset || 0);
    let memberOffset = Number.isInteger(memberOffsetRaw) && memberOffsetRaw >= 0 ? memberOffsetRaw : 0;

    if (!storeId) return NextResponse.json({ error: 'Selecione uma loja válida.' }, { status: 400 });
    if (!['configured_rotation', 'selected_members'].includes(mode)) {
      return NextResponse.json({ error: 'Modo de distribuição inválido.' }, { status: 400 });
    }

    const leadIds = await resolveSelection(supabase, body, dryRun);
    if (!leadIds.length) return NextResponse.json({ error: 'Nenhum lead corresponde à seleção atual.' }, { status: 400 });

    const context = await loadStoreContext(supabase, storeId);
    if (!context) return NextResponse.json({ error: 'Loja ativa não encontrada.' }, { status: 404 });

    if (mode === 'configured_rotation') {
      if (context.migration_required) {
        return NextResponse.json({
          error: 'O Motor de Roteamento ainda não está disponível neste ambiente.',
          migration_required: true
        }, { status: 503 });
      }
      if (!context.routing_configured) {
        return NextResponse.json({ error: 'A loja não possui rodízio ativo. Selecione membros da equipe para distribuir.' }, { status: 409 });
      }
    }

    const memberById = new Map(context.members.map((member: any) => [String(member.id), member]));
    const selectedMembers = memberIds.map((id) => memberById.get(id)).filter(Boolean) as any[];

    if (mode === 'selected_members') {
      if (!selectedMembers.length) return NextResponse.json({ error: 'Selecione pelo menos um membro da equipe.' }, { status: 400 });
      if (selectedMembers.length !== memberIds.length || selectedMembers.some((member) => !member.receives_leads)) {
        return NextResponse.json({ error: 'Há membros inválidos, pausados ou fora da loja selecionada.' }, { status: 409 });
      }
      if (context.routing_configured) {
        return NextResponse.json({
          error: 'Esta loja já possui rodízio ativo. Para preservar a sequência atual, use “Seguir rodízio da loja”.',
          routing_configured: true
        }, { status: 409 });
      }
      memberOffset %= selectedMembers.length;
    }

    const baseLeads = await fetchRowsByIds(
      supabase,
      'leads_base',
      'id,name,event_id,status,source,campaign_id,campaign_name,assigned_consultant_id,routed_lead_id',
      leadIds
    );
    const baseById = new Map(baseLeads.map((lead: any) => [String(lead.id), lead]));
    const orderedBaseLeads = leadIds.map((id) => baseById.get(id)).filter(Boolean) as any[];

    const foundIds = new Set(orderedBaseLeads.map((lead: any) => String(lead.id)));
    const missingIds = leadIds.filter((id) => !foundIds.has(id));
    const routedIds = Array.from(new Set(orderedBaseLeads.map((lead: any) => uuid(lead.routed_lead_id)).filter(Boolean)));
    const routedRows = routedIds.length
      ? await fetchRowsByIds(supabase, 'leads', 'id,assigned_user_id', routedIds) as RoutedLeadRow[]
      : [];
    const routedById = new Map<string, RoutedLeadRow>(routedRows.map((lead) => [String(lead.id), lead]));

    const eventIds = Array.from(new Set(orderedBaseLeads.map((lead: any) => uuid(lead.event_id)).filter(Boolean)));
    const participationRows: any[] = [];
    for (let index = 0; index < eventIds.length; index += QUERY_PAGE_SIZE) {
      const batch = eventIds.slice(index, index + QUERY_PAGE_SIZE);
      const participation = await supabase
        .from('store_event_participations')
        .select('event_id,store_id,status')
        .eq('store_id', storeId)
        .in('event_id', batch)
        .eq('status', 'active');
      if (participation.error) throw participation.error;
      participationRows.push(...(participation.data || []));
    }
    const allowedEventIds = new Set(participationRows.map((item: any) => String(item.event_id)));

    const eligible: any[] = [];
    const blocked: Array<{ lead_id: string; name: string; reason: string }> = [];
    for (const lead of orderedBaseLeads) {
      const routed = lead.routed_lead_id ? routedById.get(String(lead.routed_lead_id)) : null;
      if (FINAL_BASE_STATUSES.has(String(lead.status || ''))) {
        blocked.push({ lead_id: lead.id, name: lead.name || '', reason: `Status final: ${lead.status}.` });
        continue;
      }
      if (lead.assigned_consultant_id || routed?.assigned_user_id) {
        blocked.push({ lead_id: lead.id, name: lead.name || '', reason: 'Lead já possui responsável e não será retirado da carteira.' });
        continue;
      }
      if (lead.event_id && !allowedEventIds.has(String(lead.event_id))) {
        blocked.push({ lead_id: lead.id, name: lead.name || '', reason: 'A loja selecionada não possui participação ativa no evento deste lead.' });
        continue;
      }
      if (mode === 'configured_rotation' && !matchingRoutingRule(context.rules, lead)) {
        blocked.push({ lead_id: lead.id, name: lead.name || '', reason: 'Nenhuma regra ativa da loja corresponde a Evento → Campanha → Origem → Padrão deste lead.' });
        continue;
      }
      eligible.push(lead);
    }

    const eligibleLeadIds = eligible.map((lead) => String(lead.id));
    const summary = {
      selected: leadIds.length,
      found: foundIds.size,
      eligible: eligible.length,
      blocked: blocked.length,
      missing: missingIds.length,
      store_id: storeId,
      store_name: context.store.store_name,
      mode,
      routing_configured: context.routing_configured,
      migration_required: context.migration_required,
      members: selectedMembers.map((member) => ({ id: member.id, full_name: member.full_name, role: member.role }))
    };

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        summary,
        blocked,
        missing_lead_ids: missingIds.slice(0, 100),
        eligible_lead_ids: eligibleLeadIds
      });
    }

    if (process.env.VERCEL_ENV === 'preview') {
      return NextResponse.json({
        error: 'O Preview está em modo somente leitura para esta ação. A seleção e a prévia podem ser validadas sem gravar dados.',
        preview_read_only: true,
        summary
      }, { status: 409 });
    }

    if (cleanText(body.confirmation, 40) !== 'DISTRIBUIR') {
      return NextResponse.json({ error: 'Confirmação explícita obrigatória.' }, { status: 400 });
    }

    let distributed = 0;
    const results: Array<{ lead_id: string; status: string; user_id?: string; role?: string; message?: string }> = [];

    for (const lead of eligible) {
      if (mode === 'configured_rotation') {
        const rpcResult = await supabase.rpc('distribute_base_lead_to_store', {
          p_base_lead_id: lead.id,
          p_store_id: storeId,
          p_actor_user_id: master.id,
          p_mode: mode,
          p_selected_user_id: null
        });
        if (rpcResult.error) {
          if (routingMigrationMissing(rpcResult.error)) {
            return NextResponse.json({ error: 'A migration transacional da distribuição ainda não está disponível neste ambiente.', migration_required: true }, { status: 503 });
          }
          results.push({ lead_id: lead.id, status: 'error', message: rpcResult.error.message || 'Falha ao distribuir o lead.' });
          continue;
        }
        const outcome = String(rpcResult.data?.outcome || 'error');
        if (outcome === 'assigned') {
          distributed += 1;
          results.push({ lead_id: lead.id, status: 'distributed', user_id: rpcResult.data?.user_id || undefined, role: rpcResult.data?.role || undefined });
        } else {
          results.push({ lead_id: lead.id, status: outcome, message: 'O lead não foi distribuído; consulte o resultado fail-closed do motor.' });
        }
        continue;
      }

      let assigned = false;
      let capacityFailures = 0;
      let terminalResult: any = null;
      for (let attempt = 0; attempt < selectedMembers.length; attempt += 1) {
        const memberIndex = (memberOffset + attempt) % selectedMembers.length;
        const selectedMember = selectedMembers[memberIndex];
        const rpcResult = await supabase.rpc('distribute_base_lead_to_store', {
          p_base_lead_id: lead.id,
          p_store_id: storeId,
          p_actor_user_id: master.id,
          p_mode: mode,
          p_selected_user_id: selectedMember.id
        });

        if (rpcResult.error) {
          if (routingMigrationMissing(rpcResult.error)) {
            return NextResponse.json({ error: 'A migration transacional da distribuição ainda não está disponível neste ambiente.', migration_required: true }, { status: 503 });
          }
          terminalResult = { status: 'error', message: rpcResult.error.message || 'Falha ao distribuir o lead.' };
          break;
        }

        const outcome = String(rpcResult.data?.outcome || 'error');
        if (outcome === 'assigned') {
          distributed += 1;
          assigned = true;
          memberOffset = (memberIndex + 1) % selectedMembers.length;
          results.push({ lead_id: lead.id, status: 'distributed', user_id: rpcResult.data?.user_id || undefined, role: rpcResult.data?.role || undefined });
          break;
        }
        if (outcome === 'member_capacity_reached' || outcome === 'member_ineligible') {
          capacityFailures += 1;
          continue;
        }
        terminalResult = { status: outcome, user_id: rpcResult.data?.user_id || undefined, message: 'O lead não foi distribuído; a RPC permaneceu fail-closed.' };
        break;
      }

      if (!assigned) {
        if (terminalResult) results.push({ lead_id: lead.id, ...terminalResult });
        else if (capacityFailures === selectedMembers.length) {
          results.push({ lead_id: lead.id, status: 'team_capacity_reached', message: 'Nenhum membro selecionado possui capacidade disponível.' });
        } else {
          results.push({ lead_id: lead.id, status: 'error', message: 'Nenhum membro elegível recebeu o lead.' });
        }
      }
    }

    return NextResponse.json({
      success: true,
      dry_run: false,
      summary: {
        ...summary,
        distributed,
        errors: results.filter((item) => item.status === 'error').length
      },
      results,
      next_member_offset: memberOffset
    });
  } catch (error: any) {
    if (error instanceof SelectionTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    if (routingMigrationMissing(error)) {
      return NextResponse.json({
        error: 'O Motor de Roteamento ainda não está disponível neste ambiente.',
        migration_required: true
      }, { status: 503 });
    }
    return NextResponse.json({ error: error?.message || 'Não foi possível distribuir os leads.' }, { status: 500 });
  }
}
