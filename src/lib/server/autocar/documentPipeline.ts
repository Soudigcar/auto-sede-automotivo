import { aiPlatformDefaultModel } from '@/lib/server/ai-platform/models/registry';
import { autocarOutputText } from '@/lib/server/autocar/client';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { normalizeEvolutionMediaBase64 } from '@/lib/server/evolutionAudio';
import { evolutionRequest } from '@/lib/server/evolution';

const DOCUMENT_PIPELINE_VERSION = 'autocar-documents-v1';
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const SUPPORTED_DOCUMENT_MIMES = new Set(['application/pdf']);

const documentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    document_type: {
      type: 'string',
      enum: [
        'financing_simulation',
        'financing_proposal',
        'vehicle_document',
        'contract',
        'receipt',
        'proof',
        'identity_document',
        'other',
        'unclear'
      ]
    },
    summary: { type: 'string' },
    contains_personal_data: { type: 'boolean' },
    contains_financial_data: { type: 'boolean' },
    contains_vehicle_identifiers: { type: 'boolean' },
    apparent_purpose: { type: 'string' },
    safe_commercial_context: { type: 'string' },
    requires_human_review: { type: 'boolean' },
    uncertainty: { type: 'string' }
  },
  required: [
    'document_type',
    'summary',
    'contains_personal_data',
    'contains_financial_data',
    'contains_vehicle_identifiers',
    'apparent_purpose',
    'safe_commercial_context',
    'requires_human_review',
    'uncertainty'
  ]
};

function requiredOpenAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível para o pipeline de documentos.');
  return key;
}

function inboundDocument(rawPayload: any) {
  return rawPayload?.message?.documentMessage || rawPayload?.documentMessage || null;
}

function documentMime(rawPayload: any) {
  return String(inboundDocument(rawPayload)?.mimetype || '').split(';')[0].trim().toLowerCase();
}

function documentFileName(rawPayload: any) {
  const name = String(inboundDocument(rawPayload)?.fileName || 'documento.pdf').trim();
  return name.slice(0, 180) || 'documento.pdf';
}

function providerMessageId(rawPayload: any) {
  return String(rawPayload?.key?.id || rawPayload?.message?.key?.id || rawPayload?.id || '').trim();
}

function decodeBase64(base64: string) {
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw new Error('Documento recebido está vazio após decodificação.');
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('Documento excede o limite seguro de 10 MB do AUTOCAR Documents V1.');
  return bytes;
}

async function getEvolutionDocumentBase64(instanceName: string, rawMessage: any) {
  const result = await evolutionRequest(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: { message: rawMessage, convertToMp4: false }
  });
  const base64 = normalizeEvolutionMediaBase64(result);
  if (!base64) throw new Error('Evolution não retornou o documento em base64.');
  return base64;
}

async function documentRuntimeEligibility(storeId: string, conversationId: string) {
  const autocar = getAutocarDevClient();
  const [agentResult, runtimeResult] = await Promise.all([
    autocar.from('ai_store_agents')
      .select('mode,status,master_enabled,master_autopilot_allowed,store_selected_mode')
      .eq('store_id', storeId)
      .maybeSingle(),
    autocar.from('ai_runtime_conversations')
      .select('effective_mode,human_state,pause_reason')
      .eq('store_id', storeId)
      .eq('production_conversation_id', conversationId)
      .maybeSingle()
  ]);
  if (agentResult.error) throw agentResult.error;
  if (runtimeResult.error) throw runtimeResult.error;

  const agent = agentResult.data;
  const runtime = runtimeResult.data;
  const agentAllowed = Boolean(
    agent?.master_enabled &&
    agent?.master_autopilot_allowed &&
    agent?.store_selected_mode === 'autopilot' &&
    agent?.mode === 'autopilot' &&
    agent?.status === 'active'
  );

  if (!agentAllowed) {
    return { allowed: false, reason: 'Documents V1 não executa porque a AUTOCAR não está efetivamente em AUTOPILOT.' };
  }
  if (runtime && runtime.effective_mode !== 'autopilot') {
    return { allowed: false, reason: `Documents V1 bloqueado pelo modo efetivo ${String(runtime.effective_mode || 'off').toUpperCase()}.` };
  }
  if (runtime && runtime.human_state !== 'autocar_active') {
    return {
      allowed: false,
      reason: `Documents V1 bloqueado durante takeover humano: ${runtime.pause_reason || runtime.human_state || 'estado humano'}.`
    };
  }

  return { allowed: true, reason: 'AUTOCAR em AUTOPILOT e sem takeover humano.' };
}

