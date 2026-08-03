import { ensureMileageInDescription, normalizeVehicleOption } from '@/lib/vehicleCatalogOptions';

type VehicleImportInput = {
  source_url?: string;
  title?: string;
  description?: string;
  brand?: string;
  model?: string;
  version?: string;
  year?: string;
  mileage?: string;
  color?: string;
  transmission?: string;
  fuel?: string;
  price?: number;
};

type VehicleImportReviewContext = {
  source_evidence?: unknown;
  catalog_evidence?: unknown;
};

type AiReviewResult = {
  ok: boolean;
  model: string;
  vehicle: VehicleImportInput;
  optimized_description: string;
  conflicts: Array<{ field: string; message: string }>;
  warnings: string[];
  error?: string;
};

const vehicleProperties = {
  title: { type: 'string' }, description: { type: 'string' }, brand: { type: 'string' },
  model: { type: 'string' }, version: { type: 'string' }, year: { type: 'string' },
  mileage: { type: 'string' }, color: { type: 'string' }, transmission: { type: 'string' },
  fuel: { type: 'string' }, price: { type: 'number' }
} as const;

const responseSchema = {
  type: 'object', additionalProperties: false,
  required: ['vehicle', 'optimized_description', 'conflicts', 'warnings'],
  properties: {
    vehicle: { type: 'object', additionalProperties: false, required: Object.keys(vehicleProperties), properties: vehicleProperties },
    optimized_description: { type: 'string' },
    conflicts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'message'], properties: { field: { type: 'string' }, message: { type: 'string' } } } },
    warnings: { type: 'array', items: { type: 'string' } }
  }
} as const;

