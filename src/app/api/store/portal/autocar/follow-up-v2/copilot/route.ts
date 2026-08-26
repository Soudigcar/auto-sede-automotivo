import { NextResponse } from 'next/server';
import { analyzeAutocarCopilot } from '@/lib/server/autocar/copilot';
import { readStoreFollowUpV2 } from '@/lib/server/autocar/followUpV2ConfigStore';
import { evaluateFollowUpCopilotCandidate } from '@/lib/server/autocar/followUpV2CopilotQueue';
import { getAutocarRuntimeClient } from '@/lib/server/autocar/runtimeEnvironment';
import { authorizeStorePortal, canAccessStoreLead } from '@/lib/server/storePortal';
import { evolutionDisplayBody } from '@/lib/server/evolutionMessage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(value: unknown, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function humanError(error: any) {
  const text = String(error?.message || error || 'Falha no COPILOT de Follow-up.');
  if (/ai_follow_up_copilot_suggestions|does not exist|schema cache/i.test(text)) {
    return 'Fila COPILOT de Follow-up ainda não está disponível neste ambiente.';
  }
  return text.slice(0, 500);
}

async function storeContext(request: Request, slug: string) {
  const context = await authorizeStorePortal(request, slug);
  if ('error' in context) return context;
  if (!context.permissions.includes('view_autocar') || !context.permissions.includes('view_whatsapp')) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para usar o COPILOT de Follow-up.' }, { status: 403 }) } as const;
  }
  return context;
}

