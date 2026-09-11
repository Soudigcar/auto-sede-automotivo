import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { safeErrorMessage } from '@/lib/safeErrorMessage';
import {
  assertCommercialTrainingCoachPreviewScope,
  minimizeCommercialCoachTextV3,
  structureCommercialCoachingV3
} from '@/lib/server/autocar/commercialTrainingCoachV3';
import { sanitizeAutocarOpenAiFailure } from '@/lib/server/autocar/openAiDiagnostics';
import { loadAutocarReplayMessagesV2 } from '@/lib/server/autocar/replayMessageHistoryV2';
import { simulateCommercialTrainingV3Preview } from '@/lib/server/autocar/trainingLab';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CorrectionPreviewStage =
  | 'guard'
  | 'auth'
  | 'parse_request'
  | 'load_store'
  | 'load_selected_reply'
  | 'load_replay'
  | 'structure_coaching'
  | 'generate_retest'
  | 'respond';

function rawPayload(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, any>;
    } catch {
      return {};
    }
  }
  return {};
}

function isAutocarOutbound(message: any) {
  if (String(message?.direction || '') !== 'outbound') return false;
  const payload = rawPayload(message?.raw_payload);
  const source = String(payload.metric_sender_source || payload.sender_source || '').toLowerCase();
  return Boolean(
    payload.autocar_live_pilot === true
    || payload.autocar_audio_reply === true
    || payload.autocar_follow_up_autopilot === true
    || payload.autocar_human_handoff === true
    || source.includes('autocar')
  );
}

function timestampOf(message: any) {
  return String(message?.sent_at || message?.created_at || '').trim();
}

