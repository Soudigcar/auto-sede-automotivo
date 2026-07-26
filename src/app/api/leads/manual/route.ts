import { NextResponse } from 'next/server';
import {
  cleanText,
  createAdminClient,
  getProfileFromToken,
  readBearerToken
} from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

const allowedRoles = ['master', 'store', 'pre_sales', 'seller', 'prospector'] as const;
const unavailableVehicleStatuses = ['vendido', 'sold', 'inactive', 'inativo', 'deleted', 'excluido', 'rejected', 'duplicate'];
const canonicalOrigins = new Set([
  'street_survey',
  'quick_registration',
  'manual',
  'Facebook Lead Ads',
  'facebook_lead_ads',
  'WhatsApp Oficial',
  'whatsapp_official',
  'WATI / Click-to-WhatsApp',
  'wati_leads',
  'WATI'
]);

function cleanPhone(value: unknown) {
  return cleanText(value, 40);
}

function vehicleLabel(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.year]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVehicleAvailable(vehicle: any) {
  return !unavailableVehicleStatuses.includes(String(vehicle?.status || '').toLowerCase());
}

function normalizeOrigin(value: unknown) {
  const requested = cleanText(value, 160) || 'manual_pipeline';
  if (canonicalOrigins.has(requested)) return { requested, stored: requested };

  const mapped: Record<string, string> = {
    manual_pipeline: 'manual',
    walk_in: 'manual',
    event: 'street_survey',
    whatsapp: 'WhatsApp Oficial',
    instagram: 'manual',
    facebook: 'Facebook Lead Ads',
    indication: 'manual',
    phone: 'manual',
    other: 'manual'
  };

  return { requested, stored: mapped[requested] || 'manual' };
}

async function getContext(request: Request) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;
  }

  const profile = await getProfileFromToken(supabase, token);

  if (!profile || profile.status !== 'active' || !allowedRoles.includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para adicionar leads.' }, { status: 403 }) } as const;
  }

  return { supabase, profile } as const;
}

async function loadStore(supabase: any, profile: any, requestedStoreId?: string) {
  const storeId = profile.role === 'master' ? cleanText(requestedStoreId, 80) : cleanText(profile.store_id, 80);

  if (!storeId) return null;

  const { data: store, error } = await supabase
    .from('stores')
    .select('id, store_name, slug, event_id, status, portal_enabled')
    .eq('id', storeId)
    .maybeSingle();

  if (error) throw error;
  if (!store || store.status !== 'active' || !store.portal_enabled) return null;
  if (profile.role !== 'master' && profile.store_id !== store.id) return null;

  return store;
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
    .filter((link: any) => !['rejected', 'duplicate', 'deleted', 'excluido'].includes(String(link?.status || '').toLowerCase()))
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

  return (vehicles || [])
    .filter(isVehicleAvailable)
    .map((vehicle: any) => ({
      ...vehicle,
      label: vehicleLabel(vehicle),
      price: vehicle.price === null || vehicle.price === undefined ? null : Number(vehicle.price)
    }));
}

async function validateSelectedVehicle(supabase: any, storeId: string, selectedVehicleId: string) {
  const { data: link, error: linkError } = await supabase
    .from('store_vehicle_link_submissions')
    .select('id, status, metadata')
    .eq('store_id', storeId)
    .eq('imported_vehicle_id', selectedVehicleId)
    .maybeSingle();

  if (linkError) throw linkError;

  if (
    !link ||
    link?.metadata?.store_removed === true ||
    ['rejected', 'duplicate', 'deleted', 'excluido'].includes(String(link?.status || '').toLowerCase())
  ) {
    return null;
  }

  const { data: vehicle, error: vehicleError } = await supabase
    .from('site_vehicles')
    .select('id, brand, model, version, year, price, status')
    .eq('id', selectedVehicleId)
    .maybeSingle();

  if (vehicleError) throw vehicleError;
  if (!vehicle || !isVehicleAvailable(vehicle)) return null;

  return {
    id: vehicle.id,
    label: vehicleLabel(vehicle),
    price: vehicle.price === null || vehicle.price === undefined ? null : Number(vehicle.price)
  };
}

