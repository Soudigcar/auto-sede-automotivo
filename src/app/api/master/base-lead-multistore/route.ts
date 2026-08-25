import { NextResponse } from 'next/server';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';

const MAX_BATCH = 100;

function cleanText(value: unknown, max = 240) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, max);
}

function uuid(value: unknown) {
  const text = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : '';
}

function uuidList(value: unknown, max = MAX_BATCH) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(uuid).filter(Boolean))).slice(0, max);
}

function migrationMissing(error: any) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01' || code === '42703' || code === '42883' || code === 'PGRST202' || code === 'PGRST205'
    || /distribute_base_lead_multistore|lead_store_instances|canonical_lead_id/i.test(message);
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const storeId = uuid(body.store_id);
    const leadIds = uuidList(body.lead_ids, MAX_BATCH);
    const dryRun = body.dry_run !== false;
    const mode = cleanText(body.mode, 40) || 'configured_rotation';
    const selectedUserId = uuid(body.selected_user_id) || null;

    if (!storeId) return NextResponse.json({ error: 'Selecione uma loja válida.' }, { status: 400 });
    if (!leadIds.length) return NextResponse.json({ error: 'Selecione pelo menos um lead.' }, { status: 400 });
    if (!['configured_rotation', 'selected_members'].includes(mode)) {
      return NextResponse.json({ error: 'Modo de distribuição inválido.' }, { status: 400 });
    }
    if (mode === 'selected_members' && !selectedUserId) {
      return NextResponse.json({ error: 'Selecione um membro válido.' }, { status: 400 });
    }

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id,store_name,status')
      .eq('id', storeId)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store || String(store.status || '').toLowerCase() !== 'active') {
      return NextResponse.json({ error: 'Loja ativa não encontrada.' }, { status: 404 });
    }

    if (mode === 'selected_members') {
      const memberResult = await supabase
        .from('users')
        .select('id,store_id,status,role,receives_leads')
        .eq('id', selectedUserId)
        .maybeSingle();
      if (memberResult.error) throw memberResult.error;
      const member = memberResult.data;
      if (!member || member.store_id !== storeId || member.status !== 'active'
        || !['pre_sales', 'seller', 'prospector'].includes(String(member.role || ''))
        || member.receives_leads !== true) {
        return NextResponse.json({ error: 'Membro inválido, pausado ou fora da loja selecionada.' }, { status: 409 });
      }
    }

    const baseResult = await supabase
      .from('leads_base')
      .select('id,name,status,routed_lead_id,canonical_lead_id')
      .in('id', leadIds);
    if (baseResult.error) {
      if (migrationMissing(baseResult.error)) {
        return NextResponse.json({ error: 'A arquitetura multiloja ainda não está instalada neste ambiente.', migration_required: true }, { status: 503 });
      }
      throw baseResult.error;
    }

    const baseRows = baseResult.data || [];
    const baseById = new Map(baseRows.map((lead: any) => [String(lead.id), lead]));
    const ordered = leadIds.map((id) => baseById.get(id)).filter(Boolean) as any[];
    const missingIds = leadIds.filter((id) => !baseById.has(id));
    const routedIds = Array.from(new Set(ordered.map((lead: any) => uuid(lead.routed_lead_id)).filter(Boolean)));
    const routedResult = routedIds.length
      ? await supabase.from('leads').select('id,status').in('id', routedIds)
      : { data: [], error: null };
    if (routedResult.error) throw routedResult.error;
    const routedById = new Map((routedResult.data || []).map((lead: any) => [String(lead.id), lead]));

    const canonicalIds = Array.from(new Set(ordered.map((lead: any) => uuid(lead.canonical_lead_id)).filter(Boolean)));
    const instancesResult = canonicalIds.length
      ? await supabase
          .from('lead_store_instances')
          .select('canonical_lead_id,store_id,lead_id')
          .eq('store_id', storeId)
          .in('canonical_lead_id', canonicalIds)
      : { data: [], error: null };
    if (instancesResult.error) {
      if (migrationMissing(instancesResult.error)) {
        return NextResponse.json({ error: 'A arquitetura multiloja ainda não está instalada neste ambiente.', migration_required: true }, { status: 503 });
      }
      throw instancesResult.error;
    }

    const existingCanonicalIds = new Set((instancesResult.data || []).map((row: any) => String(row.canonical_lead_id)));
    const eligible: any[] = [];
    const alreadyPresent: any[] = [];
    const blocked: Array<{ lead_id: string; name: string; reason: string }> = [];

    for (const lead of ordered) {
      const routed = lead.routed_lead_id ? routedById.get(String(lead.routed_lead_id)) : null;
      if (lead.canonical_lead_id && existingCanonicalIds.has(String(lead.canonical_lead_id))) {
        alreadyPresent.push(lead);
        continue;
      }
      if (String(lead.status || '') === 'Venda concluída' || String(routed?.status || '') === 'sale_confirmed') {
        blocked.push({ lead_id: lead.id, name: lead.name || '', reason: 'Venda concluída protegida.' });
        continue;
      }
      eligible.push(lead);
    }

    const summary = {
      selected: leadIds.length,
      found: ordered.length,
      eligible: eligible.length,
      already_present: alreadyPresent.length,
      blocked: blocked.length,
      missing: missingIds.length,
      store_id: storeId,
      store_name: store.store_name,
      mode,
      multistore: true
    };

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        summary,
        eligible_lead_ids: eligible.map((lead) => String(lead.id)),
        already_present_lead_ids: alreadyPresent.map((lead) => String(lead.id)),
        blocked,
        missing_lead_ids: missingIds
      });
    }

    if (process.env.VERCEL_ENV === 'preview') {
      return NextResponse.json({
        error: 'O Preview está em modo somente leitura. A pré-validação multiloja pode ser testada sem gravar dados.',
        preview_read_only: true,
        summary
      }, { status: 409 });
    }

    if (cleanText(body.confirmation, 40) !== 'DISTRIBUIR') {
      return NextResponse.json({ error: 'Confirmação explícita obrigatória.' }, { status: 400 });
    }

    let distributed = 0;
    let idempotent = 0;
    const results: Array<{ lead_id: string; status: string; lead_instance_id?: string; message?: string }> = [];

    for (const lead of eligible) {
      const rpcResult = await supabase.rpc('distribute_base_lead_multistore', {
        p_base_lead_id: lead.id,
        p_store_id: storeId,
        p_actor_user_id: master.id,
        p_mode: mode,
        p_selected_user_id: selectedUserId
      });
      if (rpcResult.error) {
        if (migrationMissing(rpcResult.error)) {
          return NextResponse.json({ error: 'A migration multiloja ainda não está disponível neste ambiente.', migration_required: true }, { status: 503 });
        }
        results.push({ lead_id: lead.id, status: 'error', message: rpcResult.error.message || 'Falha ao distribuir.' });
        continue;
      }

      const outcome = String(rpcResult.data?.outcome || 'error');
      if (outcome === 'distributed') {
        distributed += 1;
        results.push({ lead_id: lead.id, status: 'distributed', lead_instance_id: rpcResult.data?.routed_lead_id || undefined });
      } else if (outcome === 'already_present') {
        idempotent += 1;
        results.push({ lead_id: lead.id, status: 'already_present', lead_instance_id: rpcResult.data?.routed_lead_id || undefined });
      } else {
        results.push({ lead_id: lead.id, status: outcome, message: 'A RPC permaneceu fail-closed.' });
      }
    }

    return NextResponse.json({
      success: true,
      dry_run: false,
      summary: {
        ...summary,
        distributed,
        idempotent,
        errors: results.filter((item) => item.status === 'error').length
      },
      results
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível distribuir os leads entre lojas.' }, { status: 500 });
  }
}