async function readConversationBundle(context: any, conversationId: string) {
  const { data: conversation, error: conversationError } = await context.supabase
    .from('whatsapp_conversations')
    .select('id,store_id,lead_id,base_lead_id,status,last_message_at')
    .eq('id', conversationId)
    .eq('store_id', context.store.id)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) throw new Error('Conversa não encontrada nesta loja.');

  const { data: lead, error: leadError } = conversation.lead_id
    ? await context.supabase.from('leads')
      .select('id,assigned_store_id,assigned_user_id,customer_name,customer_phone,status,interested_vehicle,interested_vehicle_id,interested_vehicle_price,scheduled_at,notes,origin')
      .eq('id', conversation.lead_id).eq('assigned_store_id', context.store.id).maybeSingle()
    : { data: null, error: null };
  if (leadError) throw leadError;
  if (context.role !== 'master' && context.role !== 'store') {
    if (!lead || !canAccessStoreLead(context.profile, context.role, lead)) {
      throw new Error('Este lead não está sob sua responsabilidade atual.');
    }
  }

  const [{ data: baseLead, error: baseLeadError }, { data: commercial, error: commercialError }, { data: messages, error: messagesError }] = await Promise.all([
    conversation.base_lead_id
      ? context.supabase.from('leads_base').select('id,name,phone,status,source,campaign_name').eq('id', conversation.base_lead_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    lead?.id
      ? context.supabase.from('lead_commercial_details')
        .select('payment_type,financing_bank,has_down_payment,down_payment_value,financed_amount,installment_count,installment_value,has_trade_in,trade_vehicle_name,trade_vehicle_manufacture_year,trade_vehicle_model_year')
        .eq('lead_id', lead.id).eq('store_id', context.store.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    context.supabase.from('whatsapp_messages')
      .select('direction,message_type,body,raw_payload,sent_at,created_at')
      .eq('store_id', context.store.id)
      .eq('conversation_id', conversation.id)
      .order('sent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40)
  ]);
  if (baseLeadError) throw baseLeadError;
  if (commercialError) throw commercialError;
  if (messagesError) throw messagesError;

  return { conversation, lead, baseLead, commercial, messages: messages || [] };
}

async function runtimeConversation(autocar: any, storeId: string, conversationId: string) {
  const { data, error } = await autocar.from('ai_runtime_conversations')
    .select('production_conversation_id,human_state,effective_mode,updated_at')
    .eq('store_id', storeId)
    .eq('production_conversation_id', conversationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: Request) {
  try {
    const slug = clean(new URL(request.url).searchParams.get('slug'));
    const context = await storeContext(request, slug);
    if ('error' in context) return context.error;
    const autocar = getAutocarRuntimeClient();
    const configBundle = await readStoreFollowUpV2(autocar, context.store.id);
    const config = configBundle.effective;
    if (!config.global.enabled || config.global.mode !== 'copilot') {
      return NextResponse.json({ success: true, enabled: false, candidates: [], suggestions: [] });
    }

    const { data: conversations, error: conversationsError } = await context.supabase
      .from('whatsapp_conversations')
      .select('id,store_id,lead_id,base_lead_id,status,last_message_at')
      .eq('store_id', context.store.id)
      .eq('status', 'open')
      .order('last_message_at', { ascending: false })
      .limit(60);
    if (conversationsError) throw conversationsError;
    const rows = conversations || [];
    const conversationIds = rows.map((row: any) => row.id);
    const leadIds = rows.map((row: any) => row.lead_id).filter(Boolean);

    const [leadsResult, commercialResult, messagesResult, runtimeResult, suggestionsResult] = await Promise.all([
      leadIds.length
        ? context.supabase.from('leads').select('id,assigned_store_id,assigned_user_id,customer_name,status,interested_vehicle,interested_vehicle_id,scheduled_at').in('id', leadIds).eq('assigned_store_id', context.store.id)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length
        ? context.supabase.from('lead_commercial_details').select('lead_id,payment_type,financing_bank,financed_amount,installment_count,installment_value').in('lead_id', leadIds).eq('store_id', context.store.id)
        : Promise.resolve({ data: [], error: null }),
      conversationIds.length
        ? context.supabase.from('whatsapp_messages').select('conversation_id,direction,sent_at,created_at').eq('store_id', context.store.id).in('conversation_id', conversationIds).order('sent_at', { ascending: false }).limit(500)
        : Promise.resolve({ data: [], error: null }),
      conversationIds.length
        ? autocar.from('ai_runtime_conversations').select('production_conversation_id,human_state,effective_mode').eq('store_id', context.store.id).in('production_conversation_id', conversationIds)
        : Promise.resolve({ data: [], error: null }),
      autocar.from('ai_follow_up_copilot_suggestions')
        .select('id,production_conversation_id,production_lead_id,scenario_key,step_id,due_at,suggested_message,status,idempotency_key,model,created_at')
        .eq('store_id', context.store.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100)
    ]);
    for (const result of [leadsResult, commercialResult, messagesResult, runtimeResult, suggestionsResult]) {
      if (result.error) throw result.error;
    }

    const leadMap = new Map((leadsResult.data || []).map((row: any) => [row.id, row]));
    const commercialMap = new Map((commercialResult.data || []).map((row: any) => [row.lead_id, row]));
    const runtimeMap = new Map((runtimeResult.data || []).map((row: any) => [row.production_conversation_id, row]));
    const messagesMap = new Map<string, any[]>();
    for (const message of messagesResult.data || []) {
      const list = messagesMap.get(message.conversation_id) || [];
      list.push(message);
      messagesMap.set(message.conversation_id, list);
    }

    const candidates = rows.flatMap((conversation: any) => {
      const lead = leadMap.get(conversation.lead_id) || null;
      if (context.role !== 'master' && context.role !== 'store' && (!lead || !canAccessStoreLead(context.profile, context.role, lead))) return [];
      const evaluated = evaluateFollowUpCopilotCandidate({
        config,
        conversation,
        lead,
        commercial: commercialMap.get(conversation.lead_id) || null,
        runtimeConversation: runtimeMap.get(conversation.id) || null,
        messages: messagesMap.get(conversation.id) || []
      });
      return evaluated.candidate ? [evaluated.candidate] : [];
    });

    return NextResponse.json({
      success: true,
      enabled: true,
      autopilot_locked: true,
      external_send_available: false,
      candidates,
      suggestions: suggestionsResult.data || []
    });
  } catch (error: any) {
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = clean(body?.slug);
    const action = clean(body?.action, 40);
    const context = await storeContext(request, slug);
    if ('error' in context) return context.error;
    const autocar = getAutocarRuntimeClient();

    if (action === 'dismiss') {
      const suggestionId = clean(body?.suggestion_id, 100);
      if (!suggestionId) return NextResponse.json({ error: 'Sugestão obrigatória.' }, { status: 400 });
      const { data: suggestion, error: suggestionError } = await autocar.from('ai_follow_up_copilot_suggestions')
        .select('id,store_id,production_conversation_id,status').eq('id', suggestionId).eq('store_id', context.store.id).maybeSingle();
      if (suggestionError) throw suggestionError;
      if (!suggestion) return NextResponse.json({ error: 'Sugestão não encontrada.' }, { status: 404 });
      await readConversationBundle(context, suggestion.production_conversation_id);
      const { error } = await autocar.from('ai_follow_up_copilot_suggestions').update({
        status: 'dismissed', resolved_by_profile_id: context.profile.id, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq('id', suggestion.id).eq('status', 'pending');
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action !== 'generate') return NextResponse.json({ error: 'Ação COPILOT inválida.' }, { status: 400 });
    const conversationId = clean(body?.conversation_id, 100);
    if (!conversationId) return NextResponse.json({ error: 'Conversa obrigatória.' }, { status: 400 });

    const configBundle = await readStoreFollowUpV2(autocar, context.store.id);
    const bundle = await readConversationBundle(context, conversationId);
    const runtime = await runtimeConversation(autocar, context.store.id, conversationId);
    const evaluated = evaluateFollowUpCopilotCandidate({
      config: configBundle.effective,
      conversation: bundle.conversation,
      lead: bundle.lead,
      commercial: bundle.commercial,
      runtimeConversation: runtime,
      messages: bundle.messages
    });
    if (!evaluated.candidate) return NextResponse.json({ error: evaluated.reason }, { status: 409 });

    const existing = await autocar.from('ai_follow_up_copilot_suggestions')
      .select('*').eq('idempotency_key', evaluated.candidate.idempotency_key).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.status === 'pending') return NextResponse.json({ success: true, reused: true, suggestion: existing.data });

    const textMessages = bundle.messages.slice().reverse().map((message: any) => ({
      direction: String(message.direction || ''),
      message_type: String(message.message_type || 'text'),
      body: evolutionDisplayBody(message.body, message.raw_payload),
      sent_at: message.sent_at || message.created_at || null
    })).filter((message: any) => Boolean(String(message.body || '').trim()));

    const analysis = await analyzeAutocarCopilot({
      store: context.store,
      lead: bundle.lead || null,
      baseLead: bundle.baseLead || null,
      commercial: bundle.commercial || null,
      messages: textMessages,
      inventorySupabase: context.supabase
    });
    const suggestedMessage = clean(analysis.suggested_reply, 4000);
    if (!suggestedMessage) throw new Error('A AUTOCAR não gerou um rascunho seguro para este Follow-up.');

    const { data: saved, error: saveError } = await autocar.from('ai_follow_up_copilot_suggestions').upsert({
      store_id: context.store.id,
      production_conversation_id: evaluated.candidate.conversation_id,
      production_lead_id: evaluated.candidate.lead_id,
      scenario_key: evaluated.candidate.scenario_key,
      step_id: evaluated.candidate.step_id,
      due_at: evaluated.candidate.due_at,
      context_last_message_at: evaluated.candidate.last_store_message_at,
      suggested_message: suggestedMessage,
      status: 'pending',
      idempotency_key: evaluated.candidate.idempotency_key,
      model: analysis.model,
      usage: analysis.usage || {},
      generated_by_profile_id: context.profile.id,
      resolved_by_profile_id: null,
      resolved_at: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'idempotency_key' }).select('*').single();
    if (saveError) throw saveError;

    const scenario = configBundle.effective.scenarios.find((row) => row.key === evaluated.candidate!.scenario_key);
    await autocar.from('ai_follow_up_performance_events').insert({
      store_id: context.store.id,
      scenario_key: evaluated.candidate.scenario_key,
      production_conversation_id: evaluated.candidate.conversation_id,
      production_lead_id: evaluated.candidate.lead_id,
      event_type: 'prepared',
      attribution_window_minutes: scenario?.attributionWindowMinutes || 1440,
      source_occurred_at: new Date().toISOString(),
      attributed_to_follow_up: false,
      metadata: { suggestion_id: saved.id, copilot_only: true, external_send: false }
    });

    return NextResponse.json({ success: true, reused: false, external_send_available: false, suggestion: saved });
  } catch (error: any) {
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}
