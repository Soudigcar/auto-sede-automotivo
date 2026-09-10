import { NextResponse } from 'next/server';
import { readCanonicalCommercialMetrics, resolveMetricsSubject } from '@/lib/server/canonicalCommercialMetrics';
import { PIPELINE_STAGES } from '@/lib/pipelineStagePagination';
import { cleanText } from '@/lib/server/storeTeam';
import { authorizeStorePortal, storeVisibleLeadOrigin } from '@/lib/server/storePortal';
import { whatsappCustomerDisplayName } from '@/lib/server/whatsappCustomerIdentity';

export const runtime = 'nodejs';

function maskPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length < 8) return '••••••••';
  const ddd = local.length >= 10 ? local.slice(0, 2) : '';
  const tail = local.slice(-4);
  return ddd ? `(${ddd}) •••••-${tail}` : `••••-${tail}`;
}

function whatsappProvider(contact: any) {
  const metadata = contact?.metadata && typeof contact.metadata === 'object'
    ? contact.metadata
    : {};
  const provider = cleanText(metadata.provider, 40).toLowerCase();
  if (provider) return provider;
  return cleanText(metadata.remote_jid, 180) ? 'evolution' : null;
}

function historicalParticipantField(role: string) {
  if (role === 'pre_sales') return 'pre_sales_user_id';
  if (role === 'seller') return 'seller_user_id';
  if (role === 'prospector') return 'captured_by_user_id';
  return null;
}

function applyPipelineLeadScope(query: any, profile: any, role: string, cursorFilter?: string) {
  if (role === 'master' || role === 'store') return cursorFilter ? query.or(cursorFilter) : query;
  const userId = cleanText(profile?.id, 80);
  if (!userId) return query.eq('id', '__unauthorized__');
  const participantField = historicalParticipantField(role);
  if (!participantField) return cursorFilter ? query.eq('assigned_user_id', userId).or(cursorFilter) : query.eq('assigned_user_id', userId);
  if (cursorFilter) return query.or(`and(or(assigned_user_id.eq.${userId},and(status.eq.sale_confirmed,${participantField}.eq.${userId})),or(${cursorFilter}))`);
  return query.or(`assigned_user_id.eq.${userId},and(status.eq.sale_confirmed,${participantField}.eq.${userId})`);
}

