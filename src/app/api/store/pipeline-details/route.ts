import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';
import { asStorePortalRole, canAccessStoreLead } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

const allowedRoles = ['master', 'store', 'pre_sales', 'seller', 'prospector'];
const allowedStatuses = [
  'new_lead',
  'in_service',
  'scheduled',
  'appointment_cancelled',
  'no_show',
  'showed_up',
  'sale_confirmed',
  'lost'
];

function normalizePhone(value: unknown) {
  return cleanText(value, 40).replace(/[^\d+]/g, '');
}

function normalizeComparable(value: unknown) {
  return cleanText(value, 500).toLocaleLowerCase('pt-BR');
}

function canAccessLead(profile: any, lead: any) {
  const role = asStorePortalRole(profile?.role);
  return Boolean(role && canAccessStoreLead(profile, role, lead));
}

async function getContext(request: Request, slug: string) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);
  if (!token) return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;

  const profile = await getProfileFromToken(supabase, token);
  if (!profile || profile.status !== 'active' || !allowedRoles.includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para o pipeline.' }, { status: 403 }) } as const;
  }

  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id, store_name, slug, status, portal_enabled')
    .eq('slug', slug)
    .maybeSingle();

  if (storeError) throw storeError;
  if (!store || store.status !== 'active' || !store.portal_enabled) {
    return { error: NextResponse.json({ error: 'Loja não encontrada ou portal desativado.' }, { status: 404 }) } as const;
  }

  if (profile.role !== 'master' && profile.store_id !== store.id) {
    return { error: NextResponse.json({ error: 'Este usuário não pertence à loja informada.' }, { status: 403 }) } as const;
  }

  return { supabase, profile, store } as const;
}