export async function GET(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;

    const { supabase, profile } = context;
    const requestedStoreId = cleanText(new URL(request.url).searchParams.get('store_id'), 80);

    if (profile.role === 'master') {
      const { data: stores, error } = await supabase
        .from('stores')
        .select('id, store_name, slug, event_id, status, portal_enabled')
        .eq('status', 'active')
        .eq('portal_enabled', true)
        .order('store_name', { ascending: true });

      if (error) throw error;

      let selectedStore: any = null;
      let stock: any[] = [];

      if (requestedStoreId) {
        selectedStore = await loadStore(supabase, profile, requestedStoreId);
        if (!selectedStore) {
          return NextResponse.json({ error: 'Loja selecionada não encontrada ou indisponível.' }, { status: 404 });
        }
        stock = await loadStock(supabase, selectedStore.id);
      }

      return NextResponse.json({
        role: profile.role,
        profile_name: profile.full_name || profile.email || 'Master',
        store: selectedStore,
        stores: stores || [],
        stock
      });
    }

    const store = await loadStore(supabase, profile);

    if (!store) {
      return NextResponse.json({ error: 'Loja vinculada não encontrada ou indisponível.' }, { status: 403 });
    }

    const stock = await loadStock(supabase, store.id);

    return NextResponse.json({
      role: profile.role,
      profile_name: profile.full_name || profile.email || 'Usuário',
      store,
      stores: [store],
      stock
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao preparar cadastro de lead.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;

    const { supabase, profile } = context;
    const body = await request.json();

    const customerName = cleanText(body.customer_name, 180);
    const customerPhone = cleanPhone(body.customer_phone);
    const typedInterestedVehicle = cleanText(body.interested_vehicle, 300);
    const selectedVehicleId = cleanText(body.interested_vehicle_id, 80) || null;
    const customerBank = cleanText(body.customer_bank, 120);
    const vehicleCategory = cleanText(body.vehicle_category_interest, 100);
    const originInfo = normalizeOrigin(body.origin);
    const notes = cleanText(body.notes, 1800);

    if (customerName.length < 3) {
      return NextResponse.json({ error: 'Informe o nome do cliente com pelo menos 3 caracteres.' }, { status: 400 });
    }

    if (customerPhone.replace(/\D/g, '').length < 10) {
      return NextResponse.json({ error: 'Informe um telefone válido com DDD.' }, { status: 400 });
    }

    const store = await loadStore(supabase, profile, body.store_id);

    if (!store) {
      return NextResponse.json({ error: 'Selecione uma loja ativa e autorizada.' }, { status: 403 });
    }

    let interestedVehicle = typedInterestedVehicle || null;
    let interestedVehiclePrice: number | null = null;

    if (selectedVehicleId) {
      const selectedVehicle = await validateSelectedVehicle(supabase, store.id, selectedVehicleId);
      if (!selectedVehicle) {
        return NextResponse.json({ error: 'O veículo selecionado não está disponível no estoque desta loja.' }, { status: 400 });
      }
      interestedVehicle = selectedVehicle.label;
      interestedVehiclePrice = selectedVehicle.price;
    }

    const insertPayload: Record<string, any> = {
      event_id: store.event_id || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_bank: customerBank || null,
      interested_vehicle: interestedVehicle,
      interested_vehicle_id: selectedVehicleId,
      interested_vehicle_price: interestedVehiclePrice,
      vehicle_category_interest: vehicleCategory || null,
      origin: originInfo.stored,
      assigned_store_id: store.id,
      status: 'new_lead',
      notes: notes || null
    };

    if (profile.role === 'pre_sales') {
      insertPayload.pre_sales_user_id = profile.id;
      insertPayload.assigned_user_id = profile.id;
      insertPayload.assigned_user_role = 'pre_sales';
    }

    if (profile.role === 'seller') {
      insertPayload.seller_user_id = profile.id;
      insertPayload.assigned_user_id = profile.id;
      insertPayload.assigned_user_role = 'seller';
    }

    if (profile.role === 'prospector') {
      insertPayload.captured_by_user_id = profile.id;
      insertPayload.assigned_user_id = profile.id;
      insertPayload.assigned_user_role = 'prospector';

      const { data: prospector } = await supabase
        .from('prospectors')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (prospector?.id) insertPayload.prospector_id = prospector.id;
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert(insertPayload)
      .select('id, event_id, assigned_store_id, assigned_user_id, assigned_user_role, customer_name, customer_phone, interested_vehicle, interested_vehicle_id, interested_vehicle_price, status, created_at')
      .single();

    if (leadError) throw leadError;

    const actorName = profile.full_name || profile.email || 'Usuário';
    const activityMetadata = {
      actor_role: profile.role,
      assigned_user_role: insertPayload.assigned_user_role || null,
      registered_from: 'manual_pipeline',
      requested_origin: originInfo.requested,
      stored_origin: originInfo.stored,
      store_slug: store.slug,
      interested_vehicle_id: selectedVehicleId
    };

    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({
        lead_id: lead.id,
        store_id: store.id,
        store_name: store.store_name,
        user_id: profile.id,
        user_name: actorName,
        activity_type: 'lead_created',
        activity_label: 'Usuário adicionou um lead',
        from_status: null,
        to_status: 'new_lead',
        customer_name: customerName,
        customer_phone: customerPhone,
        vehicle_name: interestedVehicle,
        notes: notes || null,
        metadata: activityMetadata
      }),
      supabase.from('lead_activities').insert({
        event_id: store.event_id || null,
        lead_id: lead.id,
        activity_type: 'lead_created',
        description: `Lead adicionado manualmente por ${actorName}`
      }),
      supabase.from('audit_logs').insert({
        event_id: store.event_id || null,
        action_type: 'lead_created',
        entity_type: 'leads',
        entity_id: lead.id,
        new_value: {
          origin: originInfo.stored,
          requested_origin: originInfo.requested,
          assigned_store_id: store.id,
          assigned_user_id: insertPayload.assigned_user_id || null,
          assigned_user_role: insertPayload.assigned_user_role || null,
          interested_vehicle_id: selectedVehicleId,
          created_by_user_id: profile.id,
          created_by_role: profile.role,
          source: 'manual_pipeline'
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: `Lead adicionado à pipeline da ${store.store_name}.`,
      lead,
      store: { id: store.id, store_name: store.store_name, slug: store.slug },
      assignment: profile.role === 'store' || profile.role === 'master' ? 'store' : profile.role
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao adicionar lead.' }, { status: 500 });
  }
}
