import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { autocarModelName, autocarOpenAiConfigured } from '@/lib/server/autocar/client';
import { evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';
import { autocarReadTools } from '@/lib/server/autocar/tools';
import { cleanText } from '@/lib/server/storeTeam';
import {
  ensureAutocarDevStore,
  getAutocarDevClient,
  setAutocarStoreSelectedMode,
  type AutocarStoreMode
} from '@/lib/server/autocar/devAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validMode(value: unknown): value is AutocarStoreMode {
  return value === 'off' || value === 'copilot' || value === 'autopilot';
}

async function agentForStore(context: any) {
  const autocar = getAutocarDevClient();
  await ensureAutocarDevStore(autocar, context.store);
  const { data, error } = await autocar.from('ai_store_agents')
    .select('id,store_id,status,mode,master_enabled,master_autopilot_allowed,store_selected_mode,updated_at')
    .eq('store_id', context.store.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function payload(context: any, agent: any) {
  return {
    success: true,
    phase: 'foundation_v1',
    execution_mode: agent?.mode || 'off',
    store_selected_mode: agent?.store_selected_mode || 'off',
    master_enabled: Boolean(agent?.master_enabled),
    master_autopilot_allowed: Boolean(agent?.master_autopilot_allowed),
    autopilot_preview_only: true,
    database_state: 'autocar-dev-isolated',
    automatic_replies_enabled: false,
    webhook_hooked: false,
    openai: {
      configured: autocarOpenAiConfigured(),
      model_route: autocarModelName()
    },
    permissions: {
      view: context.permissions.includes('view_autocar'),
      manage: context.permissions.includes('manage_autocar'),
      approve: context.permissions.includes('approve_autocar_actions')
    },
    store_scope: {
      store_id: context.store.id,
      store_name: context.store.store_name,
      slug: context.store.slug
    },
    read_tools: autocarReadTools.map((tool) => ({
      name: tool.name,
      capability: tool.capability,
      accepts_store_id: Object.prototype.hasOwnProperty.call(tool.parameters.properties, 'store_id')
    })),
    hard_policy_examples: {
      alter_stock_price: evaluateAutocarPolicy({ mode: 'autopilot', capability: 'alter_stock_price' }),
      confirm_sale: evaluateAutocarPolicy({ mode: 'autopilot', capability: 'confirm_sale' }),
      promise_credit_approval: evaluateAutocarPolicy({ mode: 'autopilot', capability: 'promise_credit_approval' }),
      final_trade_appraisal: evaluateAutocarPolicy({ mode: 'autopilot', capability: 'final_trade_appraisal' }),
      grant_discount: evaluateAutocarPolicy({ mode: 'autopilot', capability: 'grant_discount' })
    }
  };
}

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('view_autocar')) {
      return NextResponse.json({ error: 'Usuário sem permissão para visualizar a I.A AUTOCAR.' }, { status: 403 });
    }
    const agent = await agentForStore(context);
    return NextResponse.json(payload(context, agent));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível validar a fundação da I.A AUTOCAR.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = cleanText(body?.slug, 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('manage_autocar')) {
      return NextResponse.json({ error: 'Somente o gestor da loja pode alterar o modo da AUTOCAR.' }, { status: 403 });
    }

    const mode = body?.mode;
    if (!validMode(mode)) return NextResponse.json({ error: 'Modo AUTOCAR inválido.' }, { status: 400 });

    const autocar = getAutocarDevClient();
    const agent = await setAutocarStoreSelectedMode(autocar, context.store, mode);
    return NextResponse.json({ ...payload(context, agent), message: `Modo ${String(agent.mode || 'off').toUpperCase()} salvo no Preview.` });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível alterar o modo da AUTOCAR.' }, { status: 500 });
  }
}
