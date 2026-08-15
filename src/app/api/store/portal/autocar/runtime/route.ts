import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import {
  completeAutocarShadowClaim,
  failAutocarShadowClaim,
  markAutocarHumanActive,
  prepareAutocarSafeInbound,
  resumeAutocarConversation
} from '@/lib/server/autocar/safeRuntime';
import { generateAutocarShadowReply } from '@/lib/server/autocar/shadowReply';
import { evaluateAutocarOperationalShadowPolicy } from '@/lib/server/autocar/operationalPolicy';
import { resolveBookingContext } from '@/lib/server/autocar/bookingContextResolver';
import { evaluateBookingConfirmationGuard } from '@/lib/server/autocar/bookingConfirmationGuard';
import type { AutocarCapability, AutocarPolicyDecision } from '@/lib/server/autocar/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function contextFor(request: Request, slug: string) {
  const context = await authorizeStorePortal(request, slug);
  if ('error' in context) return context;
  if (!context.permissions.includes('view_autocar')) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para visualizar a AUTOCAR.' }, { status: 403 }) } as const;
  }
  return context;
}

async function canonicalConversation(context: any, conversationId: string) {
  const { data, error } = await context.supabase.from('whatsapp_conversations')
    .select('id,store_id,whatsapp_number_id,lead_id')
    .eq('id', conversationId)
    .eq('store_id', context.store.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Conversa não encontrada nesta loja.');
  return data;
}

function bookingDecision(bookingGuard: any): { decision: AutocarPolicyDecision; simulation: string } {
  if (bookingGuard?.state === 'READY_TO_SCHEDULE') {
    return {
      decision: {
        effect: 'allow',
        source: 'operational_guard',
        reason: 'Confirmação explícita recebida e Calendário revalidado imediatamente antes da ação simulada.'
      },
      simulation: 'ready_to_schedule'
    };
  }
  if (bookingGuard?.state === 'SLOT_UNAVAILABLE') {
    return {
      decision: {
        effect: 'deny',
        source: 'operational_guard',
        reason: 'O cliente confirmou, mas o horário ficou indisponível na revalidação do Calendário.'
      },
      simulation: 'slot_unavailable'
    };
  }
  return {
    decision: {
      effect: 'deny',
      source: 'operational_guard',
      reason: 'Aguardando confirmação explícita do cliente antes de qualquer agendamento.'
    },
    simulation: 'waiting_confirmation'
  };
}

function finalizeOperationalShadow(shadow: any, bookingGuard: any) {
  const preview = shadow?.operational_preview || {};
  const existing = Array.isArray(shadow?.proposed_actions) ? shadow.proposed_actions : [];
  const byCapability = new Map<string, any>();

  for (const action of existing) {
    const capability = String(action?.capability || '') as AutocarCapability;
    if (!capability) continue;
    if (capability === 'schedule_visit' || capability === 'schedule_test_drive') {
      const guarded = bookingDecision(bookingGuard);
      byCapability.set(capability, { ...action, capability, ...guarded });
      continue;
    }
    const decision = evaluateAutocarOperationalShadowPolicy({ capability, operationalPreview: preview });
    byCapability.set(capability, {
      ...action,
      capability,
      decision,
      simulation: decision.effect === 'allow' ? 'would_execute' : decision.effect
    });
  }

  const inferred: Array<{ capability: AutocarCapability; reason: string }> = [];
  if (preview?.plan?.needs_photos) inferred.push({ capability: 'send_photos', reason: 'Cliente solicitou fotos do veículo identificado no estoque.' });
  if (preview?.plan?.needs_location) inferred.push({ capability: 'send_location', reason: 'Cliente solicitou a localização da loja.' });
  if (preview?.plan?.needs_availability || bookingGuard?.state !== 'NOT_APPLICABLE') {
    inferred.push({
      capability: bookingGuard?.booking_type === 'test_drive' ? 'schedule_test_drive' : 'schedule_visit',
      reason: 'Intenção de agendamento detectada; execução condicionada à confirmação explícita e revalidação do Calendário.'
    });
  }

  for (const action of inferred) {
    if (action.capability === 'schedule_visit' || action.capability === 'schedule_test_drive') {
      const guarded = bookingDecision(bookingGuard);
      byCapability.set(action.capability, { capability: action.capability, reason: action.reason, ...guarded });
      continue;
    }
    const decision = evaluateAutocarOperationalShadowPolicy({ capability: action.capability, operationalPreview: preview });
    byCapability.set(action.capability, {
      capability: action.capability,
      reason: action.reason,
      decision,
      simulation: decision.effect === 'allow' ? 'would_execute' : decision.effect
    });
  }

  const finalPreview = bookingGuard?.revalidated && bookingGuard?.revalidation
    ? { ...preview, availability_revalidation: bookingGuard.revalidation }
    : preview;

  return {
    ...shadow,
    operational_preview: finalPreview,
    booking_guard: bookingGuard,
    proposed_actions: Array.from(byCapability.values()),
    operational_policy_version: 'autocar-operational-policy-v1',
    booking_guard_version: 'autocar-booking-confirmation-v1',
    no_external_execution: true
  };
}

async function processShadowInbound(context: any, conversation: any, message: any) {
  const prepared = await prepareAutocarSafeInbound({
    productionSupabase: context.supabase,
    storeId: context.store.id,
    conversationId: conversation.id,
    whatsappNumberId: conversation.whatsapp_number_id,
    leadId: conversation.lead_id,
    messageId: message.id,
    messageType: message.message_type
  });

  if (prepared.duplicate || !prepared.ready || !prepared.claim?.id) {
    return { success: true, shadow_mode: true, no_external_execution: true, result: prepared };
  }

  try {
    const [generated, bookingContext] = await Promise.all([
      generateAutocarShadowReply({
        productionSupabase: context.supabase,
        storeId: context.store.id,
        conversationId: conversation.id
      }),
      resolveBookingContext({
        productionSupabase: context.supabase,
        storeId: context.store.id,
        conversationId: conversation.id
      })
    ]);

    const bookingGuard = await evaluateBookingConfirmationGuard({
      productionSupabase: context.supabase,
      storeId: context.store.id,
      leadId: conversation.lead_id,
      bookingContext
    });

    const shadow = finalizeOperationalShadow(generated, bookingGuard);
    const completedClaim = await completeAutocarShadowClaim({
      storeId: context.store.id,
      claimId: prepared.claim.id,
      shadow: shadow as unknown as Record<string, unknown>
    });
    return {
      success: true,
      shadow_mode: true,
      no_external_execution: true,
      result: { ...prepared, claim: completedClaim, shadow }
    };
  } catch (shadowError: any) {
    const failedClaim = await failAutocarShadowClaim({
      storeId: context.store.id,
      claimId: prepared.claim.id,
      error: shadowError
    });
    return {
      error: shadowError?.message || 'Falha ao gerar resposta Shadow.',
      shadow_mode: true,
      no_external_execution: true,
      claim: failedClaim
    };
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const conversationId = cleanText(url.searchParams.get('conversation_id'), 100);
    const context = await contextFor(request, slug);
    if ('error' in context) return context.error;
    if (!conversationId) return NextResponse.json({ error: 'Conversa obrigatória.' }, { status: 400 });

    await canonicalConversation(context, conversationId);
    const autocar = getAutocarDevClient();
    const [runtimeState, claims] = await Promise.all([
      autocar.from('ai_runtime_conversations').select('*')
        .eq('store_id', context.store.id).eq('production_conversation_id', conversationId).maybeSingle(),
      autocar.from('ai_runtime_message_claims').select('*')
        .eq('store_id', context.store.id).eq('production_conversation_id', conversationId)
        .order('created_at', { ascending: false }).limit(20)
    ]);
    if (runtimeState.error) throw runtimeState.error;
    if (claims.error) throw claims.error;

    return NextResponse.json({
      success: true,
      shadow_mode: true,
      no_external_execution: true,
      runtime: runtimeState.data || null,
      claims: claims.data || []
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível consultar o runtime AUTOCAR.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = cleanText(body?.slug, 120);
    const conversationId = cleanText(body?.conversation_id, 100);
    const action = cleanText(body?.action, 60).toLowerCase();
    const context = await contextFor(request, slug);
    if ('error' in context) return context.error;
    if (!conversationId) return NextResponse.json({ error: 'Conversa obrigatória.' }, { status: 400 });

    const conversation = await canonicalConversation(context, conversationId);

    if (action === 'process-inbound' || action === 'process-latest-inbound') {
      if (!context.permissions.includes('manage_autocar')) {
        return NextResponse.json({ error: 'Somente Gestor ou Master pode executar o Shadow Mode.' }, { status: 403 });
      }

      let message: any = null;
      if (action === 'process-latest-inbound') {
        const { data, error } = await context.supabase.from('whatsapp_messages')
          .select('id,direction,message_type,sent_at,created_at')
          .eq('store_id', context.store.id)
          .eq('conversation_id', conversation.id)
          .eq('direction', 'inbound')
          .order('sent_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        message = data;
      } else {
        const messageId = cleanText(body?.message_id, 100);
        if (!messageId) return NextResponse.json({ error: 'Mensagem obrigatória.' }, { status: 400 });
        const { data, error } = await context.supabase.from('whatsapp_messages')
          .select('id,direction,message_type,sent_at,created_at')
          .eq('id', messageId)
          .eq('store_id', context.store.id)
          .eq('conversation_id', conversation.id)
          .maybeSingle();
        if (error) throw error;
        message = data;
      }

      if (!message || message.direction !== 'inbound') {
        return NextResponse.json({ error: 'A conversa não possui uma mensagem inbound real para testar.' }, { status: 400 });
      }

      const result = await processShadowInbound(context, conversation, message);
      return NextResponse.json(result, { status: result.error ? 500 : 200 });
    }

    if (action === 'human-active') {
      if (!context.permissions.includes('manage_autocar')) {
        return NextResponse.json({ error: 'Somente Gestor ou Master pode assumir a conversa pelo controle AUTOCAR.' }, { status: 403 });
      }
      const state = await markAutocarHumanActive({
        productionSupabase: context.supabase,
        storeId: context.store.id,
        conversationId: conversation.id,
        whatsappNumberId: conversation.whatsapp_number_id,
        leadId: conversation.lead_id,
        messageId: cleanText(body?.message_id, 100) || null,
        profileId: context.profile.id,
        source: 'inbox'
      });
      return NextResponse.json({ success: true, shadow_mode: true, no_external_execution: true, runtime: state });
    }

    if (action === 'resume') {
      if (!context.permissions.includes('manage_autocar')) {
        return NextResponse.json({ error: 'Somente Gestor ou Master pode reativar a AUTOCAR nesta conversa.' }, { status: 403 });
      }
      const state = await resumeAutocarConversation({
        productionSupabase: context.supabase,
        storeId: context.store.id,
        conversationId: conversation.id,
        whatsappNumberId: conversation.whatsapp_number_id,
        leadId: conversation.lead_id
      });
      return NextResponse.json({ success: true, shadow_mode: true, no_external_execution: true, runtime: state });
    }

    return NextResponse.json({ error: 'Ação de runtime AUTOCAR inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível executar o runtime AUTOCAR.' }, { status: 500 });
  }
}
