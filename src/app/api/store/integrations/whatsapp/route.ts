import { NextResponse } from 'next/server';
import {
  evolutionInstanceName,
  evolutionWebhookSignature,
  evolutionWebhookSignatureHeader,
  getEvolutionConnectionState,
  getEvolutionWebhook,
  setEvolutionWebhook
} from '@/lib/server/evolution';
import {
  connectManagedEvolutionIntegration,
  createManagedEvolutionIntegration,
  disconnectManagedEvolutionIntegration,
  evolutionConnectionStatus,
  loadManagedEvolutionIntegration,
  markManagedEvolutionError,
  publicEvolutionIntegration,
  readManagedEvolutionState,
  type ManagedEvolutionContext
} from '@/lib/server/managedWhatsappEvolution';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERCEL_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass';
const STORE_WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'];

async function authorizeManager(request: Request, slug: string) {
  const context = await authorizeStorePortal(request, slug);
  if ('error' in context) return context;

  if (context.role !== 'master' && context.role !== 'store') {
    return {
      error: NextResponse.json(
        { error: 'Somente o Gestor da loja ou Master pode administrar integrações.' },
        { status: 403 }
      )
    } as const;
  }

  return context;
}

function managedContext(context: any): ManagedEvolutionContext {
  return {
    supabase: context.supabase,
    scope: 'store',
    storeId: context.store.id,
    profileId: context.profile.id,
    numberLabel: `${context.store.store_name} · WhatsApp Evolution`,
    routingMode: 'store_pipeline'
  };
}

async function refreshStoreEvolutionWebhook(request: Request, managed: ManagedEvolutionContext, row: any) {
  if (
    managed.scope !== 'store' ||
    !managed.storeId ||
    row?.scope !== 'store' ||
    row?.store_id !== managed.storeId ||
    row?.instance_name !== evolutionInstanceName(managed.storeId)
  ) {
    throw new Error('A integração WhatsApp não pertence a esta loja.');
  }

  const stateResult = await getEvolutionConnectionState(row.instance_name);
  if (evolutionConnectionStatus(stateResult?.instance?.state) !== 'connected') {
    throw new Error('O WhatsApp da loja precisa estar conectado para atualizar o webhook.');
  }

  const headers: Record<string, string> = {
    [evolutionWebhookSignatureHeader()]: evolutionWebhookSignature(row.instance_name)
  };

  if (process.env.VERCEL_ENV === 'preview') {
    const bypassSecret = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
    if (!bypassSecret) {
      throw new Error('Variável privada VERCEL_AUTOMATION_BYPASS_SECRET não configurada no Preview.');
    }
    headers[VERCEL_PROTECTION_BYPASS_HEADER] = bypassSecret;
  }

  const webhookUrl = `${new URL(request.url).origin}/api/webhooks/evolution`;
  await setEvolutionWebhook(row.instance_name, {
    enabled: true,
    url: webhookUrl,
    byEvents: false,
    base64: false,
    events: STORE_WEBHOOK_EVENTS,
    headers
  });

  const configuredResult = await getEvolutionWebhook(row.instance_name);
  const configured = configuredResult?.webhook || configuredResult || {};
  const configuredHeaders = configured?.headers || {};
  const headersConfirmed = Object.entries(headers)
    .every(([name, value]) => configuredHeaders[name] === value);

  if (configured.enabled !== true || configured.url !== webhookUrl || !headersConfirmed) {
    throw new Error('A Evolution API não confirmou o webhook protegido desta loja.');
  }

  return row;
}

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeManager(request, slug);
    if ('error' in context) return context.error;

    const managed = managedContext(context);
    const row = await loadManagedEvolutionIntegration(managed);
    if (!row) {
      return NextResponse.json({ success: true, integration: publicEvolutionIntegration(null) });
    }

    const live = await readManagedEvolutionState(row);
    return NextResponse.json({
      success: true,
      integration: publicEvolutionIntegration(row, live)
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Não foi possível consultar a integração WhatsApp.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let managed: ManagedEvolutionContext | null = null;
  let row: any = null;
  let action = '';

  try {
    const body = await request.json();
    const slug = cleanText(body.slug, 120);
    action = cleanText(body.action, 40).toLowerCase();
    const context = await authorizeManager(request, slug);
    if ('error' in context) return context.error;

    managed = managedContext(context);
    row = await loadManagedEvolutionIntegration(managed);

    if (action === 'connect' || action === 'refresh-qr' || action === 'reconnect') {
      const result = row
        ? await connectManagedEvolutionIntegration(managed, row)
        : await createManagedEvolutionIntegration(managed);

      return NextResponse.json({
        success: true,
        integration: publicEvolutionIntegration(result.integration, {
          qr_code: result.qrCode || null
        })
      });
    }

    if (action === 'disconnect') {
      if (!row) {
        return NextResponse.json(
          { error: 'Nenhuma conexão WhatsApp foi configurada para esta loja.' },
          { status: 404 }
        );
      }

      const integration = await disconnectManagedEvolutionIntegration(managed, row);
      return NextResponse.json({
        success: true,
        integration: publicEvolutionIntegration(integration)
      });
    }

    if (action === 'refresh-webhook') {
      if (!row) {
        return NextResponse.json(
          { error: 'Nenhuma conexão WhatsApp foi configurada para esta loja.' },
          { status: 404 }
        );
      }

      const integration = await refreshStoreEvolutionWebhook(request, managed, row);
      return NextResponse.json({
        success: true,
        integration: publicEvolutionIntegration(integration)
      });
    }

    return NextResponse.json({ error: 'Ação de integração inválida.' }, { status: 400 });
  } catch (error: any) {
    if (managed && row?.id && action !== 'refresh-webhook') {
      await markManagedEvolutionError(managed, row, error);
    }

    return NextResponse.json(
      { error: error?.message || 'Não foi possível administrar a integração WhatsApp.' },
      { status: 500 }
    );
  }
}
