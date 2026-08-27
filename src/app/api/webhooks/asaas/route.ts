import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/server/masterApi';
import {
  isAuthorizedAsaasWebhook,
  minimalAsaasWebhookPayload,
  readAsaasServerConfiguration
} from '@/lib/server/billing/asaas';
import { missingBillingFoundation } from '@/lib/server/billing/repository';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ASAAS_WEBHOOK_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const configuration = readAsaasServerConfiguration();
  if (!configuration.webhookConfigured) {
    return NextResponse.json({ error: 'Webhook Asaas nao configurado.' }, { status: 503 });
  }
  if (!isAuthorizedAsaasWebhook(request, configuration)) {
    return NextResponse.json({ error: 'Webhook nao autorizado.' }, { status: 401 });
  }

  try {
    const body = await readJsonBody<any>(request, MAX_ASAAS_WEBHOOK_BYTES);
    const event = minimalAsaasWebhookPayload(body);
    if (!event.provider_event_id || !event.event_type) {
      return NextResponse.json({ error: 'Evento Asaas invalido.' }, { status: 400 });
    }

    const { error } = await getAdminClient().from('billing_webhook_events').insert({
      provider: 'asaas',
      provider_event_id: event.provider_event_id,
      event_type: event.event_type,
      provider_object_type: event.provider_object_type,
      provider_object_id: event.provider_object_id,
      processing_status: 'pending',
      payload: event.payload
    });

    if (error && String(error.code || '') !== '23505') throw error;
    return NextResponse.json({ received: true, duplicate: String(error?.code || '') === '23505' });
  } catch (error: any) {
    if (missingBillingFoundation(error)) {
      return NextResponse.json({ error: 'Billing ainda nao provisionado.' }, { status: 503 });
    }
    const response = publicError(error, 'Falha ao receber evento do Asaas.');
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
