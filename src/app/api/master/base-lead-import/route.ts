import { NextResponse } from 'next/server';
import { LEAD_IMPORT_MAX_ROWS, validateLeadImportPayloadRows } from '@/lib/leadImport';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_MAX_ROWS = 500;
const REQUEST_MAX_BYTES = 4_200_000;
const teamRoles = ['pre_sales', 'seller', 'prospector'] as const;
const roleLabels: Record<string, string> = {
  pre_sales: 'Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospectador'
};

function text(value: unknown, maxLength = 240) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, maxLength);
}

function uniqueStrings(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => text(item, 80)).filter(Boolean))).slice(0, limit);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readImportBody(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > REQUEST_MAX_BYTES) throw new Error('request_too_large');

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > REQUEST_MAX_BYTES) throw new Error('request_too_large');

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('invalid_json');
  }
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });

    const [eventsResult, storesResult, membersResult] = await Promise.all([
      supabase
        .from('events')
        .select('id,event_name,status,start_date')
        .neq('status', 'deleted')
        .order('start_date', { ascending: false, nullsFirst: false }),
      supabase
        .from('stores')
        .select('id,store_name,status')
        .eq('status', 'active')
        .order('store_name', { ascending: true }),
      supabase
        .from('users')
        .select('id,full_name,role,store_id,status,receives_leads,routing_order,stores!users_store_id_fkey(store_name)')
        .eq('status', 'active')
        .in('role', [...teamRoles])
        .not('store_id', 'is', null)
        .order('routing_order', { ascending: true })
        .order('full_name', { ascending: true })
    ]);

    if (eventsResult.error || storesResult.error || membersResult.error) {
      throw eventsResult.error || storesResult.error || membersResult.error;
    }

    return NextResponse.json({
      events: eventsResult.data || [],
      stores: storesResult.data || [],
      members: (membersResult.data || []).map((member: any) => ({
        id: member.id,
        full_name: member.full_name,
        role: member.role,
        store_id: member.store_id,
        store_name: Array.isArray(member.stores) ? member.stores[0]?.store_name || '' : member.stores?.store_name || '',
        receives_leads: member.receives_leads === true
      })),
      role_labels: roleLabels
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar os dados da importação.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });

    let body: any;
    try {
      body = await readImportBody(request);
    } catch (error: any) {
      if (error?.message === 'request_too_large') {
        return NextResponse.json({ error: 'Lote muito grande. Reduza a quantidade de linhas e tente novamente.' }, { status: 413 });
      }
      return NextResponse.json({ error: 'Conteúdo da importação inválido.' }, { status: 400 });
    }

    let rows;
    try {
      rows = validateLeadImportPayloadRows(body?.rows, BATCH_MAX_ROWS);
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || 'O lote contém linhas inválidas.' }, { status: 400 });
    }
    const fileName = text(body?.file_name, 240);
    const fileSha256 = text(body?.file_sha256, 64).toLowerCase();
    const eventId = text(body?.event_id, 80) || null;
    const selectedStoreIds = uniqueStrings(body?.selected_store_ids, 100);
    const chunkIndex = Math.max(1, Math.min(Number(body?.chunk_index) || 1, 1000));
    const chunkCount = Math.max(chunkIndex, Math.min(Number(body?.chunk_count) || 1, 1000));
    const distributionOffset = Math.max(0, Math.min(Number(body?.distribution_offset) || 0, LEAD_IMPORT_MAX_ROWS));

    if (!fileName || !/^[0-9a-f]{64}$/.test(fileSha256)) {
      return NextResponse.json({ error: 'Identificação segura do arquivo inválida.' }, { status: 400 });
    }
    if (!selectedStoreIds.length || selectedStoreIds.some((id) => !isUuid(id))) {
      return NextResponse.json({ error: 'Selecione pelo menos uma loja válida.' }, { status: 400 });
    }
    if (eventId && !isUuid(eventId)) {
      return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 });
    }

    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id,store_name,status')
      .in('id', selectedStoreIds)
      .eq('status', 'active');
    if (storesError) throw storesError;
    if ((stores || []).length !== selectedStoreIds.length) {
      return NextResponse.json({ error: 'Uma ou mais lojas não estão ativas ou não existem.' }, { status: 409 });
    }

    if (eventId) {
      const [{ data: event }, { data: participations, error: participationError }] = await Promise.all([
        supabase.from('events').select('id,event_name,status').eq('id', eventId).neq('status', 'deleted').maybeSingle(),
        supabase
          .from('store_event_participations')
          .select('store_id,status')
          .eq('event_id', eventId)
          .in('store_id', selectedStoreIds)
          .in('status', ['active', 'inactive'])
      ]);
      if (!event) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
      if (participationError) throw participationError;
      const participatingIds = new Set((participations || []).map((item: any) => item.store_id));
      const missingStore = (stores || []).find((store: any) => !participatingIds.has(store.id));
      if (missingStore) {
        return NextResponse.json({ error: `${missingStore.store_name} não participa do evento selecionado.` }, { status: 409 });
      }
    }

    const distribution = body?.distribution && typeof body.distribution === 'object' ? body.distribution : {};
    const distributionEnabled = distribution.enabled === true;
    const mode = distribution.mode === 'roles' ? 'roles' : 'members';
    const requestedMemberIds = uniqueStrings(distribution.member_ids, 500);
    const requestedRoles = uniqueStrings(distribution.roles, teamRoles.length)
      .filter((role) => teamRoles.includes(role as (typeof teamRoles)[number]));
    let assigneeIds: string[] = [];

    if (distributionEnabled) {
      let query = supabase
        .from('users')
        .select('id,full_name,role,store_id,status,receives_leads,routing_order')
        .eq('status', 'active')
        .in('store_id', selectedStoreIds)
        .in('role', [...teamRoles])
        .order('routing_order', { ascending: true })
        .order('full_name', { ascending: true })
        .order('id', { ascending: true });

      if (mode === 'members') {
        if (!requestedMemberIds.length || requestedMemberIds.some((id) => !isUuid(id))) {
          return NextResponse.json({ error: 'Selecione pelo menos um membro válido.' }, { status: 400 });
        }
        query = query.in('id', requestedMemberIds);
      } else {
        if (!requestedRoles.length) return NextResponse.json({ error: 'Selecione pelo menos um cargo.' }, { status: 400 });
        query = query.in('role', requestedRoles).eq('receives_leads', true);
      }

      const { data: members, error: membersError } = await query;
      if (membersError) throw membersError;
      assigneeIds = (members || []).map((member: any) => member.id);

      if (mode === 'members' && assigneeIds.length !== requestedMemberIds.length) {
        return NextResponse.json({ error: 'Um membro selecionado está inativo, pertence a outra loja ou possui cargo inválido.' }, { status: 409 });
      }
      if (!assigneeIds.length) {
        return NextResponse.json({ error: 'Nenhuma pessoa habilitada foi encontrada para a distribuição.' }, { status: 409 });
      }
    }

    const { data, error } = await supabase.rpc('master_import_leads_batch', {
      p_rows: rows,
      p_event_id: eventId,
      p_selected_store_ids: selectedStoreIds,
      p_assignee_ids: assigneeIds,
      p_file_name: fileName,
      p_file_sha256: fileSha256,
      p_actor_user_id: master.id,
      p_chunk_index: chunkIndex,
      p_chunk_count: chunkCount,
      p_distribution_offset: distributionOffset
    });

    if (error) {
      const migrationMissing = error.code === 'PGRST202' || /master_import_leads_batch/i.test(error.message || '');
      return NextResponse.json({
        error: migrationMissing
          ? 'A função de importação ainda não está instalada neste ambiente.'
          : 'Não foi possível concluir o lote de importação.'
      }, { status: migrationMissing ? 503 : 500 });
    }

    return NextResponse.json({ success: true, report: data });
  } catch {
    return NextResponse.json({ error: 'Não foi possível processar a importação.' }, { status: 500 });
  }
}
