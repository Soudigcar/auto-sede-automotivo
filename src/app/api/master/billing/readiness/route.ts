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

export const BILLING_STAGE12_REGISTRATION_MIGRATION =
  '20260828131550_store_registration_profiles_stage12';

const BILLING_STAGE12_DEV_PROJECT_REF = 'hfzmzfhuhukmxkxbkxay';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stageTwelvePreviewAllowed(safety: ReturnType<typeof readBillingRuntimeSafety>) {
  return safety.readsEnabled
    && safety.previewEnvironment
    && safety.environmentName === 'saas-dev'
    && safety.actualProjectRef === BILLING_STAGE12_DEV_PROJECT_REF
    && safety.allowedProjectRef === BILLING_STAGE12_DEV_PROJECT_REF;
}

function expectedSyntheticStore(
  sandbox: ReturnType<typeof readAsaasSandboxSafety>,
  storeId: string
) {
  if (storeId === sandbox.syntheticStoreId) {
    return {
      name: 'Loja DEV Roteamento',
      registrationSource: 'dev_routing_seed',
      registrationWriteAllowed: false
    };
  }
  if (storeId === sandbox.failureSyntheticStoreId) {
    return {
      name: 'Loja DEV Billing Falhas',
      registrationSource: 'billing_stage5_seed',
      registrationWriteAllowed: true
    };
  }
  return null;
}

function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

export async function POST(request: Request) {
  try {
    const safety = readBillingRuntimeSafety();
    if (!stageTwelvePreviewAllowed(safety)) {
      return NextResponse.json({
        error: 'O cadastro financeiro funciona somente no Preview isolado do saas-dev.',
        code: 'billing_stage12_environment_forbidden'
      }, { status: 403 });
    }

    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) {
      return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cadastro financeiro inválido.' }, { status: 400 });
    }

    const action = cleanText(body.action, 60);
    if (!['simulate-readiness', 'save-readiness'].includes(action)) {
      return NextResponse.json({ error: 'Ação cadastral inválida.' }, { status: 400 });
    }

    const storeId = cleanText(body.store_id, 80);
    if (!UUID_PATTERN.test(storeId)) {
      return NextResponse.json({ error: 'Loja sintética inválida.' }, { status: 400 });
    }

    const sandbox = readAsaasSandboxSafety();
    const expected = expectedSyntheticStore(sandbox, storeId);
    if (!expected) {
      return NextResponse.json({
        error: 'O cadastro está restrito às lojas sintéticas autorizadas.',
        code: 'billing_stage12_store_forbidden'
      }, { status: 403 });
    }

    if (action === 'save-readiness' && (
      !safety.registrationWritesEnabled
      || !expected.registrationWriteAllowed
    )) {
      return NextResponse.json({
        error: 'A persistência cadastral está restrita à Loja DEV Billing Falhas neste Preview.',
        code: 'billing_stage12_registration_write_forbidden'
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
        code: 'billing_stage12_store_forbidden'
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

    if (action === 'simulate-readiness') {
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
    }

    if (!readiness.ready) {
      return NextResponse.json({
        error: 'Conclua todos os campos válidos antes de salvar o cadastro sintético.',
        code: 'billing_stage12_registration_incomplete',
        readiness
      }, { status: 422 });
    }

    const requestId = cleanText(body.request_id, 80);
    if (!UUID_PATTERN.test(requestId)) {
      return NextResponse.json({ error: 'Chave de idempotência inválida.' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('save_store_billing_registration_profile', {
      p_store_id: store.id,
      p_actor_user_id: master.id,
      p_legal_name: readiness.normalized.legal_name,
      p_cnpj: digits(readiness.normalized.cnpj),
      p_financial_email: readiness.normalized.financial_email,
      p_financial_phone: digits(readiness.normalized.financial_phone),
      p_idempotency_key: requestId
    });
    if (error) throw error;

    const saved = Array.isArray(data) ? data[0] : data;
    if (!saved) throw new Error('A persistência cadastral não retornou confirmação.');

    return NextResponse.json({
      success: true,
      persisted: Boolean(saved.persisted),
      idempotent: Boolean(saved.idempotent),
      store: { id: store.id, name: store.store_name },
      profile: {
        id: saved.profile_id,
        status: saved.registration_status,
        version: saved.profile_version
      },
      readiness,
      safety: {
        would_start_trial: false,
        would_create_asaas_customer: false,
        would_charge: false,
        access_enforcement_mode: 'observe'
      },
      message: saved.idempotent
        ? 'Cadastro sintético já havia sido salvo por esta solicitação e foi preservado sem duplicação.'
        : 'Cadastro sintético salvo separadamente de stores. Nenhum trial, cliente Asaas ou cobrança foi criado.'
    });
  } catch (error: any) {
    const code = String(error?.code || '');
    const missingMigration = ['42883', 'PGRST202', 'PGRST205'].includes(code)
      || /save_store_billing_registration_profile|schema cache|does not exist/i.test(
        String(error?.message || error || '')
      );
    if (missingMigration) {
      return NextResponse.json({
        error: 'A estrutura cadastral da etapa 12 ainda não está instalada neste ambiente.',
        migration_required: BILLING_STAGE12_REGISTRATION_MIGRATION
      }, { status: 503 });
    }
    return NextResponse.json({
      error: safeErrorMessage(error, 'Falha ao processar a preparação cadastral.')
    }, { status: code === '22023' ? 422 : 500 });
  }
}
