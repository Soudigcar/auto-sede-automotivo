import { NextResponse } from 'next/server';
import { billingEnforcementEnabled } from '@/lib/server/billing/access';
import {
  BILLING_FOUNDATION_MIGRATION,
  missingBillingFoundation,
  readMasterBillingOverview,
  startStoreBillingTrial
} from '@/lib/server/billing/repository';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { readAsaasServerConfiguration } from '@/lib/server/billing/asaas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function uuid(value: unknown) {
  const text = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : '';
}

async function masterContext(request: Request) {
  const supabase = getAdminClient();
  const master = await requireMaster(request, supabase);
  if (!master) {
    return { error: NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 }) } as const;
  }
  return { supabase, master } as const;
}

export async function GET(request: Request) {
  try {
    const context = await masterContext(request);
    if ('error' in context) return context.error;
    const overview = await readMasterBillingOverview(context.supabase);
    const asaas = readAsaasServerConfiguration();

    return NextResponse.json({
      success: true,
      ...overview,
      safety: {
        global_enforcement_enabled: billingEnforcementEnabled(),
        existing_store_default: 'observe'
      },
      asaas: {
        environment: asaas.environment,
        api_configured: asaas.apiConfigured,
        webhook_configured: asaas.webhookConfigured,
        configuration_valid: asaas.errors.length === 0,
        errors: asaas.errors
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || 'Falha ao consultar o billing.') }, { status: 500 });
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
    if (action !== 'start-trial') {
      return NextResponse.json({ error: 'Acao de billing invalida.' }, { status: 400 });
    }

    const storeId = uuid(body.store_id);
    const planCode = cleanText(body.plan_code, 80).toLowerCase() || 'professional';
    const reason = cleanText(body.reason, 1000);
    if (!storeId) return NextResponse.json({ error: 'Loja invalida.' }, { status: 400 });
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
  } catch (error: any) {
    if (missingBillingFoundation(error)) {
      return NextResponse.json({
        error: 'A fundacao de billing ainda nao esta instalada neste ambiente.',
        migration_required: BILLING_FOUNDATION_MIGRATION
      }, { status: 503 });
    }
    const code = String(error?.code || '');
    const status = code === '23505' ? 409 : code === 'P0002' ? 404 : code === '42501' ? 403 : 500;
    return NextResponse.json({ error: String(error?.message || 'Falha ao iniciar o trial.') }, { status });
  }
}
