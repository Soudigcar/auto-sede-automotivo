import { NextResponse } from 'next/server';
import { authorizeStorePortal, canAccessStoreLead } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import { evolutionDisplayBody } from '@/lib/server/evolutionMessage';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { autocarModelName } from '@/lib/server/autocar/client';
import {
  autocarModeInstructions,
  buildAutocarIntelligenceContext,
  serializeAutocarIntelligenceContext
} from '@/lib/server/autocar/intelligenceCore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PREVIEW_HOMOLOGATION_BRANCH = 'feature/autocar-copilot-conversational-preview';

type OperatorTurn = { role: 'operator' | 'autocar'; text: string };

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    suggested_reply: { type: ['string', 'null'] },
    next_best_action: { type: 'string' },
    referenced_vehicle_ids: { type: 'array', items: { type: 'string' } }
  },
  required: ['answer', 'suggested_reply', 'next_best_action', 'referenced_vehicle_ids']
};

function previewHomologationAvailable() {
  return process.env.VERCEL_ENV === 'preview'
    && process.env.VERCEL_GIT_COMMIT_REF === PREVIEW_HOMOLOGATION_BRANCH;
}

function openAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível neste ambiente.');
  return key;
}

function responseOutputText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return '';
}

function cleanHistory(value: unknown): OperatorTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).map((entry: any) => {
    const role = entry?.role === 'autocar' ? 'autocar' : 'operator';
    const text = cleanText(entry?.text, 700);
    return { role, text } as OperatorTurn;
  }).filter((entry) => entry.text.length >= 1);
}

function referencedVehicles(intelligence: Awaited<ReturnType<typeof buildAutocarIntelligenceContext>>, ids: unknown) {
  const requested = (Array.isArray(ids) ? ids : []).map((value) => String(value || '').trim()).filter(Boolean).slice(0, 8);
  if (!requested.length || !intelligence.inventory) return [];
  const byId = new Map<string, any>();
  for (const vehicle of intelligence.inventory.inventory_index || []) {
    if (vehicle?.id) byId.set(String(vehicle.id), vehicle);
  }
  for (const vehicle of intelligence.inventory.matching_vehicles || []) {
    if (vehicle?.id) byId.set(String(vehicle.id), vehicle);
  }
  return requested.map((id) => byId.get(id)).filter(Boolean);
}

