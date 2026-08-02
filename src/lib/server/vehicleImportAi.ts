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
  title: { type: 'string' },
  description: { type: 'string' },
  brand: { type: 'string' },
  model: { type: 'string' },
  version: { type: 'string' },
  year: { type: 'string' },
  mileage: { type: 'string' },
  color: { type: 'string' },
  transmission: { type: 'string' },
  fuel: { type: 'string' },
  price: { type: 'number' }
} as const;

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['vehicle', 'optimized_description', 'conflicts', 'warnings'],
  properties: {
    vehicle: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(vehicleProperties),
      properties: vehicleProperties
    },
    optimized_description: { type: 'string' },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'message'],
        properties: {
          field: { type: 'string' },
          message: { type: 'string' }
        }
      }
    },
    warnings: { type: 'array', items: { type: 'string' } }
  }
} as const;

function cleanText(value: unknown, maxLength = 12000) {
  return String(value || '')
    .replace(/\uFFFD+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function safeVehicle(value: any): VehicleImportInput {
  return {
    source_url: cleanText(value?.source_url, 2200),
    title: cleanText(value?.title, 500),
    description: cleanText(value?.description, 12000),
    brand: cleanText(value?.brand, 100),
    model: cleanText(value?.model, 140),
    version: cleanText(value?.version, 220),
    year: cleanText(value?.year, 40),
    mileage: cleanText(value?.mileage, 80),
    color: cleanText(value?.color, 80),
    transmission: cleanText(value?.transmission, 80),
    fuel: cleanText(value?.fuel, 80),
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

export async function reviewVehicleImportWithOpenAI(
  input: VehicleImportInput,
  sourceLabel = 'site público da loja'
): Promise<AiReviewResult> {
  const vehicle = safeVehicle(input);
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const model = cleanText(process.env.OPENAI_MODEL || 'gpt-5', 100);

  if (!apiKey) {
    return {
      ok: false,
      model,
      vehicle,
      optimized_description: vehicle.description || '',
      conflicts: [],
      warnings: ['OPENAI_API_KEY não configurada. A importação técnica foi preservada sem revisão por IA.'],
      error: 'OPENAI_API_KEY não configurada.'
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 2200,
        instructions: [
          'Você é um auditor de cadastros de veículos no mercado brasileiro.',
          'Use exclusivamente os dados fornecidos pelo anúncio e pelo endereço de origem.',
          'Você pode organizar, normalizar capitalização e separar marca, modelo e versão quando isso estiver comprovado no título, descrição ou URL.',
          'Nunca invente quilometragem, cor, ano, versão, combustível, câmbio, preço, opcionais, garantia, histórico ou condição comercial.',
          'Quando uma informação não estiver comprovada, preserve o valor recebido ou deixe o campo vazio.',
          'Não altere números sem evidência explícita. Registre divergências em conflicts e incertezas em warnings.',
          'Ignore totalmente menus, navegação, rodapé, cookies, contatos, redes sociais, formulários, veículos relacionados, ofertas de outros carros e trechos com caracteres corrompidos.',
          'optimized_description deve ser uma nova descrição comercial, clara e natural, em um ou dois parágrafos curtos, baseada somente nos dados confirmados do veículo.',
          'Não copie o texto bruto da página e não inclua links, telefone, endereço, preço de parcelas, chamadas genéricas ou promessas não comprovadas.',
          'Responda em português do Brasil e siga exatamente o JSON Schema solicitado.'
        ].join('\n'),
        input: JSON.stringify({ source: sourceLabel, vehicle }),
        text: {
          verbosity: 'low',
          format: {
            type: 'json_schema',
            name: 'vehicle_site_import_review',
            strict: true,
            schema: responseSchema
          }
        }
      }),
      cache: 'no-store'
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = cleanText(payload?.error?.message, 500) || `OpenAI respondeu com status ${response.status}.`;
      return {
        ok: false,
        model,
        vehicle,
        optimized_description: vehicle.description || '',
        conflicts: [],
        warnings: [`A revisão por IA não foi aplicada: ${providerMessage}`],
        error: providerMessage
      };
    }

    const output = responseText(payload);
    if (!output) {
      return {
        ok: false,
        model: payload?.model || model,
        vehicle,
        optimized_description: vehicle.description || '',
        conflicts: [],
        warnings: ['A OpenAI respondeu sem conteúdo estruturado.'],
        error: 'Resposta vazia da OpenAI.'
      };
    }

    const parsed = JSON.parse(output);
    return {
      ok: true,
      model: payload?.model || model,
      vehicle: safeVehicle({ ...parsed?.vehicle, source_url: vehicle.source_url }),
      optimized_description: cleanText(parsed?.optimized_description, 12000),
      conflicts: Array.isArray(parsed?.conflicts) ? parsed.conflicts.slice(0, 20).map((item: any) => ({
        field: cleanText(item?.field, 100),
        message: cleanText(item?.message, 500)
      })) : [],
      warnings: Array.isArray(parsed?.warnings) ? parsed.warnings.slice(0, 20).map((item: any) => cleanText(item, 500)).filter(Boolean) : []
    };
  } catch (error: any) {
    const message = cleanText(error?.message || 'Falha ao consultar a OpenAI.', 500);
    return {
      ok: false,
      model,
      vehicle,
      optimized_description: vehicle.description || '',
      conflicts: [],
      warnings: [`A revisão por IA não foi aplicada: ${message}`],
      error: message
    };
  }
}

export function mergeImportedVehicle(baseInput: VehicleImportInput, reviewedInput: VehicleImportInput) {
  const base = safeVehicle(baseInput);
  const reviewed = safeVehicle(reviewedInput);

  return {
    source_url: base.source_url,
    title: reviewed.title || base.title,
    description: reviewed.description || base.description,
    brand: reviewed.brand || base.brand,
    model: reviewed.model || base.model,
    version: reviewed.version || base.version,
    year: reviewed.year || base.year,
    mileage: reviewed.mileage || base.mileage,
    color: reviewed.color || base.color,
    transmission: reviewed.transmission || base.transmission,
    fuel: reviewed.fuel || base.fuel,
    price: reviewed.price || base.price || 0
  };
}
