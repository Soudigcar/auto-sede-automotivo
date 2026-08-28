import { NextResponse } from 'next/server';
import {
  evaluateBillingRegistrationReadiness
} from '@/lib/billingRegistrationReadiness';
import { readAsaasSandboxSafety } from '@/lib/server/billing/asaas';
import { readBillingRuntimeSafety } from '@/lib/server/billing/runtime';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { safeErrorMessage } from '@/lib/safeErrorMessage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BILLING_STAGE11_DEV_PROJECT_REF = 'hfzmzfhuhukmxkxbkxay';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stageElevenPreviewAllowed(safety: ReturnType<typeof readBillingRuntimeSafety>) {
  return safety.readsEnabled
    && safety.previewEnvironment
    && safety.environmentName === 'saas-dev'
    && safety.actualProjectRef === BILLING_STAGE11_DEV_PROJECT_REF
    && safety.allowedProjectRef === BILLING_STAGE11_DEV_PROJECT_REF;
}

function expectedSyntheticStore(
  sandbox: ReturnType<typeof readAsaasSandboxSafety>,
  storeId: string
) {
  if (storeId === sandbox.syntheticStoreId) {
    return { name: 'Loja DEV Roteamento', registrationSource: 'dev_routing_seed' };
  }
  if (storeId === sandbox.failureSyntheticStoreId) {
    return { name: 'Loja DEV Billing Falhas', registrationSource: 'billing_stage5_seed' };
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const safety = readBillingRuntimeSafety();
    if (!stageElevenPreviewAllowed(safety)) {
      return NextResponse.json({
        error: 'A simulação cadastral funciona somente no Preview isolado do saas-dev.',
        code: 'billing_stage11_environment_forbidden'
      }, { status: 403 });
    }

    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) {
      return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || cleanText(body.action, 60) !== 'simulate-readiness') {
      return NextResponse.json({ error: 'Simulação cadastral inválida.' }, { status: 400 });
    }

    const storeId = cleanText(body.store_id, 80);
    if (!UUID_PATTERN.test(storeId)) {
      return NextResponse.json({ error: 'Loja sintética inválida.' }, { status: 400 });
    }

    const sandbox = readAsaasSandboxSafety();
    const expected = expectedSyntheticStore(sandbox, storeId);
    if (!expected) {
      return NextResponse.json({
        error: 'A simulação está restrita às lojas sintéticas autorizadas.',
        code: 'billing_stage11_store_forbidden'
      }, { status: 403 });
    }

    const [storeResult, usersResult] = await Promise.all([
      supabase
        .from('stores')
        .select('id,store_name,registration_source,status')
        .eq('id', storeId)
        .maybeSingle(),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('status', 'active')
        .in('role', ['store', 'pre_sales', 'seller', 'prospector'])
    ]);
    if (storeResult.error) throw storeResult.error;
    if (usersResult.error) throw usersResult.error;

    const store = storeResult.data;
    if (
      !store
      || store.store_name !== expected.name
      || store.registration_source !== expected.registrationSource
    ) {
      return NextResponse.json({
        error: 'O registro não corresponde ao seed sintético autorizado.',
        code: 'billing_stage11_store_forbidden'
      }, { status: 403 });
    }

    const readiness = evaluateBillingRegistrationReadiness({
      legalName: body.legal_name,
      cnpj: body.cnpj,
      financialEmail: body.financial_email,
      financialPhone: body.financial_phone,
      storeStatus: store.status,
      activeSystemUsers: usersResult.count || 0
    });

    return NextResponse.json({
      success: true,
      persisted: false,
      store: { id: store.id, name: store.store_name },
      readiness,
      activation_simulation: {
        outcome: readiness.ready ? 'ready_for_future_activation' : 'blocked_by_registration',
        would_start_trial: false,
        would_create_asaas_customer: false,
        would_charge: false,
        access_enforcement_mode: 'observe'
      },
      message: readiness.ready
        ? 'Cadastro sintético pronto para uma futura ativação. Nenhum dado foi salvo e nenhum trial foi iniciado.'
        : 'Cadastro sintético incompleto. Nenhum dado foi salvo e nenhuma ação financeira foi executada.'
    });
  } catch (error: any) {
    return NextResponse.json({
      error: safeErrorMessage(error, 'Falha ao simular a preparação cadastral.')
    }, { status: 500 });
  }
}
