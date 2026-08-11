import { NextResponse } from 'next/server';
import { cleanText } from '@/lib/server/storeTeam';
import { authorizeStorePortal } from '@/lib/server/storePortal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const saleChannels = ['door', 'internet', 'event'] as const;
const paymentTypes = ['cash', 'financed', 'consortium', 'other'] as const;
const teamRoles = ['store', 'pre_sales', 'seller', 'prospector'];

function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalizedEmail(value: unknown) {
  return cleanText(value, 320).toLowerCase();
}

function maskPhone(value: unknown) {
  const raw = digits(value);
  if (!raw) return '';
  const local = raw.startsWith('55') && raw.length >= 12 ? raw.slice(2) : raw;
  const ddd = local.length >= 10 ? local.slice(0, 2) : '';
  const tail = local.slice(-4);
  return ddd ? `(${ddd}) •••••-${tail}` : `••••-${tail}`;
}

function vehicleName(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.year]
    .map((value) => cleanText(value, 160))
    .filter(Boolean)
    .join(' ');
}

function leadSummary(lead: any, base: any = null) {
  return {
    id: lead.id,
    customer_name: lead.customer_name || base?.name || 'Cliente sem nome',
    customer_phone_masked: maskPhone(lead.customer_phone || base?.phone),
    email: base?.email || null,
    cpf: base?.cpf || null,
    event_id: lead.event_id || base?.event_id || null,
    origin: lead.origin || base?.source || null,
    status: lead.status,
    interested_vehicle: lead.interested_vehicle || null,
    created_at: lead.created_at
  };
}

