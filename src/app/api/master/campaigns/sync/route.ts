import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao usuário master.' }, { status: 403 });

    const body = await request.json();
    const eventId = cleanText(body.event_id, 80);
    if (!eventId) return NextResponse.json({ error: 'Evento obrigatório.' }, { status: 400 });

    const { data: event } = await supabase.from('events').select('id,event_name,status').eq('id', eventId).maybeSingle();
    if (!event || event.status === 'deleted') return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });

    const { data, error } = await supabase.rpc('sync_event_inventory', { p_event_id: eventId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { count } = await supabase
      .from('event_vehicle_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'active');

    return NextResponse.json({ success: true, inserted: Number(data || 0), total: Number(count || 0) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao sincronizar estoque.' }, { status: 500 });
  }
}