async function authorizedContext(request: Request, slug: string) {
  const context = await authorizeStorePortal(request, slug);
  if ('error' in context) return context;
  if (!context.permissions.includes('view_whatsapp') || !context.permissions.includes('view_autocar')) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para usar o Copilot AUTOCAR.' }, { status: 403 }) } as const;
  }
  return context;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    if (!slug) return NextResponse.json({ error: 'Loja obrigatória.' }, { status: 400 });

    const context = await authorizedContext(request, slug);
    if ('error' in context) return context.error;

    return NextResponse.json({
      success: true,
      preview_homologation_available: previewHomologationAvailable(),
      advisory_only: true,
      no_external_execution: true
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error?.message || 'Não foi possível consultar a homologação do Copilot AUTOCAR.',
      preview_homologation_available: false,
      no_external_execution: true
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = cleanText(body?.slug, 120);
    const conversationId = cleanText(body?.conversation_id, 100);
    const operatorPrompt = cleanText(body?.operator_prompt, 1200);
    const operatorHistory = cleanHistory(body?.history);
    const previewHomologationRequested = body?.preview_homologation === true;
    if (!slug || !conversationId || operatorPrompt.length < 3) {
      return NextResponse.json({ error: 'Loja, conversa e pergunta do operador são obrigatórias.' }, { status: 400 });
    }

    const context = await authorizedContext(request, slug);
    if ('error' in context) return context.error;

    const previewAllowed = previewHomologationAvailable();
    if (previewHomologationRequested && !previewAllowed) {
      return NextResponse.json({
        error: 'A homologação COPILOT é permitida somente no Preview isolado autorizado.',
        preview_homologation: false,
        no_external_execution: true
      }, { status: 403 });
    }

    const { data: conversation, error: conversationError } = await context.supabase
      .from('whatsapp_conversations')
      .select('id,store_id,lead_id,base_lead_id')
      .eq('id', conversationId)
      .eq('store_id', context.store.id)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) return NextResponse.json({ error: 'Conversa não encontrada nesta loja.' }, { status: 404 });

    const { data: lead, error: leadError } = conversation.lead_id
      ? await context.supabase.from('leads')
          .select('id,assigned_store_id,assigned_user_id,customer_name,customer_phone,status,interested_vehicle,interested_vehicle_id,interested_vehicle_price,scheduled_at,notes,origin')
          .eq('id', conversation.lead_id).eq('assigned_store_id', context.store.id).maybeSingle()
      : { data: null, error: null };
    if (leadError) throw leadError;

    if (context.role !== 'master' && context.role !== 'store') {
      if (!lead || !canAccessStoreLead(context.profile, context.role, lead)) {
        return NextResponse.json({ error: 'Este lead não está sob sua responsabilidade atual.' }, { status: 403 });
      }
    }

    const autocar = getAutocarDevClient();
    const { data: runtimeState, error: runtimeError } = await autocar.from('ai_runtime_conversations')
      .select('effective_mode,human_state')
      .eq('store_id', context.store.id)
      .eq('production_conversation_id', conversation.id)
      .maybeSingle();
    if (runtimeError) throw runtimeError;
    const effectiveMode = String(runtimeState?.effective_mode || 'off').trim().toLowerCase();
    const previewHomologationActive = previewHomologationRequested && previewAllowed && effectiveMode !== 'copilot';
    if (effectiveMode !== 'copilot' && !previewHomologationActive) {
      return NextResponse.json({
        error: `O Copilot conversacional está bloqueado porque o modo efetivo é ${effectiveMode.toUpperCase()}.`,
        effective_mode: effectiveMode,
        preview_homologation: false,
        no_external_execution: true
      }, { status: 409 });
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

    const textMessages = (messages || []).reverse().map((message: any) => ({
      direction: String(message.direction || ''),
      message_type: String(message.message_type || 'text'),
      body: evolutionDisplayBody(message.body, message.raw_payload),
      sent_at: message.sent_at || message.created_at || null
    })).filter((message: any) => Boolean(String(message.body || '').trim()));
    const transcript = textMessages.slice(-40).map((message: any) =>
      `${message.direction === 'outbound' ? 'LOJA' : 'CLIENTE'} [${message.message_type || 'text'}]: ${message.body}`
    ).join('\n');
    if (!transcript.trim()) return NextResponse.json({ error: 'A conversa ainda não possui texto suficiente para o Copilot.' }, { status: 400 });

    const lastCustomerMessage = [...textMessages].reverse().find((message: any) => message.direction !== 'outbound' && message.body)?.body;
    const retrievalQuery = [lastCustomerMessage, operatorPrompt].filter(Boolean).join('\n').slice(0, 6000);
    const intelligence = await buildAutocarIntelligenceContext({
      storeId: context.store.id,
      query: retrievalQuery,
      mode: 'copilot',
      inventorySupabase: context.supabase
    });

    const instructions = [
      intelligence.hardPolicyInstructions,
      autocarModeInstructions('copilot'),
      previewHomologationActive
        ? 'HOMOLOGAÇÃO PREVIEW ISOLADA: o runtime lido pode estar em outro modo, mas esta requisição deve simular exclusivamente o comportamento consultivo COPILOT. Não altere modo, runtime, dados ou estado do atendimento.'
        : '',
      'Você é o Copilot comercial AUTOCAR e responde ao OPERADOR HUMANO da loja, nunca executa ações externas.',
      'Este endpoint é estritamente consultivo: não envie WhatsApp, não altere pipeline, não agende, não crie follow-up, não negocie desconto autonomamente e nunca diga que uma ação foi executada.',
      'Use o histórico real do cliente, dados do CRM, Método Venda Mais, Biblioteca Global, conhecimento específico da loja e estoque interno somente quando relevantes.',
      'store_inventory é a fonte oficial do estoque desta loja. Nunca invente veículo, preço, disponibilidade, condição comercial, aprovação de crédito ou avaliação de troca.',
      'Quando mencionar veículo real, preencha referenced_vehicle_ids apenas com IDs exatos presentes em matching_vehicles ou inventory_index.',
      'A conversa entre operador e Copilot é contexto de assistência e não deve ser confundida com mensagens do cliente.',
      'Responda em answer diretamente à pergunta do operador, de forma prática e curta.',
      'Preencha suggested_reply somente quando houver uma resposta útil que o operador possa revisar e enviar ao cliente; caso contrário use null.',
      'Mesmo quando suggested_reply existir, ela é apenas um rascunho: não afirme que foi enviada.',
      'Se a solicitação esbarrar em política de aprovação, deny ou handoff, explique a limitação ao operador e mantenha a resposta dentro da política.'
    ].filter(Boolean).join(' ');

    const modelInput = JSON.stringify({
      inteligencia_autocar: serializeAutocarIntelligenceContext(intelligence),
      homologacao_preview: previewHomologationActive,
      runtime_lido: { effective_mode: effectiveMode, human_state: runtimeState?.human_state || null },
      modo_de_analise: 'copilot',
      loja: { nome: context.store.store_name, cidade: context.store.city || null, estado: context.store.state || null },
      crm: {
        cliente: lead?.customer_name || baseLead?.name || null,
        veiculo_interesse: lead?.interested_vehicle || null,
        etapa: lead?.status || baseLead?.status || null,
        agendamento: lead?.scheduled_at || null,
        pagamento: commercial?.payment_type || null,
        banco: commercial?.financing_bank || null,
        possui_entrada: commercial?.has_down_payment ?? null,
        valor_entrada: commercial?.down_payment_value ?? null,
        possui_troca: commercial?.has_trade_in ?? null,
        veiculo_troca: commercial?.trade_vehicle_name || null
      },
      conversa_cliente: transcript,
      conversa_operador_copilot: operatorHistory,
      pergunta_operador: operatorPrompt
    });

    const model = autocarModelName();
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 1200,
        instructions,
        input: modelInput,
        text: {
          format: {
            type: 'json_schema',
            name: 'autocar_conversational_copilot',
            description: 'Orientação consultiva ao operador humano do CRM automotivo.',
            strict: true,
            schema: responseSchema
          }
        }
      }),
      cache: 'no-store'
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.error?.message || `OpenAI respondeu com HTTP ${response.status}.`).slice(0, 500);
      throw new Error(message);
    }
    const text = responseOutputText(payload);
    if (!text) throw new Error('A OpenAI não retornou orientação textual para o Copilot.');

    let generated: any;
    try {
      generated = JSON.parse(text);
    } catch {
      throw new Error('A resposta estruturada da OpenAI não pôde ser interpretada.');
    }

    return NextResponse.json({
      success: true,
      conversation_id: conversation.id,
      runtime_effective_mode: effectiveMode,
      analysis_mode: 'copilot',
      preview_homologation: previewHomologationActive,
      advisory_only: true,
      no_external_execution: true,
      answer: cleanText(generated?.answer, 5000),
      suggested_reply: generated?.suggested_reply ? cleanText(generated.suggested_reply, 3000) : null,
      next_best_action: cleanText(generated?.next_best_action, 1000),
      referenced_vehicles: referencedVehicles(intelligence, generated?.referenced_vehicle_ids),
      intelligence: {
        mode: 'copilot',
        training_matches: intelligence.training.length,
        method_matches: intelligence.methodKnowledge.length,
        store_knowledge_matches: intelligence.storeKnowledge.length,
        inventory_available_count: intelligence.inventory?.available_count ?? 0,
        inventory_matches: intelligence.inventory?.matched_count ?? 0,
        hard_policies_applied: true
      },
      usage: {
        input_tokens: Number(payload?.usage?.input_tokens || 0),
        output_tokens: Number(payload?.usage?.output_tokens || 0)
      }
    });
  } catch (error: any) {
    console.error('AUTOCAR conversational Copilot error:', error?.message || error);
    return NextResponse.json({
      error: error?.message || 'Não foi possível consultar o Copilot AUTOCAR.',
      no_external_execution: true
    }, { status: 500 });
  }
}
