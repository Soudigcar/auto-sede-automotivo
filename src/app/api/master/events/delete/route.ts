import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const { eventId, confirmation } = await request.json();

  if (!eventId || confirmation !== 'EXCLUIR') {
    return NextResponse.json({ error: 'Confirmação inválida.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Service role do Supabase não configurada.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const deleteSteps = [
    ['lead_activities', 'event_id'],
    ['appointments', 'event_id'],
    ['losses', 'event_id'],
    ['sales', 'event_id'],
    ['street_surveys', 'event_id'],
    ['inventory', 'event_id'],
    ['leads', 'event_id'],
    ['prospectors', 'event_id'],
    ['stores', 'event_id'],
    ['financial_entries', 'event_id'],
    ['audit_logs', 'event_id']
  ] as const;

  for (const [table, column] of deleteSteps) {
    const { error } = await supabase.from(table).delete().eq(column, eventId);
    if (error) {
      return NextResponse.json({ error: `Erro ao excluir ${table}: ${error.message}` }, { status: 500 });
    }
  }

  const { error: eventError } = await supabase.from('events').delete().eq('id', eventId);
  if (eventError) {
    return NextResponse.json({ error: `Erro ao excluir evento: ${eventError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
