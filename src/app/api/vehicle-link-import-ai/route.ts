import { NextResponse } from 'next/server';
import { asStorePortalRole, storePortalPermissions } from '@/lib/server/storePortal';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type AiAction = 'normalize' | 'description' | 'marketing';

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
  required: ['vehicle', 'optimized_description', 'instagram_caption', 'whatsapp_message', 'conflicts', 'warnings'],
  properties: {
    vehicle: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(vehicleProperties),
      properties: vehicleProperties
    },
    optimized_description: { type: 'string' },
    instagram_caption: { type: 'string' },
    whatsapp_message: { type: 'string' },
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

function safeVehicle(value: any) {
  return {
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

async function authorize(request: Request, requestedStoreId: string) {
  const supabase: any = createAdminClient();
  const profile = await getProfileFromToken(supabase, readBearerToken(request));
  const role = asStorePortalRole(profile?.role);

  if (!profile || profile.status !== 'active' || !role) {
    return { error: NextResponse.json({ error: 'Usuário sem perfil ativo para usar a IA.' }, { status: 403 }) } as const;
  }
  if (!storePortalPermissions(role).includes('submit_stock_import')) {
    return { error: NextResponse.json({ error: 'Seu perfil não pode analisar importações de estoque.' }, { status: 403 }) } as const;
  }

  const storeId = role === 'master' ? cleanText(requestedStoreId, 80) : cleanText(profile.store_id, 80);
  if (!storeId) {
    return { error: NextResponse.json({ error: 'Selecione a loja proprietária.' }, { status: 400 }) } as const;
  }
  if (role !== 'master' && profile.store_id !== storeId) {
    return { error: NextResponse.json({ error: 'Você não pode analisar veículos de outra loja.' }, { status: 403 }) } as const;
  }

  const { data: store, error } = await supabase
    .from('stores')
    .select('id,status,portal_enabled')
    .eq('id', storeId)
    .maybeSingle();

  if (error) throw error;
  if (!store || store.status !== 'active' || !store.portal_enabled) {
    return { error: NextResponse.json({ error: 'A loja está inativa ou indisponível no portal.' }, { status: 409 }) } as const;
  }

  return { profile, role, store } as const;
}

function actionGoal(action: AiAction) {
  if (action === 'description') {
    return 'Priorize uma descrição comercial clara, objetiva e fiel aos dados. Também audite conflitos. Deixe os conteúdos de Instagram e WhatsApp vazios.';
  }
  if (action === 'marketing') {
    return 'Crie legenda para Instagram e mensagem curta para WhatsApp. Preserve os dados do veículo e não invente condições, garantias, taxas ou benefícios.';
  }
  return 'Normalize os campos técnicos, corrija apenas erros evidentes e identifique divergências. Gere também uma descrição comercial fiel. Deixe Instagram e WhatsApp vazios.';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = cleanText(body?.action, 30) as AiAction;
    if (!['normalize', 'description', 'marketing'].includes(action)) {
      return NextResponse.json({ error: 'Ação de IA inválida.' }, { status: 400 });
    }

    const authorization = await authorize(request, cleanText(body?.store_id, 80));
    if ('error' in authorization) return authorization.error;

    const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'A integração com a OpenAI ainda não foi configurada no servidor.' }, { status: 503 });
    }

    const vehicle = safeVehicle(body?.vehicle);
    if (!vehicle.title && !vehicle.description && !vehicle.brand && !vehicle.model) {
      return NextResponse.json({ error: 'Importe os dados do anúncio antes de usar a IA.' }, { status: 400 });
    }

    const model = cleanText(process.env.OPENAI_MODEL || 'gpt-5.6-luna', 100);
    const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: 'none' },
        store: false,
        max_output_tokens: 2500,
        instructions: [
          'Você é um auditor de cadastro automotivo brasileiro.',
          'Use exclusivamente os dados fornecidos. Nunca invente especificações, preço, quilometragem, opcionais, histórico, garantia ou condição comercial.',
          'Quando um dado não estiver comprovado, preserve o valor recebido ou deixe vazio.',
          'Não altere números. Aponte divergências em conflicts e incertezas em warnings.',
          'Responda em português do Brasil e siga exatamente o schema solicitado.',
          actionGoal(action)
        ].join('\n'),
        input: JSON.stringify({ source: 'OLX', vehicle }),
        text: {
          verbosity: 'low',
          format: {
            type: 'json_schema',
            name: 'olx_vehicle_ai_review',
            strict: true,
            schema: responseSchema
          }
        }
      }),
      cache: 'no-store'
    });

    const payload = await openAiResponse.json().catch(() => ({}));
    if (!openAiResponse.ok) {
      const providerMessage = cleanText(payload?.error?.message, 500);
      return NextResponse.json(
        { error: providerMessage || 'A OpenAI não conseguiu analisar este veículo.' },
        { status: openAiResponse.status >= 500 ? 502 : 400 }
      );
    }

    const text = responseText(payload);
    if (!text) {
      return NextResponse.json({ error: 'A OpenAI respondeu sem dados utilizáveis.' }, { status: 502 });
    }

    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'A resposta da OpenAI não pôde ser validada.' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      action,
      model: payload?.model || model,
      result: {
        ...result,
        vehicle: safeVehicle(result?.vehicle),
        conflicts: Array.isArray(result?.conflicts) ? result.conflicts.slice(0, 20) : [],
        warnings: Array.isArray(result?.warnings) ? result.warnings.slice(0, 20) : []
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: cleanText(error?.message, 500) || 'Erro ao analisar o veículo com IA.' }, { status: 500 });
  }
}
