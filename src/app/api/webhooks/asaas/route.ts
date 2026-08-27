import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/server/masterApi';
import {
  isAuthorizedAsaasWebhook,
  minimalAsaasWebhookPayload,
  readAsaasSandboxSafety,
  readAsaasServerConfiguration
} from '@/lib/server/billing/asaas';
import {
  missingBillingFoundation,
  processStoredAsaasWebhookEvent
} from '@/lib/server/billing/repository';
import { readBillingRuntimeSafety } from '@/lib/server/billing/runtime';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ASAAS_WEBHOOK_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const configuration = readAsaasServerConfiguration();
  const billingSafety = readBillingRuntimeSafety();
  const asaasSandbox = readAsaasSandboxSafety();
  if (!billingSafety.readsEnabled || !asaasSandbox.enabled || configuration.environment !== 'sandbox') {
    return NextResponse.json({ error: 'Webhook Asaas Sandbox indisponivel fora do Preview isolado.' }, { status: 503 });
  }
  if (!configuration.webhookConfigured) {
    return NextResponse.json({ error: 'Webhook Asaas nao configurado.' }, { status: 503 });
  }
  if (!isAuthorizedAsaasWebhook(request, configuration)) {
    return NextResponse.json({ error: 'Webhook nao autorizado.' }, { status: 401 });
  }

  const supabase = getAdminClient();
  let storedEvent: any = null;
  let duplicate = false;
  try {
    const body = await readJsonBody<any>(request, MAX_ASAAS_WEBHOOK_BYTES);
    const event = minimalAsaasWebhookPayload(body);
    if (!event.provider_event_id || !event.event_type) {
      return NextResponse.json({ error: 'Evento Asaas invalido.' }, { status: 400 });
    }

    const inserted = await supabase.from('billing_webhook_events').insert({
      provider: 'asaas',
      provider_event_id: event.provider_event_id,
      event_type: event.event_type,
      provider_object_type: event.provider_object_type,
      provider_object_id: event.provider_object_id,
      processing_status: 'pending',
      payload: event.payload
    }).select('id,provider_event_id,event_type,provider_object_type,provider_object_id,payload,processing_status,processing_attempts').maybeSingle();

    if (inserted.error && String(inserted.error.code || '') !== '23505') throw inserted.error;
    duplicate = String(inserted.error?.code || '') === '23505';
    storedEvent = inserted.data;
    if (duplicate) {
      const existing = await supabase
        .from('billing_webhook_events')
        .select('id,provider_event_id,event_type,provider_object_type,provider_object_id,payload,processing_status,processing_attempts')
        .eq('provider', 'asaas')
        .eq('provider_event_id', event.provider_event_id)
        .maybeSingle();
      if (existing.error) throw existing.error;
      storedEvent = existing.data;
    }
    if (!storedEvent) throw new Error('Evento Asaas nao foi persistido.');
    if (['processed', 'ignored'].includes(storedEvent.processing_status)) {
      return NextResponse.json({ received: true, duplicate: true, processing_status: storedEvent.processing_status });
    }

    const nextAttempt = Number(storedEvent.processing_attempts || 0) + 1;
    const claimed = await supabase
      .from('billing_webhook_events')
      .update({ processing_attempts: nextAttempt })
      .eq('id', storedEvent.id)
      .eq('processing_attempts', Number(storedEvent.processing_attempts || 0))
      .in('processing_status', ['pending', 'failed'])
      .select('id,provider_event_id,event_type,provider_object_type,provider_object_id,payload,processing_status,processing_attempts')
      .maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) {
      return NextResponse.json({
        received: true,
        duplicate: true,
        processing_status: storedEvent.processing_status
      });
    }
    storedEvent = claimed.data;

    const processed = await processStoredAsaasWebhookEvent(supabase, storedEvent, {
      syntheticStoreIds: asaasSandbox.syntheticStoreIds
    });
    const { error: updateError } = await supabase
      .from('billing_webhook_events')
      .update({
        processing_status: processed.processing_status,
        processed_at: new Date().toISOString(),
        last_error: null
      })
      .eq('id', storedEvent.id);
    if (updateError) throw updateError;

    return NextResponse.json({
      received: true,
      duplicate,
      processing_status: processed.processing_status
    });
  } catch (error: any) {
    if (missingBillingFoundation(error)) {
      return NextResponse.json({ error: 'Billing ainda nao provisionado.' }, { status: 503 });
    }
    const response = publicError(error, 'Falha ao receber evento do Asaas.');
    if (storedEvent?.id) {
      await supabase
        .from('billing_webhook_events')
        .update({
          processing_status: 'failed',
          last_error: response.message.slice(0, 1000)
        })
        .eq('id', storedEvent.id);
    }
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
