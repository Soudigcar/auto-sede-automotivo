import { NextResponse } from 'next/server';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';

const MAX_IDS = 500;
const MAX_BROWSE = 100;

function uuid(value: unknown) {
  const text = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : '';
}

function cleanSearch(value: unknown) {
  return String(value || '').trim().slice(0, 120);
}

function migrationMissing(error: any) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01' || code === '42703' || code === 'PGRST205' || /lead_store_instances|canonical_lead_id/i.test(message);
}

async function hydrateInstances(supabase: any, baseRows: any[]) {
  const canonicalIds = Array.from(new Set(baseRows.map((row: any) => uuid(row.canonical_lead_id)).filter(Boolean)));
  if (!canonicalIds.length) return { migration_required: false, instances_by_base_lead: {} as Record<string, any> };

  const instanceResult = await supabase
    .from('lead_store_instances')
    .select('id,canonical_lead_id,store_id,lead_id,distribution_source,created_at')
    .in('canonical_lead_id', canonicalIds)
    .order('created_at', { ascending: true });
  if (instanceResult.error) {
    if (migrationMissing(instanceResult.error)) {
      return { migration_required: true, instances_by_base_lead: {} as Record<string, any> };
    }
    throw instanceResult.error;
  }

  const instances = instanceResult.data || [];
  const storeIds = Array.from(new Set(instances.map((row: any) => uuid(row.store_id)).filter(Boolean)));
  const leadIds = Array.from(new Set(instances.map((row: any) => uuid(row.lead_id)).filter(Boolean)));

  const [storesResult, leadsResult] = await Promise.all([
    storeIds.length
      ? supabase.from('stores').select('id,store_name').in('id', storeIds)
      : Promise.resolve({ data: [], error: null }),
    leadIds.length
      ? supabase.from('leads').select('id,status,assigned_user_id,assigned_user_role').in('id', leadIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (storesResult.error) throw storesResult.error;
  if (leadsResult.error) throw leadsResult.error;

  const userIds = Array.from(new Set((leadsResult.data || []).map((lead: any) => uuid(lead.assigned_user_id)).filter(Boolean)));
  const usersResult = userIds.length
    ? await supabase.from('users').select('id,full_name,email').in('id', userIds)
    : { data: [], error: null };
  if (usersResult.error) throw usersResult.error;

  const storeById = new Map((storesResult.data || []).map((row: any) => [String(row.id), row]));
  const leadById = new Map((leadsResult.data || []).map((row: any) => [String(row.id), row]));
  const userById = new Map((usersResult.data || []).map((row: any) => [String(row.id), row]));
  const instancesByCanonical = new Map<string, any[]>();

  for (const instance of instances) {
    const lead = leadById.get(String(instance.lead_id)) || null;
    const store = storeById.get(String(instance.store_id)) || null;
    const user = lead?.assigned_user_id ? userById.get(String(lead.assigned_user_id)) || null : null;
    const item = {
      instance_id: instance.id,
      store_id: instance.store_id,
      store_name: store?.store_name || 'Loja',
      lead_id: instance.lead_id,
      status: lead?.status || null,
      assigned_user_id: lead?.assigned_user_id || null,
      assigned_user_role: lead?.assigned_user_role || null,
      assigned_user_name: user?.full_name || user?.email || null,
      distribution_source: instance.distribution_source,
      created_at: instance.created_at
    };
    const key = String(instance.canonical_lead_id);
    const list = instancesByCanonical.get(key) || [];
    list.push(item);
    instancesByCanonical.set(key, list);
  }

  const payload: Record<string, any> = {};
  for (const base of baseRows) {
    const list = instancesByCanonical.get(String(base.canonical_lead_id || '')) || [];
    payload[String(base.id)] = {
      canonical_lead_id: base.canonical_lead_id || null,
      store_count: list.length,
      instances: list
    };
  }

  return { migration_required: false, instances_by_base_lead: payload };
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });

    const url = new URL(request.url);
    const summaryOnly = url.searchParams.get('summary') === '1';
    const browse = url.searchParams.get('browse') === '1';
    const ids = Array.from(new Set(
      String(url.searchParams.get('base_lead_ids') || '')
        .split(',')
        .map(uuid)
        .filter(Boolean)
    )).slice(0, MAX_IDS);

    if (summaryOnly) {
      const instanceResult = await supabase
        .from('lead_store_instances')
        .select('canonical_lead_id,store_id,lead_id');
      if (instanceResult.error) {
        if (migrationMissing(instanceResult.error)) {
          return NextResponse.json({
            success: true,
            migration_required: true,
            summary: { canonical_leads: 0, store_instances: 0, multistore_leads: 0, stores_involved: 0 }
          });
        }
        throw instanceResult.error;
      }

      const rows = instanceResult.data || [];
      const stores = new Set(rows.map((row: any) => String(row.store_id)));
      const counts = new Map<string, number>();
      for (const row of rows) {
        const key = String(row.canonical_lead_id);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      return NextResponse.json({
        success: true,
        migration_required: false,
        summary: {
          canonical_leads: counts.size,
          store_instances: rows.length,
          multistore_leads: Array.from(counts.values()).filter((count) => count > 1).length,
          stores_involved: stores.size
        }
      });
    }

    if (browse) {
      const search = cleanSearch(url.searchParams.get('q'));
      const limit = Math.min(MAX_BROWSE, Math.max(10, Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      let query = supabase
        .from('leads_base')
        .select('id,name,phone,status,canonical_lead_id,created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (search) {
        const escaped = search.replace(/[%_,]/g, '');
        query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%,id.eq.${uuid(search) || '00000000-0000-0000-0000-000000000000'}`);
      }

      const baseResult = await query;
      if (baseResult.error) {
        if (migrationMissing(baseResult.error)) {
          return NextResponse.json({ success: true, migration_required: true, leads: [] });
        }
        throw baseResult.error;
      }

      const baseRows = baseResult.data || [];
      const hydrated = await hydrateInstances(supabase, baseRows);
      return NextResponse.json({
        success: true,
        migration_required: hydrated.migration_required,
        leads: baseRows.map((base: any) => ({
          ...base,
          store_count: hydrated.instances_by_base_lead[String(base.id)]?.store_count || 0,
          instances: hydrated.instances_by_base_lead[String(base.id)]?.instances || []
        }))
      });
    }

    if (!ids.length) return NextResponse.json({ success: true, instances_by_base_lead: {} });

    const baseResult = await supabase
      .from('leads_base')
      .select('id,canonical_lead_id')
      .in('id', ids);
    if (baseResult.error) {
      if (migrationMissing(baseResult.error)) {
        return NextResponse.json({ success: true, migration_required: true, instances_by_base_lead: {} });
      }
      throw baseResult.error;
    }

    const hydrated = await hydrateInstances(supabase, baseResult.data || []);
    return NextResponse.json({
      success: true,
      migration_required: hydrated.migration_required,
      instances_by_base_lead: hydrated.instances_by_base_lead
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar as instâncias por loja.' }, { status: 500 });
  }
}
