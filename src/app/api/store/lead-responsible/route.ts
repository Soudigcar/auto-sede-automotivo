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

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function publicResponsible(user: any) {
  if (!user) {
    return {
      full_name: '',
      role: null,
      unavailable: true
    };
  }

  return {
    full_name: cleanText(user.full_name) || 'Colaborador sem nome',
    role: cleanText(user.role, 40) || null
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const singleLeadId = cleanText(url.searchParams.get('lead_id'), 80);
    const batchLeadIds = cleanText(url.searchParams.get('lead_ids'), 8000)
      .split(',')
      .map((value) => cleanText(value, 80));
    const requestedLeadIds = unique([singleLeadId, ...batchLeadIds]).slice(0, 100);

    if (!slug || !requestedLeadIds.length) {
      return noStoreJson({ error: 'Informe a loja e ao menos um lead.' }, 400);
    }

    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    const { data: leads, error: leadsError } = await context.supabase
      .from('leads')
      .select('id, assigned_store_id, assigned_user_id')
      .in('id', requestedLeadIds)
      .eq('assigned_store_id', context.store.id);

    if (leadsError) return noStoreJson({ error: leadsError.message }, 400);

    const accessibleLeads = (leads || []).filter((lead: any) =>
      canAccessStoreLead(context.profile, context.role, lead)
    );

    if (singleLeadId && requestedLeadIds.length === 1 && !accessibleLeads.length) {
      return noStoreJson({ error: 'Lead não encontrado na carteira deste usuário.' }, 404);
    }

    const responsibleUserIds = unique(
      accessibleLeads.map((lead: any) => cleanText(lead.assigned_user_id, 80))
    );

    const { data: responsibleUsers, error: responsibleUsersError } = responsibleUserIds.length
      ? await context.supabase
          .from('users')
          .select('id, full_name, role')
          .in('id', responsibleUserIds)
          .eq('store_id', context.store.id)
      : { data: [], error: null };

    if (responsibleUsersError) {
      return noStoreJson({ error: responsibleUsersError.message }, 400);
    }

    const usersById = Object.fromEntries(
      (responsibleUsers || []).map((user: any) => [user.id, user])
    );
    const responsibles = Object.fromEntries(
      accessibleLeads.map((lead: any) => [
        lead.id,
        lead.assigned_user_id ? publicResponsible(usersById[lead.assigned_user_id]) : null
      ])
    );

    if (singleLeadId && requestedLeadIds.length === 1) {
      return noStoreJson({
        success: true,
        responsible: responsibles[singleLeadId] ?? null
      });
    }

    return noStoreJson({ success: true, responsibles });
  } catch (error: any) {
    return noStoreJson({ error: error?.message || 'Erro ao carregar os responsáveis pelos leads.' }, 500);
  }
}