function pipelineLeadAccessMode(lead: any, profile: any, role: string) {
  if (role === 'master' || role === 'store') return 'current_owner';
  const userId = cleanText(profile?.id, 80);
  if (userId && String(lead?.assigned_user_id || '') === userId) return 'current_owner';
  const participantField = historicalParticipantField(role);
  if (
    userId &&
    participantField &&
    lead?.status === 'sale_confirmed' &&
    String(lead?.[participantField] || '') === userId
  ) return 'historical_sale';
  return 'unauthorized';
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const slug = cleanText(searchParams.get('slug'), 120);
    const offset = searchParams.get('stage') ? 0 : Math.max(0, Number.parseInt(searchParams.get('offset') || '0', 10) || 0);
    const pageSize = Math.min(200, Math.max(25, Number.parseInt(searchParams.get('limit') || '200', 10) || 200));
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    const subject = await resolveMetricsSubject(context, searchParams.get('subject'));
    const stage = searchParams.get('stage');
    if (stage && !(PIPELINE_STAGES as readonly string[]).includes(stage)) return NextResponse.json({ error: 'Etapa inválida.' }, { status: 400 });
    let cursor: { created_at: string; id: string } | null = null;
    if (searchParams.get('cursor')) {
      try { cursor = JSON.parse(searchParams.get('cursor')!); } catch { return NextResponse.json({ error: 'Cursor inválido.' }, { status: 400 }); }
      if (!cursor || !/^\d{4}-\d{2}-\d{2}T[0-9:.+Z-]+$/.test(cursor.created_at) || !Number.isFinite(Date.parse(cursor.created_at)) ||
        !/^[0-9a-f-]{36}$/i.test(cursor.id) || !stage) return NextResponse.json({ error: 'Cursor inválido.' }, { status: 400 });
    }
    let scopeProfile = context.profile;
    let scopeRole: string = context.role;
    if (subject && ['master', 'store'].includes(context.role)) {
      const { data: member, error: memberError } = await context.supabase.from('users').select('id,role').eq('store_id', context.store.id).eq('id', subject).eq('status', 'active').single();
      if (memberError || !member) throw new Error('Responsável inválido.');
      scopeProfile = member; scopeRole = member.role;
      // A manager selected as subject means current ownership only.
      if (scopeRole === 'store') scopeRole = 'member';
    }
    let query = context.supabase
      .from('leads')
      .select([
        'id', 'customer_name', 'customer_phone', 'interested_vehicle', 'origin', 'status',
        'assigned_user_id', 'seller_user_id', 'pre_sales_user_id', 'captured_by_user_id',
        'notes', 'scheduled_at', 'appointment_notes', 'appointment_cancelled_at',
        'appointment_cancelled_reason', 'lost_reason', 'created_at', 'updated_at'
      ].join(','), { count: 'exact' })
      .eq('assigned_store_id', context.store.id)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const cursorFilter = cursor ? `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})` : undefined;
    query = applyPipelineLeadScope(query, scopeProfile, scopeRole, cursorFilter);
    if (stage) query = query.eq('status', stage);
    const { data, error, count } = await query;
    if (error) throw error;

    const loadedLeadIds = (data || []).map((lead: any) => lead.id).filter(Boolean);
    const showedUpLeadIds = new Set<string>(
      (data || [])
        .filter((lead: any) => lead.status === 'showed_up')
        .map((lead: any) => String(lead.id))
    );

    if (loadedLeadIds.length) {
      const showedUpEventsResult = await context.supabase
        .from('lead_activity_logs')
        .select('lead_id')
        .eq('store_id', context.store.id)
        .or('activity_type.eq.showed_up_marked,to_status.eq.showed_up')
        .in('lead_id', loadedLeadIds);
      if (showedUpEventsResult.error) throw showedUpEventsResult.error;
      for (const event of showedUpEventsResult.data || []) {
        if (event?.lead_id) showedUpLeadIds.add(String(event.lead_id));
      }
    }

    let conversationRows: any[] = [];
    let contactRows: any[] = [];
    let whatsappBusinessNames: unknown[] = [context.store.store_name];
    let whatsappEnrichment: 'ready' | 'degraded' = 'ready';
    let whatsappWarning: string | null = null;

    // WhatsApp is enrichment for the Pipeline, not a prerequisite for rendering leads.
    // If the provider/history query is slow or fails, the store must still receive its
    // operational leads and can continue working the Pipeline.
    try {
      if (loadedLeadIds.length) {
        const conversationsResult = await context.supabase
          .from('whatsapp_conversations')
          .select('id,lead_id,contact_id,last_message_at')
          .eq('store_id', context.store.id)
          .in('lead_id', loadedLeadIds)
          .order('last_message_at', { ascending: false });
        if (conversationsResult.error) throw conversationsResult.error;
        conversationRows = conversationsResult.data || [];
      }

      const contactIds = Array.from(new Set(conversationRows.map((conversation: any) => conversation.contact_id).filter(Boolean)));
      if (contactIds.length) {
        const contactsResult = await context.supabase
          .from('whatsapp_contacts')
          .select('id,profile_name,phone,metadata')
          .eq('store_id', context.store.id)
          .in('id', contactIds);
        if (contactsResult.error) throw contactsResult.error;
        contactRows = contactsResult.data || [];
      }

      const integrationResult = await context.supabase
        .from('store_whatsapp_integrations')
        .select('profile_name')
        .eq('store_id', context.store.id)
        .eq('scope', 'store')
        .limit(1)
        .maybeSingle();
      if (integrationResult.error) throw integrationResult.error;
      whatsappBusinessNames = [context.store.store_name, integrationResult.data?.profile_name];
    } catch (whatsappError: any) {
      whatsappEnrichment = 'degraded';
      whatsappWarning = 'Os leads foram carregados, mas o enriquecimento do WhatsApp está temporariamente indisponível.';
      conversationRows = [];
      contactRows = [];
      console.warn('[Store Pipeline] WhatsApp enrichment degraded; returning leads without blocking Pipeline.', {
        storeId: context.store.id,
        error: whatsappError?.message || String(whatsappError)
      });
    }

    const canonical = await readCanonicalCommercialMetrics(context, { subject, cardIds: loadedLeadIds });

    const conversationByLeadId = new Map<string, any>();
    for (const conversation of conversationRows) {
      if (conversation.lead_id && !conversationByLeadId.has(conversation.lead_id)) {
        conversationByLeadId.set(conversation.lead_id, conversation);
      }
    }

    const contactById = new Map(contactRows.map((contact: any) => [contact.id, contact]));
    const leads = (data || []).map((lead: any) => {
      const conversation = conversationByLeadId.get(lead.id) || null;
      const contact = conversation?.contact_id ? contactById.get(conversation.contact_id) : null;
      const response = canonical.card_responses[String(lead.id)];
      const accessMode = pipelineLeadAccessMode(lead, context.profile, context.role);

      return {
        ...lead,
        access_mode: accessMode,
        can_operate: accessMode === 'current_owner',
        has_showed_up: showedUpLeadIds.has(String(lead.id)),
        customer_name: conversation
          ? whatsappCustomerDisplayName(
              [contact?.profile_name, lead.customer_name],
              lead.customer_phone || contact?.phone,
              whatsappBusinessNames
            )
          : lead.customer_name,
        origin: storeVisibleLeadOrigin(lead.origin),
        customer_phone: null,
        customer_phone_masked: maskPhone(lead.customer_phone),
        has_phone: Boolean(String(lead.customer_phone || '').replace(/\D/g, '')),
        whatsapp_conversation_id: conversation?.id || null,
        whatsapp_contact_id: contact?.id || null,
        whatsapp_provider: whatsappProvider(contact),
        human_response_minutes: response?.response_minutes ?? null,
        first_customer_message_at: response?.first_inbound_at || null,
        first_human_response_at: response?.first_human_response_at || null
      };
    });

    const metrics = canonical.metrics;

    let team: Array<{ id: string; full_name: string; role: string; role_label: string }> = [];

    if (context.role === 'master' || context.role === 'store') {
      const { data: members, error: teamError } = await context.supabase
        .from('users')
        .select('id,full_name,email,role')
        .eq('store_id', context.store.id)
        .eq('status', 'active')
        .in('role', ['store', 'pre_sales', 'seller', 'prospector'])
        .order('full_name', { ascending: true });

      if (teamError) throw teamError;

      const labels: Record<string, string> = {
        store: 'Gestor da loja',
        pre_sales: 'Pré-vendas',
        seller: 'Vendedor',
        prospector: 'Prospectador'
      };

      team = (members || []).map((member: any) => ({
        id: member.id,
        full_name: member.full_name || member.email || 'Usuário',
        role: member.role,
        role_label: labels[member.role] || 'Responsável'
      }));
    } else {
      const labels: Record<string, string> = {
        pre_sales: 'Pré-vendas',
        seller: 'Vendedor',
        prospector: 'Prospectador'
      };
      team = [{
        id: context.profile.id,
        full_name: context.profile.full_name || context.profile.email || 'Usuário',
        role: context.role,
        role_label: labels[context.role] || 'Responsável'
      }];
    }

    const scopeLabel = context.role === 'master' || context.role === 'store'
      ? context.scopeLabel
      : 'Leads sob sua responsabilidade atual e vendas confirmadas com sua participação';

    return NextResponse.json({
      store: context.store,
      profile: {
        id: context.profile.id,
        full_name: context.profile.full_name || context.profile.email || 'Usuário',
        role: context.role
      },
      scope_label: scopeLabel,
      capabilities: {
        can_delete: context.role === 'master' || context.role === 'store',
        can_transfer: true,
        can_bulk_transfer: context.role === 'master' || context.role === 'store',
        can_confirm_sale: context.role !== 'prospector'
      },
      metrics,
      stage_totals: canonical.stage_totals,
      subject_user_id: subject,
      team,
      leads,
      enrichment: {
        whatsapp: whatsappEnrichment,
        warning: whatsappWarning
      },
      pagination: {
        offset,
        limit: pageSize,
        total: stage ? (canonical.stage_totals[stage] || 0) : canonical.metrics.total,
        has_more: offset + leads.length < (count || leads.length),
        next_cursor: stage && leads.length && offset + leads.length < (count || leads.length)
          ? { created_at: leads[leads.length - 1].created_at, id: leads[leads.length - 1].id } : null
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o pipeline.' }, { status: 500 });
  }
}
