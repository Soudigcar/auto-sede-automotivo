import { NextResponse } from 'next/server';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { isStoreTeamRole } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

const MAX_LEADS = 2000;
const FINAL_BASE_STATUSES = new Set(['Venda concluída', 'Perdido']);

type RoutedLeadRow = {
  id: string;
  event_id?: string | null;
  assigned_store_id?: string | null;
  assigned_user_id?: string | null;
  assigned_user_role?: string | null;
  status?: string | null;
};

function cleanText(value: unknown, max = 240) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, max);
}

function uuid(value: unknown) {
  const text = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : '';
}

function uuidList(value: unknown, max = MAX_LEADS) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(uuid).filter(Boolean))).slice(0, max);
}

function routingMigrationMissing(error: any) {
  return error?.code === '42P01' || error?.code === '42883' || /lead_routing_rules|route_lead_by_rules/i.test(error?.message || '');
}

async function loadStoreContext(supabase: any, storeId: string) {
  const [{ data: store }, membersResult, rulesResult] = await Promise.all([
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

  if (membersResult.error) throw membersResult.error;
  const migrationRequired = Boolean(rulesResult.error && routingMigrationMissing(rulesResult.error));
  if (rulesResult.error && !migrationRequired) throw rulesResult.error;

  const storeStatus = String(store?.status || '').toLowerCase();
  if (!store || storeStatus === 'deleted' || storeStatus === 'excluido') return null;

  const members = (membersResult.data || []).filter((member: any) => isStoreTeamRole(member.role));
  const rules = migrationRequired ? [] : (rulesResult.data || []);
  return {
    store,
    members,
    rules,
    migration_required: migrationRequired,
    routing_configured: rules.length > 0
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });

    const storeId = uuid(new URL(request.url).searchParams.get('store_id'));
    if (!storeId) return NextResponse.json({ error: 'Selecione uma loja válida.' }, { status: 400 });

    const context = await loadStoreContext(supabase, storeId);
    if (!context) return NextResponse.json({ error: 'Loja válida não encontrada.' }, { status: 404 });

    return NextResponse.json({
      store: context.store,
      members: context.members,
      rules: context.rules,
      migration_required: context.migration_required,
      routing_configured: context.routing_configured,
      preview_read_only: process.env.VERCEL_ENV === 'preview'
    });
  } catch (error: any) {
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
    const leadIds = uuidList(body.lead_ids);
    const memberIds = uuidList(body.member_ids, 500);
    const dryRun = body.dry_run !== false;
    const mode = cleanText(body.mode, 40) || 'configured_rotation';

    if (!storeId || !leadIds.length) return NextResponse.json({ error: 'Loja e leads são obrigatórios.' }, { status: 400 });
    if (Array.isArray(body.lead_ids) && body.lead_ids.length > MAX_LEADS) {
      return NextResponse.json({ error: `Selecione no máximo ${MAX_LEADS} leads por operação.` }, { status: 400 });
    }
    if (!['configured_rotation', 'selected_members'].includes(mode)) {
      return NextResponse.json({ error: 'Modo de distribuição inválido.' }, { status: 400 });
    }

    const context = await loadStoreContext(supabase, storeId);
    if (!context) return NextResponse.json({ error: 'Loja válida não encontrada.' }, { status: 404 });

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
    }

    const { data: baseLeads, error: baseError } = await supabase
      .from('leads_base')
      .select('id,name,phone,email,event_id,status,source,campaign_id,campaign_name,vehicle_name,assigned_store_id,assigned_store_name,assigned_consultant_id,assigned_at,routed_lead_id,routing_strategy,metadata')
      .in('id', leadIds);
    if (baseError) throw baseError;

    const foundIds = new Set((baseLeads || []).map((lead: any) => String(lead.id)));
    const missingIds = leadIds.filter((id) => !foundIds.has(id));
    const routedIds = (baseLeads || []).map((lead: any) => uuid(lead.routed_lead_id)).filter(Boolean);
    const routedResult = routedIds.length
      ? await supabase.from('leads').select('id,event_id,assigned_store_id,assigned_user_id,assigned_user_role,status').in('id', routedIds)
      : { data: [], error: null } as any;
    if (routedResult.error) throw routedResult.error;
    const routedRows = (routedResult.data || []) as RoutedLeadRow[];
    const routedById = new Map<string, RoutedLeadRow>(routedRows.map((lead) => [String(lead.id), lead]));

    const eventIds = Array.from(new Set((baseLeads || []).map((lead: any) => uuid(lead.event_id)).filter(Boolean)));
    const participationResult = eventIds.length
      ? await supabase
          .from('store_event_participations')
          .select('event_id,store_id,status')
          .eq('store_id', storeId)
          .in('event_id', eventIds)
          .in('status', ['active', 'inactive'])
      : { data: [], error: null } as any;
    if (participationResult.error) throw participationResult.error;
    const allowedEventIds = new Set((participationResult.data || []).map((item: any) => String(item.event_id)));

    const eligible: any[] = [];
    const blocked: Array<{ lead_id: string; name: string; reason: string }> = [];

    for (const lead of baseLeads || []) {
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
        blocked.push({ lead_id: lead.id, name: lead.name || '', reason: 'A loja selecionada não participa do evento deste lead.' });
        continue;
      }
      eligible.push(lead);
    }

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
      return NextResponse.json({ success: true, dry_run: true, summary, blocked, missing_lead_ids: missingIds.slice(0, 100) });
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

    for (let index = 0; index < eligible.length; index += 1) {
      const lead = eligible[index];
      try {
        let routedLeadId = uuid(lead.routed_lead_id);
        let routed: RoutedLeadRow | null | undefined = routedLeadId ? routedById.get(routedLeadId) : null;
        const now = new Date().toISOString();

        if (routedLeadId && routed) {
          const { error } = await supabase
            .from('leads')
            .update({ assigned_store_id: storeId, event_id: lead.event_id || routed.event_id || null, updated_at: now })
            .eq('id', routedLeadId)
            .is('assigned_user_id', null);
          if (error) throw error;
        } else {
          const { data: created, error } = await supabase
            .from('leads')
            .insert({
              event_id: lead.event_id || null,
              customer_name: lead.name || 'Lead sem nome',
              customer_phone: lead.phone || null,
              customer_bank: '',
              interested_vehicle: lead.vehicle_name || '',
              vehicle_category_interest: '',
              origin: lead.source || 'manual',
              assigned_store_id: storeId,
              status: 'new_lead',
              notes: 'Lead distribuído em lote pela Base Master.'
            })
            .select('id,assigned_user_id,assigned_user_role')
            .single();
          if (error || !created?.id) throw error || new Error('Não foi possível criar o lead operacional.');
          routedLeadId = created.id;
          routed = created as RoutedLeadRow;
        }

        let assignedUserId = routed?.assigned_user_id || null;
        let assignedRole = routed?.assigned_user_role || null;

        if (mode === 'configured_rotation') {
          if (!assignedUserId) {
            const rpcResult = await supabase.rpc('route_lead_by_rules', { p_lead_id: routedLeadId, p_actor_user_id: master.id });
            if (rpcResult.error) throw rpcResult.error;
            if (rpcResult.data?.outcome !== 'assigned' && rpcResult.data?.outcome !== 'already_assigned') {
              results.push({ lead_id: lead.id, status: String(rpcResult.data?.outcome || 'not_assigned'), message: 'Motor de roteamento não encontrou destinatário elegível.' });
              continue;
            }
            assignedUserId = rpcResult.data?.user_id || null;
            assignedRole = rpcResult.data?.role || null;
          }
        } else {
          const member = selectedMembers[index % selectedMembers.length];
          assignedUserId = member.id;
          assignedRole = member.role;
          const leadUpdate: Record<string, unknown> = {
            assigned_user_id: member.id,
            assigned_user_role: member.role,
            assigned_user_at: now,
            assignment_source: 'master_bulk_distribution',
            updated_at: now
          };
          if (member.role === 'prospector') leadUpdate.captured_by_user_id = member.id;
          if (member.role === 'pre_sales') {
            leadUpdate.pre_sales_user_id = member.id;
            leadUpdate.pre_sales_assigned_at = now;
          }
          if (member.role === 'seller') {
            leadUpdate.seller_user_id = member.id;
            leadUpdate.seller_assigned_at = now;
          }
          const { error: memberError } = await supabase.from('leads').update(leadUpdate).eq('id', routedLeadId).is('assigned_user_id', null);
          if (memberError) throw memberError;
          const { error: logError } = await supabase.from('lead_assignment_logs').insert({
            lead_id: routedLeadId,
            store_id: storeId,
            assignment_role: member.role,
            from_user_id: null,
            to_user_id: member.id,
            assignment_mode: 'manual',
            assigned_by_user_id: master.id,
            notes: 'Distribuição em lote pela Base Master.',
            metadata: { source: 'master_base_bulk_distribution', batch_position: index }
          });
          if (logError) throw logError;
        }

        const metadata = {
          ...(lead.metadata || {}),
          event_id: lead.event_id || null,
          routing: {
            ...(lead.metadata?.routing || {}),
            strategy: mode === 'configured_rotation' ? 'routing_rule' : 'master_bulk_distribution',
            previous_store_id: lead.assigned_store_id || null,
            previous_store_name: lead.assigned_store_name || null,
            assigned_store_id: storeId,
            assigned_store_name: context.store.store_name,
            assigned_at: now,
            routed_lead_id: routedLeadId,
            assigned_user_id: assignedUserId,
            assigned_user_role: assignedRole
          }
        };

        const { error: baseUpdateError } = await supabase.from('leads_base').update({
          assigned_store_id: storeId,
          assigned_store_name: context.store.store_name,
          assigned_consultant_id: assignedUserId,
          assigned_at: now,
          routed_lead_id: routedLeadId,
          routing_strategy: mode === 'configured_rotation' ? 'routing_rule' : 'master_bulk_distribution',
          metadata,
          updated_at: now
        }).eq('id', lead.id).is('assigned_consultant_id', null);
        if (baseUpdateError) throw baseUpdateError;

        distributed += 1;
        results.push({ lead_id: lead.id, status: 'distributed', user_id: assignedUserId || undefined, role: assignedRole || undefined });
      } catch (error: any) {
        results.push({ lead_id: lead.id, status: 'error', message: error?.message || 'Falha ao distribuir o lead.' });
      }
    }

    return NextResponse.json({
      success: true,
      dry_run: false,
      summary: { ...summary, distributed, errors: results.filter((item) => item.status === 'error').length },
      results
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível distribuir os leads.' }, { status: 500 });
  }
}
