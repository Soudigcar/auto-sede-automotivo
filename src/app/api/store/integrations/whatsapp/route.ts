import { NextResponse } from 'next/server';
import {
  connectManagedEvolutionIntegration,
  createManagedEvolutionIntegration,
  disconnectManagedEvolutionIntegration,
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

  try {
    const body = await request.json();
    const slug = cleanText(body.slug, 120);
    const action = cleanText(body.action, 40).toLowerCase();
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

    return NextResponse.json({ error: 'Ação de integração inválida.' }, { status: 400 });
  } catch (error: any) {
    if (managed && row?.id) {
      await markManagedEvolutionError(managed, row, error);
    }

    return NextResponse.json(
      { error: error?.message || 'Não foi possível administrar a integração WhatsApp.' },
      { status: 500 }
    );
  }
}
