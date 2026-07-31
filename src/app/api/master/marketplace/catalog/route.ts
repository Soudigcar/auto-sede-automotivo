import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const editableStatuses = new Set(['disponivel', 'oculto']);

function cleanUrl(value: unknown) {
  const candidate = cleanText(value, 1200);
  if (!candidate) return '';

  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
      ? parsed.toString()
      : '';
  } catch {
    return '';
  }
}

function cleanUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanUrl).filter(Boolean))).slice(0, 30);
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const [vehicleResult, storeResult, submissionResult, importResult] = await Promise.all([
      supabase
        .from('site_vehicles')
        .select('*')
        .neq('status', 'excluido')
        .order('created_at', { ascending: false }),
      supabase
        .from('stores')
        .select('id,store_name,slug,status,portal_enabled')
        .neq('status', 'deleted')
        .order('store_name', { ascending: true }),
      supabase
        .from('store_vehicle_link_submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('store_stock_imports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
    ]);

    const error = vehicleResult.error || storeResult.error || submissionResult.error || importResult.error;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const stores = storeResult.data || [];
    const storeMap = new Map(stores.map((store: any) => [store.id, store]));

    return NextResponse.json(
      {
        vehicles: (vehicleResult.data || []).map((vehicle: any) => ({
          ...vehicle,
          owner_store: vehicle.store_id ? storeMap.get(vehicle.store_id) || null : null
        })),
        stores,
        submissions: (submissionResult.data || []).map((item: any) => ({
          ...item,
          store: item.store_id ? storeMap.get(item.store_id) || null : null
        })),
        stock_imports: (importResult.data || []).map((item: any) => ({
          ...item,
          store: item.store_id ? storeMap.get(item.store_id) || null : null
        }))
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar o catálogo.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const body = await request.json();
    const action = cleanText(body.action, 50);

    if (action === 'delete_vehicle') {
      const vehicleId = cleanText(body.vehicle_id, 80);
      const { data: vehicle } = await supabase
        .from('site_vehicles')
        .select('id,status')
        .eq('id', vehicleId)
        .maybeSingle();

      if (!vehicle) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
      if (vehicle.status === 'vendido') {
        return NextResponse.json({ error: 'Veículo vendido não pode ser excluído pelo catálogo.' }, { status: 409 });
      }

      const { error } = await supabase
        .from('site_vehicles')
        .update({
          status: 'excluido',
          show_on_landing: false,
          is_featured: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', vehicle.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, message: 'Veículo removido do catálogo.' });
    }

    if (action !== 'save_vehicle') {
      return NextResponse.json({ error: 'Ação de catálogo inválida.' }, { status: 400 });
    }

    const vehicleId = cleanText(body.id, 80);
    const storeId = cleanText(body.store_id, 80);
    const brand = cleanText(body.brand, 100);
    const model = cleanText(body.model, 120);

    if (!storeId || !brand || !model) {
      return NextResponse.json({ error: 'Loja proprietária, marca e modelo são obrigatórios.' }, { status: 400 });
    }

    const { data: store } = await supabase
      .from('stores')
      .select('id,store_name,status,portal_enabled')
      .eq('id', storeId)
      .neq('status', 'deleted')
      .maybeSingle();

    if (!store || store.status !== 'active') {
      return NextResponse.json({ error: 'Selecione uma loja proprietária ativa.' }, { status: 409 });
    }

    let existing: any = null;
    if (vehicleId) {
      const result = await supabase
        .from('site_vehicles')
        .select('id,status,campaign_id')
        .eq('id', vehicleId)
        .neq('status', 'excluido')
        .maybeSingle();
      existing = result.data;
      if (!existing) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
      if (existing.status === 'vendido') {
        return NextResponse.json({ error: 'Veículo vendido está bloqueado. Use o fluxo comercial da venda.' }, { status: 409 });
      }
    }

    const requestedStatus = cleanText(body.status, 30);
    const status = existing?.status === 'vendido'
      ? 'vendido'
      : editableStatuses.has(requestedStatus)
        ? requestedStatus
        : 'disponivel';

    const imageUrls = cleanUrls(body.image_urls);
    const coverUrl = cleanUrl(body.image_url) || imageUrls[0] || '';
    const normalizedImages = Array.from(new Set([coverUrl, ...imageUrls].filter(Boolean)));
    const canPublish = status === 'disponivel' && store.portal_enabled === true;

    const payload = {
      store_id: store.id,
      store_name: store.store_name,
      brand,
      model,
      version: cleanText(body.version, 180) || null,
      year: cleanText(body.year, 30) || null,
      mileage: cleanText(body.mileage, 60) || null,
      color: cleanText(body.color, 80) || null,
      transmission: cleanText(body.transmission, 80) || null,
      fuel: cleanText(body.fuel, 80) || null,
      price: numberValue(body.price),
      image_url: coverUrl || null,
      image_urls: normalizedImages,
      source_url: cleanUrl(body.source_url) || null,
      status,
      show_on_landing: canPublish && body.show_on_landing === true,
      is_featured: canPublish && body.is_featured === true,
      updated_at: new Date().toISOString()
    };

    const result = existing
      ? await supabase.from('site_vehicles').update(payload).eq('id', existing.id).select('*').single()
      : await supabase.from('site_vehicles').insert({ ...payload, campaign_id: null }).select('*').single();

    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error?.message || 'Não foi possível salvar o veículo.' }, { status: 400 });
    }

    const submissionId = cleanText(body.submission_id, 80);
    if (submissionId) {
      await supabase
        .from('store_vehicle_link_submissions')
        .update({
          status: 'published',
          imported_vehicle_id: result.data.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', submissionId);
    }

    return NextResponse.json({
      success: true,
      vehicle: result.data,
      message: existing ? 'Veículo atualizado no catálogo permanente.' : 'Veículo cadastrado no catálogo permanente.'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar o catálogo.' }, { status: 500 });
  }
}
