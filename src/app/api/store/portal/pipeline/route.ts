import { NextResponse } from 'next/server';
import { calculateResponseTimes, responseByLeadId } from '@/lib/commercialMetrics';
import { cleanText } from '@/lib/server/storeTeam';
import { applyStoreLeadScope, authorizeStorePortal, storeVisibleLeadOrigin } from '@/lib/server/storePortal';
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

function profilePictureUrl(contact: any) {
  const metadata = contact?.metadata && typeof contact.metadata === 'object'
    ? contact.metadata
    : {};

  return cleanText(
    contact?.profile_picture_url ||
    contact?.profile_picture ||
    contact?.avatar_url ||
    contact?.photo_url ||
    metadata.profile_picture_url ||
    metadata.profilePictureUrl ||
    metadata.avatar_url ||
    metadata.photo_url,
    2_000
  ) || null;
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const slug = cleanText(searchParams.get('slug'), 120);
    const offset = Math.max(0, Number.parseInt(searchParams.get('offset') || '0', 10) || 0);
    const pageSize = Math.min(200, Math.max(25, Number.parseInt(searchParams.get('limit') || '200', 10) || 200));
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    let query = context.supabase
      .from('leads')
      .select([
        'id', 'customer_name', 'customer_phone', 'interested_vehicle', 'origin', 'status',
        'assigned_user_id', 'seller_user_id', 'pre_sales_user_id', 'captured_by_user_id',
        'notes', 'scheduled_at', 'appointment_notes', 'appointment_cancelled_at',
        'appointment_cancelled_reason', 'lost_reason', 'created_at'
      ].join(','), { count: 'exact' })
      .eq('assigned_store_id', context.store.id)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    query = applyStoreLeadScope(query, context.profile, context.role);
    const { data, error, count } = await query;
    if (error) throw error;

    const loadedLeadIds = (data || []).map((lead: any) => lead.id).filter(Boolean);
    let conversationRows: any[] = [];
    let messageRows: any[] = [];
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

      const conversationIds = conversationRows.map((conversation: any) => conversation.id).filter(Boolean);
      if (conversationIds.length) {
        const messagesResult = await context.supabase
          .from('whatsapp_messages')
          .select('conversation_id,lead_id,direction,raw_payload,sent_at,created_at')
          .in('conversation_id', conversationIds)
          .order('sent_at', { ascending: true });
        if (messagesResult.error) throw messagesResult.error;
        messageRows = messagesResult.data || [];
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
      messageRows = [];
      contactRows = [];
      console.warn('[Store Pipeline] WhatsApp enrichment degraded; returning leads without blocking Pipeline.', {
        storeId: context.store.id,
        error: whatsappError?.message || String(whatsappError)
      });
    }

    const responseMeasurements = responseByLeadId(
      calculateResponseTimes(conversationRows, messageRows).measurements
    );

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
      const response = responseMeasurements.get(String(lead.id));

      return {
        ...lead,
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
        profile_picture_url: profilePictureUrl(contact),
        human_response_minutes: response?.response_minutes ?? null,
        first_customer_message_at: response?.first_inbound_at || null,
        first_human_response_at: response?.first_human_response_at || null
      };
    });

    const loadedMetrics = {
      total: count || leads.length,
      scheduled: leads.filter((lead: any) => lead.status === 'scheduled').length,
      cancelled: leads.filter((lead: any) => lead.status === 'appointment_cancelled').length,
      sold: leads.filter((lead: any) => lead.status === 'sale_confirmed').length,
      lost: leads.filter((lead: any) => lead.status === 'lost').length
    };
    const metricContext = {
      supabase: context.supabase,
      store: context.store,
      profile: context.profile,
      role: context.role
    };

    const metrics = offset === 0 && (count || 0) > leads.length
      ? await (async () => {
          async function countStatus(status: string) {
            let statusQuery = metricContext.supabase
              .from('leads')
              .select('id', { count: 'exact', head: true })
              .eq('assigned_store_id', metricContext.store.id)
              .eq('status', status);
            statusQuery = applyStoreLeadScope(statusQuery, metricContext.profile, metricContext.role);
            const { count: statusCount, error: statusError } = await statusQuery;
            if (statusError) throw statusError;
            return statusCount || 0;
          }

          const [scheduled, cancelled, sold, lost] = await Promise.all([
            countStatus('scheduled'),
            countStatus('appointment_cancelled'),
            countStatus('sale_confirmed'),
            countStatus('lost')
          ]);

          return { total: count || leads.length, scheduled, cancelled, sold, lost };
        })()
      : loadedMetrics;

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

    return NextResponse.json({
      store: context.store,
      profile: {
        id: context.profile.id,
        full_name: context.profile.full_name || context.profile.email || 'Usuário',
        role: context.role
      },
      scope_label: context.scopeLabel,
      capabilities: {
        can_delete: context.role === 'master' || context.role === 'store',
        can_transfer: true,
        can_bulk_transfer: context.role === 'master' || context.role === 'store',
        can_confirm_sale: context.role !== 'prospector'
      },
      metrics,
      team,
      leads,
      enrichment: {
        whatsapp: whatsappEnrichment,
        warning: whatsappWarning
      },
      pagination: {
        offset,
        limit: pageSize,
        total: count || leads.length,
        has_more: offset + leads.length < (count || leads.length)
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o pipeline.' }, { status: 500 });
  }
}
