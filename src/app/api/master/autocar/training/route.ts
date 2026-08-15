import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import {
  archiveTrainingScenario,
  listTrainingLab,
  reviewTrainingSimulation,
  saveTrainingScenario,
  simulateTraining
} from '@/lib/server/autocar/trainingLab';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function stringList(value: unknown, max = 20) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, max);
  if (typeof value === 'string') return value.split(/[\n,;]+/).map((item) => cleanText(item, 500)).filter(Boolean).slice(0, max);
  return [];
}

async function master(request: Request) {
  const production = getAdminClient();
  const profile = await requireMaster(request, production);
  if (!profile) return null;
  return profile;
}

export async function GET(request: Request) {
  try {
    const profile = await master(request);
    if (!profile) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    const data = await listTrainingLab();
    return NextResponse.json({ success: true, environment: 'autocar-dev', ...data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o laboratório AUTOCAR.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await master(request);
    if (!profile) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const action = cleanText(body?.action, 60);

    if (action === 'save-scenario') {
      const scenario = await saveTrainingScenario({
        situation: cleanText(body?.situation, 4000),
        intent: cleanText(body?.intent, 240) || null,
        idealResponse: cleanText(body?.ideal_response, 6000),
        objective: cleanText(body?.objective, 2000) || null,
        nextAction: cleanText(body?.next_action, 2000) || null,
        restrictions: stringList(body?.restrictions),
        tags: stringList(body?.tags, 30),
        examples: stringList(body?.examples, 20),
        priority: Number(body?.priority || 100),
        status: body?.status === 'approved' ? 'approved' : 'draft',
        actorProfileId: profile.id
      }, cleanText(body?.scenario_id, 100) || null);
      return NextResponse.json({ success: true, scenario });
    }

    if (action === 'simulate') {
      const result = await simulateTraining({
        customerInput: cleanText(body?.customer_input, 5000),
        storeId: cleanText(body?.store_id, 100) || null,
        actorProfileId: profile.id
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'review-simulation') {
      const evaluation = body?.evaluation;
      if (!['approved', 'corrected', 'rejected'].includes(evaluation)) {
        return NextResponse.json({ error: 'Avaliação inválida.' }, { status: 400 });
      }
      const result = await reviewTrainingSimulation({
        simulationId: cleanText(body?.simulation_id, 100),
        evaluation,
        correctedResponse: cleanText(body?.corrected_response, 6000) || null,
        saveAsLearning: Boolean(body?.save_as_learning),
        situation: cleanText(body?.situation, 4000) || null,
        intent: cleanText(body?.intent, 240) || null,
        objective: cleanText(body?.objective, 2000) || null,
        nextAction: cleanText(body?.next_action, 2000) || null,
        restrictions: stringList(body?.restrictions),
        tags: stringList(body?.tags, 30),
        actorProfileId: profile.id
      });
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ error: 'Ação de treinamento inválida.' }, { status: 400 });
  } catch (error: any) {
    console.error('Master AUTOCAR training error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Não foi possível concluir o treinamento AUTOCAR.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await master(request);
    if (!profile) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const scenarioId = cleanText(body?.scenario_id, 100);
    if (!scenarioId) return NextResponse.json({ error: 'Aprendizado obrigatório.' }, { status: 400 });
    await archiveTrainingScenario(scenarioId, profile.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível arquivar o aprendizado.' }, { status: 500 });
  }
}
