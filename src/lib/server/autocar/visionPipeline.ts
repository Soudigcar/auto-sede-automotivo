import { aiPlatformDefaultModel } from '@/lib/server/ai-platform/models/registry';
import { autocarOutputText } from '@/lib/server/autocar/client';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { normalizeEvolutionMediaBase64 } from '@/lib/server/evolutionAudio';
import { evolutionRequest } from '@/lib/server/evolution';

const VISION_PIPELINE_VERSION = 'autocar-vision-v1';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const visionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    scene_type: {
      type: 'string',
      enum: ['vehicle_exterior', 'vehicle_interior', 'dashboard', 'document', 'person', 'other', 'unclear']
    },
    vehicle: {
      type: 'object',
      additionalProperties: false,
      properties: {
        visible: { type: 'boolean' },
        make: { type: 'string' },
        model: { type: 'string' },
        body_style: { type: 'string' },
        color: { type: 'string' },
        plate_visible: { type: 'boolean' },
        confidence: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['visible', 'make', 'model', 'body_style', 'color', 'plate_visible', 'confidence']
    },
    apparent_damage: {
      type: 'object',
      additionalProperties: false,
      properties: {
        detected: { type: 'boolean' },
        description: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['detected', 'description', 'confidence']
    },
    dashboard: {
      type: 'object',
      additionalProperties: false,
      properties: {
        visible: { type: 'boolean' },
        odometer_text: { type: 'string' },
        warning_lights: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['visible', 'odometer_text', 'warning_lights', 'confidence']
    },
    document_like: { type: 'boolean' },
    contains_personal_data: { type: 'boolean' },
    safe_commercial_context: { type: 'string' },
    uncertainty: { type: 'string' }
  },
  required: [
    'summary', 'scene_type', 'vehicle', 'apparent_damage', 'dashboard',
    'document_like', 'contains_personal_data', 'safe_commercial_context', 'uncertainty'
  ]
};

function requiredOpenAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível para o pipeline de visão.');
  return key;
}

function inboundImage(rawPayload: any) {
  return rawPayload?.message?.imageMessage || rawPayload?.imageMessage || null;
}

function imageMime(rawPayload: any) {
  return String(inboundImage(rawPayload)?.mimetype || 'image/jpeg').split(';')[0].trim().toLowerCase();
}

function providerMessageId(rawPayload: any) {
  return String(rawPayload?.key?.id || rawPayload?.message?.key?.id || rawPayload?.id || '').trim();
}

function decodeBase64(base64: string) {
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw new Error('Imagem recebida está vazia após decodificação.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Imagem excede o limite seguro de 10 MB do AUTOCAR Vision V1.');
  return bytes;
}

async function getEvolutionImageBase64(instanceName: string, rawMessage: any) {
  const result = await evolutionRequest(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: { message: rawMessage, convertToMp4: false }
  });
  const base64 = normalizeEvolutionMediaBase64(result);
  if (!base64) throw new Error('Evolution não retornou a imagem em base64.');
  return base64;
}

async function visionRuntimeEligibility(storeId: string, conversationId: string) {
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
    return { allowed: false, reason: 'Vision V1 não executa porque a AUTOCAR não está efetivamente em AUTOPILOT.' };
  }
  if (runtime && runtime.effective_mode !== 'autopilot') {
    return { allowed: false, reason: `Vision V1 bloqueada pelo modo efetivo ${String(runtime.effective_mode || 'off').toUpperCase()}.` };
  }
  if (runtime && runtime.human_state !== 'autocar_active') {
    return {
      allowed: false,
      reason: `Vision V1 bloqueada durante takeover humano: ${runtime.pause_reason || runtime.human_state || 'estado humano'}.`
    };
  }

  return { allowed: true, reason: 'AUTOCAR em AUTOPILOT e sem takeover humano.' };
}

