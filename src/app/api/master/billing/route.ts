import { NextResponse } from 'next/server';
import { billingEnforcementEnabled } from '@/lib/server/billing/access';
import {
  BILLING_FOUNDATION_MIGRATION,
  asaasCheckoutFailureState,
  confirmStoreAsaasSandboxPayment,
  createStoreAsaasSandboxCheckout,
  missingBillingFoundation,
  readMasterBillingOverview,
  startStoreBillingTrial
} from '@/lib/server/billing/repository';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import {
  deliverAsaasSandboxTestWebhook,
  readAsaasSandboxSafety,
  readAsaasServerConfiguration
} from '@/lib/server/billing/asaas';
import {
  readBillingRuntimeSafety,
  readBillingStage15cSafety
} from '@/lib/server/billing/runtime';
import { safeErrorMessage } from '@/lib/safeErrorMessage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BILLING_STAGE12_DEV_PROJECT_REF = 'hfzmzfhuhukmxkxbkxay';
const BILLING_STAGE15C_WEBHOOK_REQUEST_ID = '150c0000-0000-4000-8000-000000000602';
const BILLING_STAGE15C_FAILURE_SUBSCRIPTION_ID = '150c0000-0000-4000-8000-000000000202';
const BILLING_STAGE15C_FAILURE_PAYMENT_ID = '150c0000-0000-4000-8000-000000000302';

