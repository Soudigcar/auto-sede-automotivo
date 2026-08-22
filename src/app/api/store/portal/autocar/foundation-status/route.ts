import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { autocarModelName, autocarOpenAiConfigured } from '@/lib/server/autocar/client';
import { evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';
import {
  getAutocarRuntimePublicStatus,
  type AutocarRuntimePublicStatus
} from '@/lib/server/autocar/runtimeEnvironment';
import { evaluateStoreAutocarModeMutationGovernance } from '@/lib/server/autocar/storeModeGovernance';
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
  const { data, error } = await autocar
    .from('ai_store_agents')
    .select('id,store_id,status,mode,master_enabled,master_autopilot_allowed,store_selected_mode,updated_at')
    .eq('store_id', context.store.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function payload(context: any, agent: any, runtimeStatus: AutocarRuntimePublicStatus) {
  const modeGovernance = evaluateStoreAutocarModeMutationGovernance(runtimeStatus);
  return {
    success: true,
    phase: runtimeStatus.schema === 'production_v2' ? 'production_v2' : 'foundation_v1',
    environment: runtimeStatus.runtime_environment,
    vercel_environment: runtimeStatus.vercel_environment,
    runtime: runtimeStatus,
    mode_governance: modeGovernance,
    execution_mode: agent?.mode || 'off',
    store_selected_mode: agent?.store_selected_mode || 'off',
    master_enabled: Boolean(agent?.master_enabled),
    master_autopilot_allowed: Boolean(agent?.master_autopilot_allowed),
    autopilot_preview_only: runtimeStatus.autopilot_preview_only,
    database_state: runtimeStatus.database_state,
    schema: runtimeStatus.schema,
    schema_version: runtimeStatus.schema_version,
    live_enabled: runtimeStatus.live_enabled,
    automatic_replies_enabled: runtimeStatus.automatic_replies_enabled,
    automatic_replies_reason: runtimeStatus.automatic_replies_reason,
    webhook_hooked: runtimeStatus.webhook_hooked,
    webhook_status: runtimeStatus.webhook_status,
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
      return NextResponse.json(
        { error: 'Usuário sem permissão para visualizar a I.A AUTOCAR.' },
        { status: 403 }
      );
    }

    const [agent, runtimeStatus] = await Promise.all([
      agentForStore(context),
      getAutocarRuntimePublicStatus()
    ]);

    return NextResponse.json(payload(context, agent, runtimeStatus));
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Não foi possível validar a fundação da I.A AUTOCAR.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = cleanText(body?.slug, 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('manage_autocar')) {
      return NextResponse.json(
        { error: 'Somente o gestor da loja pode alterar o modo da AUTOCAR.' },
        { status: 403 }
      );
    }

    const mode = body?.mode;
    if (!validMode(mode)) {
      return NextResponse.json({ error: 'Modo AUTOCAR inválido.' }, { status: 400 });
    }

    const runtimeStatusBeforeWrite = await getAutocarRuntimePublicStatus();
    const governance = evaluateStoreAutocarModeMutationGovernance(runtimeStatusBeforeWrite);
    if (!governance.allowed) {
      return NextResponse.json(
        { error: governance.reason, mode_governance: governance },
        { status: 409 }
      );
    }

    const autocar = getAutocarDevClient();
    const agent = await setAutocarStoreSelectedMode(autocar, context.store, mode);
    const runtimeStatus = await getAutocarRuntimePublicStatus();
    const finalGovernance = evaluateStoreAutocarModeMutationGovernance(runtimeStatus);

    return NextResponse.json({
      ...payload(context, agent, runtimeStatus),
      mode_governance: finalGovernance,
      message: finalGovernance.live_configuration
        ? `Modo ${String(agent.mode || 'off').toUpperCase()} salvo na AUTOCAR Production. Esta configuração pode afetar o atendimento LIVE dentro dos gates Master e SAFE CORE.`
        : `Modo ${String(agent.mode || 'off').toUpperCase()} salvo somente em autocar-dev. Production não foi alterada.`
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Não foi possível alterar o modo da AUTOCAR.' },
      { status: 500 }
    );
  }
}
