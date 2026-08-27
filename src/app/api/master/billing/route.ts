import { NextResponse } from 'next/server';
import { billingEnforcementEnabled } from '@/lib/server/billing/access';
import {
  BILLING_FOUNDATION_MIGRATION,
  confirmStoreAsaasSandboxPayment,
  createStoreAsaasSandboxCheckout,
  missingBillingFoundation,
  readMasterBillingOverview,
  startStoreBillingTrial
} from '@/lib/server/billing/repository';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import {
  readAsaasSandboxSafety,
  readAsaasServerConfiguration
} from '@/lib/server/billing/asaas';
import { readBillingRuntimeSafety } from '@/lib/server/billing/runtime';
import { safeErrorMessage } from '@/lib/safeErrorMessage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function uuid(value: unknown) {
  const text = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : '';
}

async function masterContext(request: Request) {
  const safety = readBillingRuntimeSafety();
  if (!safety.readsEnabled) {
    return {
      error: NextResponse.json({
        error: 'Billing indisponivel: o Preview nao esta isolado no saas-dev.',
        code: safety.reason
      }, { status: 503 })
    } as const;
  }
  const supabase = getAdminClient();
  const master = await requireMaster(request, supabase);
  if (!master) {
    return { error: NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 }) } as const;
  }
  return { supabase, master, safety } as const;
}

