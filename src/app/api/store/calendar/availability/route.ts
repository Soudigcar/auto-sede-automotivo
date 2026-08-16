import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import { checkStoreAvailability } from '@/lib/server/storeAvailability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const startsAtText = cleanText(url.searchParams.get('starts_at'), 80);
    const durationMinutes = Number(url.searchParams.get('duration_minutes') || 60);
    const excludeLeadId = cleanText(url.searchParams.get('exclude_lead_id'), 100) || null;
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('view_calendar')) {
      return NextResponse.json({ error: 'Usuário sem permissão para consultar o calendário.' }, { status: 403 });
    }

    const startsAt = new Date(startsAtText);
    if (!startsAtText || Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ error: 'Informe data e horário válidos.' }, { status: 400 });
    }

    const result = await checkStoreAvailability({
      supabase: context.supabase,
      storeId: context.store.id,
      startsAt,
      durationMinutes,
      excludeLeadId
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível consultar disponibilidade.' }, { status: 500 });
  }
}
