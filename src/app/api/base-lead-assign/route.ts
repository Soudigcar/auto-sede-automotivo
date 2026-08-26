import { NextResponse } from 'next/server';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';

/**
 * Legacy endpoint kept only as a fail-closed compatibility boundary.
 *
 * The old implementation reassigned public.leads.assigned_store_id and replaced
 * leads_base.routed_lead_id. That violates the multistore invariant where one
 * canonical Master lead may have independent operational rows in many stores.
 *
 * All new Master distribution must go through /api/master/base-lead-multistore.
 */
export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) {
      return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });
    }

    return NextResponse.json({
      error: 'Redirecionamento legado desativado. Use a Distribuição Multiloja para criar uma instância independente na loja de destino.',
      code: 'LEGACY_STORE_REASSIGN_DISABLED',
      multistore_endpoint: '/api/master/base-lead-multistore',
      multistore_page: '/master/transferencia-leads'
    }, { status: 409 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Não foi possível validar o fluxo de distribuição.' },
      { status: 500 }
    );
  }
}
