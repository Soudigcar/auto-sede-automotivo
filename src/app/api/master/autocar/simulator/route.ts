import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { simulateAutocarMode } from '@/lib/server/autocar/modeSimulator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function masterContext(request: Request) {
  const production = getAdminClient();
  const master = await requireMaster(request, production);
  if (!master) return null;
  return { production, master };
}

export async function GET(request: Request) {
  try {
    const context = await masterContext(request);
    if (!context) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const { data: stores, error } = await context.production
      .from('stores')
      .select('id,store_name,slug,status,portal_enabled,city,state')
      .order('store_name', { ascending: true });
    if (error) throw error;

    return NextResponse.json({
      success: true,
      stores: (stores || []).filter((store: any) => !['deleted', 'excluido'].includes(String(store.status || '').toLowerCase()))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o simulador AUTOCAR.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await masterContext(request);
    if (!context) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const storeId = cleanText(body?.store_id, 100);
    const customerInput = cleanText(body?.customer_input, 5000);
    const mode = body?.mode === 'autopilot' ? 'autopilot' : 'copilot';
    if (!storeId || !customerInput) return NextResponse.json({ error: 'Loja e pergunta do cliente são obrigatórias.' }, { status: 400 });

    const { data: store, error } = await context.production
      .from('stores')
      .select('id,store_name,slug,status')
      .eq('id', storeId)
      .maybeSingle();
    if (error) throw error;
    if (!store) return NextResponse.json({ error: 'Loja não encontrada no CRM.' }, { status: 404 });

    const result = await simulateAutocarMode({
      storeId: store.id,
      customerInput,
      mode,
      actorProfileId: context.master.id
    });

    return NextResponse.json({ success: true, store, ...result });
  } catch (error: any) {
    console.error('Master AUTOCAR simulator error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Não foi possível simular a AUTOCAR.' }, { status: 500 });
  }
}