function cleanText(value: unknown, maxLength = 12000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function fold(value: unknown) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function safeVehicle(value: any): VehicleImportInput {
  const mileage = cleanText(value?.mileage, 80);
  return {
    source_url: cleanText(value?.source_url, 2200),
    title: cleanText(value?.title, 500),
    description: ensureMileageInDescription(cleanText(value?.description, 12000), mileage),
    brand: cleanText(value?.brand, 100),
    model: cleanText(value?.model, 140),
    version: cleanText(value?.version, 220),
    year: cleanText(value?.year, 40),
    mileage,
    color: normalizeVehicleOption('color', value?.color),
    transmission: normalizeVehicleOption('transmission', value?.transmission),
    fuel: normalizeVehicleOption('fuel', value?.fuel),
    price: Math.max(0, Number(value?.price || 0) || 0)
  };
}

function responseText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function sanitizeReviewMessages(messages: unknown[], vehicle: VehicleImportInput) {
  return messages
    .map((message) => cleanText(message, 500))
    .filter(Boolean)
    .filter((message) => {
      const normalized = fold(message);
      const saysColorMissing = /\bcor\b/.test(normalized) && /(nao inform|nao identific|nao encontr|ausente)/.test(normalized);
      const saysTransmissionMissing = /\b(cambio|transmissao)\b/.test(normalized) && /(nao inform|nao identific|nao encontr|ausente)/.test(normalized);
      const saysFuelMissing = /\b(combustivel|fuel)\b/.test(normalized) && /(nao inform|nao identific|nao encontr|ausente)/.test(normalized);

      if (vehicle.color && saysColorMissing && (!saysTransmissionMissing || vehicle.transmission)) return false;
      if (vehicle.transmission && saysTransmissionMissing && (!saysColorMissing || vehicle.color)) return false;
      if (vehicle.fuel && saysFuelMissing) return false;
      return true;
    });
}

export async function reviewVehicleImportWithOpenAI(
  input: VehicleImportInput,
  sourceLabel = 'site público da loja',
  context: VehicleImportReviewContext = {}
): Promise<AiReviewResult> {
  const vehicle = safeVehicle(input);
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const model = cleanText(process.env.OPENAI_MODEL || 'gpt-5', 100);

  if (!apiKey) {
    return { ok: false, model, vehicle, optimized_description: vehicle.description || '', conflicts: [], warnings: ['A revisão por IA está indisponível neste ambiente. A importação técnica foi preservada para conferência manual.'], error: 'OPENAI_API_KEY não disponível no ambiente de execução.' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, store: false, max_output_tokens: 2200,
        instructions: [
          'Você é um auditor de cadastros de veículos no mercado brasileiro.',
          'Use exclusivamente as evidências fornecidas: campos técnicos, título, URL, descrição original do anúncio e, quando presente, correspondência conservadora do catálogo interno.',
          'A descrição original do anúncio é evidência válida. Leia-a integralmente para identificar informações explícitas como cor, câmbio, combustível, ano e quilometragem.',
          'A prioridade das fontes é: quadro técnico do anúncio; descrição original do anúncio; título e URL; catálogo interno com correspondência única ou consenso; revisão linguística da IA.',
          'O catálogo interno serve somente como fallback para campos ausentes e nunca deve substituir uma informação explícita do anúncio.',
          'Você pode organizar, normalizar capitalização e separar marca, modelo e versão quando isso estiver comprovado pelas evidências.',
          'Nunca invente quilometragem, cor, ano, versão, combustível, câmbio, preço, opcionais, garantia, histórico ou condição comercial.',
          'Quando uma informação não estiver comprovada, preserve o valor recebido ou deixe o campo vazio.',
          'Não altere números sem evidência explícita. Registre divergências em conflicts e incertezas em warnings.',
          'Não declare um campo como não informado quando ele já estiver preenchido no objeto vehicle ou comprovado na descrição original.',
          'Se a quilometragem estiver no campo técnico, inclua-a claramente na descrição otimizada.',
          'Use somente valores padronizados para cor, câmbio e combustível.',
          'Produza uma descrição comercial clara, objetiva e fiel, sem promessas ou benefícios não informados.',
          'Responda em português do Brasil e siga exatamente o JSON Schema solicitado.'
        ].join('\n'),
        input: JSON.stringify({
          source: sourceLabel,
          vehicle,
          evidence: {
            source: context.source_evidence || null,
            catalog: context.catalog_evidence || null
          }
        }),
        text: { verbosity: 'low', format: { type: 'json_schema', name: 'vehicle_site_import_review', strict: true, schema: responseSchema } }
      }),
      cache: 'no-store'
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = cleanText(payload?.error?.message, 500) || `OpenAI respondeu com status ${response.status}.`;
      return { ok: false, model, vehicle, optimized_description: vehicle.description || '', conflicts: [], warnings: [`A revisão por IA não foi aplicada: ${providerMessage}`], error: providerMessage };
    }

    const output = responseText(payload);
    if (!output) return { ok: false, model: payload?.model || model, vehicle, optimized_description: vehicle.description || '', conflicts: [], warnings: ['A OpenAI respondeu sem conteúdo estruturado.'], error: 'Resposta vazia da OpenAI.' };

    const parsed = JSON.parse(output);
    const reviewed = safeVehicle({ ...parsed?.vehicle, source_url: vehicle.source_url });
    const reviewedVehicle = safeVehicle({
      ...reviewed,
      source_url: vehicle.source_url,
      year: vehicle.year || reviewed.year,
      mileage: vehicle.mileage || reviewed.mileage,
      color: vehicle.color || reviewed.color,
      transmission: vehicle.transmission || reviewed.transmission,
      fuel: vehicle.fuel || reviewed.fuel
    });

    return {
      ok: true,
      model: payload?.model || model,
      vehicle: reviewedVehicle,
      optimized_description: ensureMileageInDescription(cleanText(parsed?.optimized_description, 12000) || vehicle.description, reviewedVehicle.mileage),
      conflicts: Array.isArray(parsed?.conflicts) ? parsed.conflicts.slice(0, 20).map((item: any) => ({ field: cleanText(item?.field, 100), message: cleanText(item?.message, 500) })) : [],
      warnings: sanitizeReviewMessages(Array.isArray(parsed?.warnings) ? parsed.warnings.slice(0, 20) : [], reviewedVehicle)
    };
  } catch (error: any) {
    const message = cleanText(error?.message || 'Falha ao consultar a OpenAI.', 500);
    return { ok: false, model, vehicle, optimized_description: vehicle.description || '', conflicts: [], warnings: [`A revisão por IA não foi aplicada: ${message}`], error: message };
  }
}

export function mergeImportedVehicle(baseInput: VehicleImportInput, reviewedInput: VehicleImportInput) {
  const base = safeVehicle(baseInput);
  const reviewed = safeVehicle(reviewedInput);
  const mileage = base.mileage || reviewed.mileage;
  return {
    source_url: base.source_url,
    title: reviewed.title || base.title,
    description: ensureMileageInDescription(reviewed.description || base.description, mileage),
    brand: reviewed.brand || base.brand,
    model: reviewed.model || base.model,
    version: reviewed.version || base.version,
    year: base.year || reviewed.year,
    mileage,
    color: base.color || reviewed.color,
    transmission: base.transmission || reviewed.transmission,
    fuel: base.fuel || reviewed.fuel,
    price: base.price || reviewed.price || 0
  };
}