async function loadSelectedAutocarAndInbound(input: {
  production: any;
  storeId: string;
  conversationId: string;
  autocarMessageId: string;
}) {
  const select = 'id,direction,message_type,body,raw_payload,sent_at,created_at';
  const { data: selected, error: selectedError } = await input.production
    .from('whatsapp_messages')
    .select(select)
    .eq('store_id', input.storeId)
    .eq('conversation_id', input.conversationId)
    .eq('id', input.autocarMessageId)
    .maybeSingle();
  if (selectedError) throw selectedError;
  if (!selected || !isAutocarOutbound(selected)) {
    throw new Error('Selecione uma mensagem histórica identificada como resposta da AUTOCAR.');
  }

  const selectedAt = timestampOf(selected);
  if (!selectedAt) throw new Error('A resposta AUTOCAR selecionada não possui timestamp utilizável para replay seguro.');

  let query = input.production
    .from('whatsapp_messages')
    .select(select)
    .eq('store_id', input.storeId)
    .eq('conversation_id', input.conversationId);
  if (selected.sent_at) query = query.lte('sent_at', selected.sent_at);
  else query = query.lte('created_at', selected.created_at);

  const { data: preceding, error: precedingError } = await query
    .order('sent_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);
  if (precedingError) throw precedingError;

  const rows = (preceding || []).filter((row: any) => String(row.id) !== String(selected.id));
  const inboundIndex = rows.findIndex((row: any) => String(row.direction || '') === 'inbound');
  if (inboundIndex < 0) throw new Error('Não foi encontrada uma fala do cliente antes dessa resposta da AUTOCAR.');

  const inbound = rows[inboundIndex];
  const between = rows.slice(0, inboundIndex);
  const humanBetween = between.find((row: any) => String(row.direction || '') === 'outbound' && !isAutocarOutbound(row));
  const otherAutocarBetween = between.find((row: any) => isAutocarOutbound(row));
  if (humanBetween || otherAutocarBetween) {
    throw new Error('A resposta selecionada não é a primeira resposta direta da AUTOCAR após a fala anterior do cliente. Escolha a resposta AUTOCAR imediatamente ligada ao momento que deseja treinar.');
  }

  return { selected, inbound };
}

export async function POST(request: Request) {
  let stage: CorrectionPreviewStage = 'guard';
  try {
    const guard = assertCommercialTrainingCoachPreviewScope();

    stage = 'auth';
    const production = getAdminClient();
    const profile = await requireMaster(request, production);
    if (!profile) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    stage = 'parse_request';
    const body = await request.json().catch(() => ({}));
    const storeId = cleanText(body?.store_id, 100);
    const conversationId = cleanText(body?.conversation_id, 100);
    const autocarMessageId = cleanText(body?.autocar_message_id, 100);
    const correctedResponse = cleanText(body?.corrected_response, 6000);
    const feedback = cleanText(body?.trainer_feedback, 6000);
    const scope = body?.scope === 'store' ? 'store' : 'global';

    if (!storeId || !conversationId || !autocarMessageId) {
      return NextResponse.json({ error: 'Loja, conversa e resposta AUTOCAR são obrigatórias.' }, { status: 400 });
    }
    if (!correctedResponse && !feedback) {
      return NextResponse.json({ error: 'Edite a cópia da resposta da AUTOCAR ou explique a correção desejada.' }, { status: 400 });
    }

    stage = 'load_store';
    const { data: store, error: storeError } = await production.from('stores')
      .select('id,store_name')
      .eq('id', storeId)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store) return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 });

    stage = 'load_selected_reply';
    const { selected, inbound } = await loadSelectedAutocarAndInbound({
      production,
      storeId,
      conversationId,
      autocarMessageId
    });

    stage = 'load_replay';
    const replay = await loadAutocarReplayMessagesV2({
      productionSupabase: production,
      storeId,
      conversationId,
      messageId: String(inbound.id),
      limit: 12
    });

    const conversationContext = replay.messages
      .map((message: any) => {
        const speaker = String(message.direction || '') === 'inbound' ? 'CLIENTE' : (isAutocarOutbound(message) ? 'AUTOCAR' : 'LOJA/HUMANO');
        return `${speaker}: ${minimizeCommercialCoachTextV3(message.body, 1600)}`;
      })
      .filter(Boolean);

    const originalResponse = minimizeCommercialCoachTextV3(selected.body, 6000);
    const minimizedCorrection = minimizeCommercialCoachTextV3(correctedResponse, 6000);

    stage = 'structure_coaching';
    const coaching = await structureCommercialCoachingV3({
      feedback,
      correctedResponse: minimizedCorrection,
      scope,
      storeName: scope === 'store' ? String(store.store_name || '') : null,
      currentInbound: String(replay.currentInbound.body || ''),
      currentAutocarResponse: originalResponse,
      recentConversation: conversationContext
    });

    stage = 'generate_retest';
    const retest = await simulateCommercialTrainingV3Preview({
      customerInput: String(replay.currentInbound.body || ''),
      situation: coaching.lesson.situation,
      scope,
      storeId: scope === 'store' ? storeId : null,
      intent: coaching.lesson.intent,
      technique: coaching.lesson.technique,
      referenceResponse: minimizedCorrection || null,
      objective: coaching.lesson.objective,
      nextAction: coaching.lesson.next_action,
      restrictions: coaching.lesson.restrictions,
      examples: coaching.lesson.examples,
      conversationContext
    });

    stage = 'respond';
    return NextResponse.json({
      success: true,
      guard,
      source: {
        store: { id: store.id, name: store.store_name },
        conversation_id: conversationId,
        customer_message_id: String(replay.currentInbound.id),
        customer_message: minimizeCommercialCoachTextV3(replay.currentInbound.body, 4000),
        autocar_message_id: String(selected.id),
        original_autocar_response: originalResponse,
        historical_message_immutable: true,
        future_messages_excluded_from_context: replay.historical
      },
      trainer: {
        corrected_response: minimizedCorrection,
        feedback: minimizeCommercialCoachTextV3(feedback, 6000),
        corrected_response_is_non_binding_example: true
      },
      coaching,
      retest,
      no_external_execution: true,
      external_execution: false,
      persistence: false
    });
  } catch (error: unknown) {
    const diagnostic = sanitizeAutocarOpenAiFailure(error, 'structured_response');
    console.error('AUTOCAR_TRAINING_CORRECTION_PREVIEW_FAILURE', JSON.stringify({
      stage,
      error_name: error instanceof Error ? error.name : 'UnknownError',
      openai_stage: diagnostic.stage,
      category: diagnostic.category,
      status: diagnostic.status,
      code: diagnostic.code,
      request_id: diagnostic.request_id
    }));
    return NextResponse.json({
      error: safeErrorMessage(error, 'Não foi possível corrigir e retestar esta resposta no Preview.'),
      failure_stage: stage,
      external_execution: false,
      persistence: false
    }, { status: 500 });
  }
}
