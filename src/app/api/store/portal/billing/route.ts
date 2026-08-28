import { NextResponse } from 'next/server';
import { readStoreBillingOverview } from '@/lib/server/billing/repository';
import { readBillingRuntimeSafety } from '@/lib/server/billing/runtime';
import { safeErrorMessage } from '@/lib/safeErrorMessage';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const safety = readBillingRuntimeSafety();
    if (!safety.readsEnabled) {
      return NextResponse.json({
        error: 'Billing indisponível: a configuração segura deste ambiente recusou a leitura.',
        code: safety.reason
      }, { status: 503 });
    }

    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('view_billing')) {
      return NextResponse.json({ error: 'A assinatura é visível somente para o gestor da loja.' }, { status: 403 });
    }

    const overview = await readStoreBillingOverview(context.supabase, context.store.id);
    const subscription = overview.subscription;
    const payment = overview.payment;

    return NextResponse.json({
      success: true,
      schema_ready: overview.schema_ready,
      plan: overview.plan,
      subscription: subscription ? {
        status: subscription.status,
        access_enforcement_mode: subscription.access_enforcement_mode,
        trial_started_at: subscription.trial_started_at,
        trial_ends_at: subscription.trial_ends_at,
        current_period_started_at: subscription.current_period_started_at,
        current_period_ends_at: subscription.current_period_ends_at,
        past_due_at: subscription.past_due_at,
        grace_ends_at: subscription.grace_ends_at,
        checkout_registered: Boolean(subscription.provider_checkout_id),
        card_registered: Boolean(
          subscription.provider_customer_id
          && subscription.provider_subscription_id
          && payment
        )
      } : null,
      payment: payment ? {
        provider_status: payment.provider_status,
        amount_cents: payment.amount_cents,
        due_at: payment.due_at,
        confirmed_at: payment.confirmed_at,
        received_at: payment.received_at,
        overdue_at: payment.overdue_at,
        refunded_at: payment.refunded_at,
        chargeback_at: payment.chargeback_at
      } : null,
      latest_event: overview.latest_audit ? {
        action: overview.latest_audit.action,
        created_at: overview.latest_audit.created_at
      } : null,
      entitlement: {
        access_preserved: true,
        enforced: false,
        mode: 'observe',
        reason: context.billing.reason,
        observed_allowed: context.billing.observedAllowed,
        observed_reason: context.billing.observedReason
      },
      safety: {
        read_only: true,
        mutations_enabled: false,
        runtime_environment: safety.environmentName,
        deployment_environment: safety.deploymentEnvironment,
        connected_project_ref: safety.actualProjectRef,
        preview_only: safety.previewEnvironment,
        production_observe_prepared: safety.productionEnvironment
          && safety.readsEnabled
          && !safety.mutationsEnabled
          && !safety.enforcementEnabled
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      error: safeErrorMessage(error, 'Não foi possível consultar a assinatura da loja.')
    }, { status: 500 });
  }
}
