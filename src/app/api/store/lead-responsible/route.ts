import { NextResponse } from 'next/server';
import { authorizeStorePortal, canAccessStoreLead } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

function cleanText(value: unknown, maxLength = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function noStoreJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const leadId = cleanText(url.searchParams.get('lead_id'), 80);
    if (!slug || !leadId) return noStoreJson({ error: 'Informe a loja e o lead.' }, 400);

    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    const { data: lead, error: leadError } = await context.supabase
      .from('leads')
      .select('id, assigned_store_id, assigned_user_id')
      .eq('id', leadId)
      .eq('assigned_store_id', context.store.id)
      .maybeSingle();

    if (leadError) return noStoreJson({ error: leadError.message }, 400);
    if (!lead || !canAccessStoreLead(context.profile, context.role, lead)) {
      return noStoreJson({ error: 'Lead não encontrado na carteira deste usuário.' }, 404);
    }
    if (!lead.assigned_user_id) return noStoreJson({ success: true, responsible: null });

    const { data: responsible, error: responsibleError } = await context.supabase
      .from('users')
      .select('full_name, role')
      .eq('id', lead.assigned_user_id)
      .eq('store_id', context.store.id)
      .maybeSingle();

    if (responsibleError) return noStoreJson({ error: responsibleError.message }, 400);
    if (!responsible) return noStoreJson({ error: 'Responsável atribuído não encontrado nesta loja.' }, 409);

    return noStoreJson({
      success: true,
      responsible: {
        full_name: cleanText(responsible.full_name) || 'Colaborador sem nome',
        role: cleanText(responsible.role, 40) || null
      }
    });
  } catch (error: any) {
    return noStoreJson({ error: error?.message || 'Erro ao carregar o responsável pelo lead.' }, 500);
  }
}
