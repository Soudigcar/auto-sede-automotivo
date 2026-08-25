import { NextResponse } from 'next/server';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';

const MAX_MANUAL_SELECTION = 2000;
const MAX_FILTERED_SELECTION = 10000;
const EXECUTION_BATCH_SIZE = 100;
const QUERY_PAGE_SIZE = 400;

type SelectionFilters = {
  event_filter: string;
  query: string;
  status: string;
  source: string;
  store_filter: string;
  birth_date_filter: string;
  city_filter: string;
};

type ResolvedSelection = {
  leadIds: string[];
  selectionBeforeRemoval: number;
  autoRemovedSameStore: number;
  removedByStoreFilter: number;
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

function assignedStoreName(lead: any) {
  return String(lead?.assigned_store_name || lead?.metadata?.routing?.assigned_store_name || '').trim();
}

function assignedStoreId(lead: any) {
  return uuid(lead?.assigned_store_id || lead?.metadata?.routing?.assigned_store_id);
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

async function resolveAllFilteredLeadIds(
  supabase: any,
  filters: SelectionFilters,
  excludedLeadIds: string[],
  excludedStoreIds: string[],
  destinationStoreId: string
): Promise<ResolvedSelection> {
  const excluded = new Set(excludedLeadIds);
  const excludedStores = new Set(excludedStoreIds);
  let activeEventIds: string[] = [];
  let selectionBeforeRemoval = 0;
  let autoRemovedSameStore = 0;
  let removedByStoreFilter = 0;

  if (filters.event_filter === 'active') {
    const activeEvents = await supabase.from('events').select('id').eq('status', 'active');
    if (activeEvents.error) throw activeEvents.error;
    activeEventIds = (activeEvents.data || []).map((item: any) => String(item.id));
    if (!activeEventIds.length) {
      return { leadIds: [], selectionBeforeRemoval: 0, autoRemovedSameStore: 0, removedByStoreFilter: 0 };
    }
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
      const leadId = String(lead.id);
      if (excluded.has(leadId)) continue;
      const commercial = lead.routed_lead_id ? commercialMap.get(String(lead.routed_lead_id)) : null;
      const enriched = {
        ...lead,
        _birth_date: commercial?.birth_date || lead.metadata?.birth_date || null,
        _commercial_cpf: commercial?.cpf || lead.cpf || null
      };
      if (!baseLeadMatchesFilters(enriched, filters, eventNames)) continue;

      selectionBeforeRemoval += 1;
      const currentStoreId = assignedStoreId(enriched);
      if (currentStoreId && currentStoreId === destinationStoreId) {
        autoRemovedSameStore += 1;
        continue;
      }
      if (currentStoreId && excludedStores.has(currentStoreId)) {
        removedByStoreFilter += 1;
        continue;
      }
      matches.push(leadId);
      if (matches.length > MAX_FILTERED_SELECTION) {
        throw new SelectionTooLargeError(`O filtro retornou mais de ${MAX_FILTERED_SELECTION} leads. Refine os filtros antes de transferir.`);
      }
    }

    if (page.length < QUERY_PAGE_SIZE) break;
  }

  return { leadIds: matches, selectionBeforeRemoval, autoRemovedSameStore, removedByStoreFilter };
}

async function resolveExplicitLeadIds(
  supabase: any,
  explicitIds: string[],
  excludedStoreIds: string[],
  destinationStoreId: string
): Promise<ResolvedSelection> {
  if (!explicitIds.length) {
    return { leadIds: [], selectionBeforeRemoval: 0, autoRemovedSameStore: 0, removedByStoreFilter: 0 };
  }
  const excludedStores = new Set(excludedStoreIds);
  const rows = await fetchRowsByIds(supabase, 'leads_base', 'id,assigned_store_id,metadata', explicitIds);
  const byId = new Map(rows.map((lead: any) => [String(lead.id), lead]));
  const leadIds: string[] = [];
  let autoRemovedSameStore = 0;
  let removedByStoreFilter = 0;
  for (const id of explicitIds) {
    const lead = byId.get(id);
    if (!lead) {
      leadIds.push(id);
      continue;
    }
    const currentStoreId = assignedStoreId(lead);
    if (currentStoreId && currentStoreId === destinationStoreId) {
      autoRemovedSameStore += 1;
      continue;
    }
    if (currentStoreId && excludedStores.has(currentStoreId)) {
      removedByStoreFilter += 1;
      continue;
    }
    leadIds.push(id);
  }
  return {
    leadIds,
    selectionBeforeRemoval: explicitIds.length,
    autoRemovedSameStore,
    removedByStoreFilter
  };
}

async function resolveSelection(supabase: any, body: any, dryRun: boolean, destinationStoreId: string): Promise<ResolvedSelection> {
  const selection = body?.selection && typeof body.selection === 'object' ? body.selection : {};
  const allFiltered = selection.all_filtered === true;
  const explicitIds = uuidList(selection.lead_ids ?? body?.lead_ids, MAX_FILTERED_SELECTION);
  const excludedStoreIds = uuidList(selection.excluded_store_ids, 500);

  if (allFiltered && explicitIds.length) throw new Error('Use seleção manual ou todos os filtrados, não os dois ao mesmo tempo.');
  if (allFiltered && !dryRun) throw new Error('Todos os filtrados devem passar pela pré-validação antes do processamento em lotes.');
  if (allFiltered) {
    const filters = normalizeFilters(selection.filters);
    const excludedIds = uuidList(selection.excluded_lead_ids, MAX_FILTERED_SELECTION);
    return resolveAllFilteredLeadIds(supabase, filters, excludedIds, excludedStoreIds, destinationStoreId);
  }
  if (explicitIds.length > MAX_MANUAL_SELECTION && dryRun) {
    throw new SelectionTooLargeError(`Selecione no máximo ${MAX_MANUAL_SELECTION} leads manualmente por pré-validação.`);
  }
  if (explicitIds.length > EXECUTION_BATCH_SIZE && !dryRun) {
    throw new SelectionTooLargeError(`A execução aceita no máximo ${EXECUTION_BATCH_SIZE} leads por lote.`);
  }
  return resolveExplicitLeadIds(supabase, explicitIds, excludedStoreIds, destinationStoreId);
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const storeId = uuid(body.store_id);
    const dryRun = body.dry_run !== false;
    if (!storeId) return NextResponse.json({ error: 'Selecione uma loja válida.' }, { status: 400 });

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id,store_name,status')
      .eq('id', storeId)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store || String(store.status || '').toLowerCase() !== 'active') {
      return NextResponse.json({ error: 'Loja ativa não encontrada.' }, { status: 404 });
    }

    const resolvedSelection = await resolveSelection(supabase, body, dryRun, storeId);
    const leadIds = resolvedSelection.leadIds;
    if (!leadIds.length) {
      return NextResponse.json({
        success: true,
        dry_run: dryRun,
        summary: {
          selection_before_removal: resolvedSelection.selectionBeforeRemoval,
          selected: 0,
          found: 0,
          eligible: 0,
          blocked: 0,
          missing: 0,
          auto_removed_same_store: resolvedSelection.autoRemovedSameStore,
          removed_by_store_filter: resolvedSelection.removedByStoreFilter,
          store_id: storeId,
          store_name: store.store_name
        },
        blocked: [],
        missing_lead_ids: [],
        eligible_lead_ids: []
      });
    }

    const baseLeads = await fetchRowsByIds(
      supabase,
      'leads_base',
      'id,name,status,assigned_store_id,assigned_store_name,routed_lead_id,metadata',
      leadIds
    );
    const baseById = new Map(baseLeads.map((lead: any) => [String(lead.id), lead]));
    const orderedBaseLeads = leadIds.map((id) => baseById.get(id)).filter(Boolean) as any[];
    const foundIds = new Set(orderedBaseLeads.map((lead: any) => String(lead.id)));
    const missingIds = leadIds.filter((id) => !foundIds.has(id));
    const routedIds = Array.from(new Set(orderedBaseLeads.map((lead: any) => uuid(lead.routed_lead_id)).filter(Boolean)));
    const routedRows = routedIds.length
      ? await fetchRowsByIds(supabase, 'leads', 'id,status', routedIds)
      : [];
    const routedById = new Map(routedRows.map((lead: any) => [String(lead.id), lead]));

    const eligible: any[] = [];
    const blocked: Array<{ lead_id: string; name: string; reason: string }> = [];
    let defensiveSameStoreBlocks = 0;

    for (const lead of orderedBaseLeads) {
      const routed = lead.routed_lead_id ? routedById.get(String(lead.routed_lead_id)) : null;
      if (assignedStoreId(lead) === storeId) {
        defensiveSameStoreBlocks += 1;
        blocked.push({ lead_id: lead.id, name: lead.name || '', reason: 'Lead já pertence à loja de destino e foi removido desta transferência.' });
        continue;
      }
      if (String(lead.status || '') === 'Venda concluída' || String(routed?.status || '') === 'sale_confirmed') {
        blocked.push({ lead_id: lead.id, name: lead.name || '', reason: 'Venda concluída protegida. Use um fluxo específico de pós-venda/correção se necessário.' });
        continue;
      }
      eligible.push(lead);
    }

    const eligibleLeadIds = eligible.map((lead) => String(lead.id));
    const summary = {
      selection_before_removal: resolvedSelection.selectionBeforeRemoval,
      selected: leadIds.length,
      found: foundIds.size,
      eligible: eligible.length,
      blocked: blocked.length,
      missing: missingIds.length,
      auto_removed_same_store: resolvedSelection.autoRemovedSameStore + defensiveSameStoreBlocks,
      removed_by_store_filter: resolvedSelection.removedByStoreFilter,
      store_id: storeId,
      store_name: store.store_name,
      privacy_mode: 'master_transfer'
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
        error: 'O Preview está em modo somente leitura para transferência Master. A pré-validação pode ser testada sem gravar dados.',
        preview_read_only: true,
        summary
      }, { status: 409 });
    }

    if (cleanText(body.confirmation, 40) !== 'TRANSFERIR') {
      return NextResponse.json({ error: 'Confirmação explícita obrigatória.' }, { status: 400 });
    }

    let transferred = 0;
    const results: Array<{ lead_id: string; status: string; message?: string }> = [];
    for (const lead of eligible) {
      const rpcResult = await supabase.rpc('master_transfer_base_lead_to_store', {
        p_base_lead_id: lead.id,
        p_store_id: storeId,
        p_actor_user_id: master.id
      });
      if (rpcResult.error) {
        results.push({ lead_id: lead.id, status: 'error', message: rpcResult.error.message || 'Falha ao transferir o lead.' });
        continue;
      }
      const outcome = String(rpcResult.data?.outcome || 'error');
      if (outcome === 'transferred') {
        transferred += 1;
        results.push({ lead_id: lead.id, status: 'transferred' });
      } else {
        results.push({ lead_id: lead.id, status: outcome, message: 'O lead não foi transferido; consulte a proteção retornada pela RPC.' });
      }
    }

    return NextResponse.json({
      success: true,
      dry_run: false,
      summary: {
        ...summary,
        transferred,
        errors: results.filter((item) => item.status === 'error').length
      },
      results
    });
  } catch (error: any) {
    if (error instanceof SelectionTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: error?.message || 'Não foi possível transferir os leads.' }, { status: 500 });
  }
}
