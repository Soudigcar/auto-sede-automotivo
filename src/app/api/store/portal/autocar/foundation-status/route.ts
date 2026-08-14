import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { autocarModelName, autocarOpenAiConfigured } from '@/lib/server/autocar/client';
import { evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';
import { autocarReadTools } from '@/lib/server/autocar/tools';
import { cleanText } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    if (!context.permissions.includes('view_autocar')) {
      return NextResponse.json({ error: 'Usuário sem permissão para visualizar a I.A AUTOCAR.' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      phase: 'foundation_v1',
      execution_mode: 'off',
      database_state: 'migration_versioned_not_applied',
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
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível validar a fundação da I.A AUTOCAR.' }, { status: 500 });
  }
}
