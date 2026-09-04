import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authorizeStorePortal, canAccessStoreConversation } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { markAutocarHumanActive } from '@/lib/server/autocar/safeRuntime';
import { processAutocarShadowInbound } from '@/lib/server/autocar/autoShadow';
import { evaluateAutocarResumeRequest, isProtectedAutocarResumeState } from '@/lib/server/autocar/resumeGovernance';

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
  if (!data) return null;

  let lead: any = null;
  if (data.lead_id) {
    const { data: leadRow, error: leadError } = await context.supabase.from('leads')
      .select('id,assigned_store_id,assigned_user_id')
      .eq('id', data.lead_id)
      .maybeSingle();
    if (leadError) throw leadError;
    lead = leadRow;
  }

  if (!canAccessStoreConversation(context.profile, context.role, data, lead)) return null;
  return data;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const conversationId = cleanText(url.searchParams.get('conversation_id'), 100);
    const context = await contextFor(request, slug);
    if ('error' in context) return context.error;
    if (!conversationId) return NextResponse.json({ error: 'Conversa obrigatória.' }, { status: 400 });

    const conversation = await canonicalConversation(context, conversationId);
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada ou fora da sua carteira.' }, { status: 404 });
    }
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

    const currentRuntime = runtimeState.data || null;
    return NextResponse.json({
      success: true,
      shadow_mode: true,
      no_external_execution: true,
      can_manage_autocar: context.permissions.includes('manage_autocar'),
      can_take_over: context.permissions.includes('view_whatsapp'),
      can_resume_protected: context.role === 'master',
      protected_resume_required: isProtectedAutocarResumeState(currentRuntime),
      runtime: currentRuntime,
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
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada ou fora da sua carteira.' }, { status: 404 });
    }

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

      const result = await processAutocarShadowInbound({
        productionSupabase: context.supabase,
        storeId: context.store.id,
        conversation,
        message,
        allowLivePilot: false
      });
      return NextResponse.json(result, { status: result.error ? 500 : 200 });
    }

    if (action === 'human-active') {
      if (!context.permissions.includes('view_whatsapp')) {
        return NextResponse.json({ error: 'Usuário sem permissão para assumir esta conversa.' }, { status: 403 });
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

      const autocar = getAutocarDevClient();
      const { data: currentRuntime, error: runtimeError } = await autocar.from('ai_runtime_conversations')
        .select('id,human_state,pause_reason,paused_by_profile_id,paused_by_source,paused_at,resumed_at')
        .eq('store_id', context.store.id)
        .eq('production_conversation_id', conversation.id)
        .maybeSingle();
      if (runtimeError) throw runtimeError;

      const decision = evaluateAutocarResumeRequest({
        runtime: currentRuntime,
        actorRole: context.role,
        resumeReason: cleanText(body?.resume_reason, 500),
        confirmed: body?.confirm_protected_resume === true
      });
      if (!decision.allowed) {
        return NextResponse.json({ error: decision.error, protected_resume: decision.protectedResume }, { status: decision.status });
      }

      const { data: resumeResult, error: resumeError } = await autocar.rpc('resume_autocar_conversation_audited', {
        p_store_id: context.store.id,
        p_production_conversation_id: conversation.id,
        p_actor_profile_id: context.profile.id,
        p_actor_role: context.role,
        p_resume_reason: decision.resumeReason,
        p_resume_source: 'store_portal_runtime',
        p_confirmed: decision.protectedResume ? body?.confirm_protected_resume === true : false,
        p_request_id: randomUUID()
      });

      if (resumeError) {
        const code = String(resumeError.code || '');
        if (code === '42501') {
          return NextResponse.json({ error: 'A retomada protegida foi bloqueada pelo SAFE CORE.' }, { status: 403 });
        }
        if (code === '22023') {
          return NextResponse.json({ error: 'Os dados da retomada protegida são inválidos.' }, { status: 400 });
        }
        if (code === 'P0002') {
          return NextResponse.json({ error: 'Runtime AUTOCAR não encontrado para esta conversa.' }, { status: 404 });
        }
        if (code === 'P0001') {
          return NextResponse.json({ error: 'A conversa já não está em atendimento humano.' }, { status: 409 });
        }
        if (code === 'PGRST202') {
          return NextResponse.json({ error: 'A governança auditada de retomada ainda não está disponível neste ambiente.' }, { status: 503 });
        }
        throw resumeError;
      }

      const state = resumeResult?.runtime || null;
      return NextResponse.json({
        success: true,
        shadow_mode: true,
        no_external_execution: true,
        protected_resume: Boolean(resumeResult?.protected_resume),
        runtime: state
      });
    }

    return NextResponse.json({ error: 'Ação de runtime AUTOCAR inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível executar o runtime AUTOCAR.' }, { status: 500 });
  }
}
