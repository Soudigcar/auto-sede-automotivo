import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao usuário master.' }, { status: 403 });

    const eventId = cleanText(new URL(request.url).searchParams.get('event_id'), 80);
    if (!eventId) return NextResponse.json({ error: 'Evento obrigatório.' }, { status: 400 });

    const { data: assignmentRows, error } = await supabase
      .from('event_vehicle_assignments')
      .select('*')
      .eq('event_id', eventId)
      .order('is_featured', { ascending: false })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const vehicleIds = Array.from(new Set((assignmentRows || []).map((item) => item.vehicle_id)));
    const storeIds = Array.from(new Set((assignmentRows || []).map((item) => item.store_id)));

    const [vehicleResult, storeResult] = await Promise.all([
      vehicleIds.length
        ? supabase.from('site_vehicles').select('*').in('id', vehicleIds)
        : Promise.resolve({ data: [], error: null } as any),
      storeIds.length
        ? supabase.from('stores').select('id,store_name,slug,status,portal_enabled').in('id', storeIds)
        : Promise.resolve({ data: [], error: null } as any)
    ]);

    const secondaryError = vehicleResult.error || storeResult.error;
    if (secondaryError) return NextResponse.json({ error: secondaryError.message }, { status: 500 });

    const vehicleMap = Object.fromEntries((vehicleResult.data || []).map((item: any) => [item.id, item]));
    const storeMap = Object.fromEntries((storeResult.data || []).map((item: any) => [item.id, item]));

    const assignments = (assignmentRows || []).map((item) => ({
      ...item,
      vehicle: vehicleMap[item.vehicle_id] || null,
      store: storeMap[item.store_id] || null
    }));

    return NextResponse.json({ assignments });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar veículos do evento.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao usuário master.' }, { status: 403 });

    const body = await request.json();
    const assignmentId = cleanText(body.assignment_id, 80);
    if (!assignmentId) return NextResponse.json({ error: 'Vínculo obrigatório.' }, { status: 400 });

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString(), source: 'manual' };
    if (typeof body.show_on_landing === 'boolean') payload.show_on_landing = body.show_on_landing;
    if (typeof body.is_featured === 'boolean') payload.is_featured = body.is_featured;
    if (body.status === 'active' || body.status === 'inactive') payload.status = body.status;
    if (body.display_order !== undefined) payload.display_order = Math.max(Number(body.display_order || 0), 0);
    if (body.promotional_price !== undefined) {
      const price = body.promotional_price === '' || body.promotional_price === null ? null : Number(body.promotional_price);
      if (price !== null && (!Number.isFinite(price) || price < 0)) {
        return NextResponse.json({ error: 'Preço promocional inválido.' }, { status: 400 });
      }
      payload.promotional_price = price;
    }

    const { data, error } = await supabase
      .from('event_vehicle_assignments')
      .update(payload)
      .eq('id', assignmentId)
      .select('*')
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message || 'Vínculo não encontrado.' }, { status: 400 });
    return NextResponse.json({ success: true, assignment: data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao atualizar veículo do evento.' }, { status: 500 });
  }
}