async function analyzeImage(input: { base64: string; mime: string; caption: string }) {
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
        'Você é o módulo visual da AUTOCAR para atendimento automotivo.',
        'Descreva somente o que é visualmente sustentado pela imagem; não invente marca, modelo, versão, quilometragem, avaria ou diagnóstico.',
        'Quando marca/modelo não forem inequívocos, deixe os campos vazios e reduza a confiança.',
        'Danos são apenas aparentes visualmente e nunca equivalem a laudo, perícia ou avaliação definitiva.',
        'Se parecer documento ou contiver dados pessoais, marque os indicadores e não transcreva números, nomes, CPF, CNH, placa ou outros identificadores pessoais no resumo.',
        'safe_commercial_context deve ser uma frase curta e segura que possa ser usada como contexto pela AUTOCAR na conversa.',
        'uncertainty deve explicar limitações relevantes da análise.'
      ].join(' '),
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: input.caption ? `Legenda enviada pelo cliente: ${input.caption}` : 'O cliente enviou esta imagem sem legenda.' },
          { type: 'input_image', image_url: `data:${input.mime};base64,${input.base64}`, detail: 'auto' }
        ]
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'autocar_vision_analysis',
          strict: true,
          schema: visionSchema
        }
      }
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error?.message || `OpenAI Vision HTTP ${response.status}.`).slice(0, 500));
  }
  const text = autocarOutputText(payload);
  if (!text) throw new Error('A análise visual retornou vazia.');

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
    throw new Error('A resposta estruturada do AUTOCAR Vision V1 não pôde ser interpretada.');
  }
}

export function autocarVisionContextText(rawPayload: any) {
  const vision = rawPayload?.autocar_vision_analysis;
  if (!vision?.analysis) return '';
  const analysis = vision.analysis;
  const parts = [
    String(analysis.safe_commercial_context || '').trim(),
    analysis.document_like ? 'A imagem parece ser um documento; não extrair dados pessoais nesta fase.' : '',
    String(analysis.uncertainty || '').trim() ? `Limitações visuais: ${String(analysis.uncertainty).trim()}` : ''
  ].filter(Boolean);
  return parts.join(' ');
}

export async function prepareAutocarInboundImage(input: {
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
  if (!message) return { ready: false, skipped: true, reason: 'Mensagem canônica não encontrada para visão.' };
  if (String(message.message_type || '') !== 'image') return { ready: true, skipped: true, reason: 'Mensagem não é imagem.' };

  const existing = message?.raw_payload?.autocar_vision_analysis;
  if (existing?.analysis) {
    return {
      ready: true,
      duplicate: true,
      version: existing.version || VISION_PIPELINE_VERSION,
      model: existing.model || null,
      bytes: existing.bytes || null,
      analysis: existing.analysis,
      usage: existing.usage || null
    };
  }

  const eligibility = await visionRuntimeEligibility(input.storeId, input.conversationId);
  if (!eligibility.allowed) {
    return {
      ready: true,
      skipped: true,
      gated: true,
      version: VISION_PIPELINE_VERSION,
      model: null,
      bytes: null,
      mimetype: imageMime(message.raw_payload),
      analysis: null,
      usage: null,
      reason: eligibility.reason
    };
  }

  const mime = imageMime(message.raw_payload);
  if (!SUPPORTED_IMAGE_MIMES.has(mime)) {
    return { ready: false, skipped: true, reason: `Formato de imagem ${mime || 'desconhecido'} não suportado no Vision V1.` };
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
    return { ready: false, skipped: true, reason: 'Integração Evolution da loja não está conectada para recuperar a imagem.' };
  }

  const providerId = providerMessageId(message.raw_payload);
  if (!providerId) return { ready: false, skipped: true, reason: 'Imagem sem identificador do provedor.' };

  const base64 = await getEvolutionImageBase64(String(integration.instance_name), message.raw_payload);
  const bytes = decodeBase64(base64);
  const caption = String(inboundImage(message.raw_payload)?.caption || message.body || '').replace(/^\[Imagem\]$/i, '').trim().slice(0, 4000);
  const result = await analyzeImage({ base64, mime, caption });
  const analyzedAt = new Date().toISOString();
  const vision = {
    version: VISION_PIPELINE_VERSION,
    model: result.model,
    mimetype: mime,
    bytes: bytes.length,
    provider_message_id: providerId,
    analyzed_at: analyzedAt,
    usage: result.usage,
    analysis: result.analysis
  };

  const { error: updateError } = await input.productionSupabase
    .from('whatsapp_messages')
    .update({ raw_payload: { ...(message.raw_payload || {}), autocar_vision_analysis: vision } })
    .eq('id', message.id)
    .eq('store_id', input.storeId);
  if (updateError) throw updateError;

  return {
    ready: true,
    version: VISION_PIPELINE_VERSION,
    model: result.model,
    bytes: bytes.length,
    mimetype: mime,
    analysis: result.analysis,
    usage: result.usage
  };
}
