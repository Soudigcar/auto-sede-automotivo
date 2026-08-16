import { NextResponse } from 'next/server';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { aiPlatformModelRegistry } from '@/lib/server/ai-platform/models/registry';
import { readAutocarClaimTelemetry } from '@/lib/server/ai-platform/telemetry/autocarClaims';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const production = getAdminClient();
    const master = await requireMaster(request, production);
    if (!master) {
      return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    }

    const autocar = getAutocarDevClient();
    const [storesResult, agentsResult, telemetry] = await Promise.all([
      production
        .from('stores')
        .select('id,store_name,slug,status,portal_enabled,city,state')
        .order('store_name', { ascending: true }),
      autocar
        .from('ai_store_agents')
        .select('store_id,status,mode,master_enabled,master_autopilot_allowed,store_selected_mode,updated_at')
        .order('updated_at', { ascending: false }),
      readAutocarClaimTelemetry(autocar)
    ]);

    if (storesResult.error) throw storesResult.error;
    if (agentsResult.error) throw agentsResult.error;

    const agentMap = new Map((agentsResult.data || []).map((agent: any) => [agent.store_id, agent]));
    const stores = (storesResult.data || [])
      .filter((store: any) => !['deleted', 'excluido'].includes(String(store.status || '').toLowerCase()))
      .map((store: any) => ({
        id: store.id,
        store_name: store.store_name,
        slug: store.slug,
        city: store.city,
        state: store.state,
        agent: agentMap.get(store.id) || null,
        telemetry: telemetry.stores[store.id] || null
      }));

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      platform: {
        version: 'ai-control-plane-v1',
        environment: 'autocar-dev',
        execution_policy: 'read_only_master_snapshot',
        models: aiPlatformModelRegistry(),
        telemetry
      },
      summary: {
        stores: stores.length,
        enabled_agents: stores.filter((store: any) => store.agent?.master_enabled).length,
        autopilot_agents: stores.filter((store: any) => store.agent?.mode === 'autopilot').length,
        stores_with_telemetry: stores.filter((store: any) => store.telemetry?.claims > 0).length
      },
      stores
    });
  } catch (error: any) {
    console.error('Master AI Platform snapshot error:', error?.message || error);
    return NextResponse.json({ error: String(error?.message || 'Não foi possível carregar o AI Control Plane.') }, { status: 500 });
  }
}