function registrationPreviewAllowed(safety: ReturnType<typeof readBillingRuntimeSafety>) {
  const legacySaasDev = safety.readsEnabled
    && safety.previewEnvironment
    && safety.environmentName === 'saas-dev'
    && safety.actualProjectRef === BILLING_STAGE12_DEV_PROJECT_REF
    && safety.allowedProjectRef === BILLING_STAGE12_DEV_PROJECT_REF;
  return legacySaasDev || readBillingStage15cSafety().enabled;
}

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
        error: 'Billing indisponivel: a configuracao segura deste ambiente recusou a leitura.',
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
    const registrationSimulationEnabled = registrationPreviewAllowed(context.safety);
    const registrationPersistenceEnabled = registrationSimulationEnabled
      && context.safety.registrationWritesEnabled;
    const stage13ActivationEnabled = registrationSimulationEnabled
      && context.safety.stage13ActivationEnabled
      && asaasSandbox.stage13ActivationEnabled;
    const syntheticStoreIds = new Set(asaasSandbox.syntheticStoreIds);
    const stores = overview.stores.map((store: any) => ({
      ...store,
      billing_registration_simulation_allowed: registrationSimulationEnabled
        && syntheticStoreIds.has(String(store.id))
        && (
          (store.store_name === 'Loja DEV Roteamento' && store.registration_source === 'dev_routing_seed')
          || (store.store_name === 'Loja DEV Billing Falhas' && store.registration_source === 'billing_stage5_seed')
          || (store.store_name === 'Loja DEV Billing Ativacao' && store.registration_source === 'billing_stage13_seed')
        ),
      billing_registration_write_allowed: registrationPersistenceEnabled
        && String(store.id) === asaasSandbox.failureSyntheticStoreId
        && store.store_name === 'Loja DEV Billing Falhas'
        && store.registration_source === 'billing_stage5_seed',
      billing_stage13_activation_allowed: registrationSimulationEnabled
        && String(store.id) === asaasSandbox.stage13SyntheticStoreId
        && store.store_name === 'Loja DEV Billing Ativacao'
        && store.registration_source === 'billing_stage13_seed'
        && store.billing_registration_profile?.registration_status === 'ready_for_activation'
    }));

    return NextResponse.json({
      success: true,
      ...overview,
      stores,
      safety: {
        global_enforcement_enabled: billingEnforcementEnabled(),
        mutations_enabled: context.safety.mutationsEnabled,
        trial_start_enabled: context.safety.trialStartEnabled,
        existing_store_default: 'observe',
        runtime_environment: context.safety.environmentName,
        deployment_environment: context.safety.deploymentEnvironment,
        connected_project_ref: context.safety.actualProjectRef,
        preview_only: context.safety.previewEnvironment,
        registration_simulation_enabled: registrationSimulationEnabled,
        registration_persistence_enabled: registrationPersistenceEnabled,
        stage13_activation_enabled: stage13ActivationEnabled,
        production_observe_prepared: context.safety.productionEnvironment
          && context.safety.readsEnabled
          && !context.safety.mutationsEnabled
          && !context.safety.enforcementEnabled
      },
      asaas: {
        environment: asaas.environment,
        api_configured: asaas.apiConfigured,
        webhook_configured: asaas.webhookConfigured,
        sandbox_enabled: asaasSandbox.enabled,
        synthetic_store_configured: Boolean(asaasSandbox.syntheticStoreId),
        preview_callback_configured: Boolean(asaasSandbox.previewBaseUrl),
        webhook_bypass_configured: asaasSandbox.webhookBypassConfigured,
        sandbox_payment_confirmation_enabled: context.safety.mutationsEnabled
          && asaasSandbox.paymentConfirmationEnabled,
        sandbox_failure_test_enabled: false,
        failure_synthetic_store_configured: Boolean(asaasSandbox.failureSyntheticStoreId),
        stage13_synthetic_store_configured: Boolean(asaasSandbox.stage13SyntheticStoreId),
        stage13_activation_enabled: stage13ActivationEnabled,
        production_blocked: true,
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
    // Guard historico da etapa 6: if (!context.safety.mutationsEnabled)
    // retornava billing_stage6_read_only antes de interpretar qualquer acao.
    // A etapa 13 mantem mutacoes gerais fechadas e reconhece somente sua acao
    // sintetica dedicada depois de validar o corpo.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Dados invalidos.' }, { status: 400 });
    }

    const action = cleanText(body.action, 60);
    if (![
      'start-trial',
      'create-sandbox-checkout',
      'confirm-sandbox-payment',
      'activate-stage13-sandbox',
      'rehearse-stage15c-webhooks'
    ].includes(action)) {
      return NextResponse.json({ error: 'Acao de billing invalida.' }, { status: 400 });
    }
    const storeId = uuid(body.store_id);
    if (!storeId) return NextResponse.json({ error: 'Loja invalida.' }, { status: 400 });

    if (action === 'activate-stage13-sandbox') {
      const configuration = readAsaasServerConfiguration();
      const asaasSandbox = readAsaasSandboxSafety();
      const requestId = uuid(body.request_id);
      if (!requestId) {
        return NextResponse.json({ error: 'Chave de idempotencia invalida.' }, { status: 400 });
      }
      if (
        !context.safety.stage13ActivationEnabled
        || !context.safety.trialStartEnabled
        || !context.safety.previewEnvironment
        || !registrationPreviewAllowed(context.safety)
        || !asaasSandbox.stage13ActivationEnabled
      ) {
        return NextResponse.json({
          error: 'O ensaio de ativacao da etapa 13 permanece bloqueado neste ambiente.',
          code: 'billing_stage13_activation_disabled'
        }, { status: 403 });
      }
      if (
        !configuration.apiConfigured
        || !configuration.webhookConfigured
        || !asaasSandbox.enabled
      ) {
        return NextResponse.json({
          error: configuration.errors[0] || asaasSandbox.errors[0] || 'Asaas Sandbox indisponivel.',
          code: 'asaas_sandbox_disabled'
        }, { status: 503 });
      }
      if (storeId !== asaasSandbox.stage13SyntheticStoreId) {
        return NextResponse.json({
          error: 'A etapa 13 esta restrita a terceira loja sintetica autorizada.',
          code: 'billing_stage13_store_forbidden'
        }, { status: 403 });
      }

      const [storeResult, registrationResult] = await Promise.all([
        context.supabase
          .from('stores')
          .select('id,store_name,registration_source,status')
          .eq('id', storeId)
          .maybeSingle(),
        context.supabase
          .from('store_billing_registration_profiles')
          .select('store_id,registration_status,validated_at')
          .eq('store_id', storeId)
          .maybeSingle()
      ]);
      if (storeResult.error) throw storeResult.error;
      if (registrationResult.error) throw registrationResult.error;
      if (
        storeResult.data?.store_name !== 'Loja DEV Billing Ativacao'
        || storeResult.data?.registration_source !== 'billing_stage13_seed'
        || storeResult.data?.status !== 'active'
        || registrationResult.data?.registration_status !== 'ready_for_activation'
        || !registrationResult.data?.validated_at
      ) {
        return NextResponse.json({
          error: 'A terceira loja sintetica ainda nao possui identidade e cadastro validados.',
          code: 'billing_stage13_registration_required'
        }, { status: 422 });
      }

      const subscription = await startStoreBillingTrial(context.supabase, {
        storeId,
        planCode: 'professional',
        actorUserId: context.master.id,
        reason: `Ensaio sintetico da etapa 13 em modo observe. Solicitacao ${requestId}.`
      });
      let checkout;
      try {
        checkout = await createStoreAsaasSandboxCheckout(context.supabase, {
          storeId,
          actorUserId: context.master.id,
          configuration,
          safety: asaasSandbox
        });
      } catch (checkoutError: any) {
        console.warn('[billing.asaas] Checkout Sandbox indisponivel; trial preservado', {
          code: cleanText(checkoutError?.code || 'unknown', 80)
        });
        return NextResponse.json({
          success: false,
          error: 'O Asaas Sandbox nao concluiu o Checkout. O trial foi preservado e a operacao pode ser repetida com seguranca.',
          ...asaasCheckoutFailureState(subscription)
        }, { status: 502 });
      }

      return NextResponse.json({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          trial_started_at: subscription.trial_started_at,
          trial_ends_at: subscription.trial_ends_at,
          access_enforcement_mode: subscription.access_enforcement_mode
        },
        ...checkout,
        environment: 'sandbox',
        payment_confirmed: false,
        access_enforcement_mode: 'observe',
        message: checkout.reused
          ? 'Ativacao sintetica revalidada sem duplicar trial, Checkout ou auditoria.'
          : 'Trial unico de sete dias iniciado e Checkout recorrente criado no Asaas Sandbox com cadastro pre-preenchido.'
      });
    }

    if (action === 'rehearse-stage15c-webhooks') {
      const configuration = readAsaasServerConfiguration();
      const asaasSandbox = readAsaasSandboxSafety();
      const stage15cSafety = readBillingStage15cSafety();
      const requestId = uuid(body.request_id);
      if (
        !stage15cSafety.enabled
        || !asaasSandbox.enabled
        || !asaasSandbox.failureTestEnabled
        || configuration.environment !== 'sandbox'
        || !configuration.webhookConfigured
        || requestId !== BILLING_STAGE15C_WEBHOOK_REQUEST_ID
      ) {
        return NextResponse.json({
          error: 'O ensaio de webhooks 15C permanece bloqueado neste ambiente.',
          code: 'billing_stage15c_webhook_rehearsal_disabled'
        }, { status: 403 });
      }
      if (storeId !== asaasSandbox.failureSyntheticStoreId) {
        return NextResponse.json({
          error: 'O ensaio de webhooks 15C esta restrito a loja sintetica de falhas.',
          code: 'billing_stage15c_store_forbidden'
        }, { status: 403 });
      }

      const [storeResult, subscriptionResult, paymentResult] = await Promise.all([
        context.supabase
          .from('stores')
          .select('id,store_name,status,registration_source')
          .eq('id', storeId)
          .maybeSingle(),
        context.supabase
          .from('store_billing_subscriptions')
          .select('id,store_id,status,access_enforcement_mode,provider_customer_id,provider_subscription_id,external_reference')
          .eq('id', BILLING_STAGE15C_FAILURE_SUBSCRIPTION_ID)
          .eq('store_id', storeId)
          .maybeSingle(),
        context.supabase
          .from('billing_payments')
          .select('id,subscription_id,store_id,provider_payment_id,provider_status,amount_cents,due_at')
          .eq('id', BILLING_STAGE15C_FAILURE_PAYMENT_ID)
          .eq('store_id', storeId)
          .maybeSingle()
      ]);
      if (storeResult.error) throw storeResult.error;
      if (subscriptionResult.error) throw subscriptionResult.error;
      if (paymentResult.error) throw paymentResult.error;
      const store = storeResult.data;
      const subscription = subscriptionResult.data;
      const payment = paymentResult.data;
      if (
        store?.store_name !== 'Loja DEV Billing Falhas'
        || store?.status !== 'active'
        || store?.registration_source !== 'billing_stage5_seed'
        || !subscription
        || subscription.access_enforcement_mode !== 'observe'
        || !['trialing', 'active', 'past_due'].includes(subscription.status)
        || !String(subscription.provider_customer_id || '').startsWith('cus_stage15c_')
        || !String(subscription.provider_subscription_id || '').startsWith('sub_stage15c_')
        || !String(subscription.external_reference || '').startsWith(`store:${storeId}:subscription:`)
        || !payment
        || payment.subscription_id !== subscription.id
        || Number(payment.amount_cents) !== 149700
        || !String(payment.provider_payment_id || '').startsWith('pay_stage15c_')
      ) {
        return NextResponse.json({
          error: 'A fixture financeira 15C nao corresponde ao estado sintetico selado.',
          code: 'billing_stage15c_webhook_fixture_required'
        }, { status: 422 });
      }

      const compactRequestId = requestId.replace(/-/g, '');
      const webhookBody = (suffix: string, event: string, status: string) => ({
        id: `evt_stage5_15c_${compactRequestId}_${suffix}`,
        event,
        dateCreated: new Date().toISOString(),
        payment: {
          object: 'payment',
          id: payment.provider_payment_id,
          status,
          value: 1497,
          dueDate: String(payment.due_at || '').slice(0, 10),
          billingType: 'CREDIT_CARD',
          customer: subscription.provider_customer_id,
          subscription: subscription.provider_subscription_id,
          externalReference: subscription.external_reference
        }
      });
      const deliver = (payload: ReturnType<typeof webhookBody>) =>
        deliverAsaasSandboxTestWebhook(configuration, asaasSandbox, payload);

      const confirmed = webhookBody('confirmed_concurrent', 'PAYMENT_CONFIRMED', 'CONFIRMED');
      const confirmedResults = await Promise.all([deliver(confirmed), deliver(confirmed)]);
      const requested = webhookBody(
        'chargeback_requested_concurrent',
        'PAYMENT_CHARGEBACK_REQUESTED',
        'CHARGEBACK_REQUESTED'
      );
      const requestedResults = await Promise.all([deliver(requested), deliver(requested)]);
      const disputeResult = await deliver(webhookBody(
        'chargeback_dispute',
        'PAYMENT_CHARGEBACK_DISPUTE',
        'CHARGEBACK_DISPUTE'
      ));
      const staleResult = await deliver(webhookBody(
        'confirmed_out_of_order',
        'PAYMENT_CONFIRMED',
        'CONFIRMED'
      ));

      const [finalSubscriptionResult, finalPaymentResult] = await Promise.all([
        context.supabase
          .from('store_billing_subscriptions')
          .select('status,access_enforcement_mode')
          .eq('id', subscription.id)
          .maybeSingle(),
        context.supabase
          .from('billing_payments')
          .select('provider_status,chargeback_at')
          .eq('id', payment.id)
          .maybeSingle()
      ]);
      if (finalSubscriptionResult.error) throw finalSubscriptionResult.error;
      if (finalPaymentResult.error) throw finalPaymentResult.error;
      if (
        finalSubscriptionResult.data?.status !== 'past_due'
        || finalSubscriptionResult.data?.access_enforcement_mode !== 'observe'
        || finalPaymentResult.data?.provider_status !== 'CHARGEBACK_DISPUTE'
        || !finalPaymentResult.data?.chargeback_at
      ) {
        throw new Error('O ensaio 15C nao preservou a perda terminal em modo observe.');
      }

      return NextResponse.json({
        success: true,
        environment: 'sandbox',
        access_enforcement_mode: 'observe',
        concurrent_confirmation_duplicate_observed: confirmedResults.some((item) => item.duplicate),
        concurrent_chargeback_duplicate_observed: requestedResults.some((item) => item.duplicate),
        chargeback_processing_status: disputeResult.processing_status,
        out_of_order_processing_status: staleResult.processing_status,
        final_subscription_status: finalSubscriptionResult.data.status,
        final_payment_status: finalPaymentResult.data.provider_status
      });
    }

    if (!context.safety.mutationsEnabled) {
      return NextResponse.json({
        error: 'As mutacoes gerais de billing permanecem bloqueadas; somente os ensaios sinteticos explicitamente autorizados podem ser executados.',
        code: 'billing_general_mutations_read_only'
      }, { status: 403 });
    }

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
      if (!asaasSandbox.syntheticStoreIds.includes(storeId)) {
        return NextResponse.json({
          error: 'O Checkout Sandbox esta restrito as lojas sinteticas autorizadas.',
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
            'ASAAS_SANDBOX_REGISTRATION_REQUIRED',
            'BILLING_STAGE13_STORE_FORBIDDEN',
            'ASAAS_SANDBOX_PAYMENT_CONFIRMATION_FORBIDDEN',
            'ASAAS_SANDBOX_FAILURE_TEST_FORBIDDEN',
            'ASAAS_SANDBOX_PAYMENT_NOT_READY',
            'ASAAS_SANDBOX_PAYMENT_MISMATCH'
          ].includes(code)
          ? 403
          : 500;
    return NextResponse.json({ error: safeErrorMessage(error, 'Falha ao processar a operacao de billing.') }, { status });
  }
}