async function loadLead(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('leads')
    .select('id, assigned_store_id, captured_by_user_id, pre_sales_user_id, seller_user_id, assigned_user_id, customer_name, customer_phone, interested_vehicle, interested_vehicle_id, interested_vehicle_price, origin, notes, status, scheduled_at, appointment_notes')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadStock(supabase: any, storeId: string) {
  const { data: links, error: linksError } = await supabase
    .from('store_vehicle_link_submissions')
    .select('imported_vehicle_id, status, metadata')
    .eq('store_id', storeId)
    .not('imported_vehicle_id', 'is', null);
  if (linksError) throw linksError;

  const vehicleIds = Array.from(new Set((links || [])
    .filter((link: any) => link?.metadata?.store_removed !== true)
    .map((link: any) => link.imported_vehicle_id)
    .filter(Boolean)));

  if (!vehicleIds.length) return [];

  const { data: vehicles, error: vehiclesError } = await supabase
    .from('site_vehicles')
    .select('id, brand, model, version, year, price, status, show_on_landing')
    .in('id', vehicleIds)
    .order('brand', { ascending: true })
    .order('model', { ascending: true });
  if (vehiclesError) throw vehiclesError;

  return (vehicles || []).filter((vehicle: any) => !['vendido', 'sold', 'inactive', 'inativo'].includes(String(vehicle.status || '').toLowerCase()));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 160);
    const leadId = cleanText(url.searchParams.get('lead_id'), 80);
    if (!slug) return NextResponse.json({ error: 'Informe a loja.' }, { status: 400 });

    const context = await getContext(request, slug);
    if ('error' in context) return context.error;

    const stock = await loadStock(context.supabase, context.store.id);
    let lead: any = null;
    let notes: any[] = [];

    if (leadId) {
      lead = await loadLead(context.supabase, leadId);
      if (!lead || !canAccessLead(context.profile, lead)) {
        return NextResponse.json({ error: 'Lead não encontrado na carteira deste usuário.' }, { status: 404 });
      }

      const { data, error } = await context.supabase
        .from('lead_notes')
        .select('id, note_type, content, author_name, created_at')
        .eq('lead_id', lead.id)
        .eq('store_id', context.store.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      notes = data || [];
    }

    return NextResponse.json({ store: context.store, stock, lead, notes });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar dados do pipeline.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const slug = cleanText(body.slug, 160);
    const leadId = cleanText(body.lead_id, 80);
    if (!slug || !leadId) return NextResponse.json({ error: 'Informe loja e lead.' }, { status: 400 });

    const context = await getContext(request, slug);
    if ('error' in context) return context.error;

    const lead = await loadLead(context.supabase, leadId);
    if (!lead || !canAccessLead(context.profile, lead)) {
      return NextResponse.json({ error: 'Lead não encontrado na carteira deste usuário.' }, { status: 404 });
    }

    const status = cleanText(body.status, 50);
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ error: 'Status do lead inválido.' }, { status: 400 });
    }

    let selectedVehicleId = cleanText(body.interested_vehicle_id, 80) || null;
    let selectedVehiclePrice: number | null = null;
    const typedVehicleLabel = cleanText(body.interested_vehicle, 300) || null;
    let selectedVehicleLabel = typedVehicleLabel;

    if (selectedVehicleId) {
      const { data: link } = await context.supabase
        .from('store_vehicle_link_submissions')
        .select('id, metadata')
        .eq('store_id', context.store.id)
        .eq('imported_vehicle_id', selectedVehicleId)
        .maybeSingle();

      if (!link || link?.metadata?.store_removed === true) {
        return NextResponse.json({ error: 'O veículo selecionado não pertence ao estoque desta loja.' }, { status: 400 });
      }

      const { data: vehicle, error: vehicleError } = await context.supabase
        .from('site_vehicles')
        .select('id, brand, model, version, year, price, status')
        .eq('id', selectedVehicleId)
        .maybeSingle();
      if (vehicleError) throw vehicleError;
      if (!vehicle) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });

      const canonicalLabel = [vehicle.brand, vehicle.model, vehicle.version, vehicle.year].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

      if (typedVehicleLabel && normalizeComparable(typedVehicleLabel) !== normalizeComparable(canonicalLabel)) {
        selectedVehicleId = null;
        selectedVehiclePrice = null;
        selectedVehicleLabel = typedVehicleLabel;
      } else {
        selectedVehiclePrice = vehicle.price === null ? null : Number(vehicle.price);
        selectedVehicleLabel = canonicalLabel;
      }
    }

    const scheduleDate = cleanText(body.schedule_date, 20);
    const scheduleTime = cleanText(body.schedule_time, 20);
    let scheduledAt: string | null = null;

    if (scheduleDate || scheduleTime || status === 'scheduled') {
      if (!scheduleDate || !scheduleTime) {
        return NextResponse.json({ error: 'Para agendar, informe data e hora.' }, { status: 400 });
      }
      const parsed = new Date(`${scheduleDate}T${scheduleTime}:00-03:00`);
      if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: 'Data ou hora inválida.' }, { status: 400 });
      if (parsed.getTime() < Date.now()) return NextResponse.json({ error: 'Não é permitido agendar em horário passado.' }, { status: 400 });
      scheduledAt = parsed.toISOString();
    }

    const notesText = cleanText(body.notes, 5000) || null;
    const appointmentNotes = cleanText(body.appointment_notes, 5000) || null;
    const newObservation = cleanText(body.new_observation, 5000);

    const updatePayload = {
      customer_name: cleanText(body.customer_name, 180) || 'Cliente sem nome',
      customer_phone: normalizePhone(body.customer_phone) || null,
      interested_vehicle: selectedVehicleLabel,
      interested_vehicle_id: selectedVehicleId,
      interested_vehicle_price: selectedVehiclePrice,
      origin: cleanText(body.origin, 180) || lead.origin || 'Manual',
      notes: notesText,
      status,
      scheduled_at: scheduledAt,
      appointment_notes: appointmentNotes,
      updated_at: new Date().toISOString()
    };

    const { data: updated, error: updateError } = await context.supabase
      .from('leads')
      .update(updatePayload)
      .eq('id', lead.id)
      .eq('assigned_store_id', context.store.id)
      .select('*')
      .single();
    if (updateError) throw updateError;

    const authorName = context.profile.full_name || context.profile.email || 'Usuário da loja';
    const entries: any[] = [];

    if (notesText && notesText !== (lead.notes || null)) {
      entries.push({ lead_id: lead.id, store_id: context.store.id, author_user_id: context.profile.id, author_name: authorName, note_type: 'general', content: notesText });
    }
    if (appointmentNotes && appointmentNotes !== (lead.appointment_notes || null)) {
      entries.push({ lead_id: lead.id, store_id: context.store.id, author_user_id: context.profile.id, author_name: authorName, note_type: 'appointment', content: appointmentNotes });
    }
    if (newObservation) {
      entries.push({ lead_id: lead.id, store_id: context.store.id, author_user_id: context.profile.id, author_name: authorName, note_type: 'service', content: newObservation });
    }

    if (entries.length) {
      const { error: notesError } = await context.supabase.from('lead_notes').insert(entries);
      if (notesError) throw notesError;
    }

    const { data: history, error: historyError } = await context.supabase
      .from('lead_notes')
      .select('id, note_type, content, author_name, created_at')
      .eq('lead_id', lead.id)
      .eq('store_id', context.store.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (historyError) throw historyError;

    return NextResponse.json({ success: true, lead: updated, notes: history || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar informações do lead.' }, { status: 500 });
  }
}