export async function GET(request: Request) {
  try {
    const context = await masterContext(request);
    if ('error' in context) return context.error;
    const overview = await readMasterBillingOverview(context.supabase);
    const asaas = readAsaasServerConfiguration();
    const asaasSandbox = readAsaasSandboxSafety();

    return NextResponse.json({
      success: true,
      ...overview,
      safety: {
        global_enforcement_enabled: billingEnforcementEnabled(),
        trial_start_enabled: context.safety.trialStartEnabled,
        existing_store_default: 'observe',
        runtime_environment: context.safety.environmentName,
        connected_project_ref: context.safety.actualProjectRef,
        preview_only: true
      },
      asaas: {
        environment: asaas.environment,
        api_configured: asaas.apiConfigured,
        webhook_configured: asaas.webhookConfigured,
        sandbox_enabled: asaasSandbox.enabled,
        synthetic_store_configured: Boolean(asaasSandbox.syntheticStoreId),
        preview_callback_configured: Boolean(asaasSandbox.previewBaseUrl),
        webhook_bypass_configured: asaasSandbox.webhookBypassConfigured,
        sandbox_payment_confirmation_enabled: asaasSandbox.paymentConfirmationEnabled,
        configuration_valid: asaas.errors.length === 0,
        errors: [...asaas.errors, ...asaasSandbox.errors]
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error, 'Falha ao consultar o billing.') }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await masterContext(request);
    if ('error' in context) return context.error;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Dados invalidos.' }, { status: 400 });
    }

    const action = cleanText(body.action, 60);
    if (!['start-trial', 'create-sandbox-checkout', 'confirm-sandbox-payment'].includes(action)) {
      return NextResponse.json({ error: 'Acao de billing invalida.' }, { status: 400 });
    }
    const storeId = uuid(body.store_id);
    if (!storeId) return NextResponse.json({ error: 'Loja invalida.' }, { status: 400 });

    if (action === 'start-trial') {
      if (!context.safety.trialStartEnabled) {
        return NextResponse.json({
          error: 'A liberacao de trial esta bloqueada nesta etapa de Preview.',
          code: 'billing_trial_start_disabled'
        }, { status: 403 });
      }
      const planCode = cleanText(body.plan_code, 80).toLowerCase() || 'professional';
      const reason = cleanText(body.reason, 1000);
      if (reason.length < 10) {
        return NextResponse.json({ error: 'Informe o motivo da liberacao do trial.' }, { status: 400 });
      }

      const subscription = await startStoreBillingTrial(context.supabase, {
        storeId,
        planCode,
        actorUserId: context.master.id,
        reason
      });

      return NextResponse.json({
        success: true,
        subscription,
        access_enforcement_mode: 'observe',
        message: 'Trial de sete dias registrado sem bloquear ou alterar o acesso atual da loja.'
      });
    }

    if (action === 'create-sandbox-checkout') {
      const configuration = readAsaasServerConfiguration();
      const asaasSandbox = readAsaasSandboxSafety();
      if (!configuration.apiConfigured || !configuration.webhookConfigured || !asaasSandbox.enabled) {
        return NextResponse.json({
          error: configuration.errors[0] || asaasSandbox.errors[0] || 'Asaas Sandbox indisponivel.',
          code: 'asaas_sandbox_disabled'
        }, { status: 503 });
      }
      if (storeId !== asaasSandbox.syntheticStoreId) {
        return NextResponse.json({
          error: 'O Checkout Sandbox esta restrito a Loja DEV Roteamento.',
          code: 'asaas_sandbox_store_forbidden'
        }, { status: 403 });
      }
      const checkout = await createStoreAsaasSandboxCheckout(context.supabase, {
        storeId,
        actorUserId: context.master.id,
        configuration,
        safety: asaasSandbox
      });
      return NextResponse.json({
        success: true,
        ...checkout,
        environment: 'sandbox',
        access_enforcement_mode: 'observe',
        message: checkout.reused
          ? 'Checkout Sandbox existente recuperado sem duplicacao.'
          : 'Checkout recorrente criado no Asaas Sandbox sem cobranca real.'
      });
    }

    if (action === 'confirm-sandbox-payment') {
      const configuration = readAsaasServerConfiguration();
      const asaasSandbox = readAsaasSandboxSafety();
      if (
        !configuration.apiConfigured
        || !configuration.webhookConfigured
        || !asaasSandbox.enabled
        || !asaasSandbox.paymentConfirmationEnabled
      ) {
        return NextResponse.json({
          error: configuration.errors[0]
            || asaasSandbox.errors[0]
            || 'A confirmacao da cobranca Sandbox permanece desabilitada.',
          code: 'asaas_sandbox_payment_confirmation_disabled'
        }, { status: 503 });
      }
      if (storeId !== asaasSandbox.syntheticStoreId) {
        return NextResponse.json({
          error: 'A confirmacao Sandbox esta restrita a Loja DEV Roteamento.',
          code: 'asaas_sandbox_store_forbidden'
        }, { status: 403 });
      }
      const confirmation = await confirmStoreAsaasSandboxPayment(context.supabase, {
        storeId,
        actorUserId: context.master.id,
        configuration,
        safety: asaasSandbox
      });
      return NextResponse.json({
        success: true,
        ...confirmation,
        environment: 'sandbox',
        access_enforcement_mode: 'observe',
        message: confirmation.webhook_pending
          ? 'Confirmacao Sandbox solicitada. O estado sera atualizado somente pelo webhook autenticado.'
          : 'A cobranca sintetica ja estava confirmada e foi preservada sem duplicacao.'
      });
    }

  } catch (error: any) {
    if (missingBillingFoundation(error)) {
      return NextResponse.json({
        error: 'A fundacao de billing ainda nao esta instalada neste ambiente.',
        migration_required: BILLING_FOUNDATION_MIGRATION
      }, { status: 503 });
    }
    const code = String(error?.code || '');
    const status = code === '23505'
      ? 409
      : code === 'P0002'
        ? 404
        : [
            '42501',
            'BILLING_STORE_NOT_ELIGIBLE',
            'ASAAS_SANDBOX_STORE_FORBIDDEN',
            'ASAAS_SANDBOX_TRIAL_REQUIRED',
            'ASAAS_SANDBOX_PAYMENT_CONFIRMATION_FORBIDDEN',
            'ASAAS_SANDBOX_PAYMENT_NOT_READY',
            'ASAAS_SANDBOX_PAYMENT_MISMATCH'
          ].includes(code)
          ? 403
          : 500;
    return NextResponse.json({ error: safeErrorMessage(error, 'Falha ao processar a operacao de billing.') }, { status });
  }
}
