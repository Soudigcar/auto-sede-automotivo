import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEvolutionLocation } from '@/lib/server/evolution';
import { markAutocarHumanActive } from '@/lib/server/autocar/safeRuntime';
import { readManagedEvolutionState } from '@/lib/server/managedWhatsappEvolution';
import { asStorePortalRole, canAccessStoreConversation } from '@/lib/server/storePortal';
import { resolveEvolutionAvailability } from '@/lib/server/storeWhatsappChannel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LocationSource = 'store' | 'current';

function cleanText(value: unknown, maxLength = 240) {
  return String(value || '').trim().slice(0, maxLength);
}

function coordinate(value: unknown, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function normalizePhone(value: unknown) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase Service Role não configurada no servidor.');
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getProfile(supabase: any, token: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;
  const { data: byAuth } = await supabase.from('users').select('*').eq('auth_user_id', authData.user.id).maybeSingle();
  if (byAuth?.status === 'active' && asStorePortalRole(byAuth.role)) return byAuth;
  if (!authData.user.email) return null;
  const { data: byEmail } = await supabase.from('users').select('*').ilike('email', authData.user.email).maybeSingle();
  return byEmail?.status === 'active' && asStorePortalRole(byEmail.role) ? byEmail : null;
}

function canAccessConversation(profile: any, conversation: any, lead: any) {
  const role = asStorePortalRole(profile?.role);
  return Boolean(role && canAccessStoreConversation(profile, role, conversation, lead));
}

function storeAddress(store: any) {
  return [store?.address_text, store?.city, store?.state, store?.postal_code].map((value) => cleanText(value, 180)).filter(Boolean).join(', ');
}

function publicStoreLocation(store: any) {
  const latitude = coordinate(store?.latitude, -90, 90);
  const longitude = coordinate(store?.longitude, -180, 180);
  if (latitude === null || longitude === null) return null;
  return {
    source: 'store' as const,
    name: cleanText(store?.location_label || store?.store_name || 'Localização da loja', 120),
    address: storeAddress(store),
    latitude,
    longitude
  };
}

function evolutionMessageId(result: any) {
  return result?.key?.id || result?.message?.key?.id || result?.data?.key?.id || result?.data?.message?.key?.id || result?.id || null;
}

async function resolveContext(supabase: any, token: string, conversationId: string) {
  if (!token) return { response: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) };
  const profile = await getProfile(supabase, token);
  if (!profile) return { response: NextResponse.json({ error: 'Usuário sem permissão para enviar localização.' }, { status: 403 }) };
  if (!conversationId) return { response: NextResponse.json({ error: 'Informe a conversa.' }, { status: 400 }) };

  const { data: conversation, error: conversationError } = await supabase.from('whatsapp_conversations').select('*').eq('id', conversationId).maybeSingle();
  if (conversationError) return { response: NextResponse.json({ error: conversationError.message }, { status: 400 }) };
  if (!conversation) return { response: NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 }) };

  const [leadResponse, baseLeadResponse] = await Promise.all([
    conversation.lead_id
      ? supabase.from('leads').select('id, assigned_store_id, assigned_user_id').eq('id', conversation.lead_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    conversation.base_lead_id
      ? supabase.from('leads_base').select('id, assigned_store_id, routed_lead_id').eq('id', conversation.base_lead_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  const leadError = leadResponse.error || baseLeadResponse.error;
  if (leadError) return { response: NextResponse.json({ error: leadError.message }, { status: 400 }) };
  const lead = leadResponse.data;
  const baseLead = baseLeadResponse.data;
  if (!canAccessConversation(profile, conversation, lead)) {
    return { response: NextResponse.json({ error: 'Conversa não encontrada ou sem permissão.' }, { status: 404 }) };
  }

  const locationStoreId = conversation.store_id || lead?.assigned_store_id || baseLead?.assigned_store_id || null;
  const [contactResponse, integrationResponse, storeResponse] = await Promise.all([
    supabase.from('whatsapp_contacts').select('id, phone, wa_id').eq('id', conversation.contact_id).maybeSingle(),
    supabase.from('store_whatsapp_integrations').select('instance_name, status, scope, provider').eq('crm_number_id', conversation.whatsapp_number_id).maybeSingle(),
    locationStoreId
      ? supabase.from('stores').select('id, store_name, address_text, city, state, postal_code, location_label, latitude, longitude').eq('id', locationStoreId).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  const relationError = contactResponse.error || integrationResponse.error || storeResponse.error;
  if (relationError) return { response: NextResponse.json({ error: relationError.message }, { status: 400 }) };

  return {
    profile,
    conversation,
    contact: contactResponse.data,
    integration: integrationResponse.data,
    store: storeResponse.data
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const conversationId = cleanText(new URL(request.url).searchParams.get('conversation_id'), 120);
    const context = await resolveContext(supabase, token, conversationId);
    if (context.response) return context.response;
    return NextResponse.json({ success: true, store_location: publicStoreLocation(context.store) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao consultar localização.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const body = await request.json().catch(() => ({}));
    const conversationId = cleanText(body.conversation_id, 120);
    const source = cleanText(body.source, 20) as LocationSource;
    if (!['store', 'current'].includes(source)) return NextResponse.json({ error: 'Origem da localização inválida.' }, { status: 400 });

    const context = await resolveContext(supabase, token, conversationId);
    if (context.response) return context.response;
    const { profile, conversation, contact, integration } = context;
    if (!contact) return NextResponse.json({ error: 'Contato da conversa não encontrado.' }, { status: 404 });
    if (!integration || integration.provider !== 'evolution') {
      return NextResponse.json({ error: 'Envio de localização está disponível para conversas Evolution nesta etapa.' }, { status: 409 });
    }

    const liveState = await readManagedEvolutionState(integration);
    const availability = resolveEvolutionAvailability(integration, liveState);
    if (!availability.connected) {
      const owner = integration.scope === 'master' ? 'central do Master' : 'da loja';
      return NextResponse.json({ error: `WhatsApp ${owner} não está conectado neste momento.`, channel_status: availability.status }, { status: 409 });
    }

    const recipient = normalizePhone(contact.phone || contact.wa_id);
    if (!recipient) return NextResponse.json({ error: 'Contato sem telefone válido para envio.' }, { status: 400 });

    const trustedStoreLocation = publicStoreLocation(context.store);
    const latitude = source === 'store' ? trustedStoreLocation?.latitude ?? null : coordinate(body.latitude, -90, 90);
    const longitude = source === 'store' ? trustedStoreLocation?.longitude ?? null : coordinate(body.longitude, -180, 180);
    if (latitude === null || longitude === null) {
      const error = source === 'store' ? 'A loja ainda não possui latitude e longitude configuradas.' : 'A localização atual retornou coordenadas inválidas.';
      return NextResponse.json({ error }, { status: 400 });
    }

    const name = source === 'store'
      ? trustedStoreLocation!.name
      : cleanText(body.name || 'Localização atual', 120);
    const address = source === 'store'
      ? trustedStoreLocation!.address
      : cleanText(body.address || 'Localização compartilhada pelo atendente', 240);

    if (conversation.store_id) {
      const takeover = await markAutocarHumanActive({
        productionSupabase: supabase,
        storeId: conversation.store_id,
        conversationId: conversation.id,
        whatsappNumberId: conversation.whatsapp_number_id,
        leadId: conversation.lead_id || null,
        messageId: null,
        profileId: profile.id || null,
        source: 'inbox'
      });
      if (takeover?.human_state !== 'human_active') {
        return NextResponse.json({ error: 'Não foi possível confirmar o atendimento humano antes do envio.' }, { status: 409 });
      }
    }

    const result = await sendEvolutionLocation(integration.instance_name, recipient, { name, address, latitude, longitude });
    const waMessageId = evolutionMessageId(result);
    const sentAt = new Date().toISOString();
    const previewBody = `📍 ${name}${address ? ` — ${address}` : ''}`;
    const location = { source, name, address, latitude, longitude };

    let savedMessage: any = null;
    const { data: inserted, error: saveError } = await supabase.from('whatsapp_messages').insert({
      store_id: conversation.store_id,
      whatsapp_number_id: conversation.whatsapp_number_id,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      lead_id: conversation.lead_id,
      base_lead_id: conversation.base_lead_id,
      wa_message_id: waMessageId,
      direction: 'outbound',
      message_type: 'location',
      body: previewBody,
      status: 'sent',
      raw_payload: {
        provider_result: result,
        location,
        metric_sender_type: 'human',
        metric_sender_user_id: profile.id,
        metric_sender_role: profile.role,
        metric_sender_source: 'crm'
      },
      sent_at: sentAt
    }).select('*').single();

    if (saveError) {
      if (waMessageId) {
        const { data: existing } = await supabase.from('whatsapp_messages').select('*').eq('wa_message_id', waMessageId).maybeSingle();
        savedMessage = existing || null;
      }
      if (!savedMessage) return NextResponse.json({ error: saveError.message }, { status: 400 });
    } else savedMessage = inserted;

    await supabase.from('whatsapp_conversations').update({ last_message: previewBody, last_message_at: sentAt, unread_count: 0, updated_at: sentAt }).eq('id', conversation.id);
    return NextResponse.json({ success: true, message: savedMessage, provider: 'evolution' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao enviar localização pelo WhatsApp.' }, { status: 500 });
  }
}