async function analyzePdf(input: { base64: string; fileName: string; caption: string }) {
  const model = aiPlatformDefaultModel('terra');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredOpenAiKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 900,
      instructions: [
        'Você é o módulo de documentos da AUTOCAR para atendimento automotivo.',
        'Classifique e resuma somente o contexto comercial necessário para o atendimento.',
        'Nunca transcreva nem repita nomes completos, CPF, RG, CNH, endereço, telefone, e-mail, placa, RENAVAM, chassi, número de conta, cartão, proposta, contrato ou qualquer outro identificador individual.',
        'Não reproduza assinaturas, números de documentos, códigos, credenciais ou dados bancários.',
        'Valores financeiros podem ser descritos apenas de forma genérica quando forem essenciais ao contexto; não conclua aprovação de crédito, financiamento ou condição comercial.',
        'Documento veicular não equivale a validação de propriedade, procedência ou situação jurídica.',
        'Contrato, comprovante ou proposta não autoriza ação automática, venda, desconto, alteração de CRM ou confirmação de negócio.',
        'safe_commercial_context deve ser curto, não sensível e útil para continuar a conversa sem expor dados pessoais.',
        'requires_human_review deve ser true quando o documento exigir validação humana, contiver dados pessoais/financeiros relevantes ou puder produzir consequência jurídica/comercial.',
        'uncertainty deve explicar limitações relevantes sem reproduzir conteúdo sensível.'
      ].join(' '),
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: input.caption ? `Contexto enviado pelo cliente: ${input.caption}` : 'O cliente enviou este PDF sem contexto textual adicional.' },
          { type: 'input_file', filename: input.fileName, file_data: `data:application/pdf;base64,${input.base64}` }
        ]
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'autocar_document_analysis',
          strict: true,
          schema: documentSchema
        }
      }
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error?.message || `OpenAI Documents HTTP ${response.status}.`).slice(0, 500));
  }
  const text = autocarOutputText(payload);
  if (!text) throw new Error('A análise do documento retornou vazia.');

  try {
    return {
      analysis: JSON.parse(text),
      model,
      usage: {
        input_tokens: Number(payload?.usage?.input_tokens || 0),
        output_tokens: Number(payload?.usage?.output_tokens || 0)
      }
    };
  } catch {
    throw new Error('A resposta estruturada do AUTOCAR Documents V1 não pôde ser interpretada.');
  }
}

export function autocarDocumentContextText(rawPayload: any) {
  const document = rawPayload?.autocar_document_analysis;
  if (!document?.analysis) return '';
  const analysis = document.analysis;
  const parts = [
    String(analysis.safe_commercial_context || '').trim(),
    analysis.requires_human_review ? 'O documento requer revisão humana antes de qualquer consequência comercial.' : '',
    String(analysis.uncertainty || '').trim() ? `Limitações do documento: ${String(analysis.uncertainty).trim()}` : ''
  ].filter(Boolean);
  return parts.join(' ');
}

export async function prepareAutocarInboundDocument(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  whatsappNumberId: string;
  messageId: string;
}) {
  const { data: message, error: messageError } = await input.productionSupabase
    .from('whatsapp_messages')
    .select('id,store_id,conversation_id,whatsapp_number_id,message_type,body,raw_payload')
    .eq('id', input.messageId)
    .eq('store_id', input.storeId)
    .eq('conversation_id', input.conversationId)
    .eq('whatsapp_number_id', input.whatsappNumberId)
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message) return { ready: false, skipped: true, reason: 'Mensagem canônica não encontrada para análise de documento.' };
  if (String(message.message_type || '') !== 'document') return { ready: true, skipped: true, reason: 'Mensagem não é documento.' };

  const existing = message?.raw_payload?.autocar_document_analysis;
  if (existing?.analysis) {
    return {
      ready: true,
      duplicate: true,
      version: existing.version || DOCUMENT_PIPELINE_VERSION,
      model: existing.model || null,
      bytes: existing.bytes || null,
      mimetype: existing.mimetype || null,
      file_name: existing.file_name || null,
      analysis: existing.analysis,
      usage: existing.usage || null
    };
  }

  const eligibility = await documentRuntimeEligibility(input.storeId, input.conversationId);
  if (!eligibility.allowed) {
    return {
      ready: true,
      skipped: true,
      gated: true,
      version: DOCUMENT_PIPELINE_VERSION,
      model: null,
      bytes: null,
      mimetype: documentMime(message.raw_payload),
      analysis: null,
      usage: null,
      reason: eligibility.reason
    };
  }

  const mime = documentMime(message.raw_payload);
  if (!SUPPORTED_DOCUMENT_MIMES.has(mime)) {
    return { ready: false, skipped: true, reason: `Formato de documento ${mime || 'desconhecido'} não suportado no Documents V1. Apenas PDF está habilitado.` };
  }

  const { data: integration, error: integrationError } = await input.productionSupabase
    .from('store_whatsapp_integrations')
    .select('instance_name,status,scope')
    .eq('store_id', input.storeId)
    .eq('crm_number_id', input.whatsappNumberId)
    .eq('scope', 'store')
    .maybeSingle();
  if (integrationError) throw integrationError;
  if (!integration?.instance_name || integration.status !== 'connected') {
    return { ready: false, skipped: true, reason: 'Integração Evolution da loja não está conectada para recuperar o documento.' };
  }

  const providerId = providerMessageId(message.raw_payload);
  if (!providerId) return { ready: false, skipped: true, reason: 'Documento sem identificador do provedor.' };

  const base64 = await getEvolutionDocumentBase64(String(integration.instance_name), message.raw_payload);
  const bytes = decodeBase64(base64);
  const fileName = documentFileName(message.raw_payload);
  const caption = String(inboundDocument(message.raw_payload)?.caption || '').trim().slice(0, 2000);
  const result = await analyzePdf({ base64, fileName, caption });
  const analyzedAt = new Date().toISOString();
  const document = {
    version: DOCUMENT_PIPELINE_VERSION,
    model: result.model,
    mimetype: mime,
    file_name: fileName,
    bytes: bytes.length,
    provider_message_id: providerId,
    analyzed_at: analyzedAt,
    usage: result.usage,
    analysis: result.analysis
  };

  const { error: updateError } = await input.productionSupabase
    .from('whatsapp_messages')
    .update({ raw_payload: { ...(message.raw_payload || {}), autocar_document_analysis: document } })
    .eq('id', message.id)
    .eq('store_id', input.storeId);
  if (updateError) throw updateError;

  return {
    ready: true,
    version: DOCUMENT_PIPELINE_VERSION,
    model: result.model,
    bytes: bytes.length,
    mimetype: mime,
    file_name: fileName,
    analysis: result.analysis,
    usage: result.usage
  };
}
