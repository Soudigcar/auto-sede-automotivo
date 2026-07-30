import { NextResponse } from 'next/server';
import { cleanText } from '@/lib/server/storeTeam';
import { authorizeStorePortal, canAccessStoreLead } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const leadId = cleanText(url.searchParams.get('lead_id'), 80);
    if (!slug || !leadId) return NextResponse.json({ error: 'Informe a loja e o lead.' }, { status: 400 });

    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    const { data: lead, error } = await context.supabase
      .from('leads')
      .select([
        'id', 'event_id', 'assigned_store_id', 'assigned_user_id', 'assigned_user_role',
        'pre_sales_user_id', 'seller_user_id', 'captured_by_user_id', 'prospector_id',
        'customer_name', 'customer_bank', 'interested_vehicle', 'interested_vehicle_id',
        'interested_vehicle_price', 'vehicle_category_interest', 'origin', 'status', 'notes',
        'scheduled_at', 'appointment_notes', 'appointment_cancelled_at',
        'appointment_cancelled_reason', 'lost_reason', 'created_at', 'updated_at'
      ].join(','))
      .eq('id', leadId)
      .maybeSingle();
    if (error) throw error;
    if (!lead || lead.assigned_store_id !== context.store.id || !canAccessStoreLead(context.profile, context.role, lead)) {
      return NextResponse.json({ error: 'Lead não encontrado na carteira deste usuário.' }, { status: 404 });
    }

    const { data: notes, error: notesError } = await context.supabase
      .from('lead_notes')
      .select('id, note_type, content, author_name, created_at')
      .eq('lead_id', lead.id)
      .eq('store_id', context.store.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (notesError) throw notesError;

    return NextResponse.json({ lead, notes: notes || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar os detalhes do lead.' }, { status: 500 });
  }
}
