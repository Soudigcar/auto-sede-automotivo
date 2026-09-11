import { createAutocarStructuredResponse } from '@/lib/server/autocar/client';
import type { AutocarTrainingScope } from '@/lib/server/autocar/commercialTrainingV3';

export const AUTOCAR_COMMERCIAL_COACH_VERSION = 'autocar-commercial-coach-v3-real-conversation-preview';
export const AUTOCAR_COMMERCIAL_COACH_PREVIEW_BRANCH = 'feature/autocar-commercial-intelligence-training-v3';

export type CommercialCoachLessonV3 = {
  situation: string;
  intent: string;
  technique: string;
  objective: string;
  restrictions: string[];
  next_action: string;
  examples: string[];
};

const lessonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    situation: { type: 'string' },
    intent: { type: 'string' },
    technique: { type: 'string' },
    objective: { type: 'string' },
    restrictions: { type: 'array', items: { type: 'string' } },
    next_action: { type: 'string' },
    examples: { type: 'array', items: { type: 'string' } }
  },
  required: ['situation', 'intent', 'technique', 'objective', 'restrictions', 'next_action', 'examples']
};

function cleanText(value: unknown, max = 5000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function minimizeCommercialCoachTextV3(value: unknown, max = 5000) {
  return cleanText(value, max)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ]')
    .replace(/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}\b/g, '[TELEFONE]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[ID]')
    .replace(/\b[A-Z]{3}[- ]?\d[A-Z0-9]\d{2}\b/gi, '[PLACA]');
}

function cleanLines(values: unknown, maxItems = 12, maxChars = 1600) {
  return (Array.isArray(values) ? values : [])
    .map((value) => minimizeCommercialCoachTextV3(value, maxChars))
    .filter(Boolean)
    .slice(-maxItems);
}

export function evaluateCommercialTrainingCoachPreviewScope(input: {
  vercelEnv?: string | null;
  gitRef?: string | null;
}) {
  const environment = cleanText(input.vercelEnv, 60);
  const gitRef = cleanText(input.gitRef, 240);
  if (environment !== 'preview') {
    return { allowed: false, reason: 'Treinar com Conversas Reais V3 está bloqueado fora de Vercel Preview.' };
  }
  if (gitRef !== AUTOCAR_COMMERCIAL_COACH_PREVIEW_BRANCH) {
    return { allowed: false, reason: 'Treinar com Conversas Reais V3 está restrito à branch de homologação autorizada.' };
  }
  return { allowed: true, reason: 'Preview autorizado para coaching read-only V3.' };
}

export function assertCommercialTrainingCoachPreviewScope() {
  const result = evaluateCommercialTrainingCoachPreviewScope({
    vercelEnv: process.env.VERCEL_ENV,
    gitRef: process.env.VERCEL_GIT_COMMIT_REF
  });
  if (!result.allowed) throw new Error(result.reason);
  return result;
}

export async function structureCommercialCoachingV3(input: {
  feedback?: string | null;
  correctedResponse?: string | null;
  scope: AutocarTrainingScope;
  storeName?: string | null;
  currentInbound: string;
  currentAutocarResponse: string;
  recentConversation: string[];
}) {
  const feedback = minimizeCommercialCoachTextV3(input.feedback, 6000);
  const correctedResponse = minimizeCommercialCoachTextV3(input.correctedResponse, 6000);
  const currentInbound = minimizeCommercialCoachTextV3(input.currentInbound, 4000);
  const currentAutocarResponse = minimizeCommercialCoachTextV3(input.currentAutocarResponse, 6000);
  if (!feedback && !correctedResponse) {
    throw new Error('Edite a cópia da resposta da AUTOCAR ou explique como ela deveria ter conduzido esse momento.');
  }
  if (!currentInbound) throw new Error('A mensagem do cliente é obrigatória para estruturar o aprendizado.');
  if (!currentAutocarResponse) throw new Error('A resposta original da AUTOCAR é obrigatória para este modo de correção.');

  const result = await createAutocarStructuredResponse({
    task: 'commercial_reply',
    maxOutputTokens: 1200,
    instructions: [
      'Você é o COACH COMERCIAL V3 da AUTOCAR.',
      'Transforme a correção e a orientação do treinador humano em uma técnica comercial reutilizável, sem criar roteiro ou resposta fixa.',
      'A conversa é material de treinamento read-only. Não execute ação, não envie mensagem, não altere CRM e não invente fatos.',
      'A resposta corrigida é uma demonstração não vinculante da intenção do treinador. Extraia dela raciocínio, ordem da conversa, postura, técnica e limites; nunca a transforme em template obrigatório.',
      'Compare a resposta original da AUTOCAR com a correção do treinador para identificar o que mudou e generalizar o aprendizado.',
      'Não transforme nomes, telefones, e-mails, documentos, placas, valores, estoque ou outros fatos específicos da conversa em regra comercial reutilizável.',
      'Preserve a intenção do treinador. Não corrija silenciosamente a estratégia comercial dele, exceto quando ela violar segurança, regras Master ou depender de fatos inexistentes.',
      'situation descreve o padrão de situação comercial, não o nome do cliente.',
      'intent deve ser um identificador curto em snake_case, sem dados pessoais.',
      'technique descreve como raciocinar e conduzir; não escreva uma fala pronta para o cliente.',
      'objective descreve o resultado comercial pretendido.',
      'restrictions lista o que evitar, incluindo pressão, invenção ou avanço prematuro quando aplicável.',
      'next_action descreve no máximo um próximo movimento comercial preferido, condicionado ao contexto.',
      'examples contém somente paráfrases genéricas de situações ou mensagens, sem nomes, telefones, documentos, placas ou outros dados pessoais.',
      'Se o escopo for store, a técnica pode adaptar o processo local, mas nunca pode contrariar regras Master, SAFE CORE ou fatos canônicos.',
      'Uma pergunta isolada de preço, foto, quilometragem, financiamento ou detalhe do veículo não prova maturidade para agendamento por si só.'
    ].join(' '),
    input: {
      scope: input.scope,
      store_name: cleanText(input.storeName, 240) || null,
      trainer_feedback: feedback || null,
      trainer_corrected_response_non_binding: correctedResponse || null,
      current_customer_message: currentInbound,
      original_autocar_response: currentAutocarResponse,
      recent_conversation: cleanLines(input.recentConversation, 12, 1600)
    },
    schemaName: 'autocar_commercial_coach_v3_lesson',
    schema: lessonSchema,
    diagnosticStage: 'structured_response'
  });

  const parsed = result.parsed as CommercialCoachLessonV3;
  const lesson: CommercialCoachLessonV3 = {
    situation: cleanText(parsed.situation, 4000),
    intent: cleanText(parsed.intent, 240).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''),
    technique: cleanText(parsed.technique, 5000),
    objective: cleanText(parsed.objective, 2000),
    restrictions: cleanLines(parsed.restrictions, 20, 700),
    next_action: cleanText(parsed.next_action, 2000),
    examples: cleanLines(parsed.examples, 12, 1000)
  };

  if (!lesson.technique || !lesson.objective) {
    throw new Error('O Coach V3 não conseguiu estruturar técnica e objetivo com segurança.');
  }

  return {
    version: AUTOCAR_COMMERCIAL_COACH_VERSION,
    lesson,
    model_routing: result.routing,
    usage: {
      input_tokens: Number(result.payload?.usage?.input_tokens || 0),
      output_tokens: Number(result.payload?.usage?.output_tokens || 0)
    },
    privacy: {
      personal_identifiers_minimized_before_model: true
    },
    external_execution: false,
    persistence: false
  };
}
