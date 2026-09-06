import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/server/masterApi';
import { createAutocarStructuredResponse, autocarOpenAiConfigured } from '@/lib/server/autocar/client';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import {
  AUTOCAR_DEV_REF,
  autocarProjectRefFromUrl,
  autocarRuntimePublicDescriptor
} from '@/lib/server/autocar/runtimeEnvironment';
import { evaluateFollowUpEvent } from '@/lib/server/autocar/smartFollowUp';
import { buildAutocarVehiclePresentationV2 } from '@/lib/server/autocar/vehiclePresentationV2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUTHORIZED_BRANCH = 'fix/autocar-generative-conversation-orchestration';
const RUN_MARKER = 'AUTOCAR-HOMOLOGACAO-GENERATIVA-69cdb9c1';
const SYNTHETIC_STORE_ID = '69000000-0000-4000-8000-000000000001';
const NORMAL_EVENT_ID = '69000000-0000-4000-8000-000000000008';
const FAIL_CLOSED_EVENT_ID = '69000000-0000-4000-8000-000000000009';

const vehicleOpeningSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { text: { type: 'string' } },
  required: ['text']
};

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ...body, dry_run: true, external_execution: false }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

function verifyIsolation() {
  if (process.env.VERCEL_ENV !== 'preview') throw new Error('Harness permitido somente em Vercel Preview.');
  if (process.env.VERCEL_GIT_COMMIT_REF !== AUTHORIZED_BRANCH) throw new Error('Branch não autorizada para o harness.');
  if (process.env.AUTOCAR_SMART_FOLLOW_UP_DRY_RUN_ENABLED !== 'true') throw new Error('Dry-run obrigatório.');

  const crmRef = autocarProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  const autocar = autocarRuntimePublicDescriptor(process.env);
  if (crmRef !== AUTOCAR_DEV_REF || autocar.project_ref !== AUTOCAR_DEV_REF) {
    throw new Error('Isolamento DEV inválido; execução bloqueada.');
  }

  return {
    crm_project_ref: crmRef,
    autocar_project_ref: autocar.project_ref,
    runtime_environment: autocar.runtime_environment,
    openai_configured: autocarOpenAiConfigured()
  };
}

const groundedVehicles = [
  {
    id: 'synthetic-vehicle-69cdb9c1-a',
    brand: 'Marca Sintética',
    model: 'Modelo Horizonte',
    version: 'Demo 1.0',
    year: '2025/2026',
    mileage: '12 km sintéticos',
    fuel: 'Flex',
    transmission: 'Automático',
    price: 101010,
    primary_photo: 'https://example.com/autocar-synthetic-69cdb9c1-a.jpg'
  },
  {
    id: 'synthetic-vehicle-69cdb9c1-b',
    brand: 'Marca Sintética',
    model: 'Modelo Aurora',
    version: 'Demo 2.0',
    year: '2024/2025',
    mileage: '34 km sintéticos',
    fuel: 'Flex',
    transmission: 'Automático',
    price: 202020,
    primary_photo: 'https://example.com/autocar-synthetic-69cdb9c1-b.jpg'
  }
];

async function runVehiclePresentation() {
  const generated = await createAutocarStructuredResponse({
    task: 'commercial_reply',
    instructions: [
      'Gere uma abertura curta, contextual e totalmente generativa em português do Brasil para apresentar exatamente dois veículos sintéticos.',
      'Use somente os fatos fornecidos. Não use template, fallback fixo nem a frase “Separei 2 opções para você comparar”.',
      'Não invente disponibilidade, condição comercial, financiamento, localização ou características.'
    ].join(' '),
    input: { marker: RUN_MARKER, vehicles: groundedVehicles, external_execution: false },
    schemaName: 'autocar_vehicle_presentation_v2_homologation',
    schema: vehicleOpeningSchema,
    maxOutputTokens: 300
  });
  const opening = String(generated.parsed?.text || '').replace(/\s+/g, ' ').trim();
  const scenarioA = buildAutocarVehiclePresentationV2({ referencedVehicles: groundedVehicles, aiResponse: opening });
  const scenarioB = buildAutocarVehiclePresentationV2({ referencedVehicles: groundedVehicles, aiResponse: '' });
  return { generated_opening: opening, scenario_a: scenarioA, scenario_b: scenarioB };
}

async function runFollowUp(phase: 'follow_up' | 'fail_closed') {
  const autocar = getAutocarDevClient();
  const production = getAdminClient();
  const eventId = phase === 'follow_up' ? NORMAL_EVENT_ID : FAIL_CLOSED_EVENT_ID;
  const { data: event, error } = await autocar.from('ai_follow_up_events').select('*').eq('id', eventId).maybeSingle();
  if (error) throw error;
  if (!event || event.store_id !== SYNTHETIC_STORE_ID || !String(event.idempotency_key || '').includes('69cdb9c1')) {
    throw new Error('Evento sintético autorizado não encontrado.');
  }

  const decision = await evaluateFollowUpEvent({
    production,
    autocar,
    event,
    ...(phase === 'fail_closed'
      ? { generateText: async () => { throw new Error('Falha sintética controlada de geração.'); } }
      : {})
  });
  const status = decision.decision === 'would_send'
    ? 'dry_run_ready'
    : decision.decision === 'cancelled'
      ? 'cancelled'
      : 'dry_run_blocked';
  const { error: updateError } = await autocar.from('ai_follow_up_events').update({ status, last_decision: decision }).eq('id', eventId).eq('store_id', SYNTHETIC_STORE_ID);
  if (updateError) throw updateError;
  const { error: auditError } = await autocar.from('ai_follow_up_event_audit').insert({ event_id: eventId, event_status: status, action: 'dry_run_evaluated', detail: { ...decision, homologation_marker: RUN_MARKER } });
  if (auditError) throw auditError;
  return { event_id: eventId, status, ...decision };
}

export async function GET(request: Request) {
  try {
    const isolation = verifyIsolation();
    const url = new URL(request.url);
    if (url.searchParams.get('run') !== RUN_MARKER) return response({ error: 'Marcador de homologação inválido.' }, 403);
    const phase = url.searchParams.get('phase');
    if (phase === 'isolation') return response({ success: true, phase, isolation });
    if (phase === 'vehicle') return response({ success: true, phase, isolation, vehicle_presentation: await runVehiclePresentation() });
    if (phase === 'follow_up' || phase === 'fail_closed') {
      return response({ success: true, phase, isolation, result: await runFollowUp(phase) });
    }
    return response({ error: 'Fase inválida.' }, 400);
  } catch (error: any) {
    return response({ error: String(error?.message || error).slice(0, 300) }, 500);
  }
}