async function loadLeadBaseMap(supabase: any, storeId: string, leadIds: string[]) {
  if (!leadIds.length) return new Map<string, any>();
  const { data, error } = await supabase
    .from('leads_base')
    .select('routed_lead_id,event_id,name,phone,email,cpf,source,created_at')
    .eq('assigned_store_id', storeId)
    .in('routed_lead_id', leadIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const map = new Map<string, any>();
  for (const item of data || []) {
    if (item.routed_lead_id && !map.has(item.routed_lead_id)) map.set(item.routed_lead_id, item);
  }
  return map;
}

async function loadSearchableLeads(supabase: any, storeId: string, eventId?: string) {
  let query = supabase
    .from('leads')
    .select('id,event_id,assigned_store_id,customer_name,customer_phone,interested_vehicle,origin,status,created_at')
    .eq('assigned_store_id', storeId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (eventId) query = query.eq('event_id', eventId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function findDuplicate(supabase: any, storeId: string, phone: string, email: string) {
  const phoneDigits = digits(phone);
  const emailKey = normalizedEmail(email);
  if (!phoneDigits && !emailKey) return null;

  const leads = await loadSearchableLeads(supabase, storeId);
  const baseMap = await loadLeadBaseMap(supabase, storeId, leads.map((lead: any) => lead.id));
  for (const lead of leads) {
    const base = baseMap.get(lead.id);
    const samePhone = Boolean(phoneDigits) && digits(lead.customer_phone || base?.phone) === phoneDigits;
    const sameEmail = Boolean(emailKey) && normalizedEmail(base?.email) === emailKey;
    if (samePhone || sameEmail) return leadSummary(lead, base);
  }
  return null;
}

async function getContext(request: Request, slug: string) {
  const context = await authorizeStorePortal(request, slug);
  if ('error' in context) return context;
  if (!context.permissions.includes('manage_stock')) {
    return { error: NextResponse.json({ error: 'Este perfil não pode registrar vendas pelo estoque.' }, { status: 403 }) } as const;
  }
  return context;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const action = cleanText(url.searchParams.get('action'), 40) || 'context';
    const context = await getContext(request, slug);
    if ('error' in context) return context.error;

    const { supabase, store } = context;

    if (action === 'search-leads') {
      const q = cleanText(url.searchParams.get('q'), 200);
      const eventId = cleanText(url.searchParams.get('event_id'), 80);
      if (q.length < 2) return NextResponse.json({ leads: [] });

      const queryDigits = digits(q);
      const queryText = q.toLowerCase();
      const leads = await loadSearchableLeads(supabase, store.id, eventId || undefined);
      const baseMap = await loadLeadBaseMap(supabase, store.id, leads.map((lead: any) => lead.id));
      const filtered = leads
        .filter((lead: any) => {
          const base = baseMap.get(lead.id);
          const name = String(lead.customer_name || base?.name || '').toLowerCase();
          const email = normalizedEmail(base?.email);
          const phone = digits(lead.customer_phone || base?.phone);
          return name.includes(queryText) || email.includes(queryText) || (queryDigits.length >= 4 && phone.includes(queryDigits));
        })
        .slice(0, 30)
        .map((lead: any) => leadSummary(lead, baseMap.get(lead.id)));

      return NextResponse.json({ leads: filtered }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    const vehicleId = cleanText(url.searchParams.get('vehicle_id'), 80);
    if (!vehicleId) return NextResponse.json({ error: 'Informe o veículo.' }, { status: 400 });

    const { data: vehicle, error: vehicleError } = await supabase
      .from('site_vehicles')
      .select('id,store_id,brand,model,version,year,manufacture_year,model_year,price,status,show_on_landing,image_url,image_urls,sold_at,sold_lead_id')
      .eq('id', vehicleId)
      .eq('store_id', store.id)
      .maybeSingle();
    if (vehicleError) throw vehicleError;
    if (!vehicle) return NextResponse.json({ error: 'Veículo não encontrado no estoque desta loja.' }, { status: 404 });

    const [{ data: team, error: teamError }, { data: participations, error: participationError }] = await Promise.all([
      supabase
        .from('users')
        .select('id,full_name,email,role,status,store_id')
        .eq('store_id', store.id)
        .eq('status', 'active')
        .in('role', teamRoles)
        .order('full_name', { ascending: true }),
      supabase
        .from('store_event_participations')
        .select('event_id,status,created_at')
        .eq('store_id', store.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(100)
    ]);
    if (teamError) throw teamError;
    if (participationError) throw participationError;

    const eventIds = Array.from(new Set((participations || []).map((item: any) => item.event_id).filter(Boolean)));
    let events: any[] = [];
    if (eventIds.length) {
      const { data, error } = await supabase
        .from('events')
        .select('id,event_name,slug,start_date,end_date,status,city,state')
        .in('id', eventIds)
        .order('end_date', { ascending: false });
      if (error) throw error;
      events = data || [];
    }

    return NextResponse.json({
      store: { id: store.id, store_name: store.store_name },
      vehicle: { ...vehicle, display_name: vehicleName(vehicle) },
      team: (team || []).map((member: any) => ({
        id: member.id,
        full_name: member.full_name || member.email || 'Membro da equipe',
        role: member.role
      })),
      events
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o registro de venda.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const slug = cleanText(body.slug, 120);
    const action = cleanText(body.action, 40) || 'confirm';
    const context = await getContext(request, slug);
    if ('error' in context) return context.error;

    const { supabase, store, profile } = context;

    if (action === 'duplicate-check') {
      const duplicate = await findDuplicate(supabase, store.id, cleanText(body.phone, 80), normalizedEmail(body.email));
      return NextResponse.json({ duplicate });
    }

    if (action !== 'confirm') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });

    const vehicleId = cleanText(body.vehicle_id, 80);
    const channel = cleanText(body.sale_channel, 30) as (typeof saleChannels)[number];
    const eventId = cleanText(body.event_id, 80) || null;
    const leadId = cleanText(body.lead_id, 80) || null;
    const registerCustomer = body.register_customer === true;
    const responsibleUserId = cleanText(body.responsible_user_id, 80) || null;
    const paymentType = cleanText(body.payment_type, 30) || null;
    const hasTradeIn = typeof body.has_trade_in === 'boolean' ? body.has_trade_in : null;
    const customerName = cleanText(body.customer_name, 180);
    const customerPhone = cleanText(body.customer_phone, 80);
    const customerEmail = normalizedEmail(body.customer_email);
    const customerCpf = cleanText(body.customer_cpf, 32);
    const birthDate = cleanText(body.birth_date, 20) || null;

    if (!vehicleId) return NextResponse.json({ error: 'Informe o veículo vendido.' }, { status: 400 });
    if (!saleChannels.includes(channel)) return NextResponse.json({ error: 'Selecione Porta, Internet ou Evento.' }, { status: 400 });
    if (channel === 'event' && !eventId) return NextResponse.json({ error: 'Selecione o evento da venda.' }, { status: 400 });

    const detailedSale = channel !== 'door' || registerCustomer;
    if (detailedSale && !leadId) {
      if (customerName.length < 3) return NextResponse.json({ error: 'Informe o nome do cliente.' }, { status: 400 });
      if (digits(customerPhone).length < 10) return NextResponse.json({ error: 'Informe um telefone válido.' }, { status: 400 });
    }
    if (detailedSale && !responsibleUserId) return NextResponse.json({ error: 'Selecione o responsável pela venda.' }, { status: 400 });
    if (detailedSale && (!paymentType || !paymentTypes.includes(paymentType as any))) return NextResponse.json({ error: 'Selecione a forma de pagamento.' }, { status: 400 });
    if (detailedSale && hasTradeIn === null) return NextResponse.json({ error: 'Informe se houve veículo na troca.' }, { status: 400 });

    if (!leadId && detailedSale) {
      const duplicate = await findDuplicate(supabase, store.id, customerPhone, customerEmail);
      if (duplicate) {
        return NextResponse.json({ error: 'Este cliente já possui um lead salvo. Selecione o cadastro existente antes de concluir a venda.', duplicate }, { status: 409 });
      }
    }

    const actorName = profile.full_name || profile.email || 'Usuário';
    const { data, error } = await supabase.rpc('store_confirm_inventory_sale_transaction', {
      p_vehicle_id: vehicleId,
      p_store_id: store.id,
      p_sale_channel: channel,
      p_event_id: eventId,
      p_lead_id: leadId,
      p_register_customer: registerCustomer,
      p_customer_name: customerName || null,
      p_customer_phone: customerPhone || null,
      p_customer_email: customerEmail || null,
      p_customer_cpf: customerCpf || null,
      p_birth_date: birthDate,
      p_responsible_user_id: responsibleUserId,
      p_payment_type: paymentType,
      p_has_trade_in: hasTradeIn,
      p_actor_user_id: profile.id,
      p_actor_name: actorName
    });

    if (error) {
      const message = String(error.message || '');
      if (message.includes('store_confirm_inventory_sale_transaction') || message.includes('Could not find the function')) {
        return NextResponse.json({ error: 'O fluxo está pronto no preview, mas a migration da venda pelo estoque ainda não foi aplicada no Supabase.' }, { status: 503 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, ...(data || {}) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível registrar a venda.' }, { status: 500 });
  }
}
