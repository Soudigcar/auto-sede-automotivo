import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { safeErrorMessage } from '@/lib/safeErrorMessage';
import {
  archiveTrainingScenario,
  listTrainingLab,
  prepareTrainingScenarioForApproval,
  reviewTrainingSimulation,
  saveTrainingScenario,
  simulateTraining
} from '@/lib/server/autocar/trainingLab';
import { ensureAutocarDevStore, getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { getAutocarRuntimePublicStatus } from '@/lib/server/autocar/runtimeEnvironment';
import {
  approveTrainingScenario,
  publishTrainingScenario,
  readTrainingGovernance,
  unpublishTrainingScenario
} from '@/lib/server/autocar/trainingPublicationGovernance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function stringList(value: unknown, max = 20) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, max);
  }
  if (typeof value === 'string') {
    return value.split(/[\n,;]+/).map((item) => cleanText(item, 500)).filter(Boolean).slice(0, max);
  }
  return [];
}

async function masterContext(request: Request) {
  const production = getAdminClient();
  const profile = await requireMaster(request, production);
  if (!profile) return null;
  return { production, profile };
}

async function runtimeResponse(extra: Record<string, unknown> = {}) {
  const runtimeStatus = await getAutocarRuntimePublicStatus();
  return {
    success: true,
    environment: runtimeStatus.runtime_environment,
    runtime: runtimeStatus,
    ...extra
  };
}

export async function GET(request: Request) {
  try {
    const context = await masterContext(request);
    if (!context) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const [data, runtimeStatus] = await Promise.all([
      listTrainingLab(),
      getAutocarRuntimePublicStatus()
    ]);
    const governance = await readTrainingGovernance(
      getAutocarDevClient(),
      (data.scenarios || []).map((scenario: any) => String(scenario.id))
    );
    const scenarios = (data.scenarios || []).map((scenario: any) => ({
      ...scenario,
      ...(governance.get(String(scenario.id)) || {
        publication_status: 'unpublished',
        approved_at: null,
        approved_by_profile_id: null,
        published_at: null,
        published_by_profile_id: null
      })
    }));

    return NextResponse.json({
      success: true,
      environment: runtimeStatus.runtime_environment,
      runtime: runtimeStatus,
      scenarios,
      simulations: data.simulations || []
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: safeErrorMessage(error, 'Não foi possível carregar o laboratório AUTOCAR.') }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await masterContext(request);
    if (!context) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const action = cleanText(body?.action, 60);
    const autocar = getAutocarDevClient();

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
        status: 'draft',
        actorProfileId: context.profile.id
      }, cleanText(body?.scenario_id, 100) || null);
      return NextResponse.json(await runtimeResponse({ scenario, governance: 'draft_unpublished' }));
    }

    if (action === 'approve-scenario') {
      const scenarioId = cleanText(body?.scenario_id, 100);
      if (!scenarioId) return NextResponse.json({ error: 'Aprendizado obrigatório.' }, { status: 400 });
      await prepareTrainingScenarioForApproval(scenarioId, context.profile.id);
      const scenario = await approveTrainingScenario(autocar, scenarioId, context.profile.id);
      return NextResponse.json(await runtimeResponse({ scenario, governance: 'approved_unpublished' }));
    }

    if (action === 'publish-scenario') {
      if (cleanText(body?.confirmation, 80) !== 'PUBLICAR_GLOBAL') {
        return NextResponse.json({ error: 'Confirmação explícita de publicação global obrigatória.' }, { status: 400 });
      }
      const scenarioId = cleanText(body?.scenario_id, 100);
      if (!scenarioId) return NextResponse.json({ error: 'Aprendizado obrigatório.' }, { status: 400 });
      const scenario = await publishTrainingScenario(autocar, scenarioId, context.profile.id);
      return NextResponse.json(await runtimeResponse({ scenario, governance: 'approved_published' }));
    }

    if (action === 'unpublish-scenario') {
      const scenarioId = cleanText(body?.scenario_id, 100);
      if (!scenarioId) return NextResponse.json({ error: 'Aprendizado obrigatório.' }, { status: 400 });
      const scenario = await unpublishTrainingScenario(autocar, scenarioId, context.profile.id);
      return NextResponse.json(await runtimeResponse({ scenario, governance: 'approved_unpublished' }));
    }

    if (action === 'simulate') {
      const storeId = cleanText(body?.store_id, 100) || null;
      if (storeId) {
        const { data: store, error } = await context.production
          .from('stores')
          .select('id,store_name,slug,status,portal_enabled')
          .eq('id', storeId)
          .maybeSingle();
        if (error) throw error;
        if (!store) return NextResponse.json({ error: 'Loja não encontrada no CRM.' }, { status: 404 });
        await ensureAutocarDevStore(autocar, store);
      }

      const result = await simulateTraining({
        customerInput: cleanText(body?.customer_input, 5000),
        storeId,
        actorProfileId: context.profile.id
      });
      return NextResponse.json(await runtimeResponse(result));
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
        saveAsLearning: false,
        actorProfileId: context.profile.id
      });

      let learning = null;
      if (Boolean(body?.save_as_learning) && evaluation !== 'rejected') {
        learning = await saveTrainingScenario({
          situation: cleanText(body?.situation, 4000) || String(result.simulation?.customer_input || '').trim(),
          intent: cleanText(body?.intent, 240) || null,
          idealResponse: cleanText(body?.corrected_response, 6000) || String(result.simulation?.corrected_response || result.simulation?.ai_response || '').trim(),
          objective: cleanText(body?.objective, 2000) || null,
          nextAction: cleanText(body?.next_action, 2000) || String(result.simulation?.next_action || '').trim() || null,
          restrictions: stringList(body?.restrictions),
          tags: stringList(body?.tags, 30),
          examples: [String(result.simulation?.customer_input || '').trim()].filter(Boolean),
          priority: Number(body?.priority || 100),
          status: 'draft',
          actorProfileId: context.profile.id
        });
      }

      return NextResponse.json(await runtimeResponse({ ...result, learning, learning_status: learning ? 'draft_unpublished' : null }));
    }

    return NextResponse.json({ error: 'Ação de treinamento inválida.' }, { status: 400 });
  } catch (error: unknown) {
    const message = safeErrorMessage(error, 'Não foi possível concluir o treinamento AUTOCAR.');
    console.error('Master AUTOCAR training error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await masterContext(request);
    if (!context) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const scenarioId = cleanText(body?.scenario_id, 100);
    if (!scenarioId) return NextResponse.json({ error: 'Aprendizado obrigatório.' }, { status: 400 });
    await archiveTrainingScenario(scenarioId, context.profile.id);
    return NextResponse.json(await runtimeResponse({ governance: 'archived_unpublished' }));
  } catch (error: unknown) {
    return NextResponse.json({ error: safeErrorMessage(error, 'Não foi possível arquivar o aprendizado.') }, { status: 500 });
  }
}
