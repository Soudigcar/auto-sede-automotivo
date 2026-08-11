import { NextResponse } from 'next/server';
import {
  adoptMasterPilotEvolutionIntegration,
  connectManagedEvolutionIntegration,
  createManagedEvolutionIntegration,
  disconnectManagedEvolutionIntegration,
  loadManagedEvolutionIntegration,
  markManagedEvolutionError,
  publicEvolutionIntegration,
  readManagedEvolutionState,
  type ManagedEvolutionContext
} from '@/lib/server/managedWhatsappEvolution';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function managedContext(supabase: any, profile: any): ManagedEvolutionContext {
  return {
    supabase,
    scope: 'master',
    storeId: null,
    profileId: profile.id,
    numberLabel: 'Master · WhatsApp Evolution',
    routingMode: 'master_base'
  };
}

async function authorizeMaster(request: Request) {
  const supabase = getAdminClient();
  const profile = await requireMaster(request, supabase);

  if (!profile) {
    return {
      error: NextResponse.json(
        { error: 'Apenas usuário Master pode administrar o WhatsApp central.' },
        { status: 403 }
      )
    } as const;
  }

  return { supabase, profile } as const;
}

export async function GET(request: Request) {
  try {
    const authorization = await authorizeMaster(request);
    if ('error' in authorization) return authorization.error;

    const context = managedContext(authorization.supabase, authorization.profile);
    const row = await loadManagedEvolutionIntegration(context);
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
      { error: error?.message || 'Não foi possível consultar o WhatsApp central.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let context: ManagedEvolutionContext | null = null;
  let row: any = null;
  let action = '';

  try {
    const authorization = await authorizeMaster(request);
    if ('error' in authorization) return authorization.error;

    const body = await request.json();
    action = cleanText(body.action, 40).toLowerCase();
    context = managedContext(authorization.supabase, authorization.profile);
    row = await loadManagedEvolutionIntegration(context);

    if (action === 'connect' || action === 'refresh-qr' || action === 'reconnect') {
      const result = row
        ? await connectManagedEvolutionIntegration(context, row)
        : await createManagedEvolutionIntegration(context);

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
          { error: 'Nenhuma conexão WhatsApp central foi configurada.' },
          { status: 404 }
        );
      }

      const integration = await disconnectManagedEvolutionIntegration(context, row);
      return NextResponse.json({
        success: true,
        integration: publicEvolutionIntegration(integration)
      });
    }

    if (action === 'adopt-pilot') {
      if (!row) {
        return NextResponse.json(
          { error: 'Crie primeiro o vínculo central da Master antes de reaproveitar a instância piloto.' },
          { status: 409 }
        );
      }

      const integration = await adoptMasterPilotEvolutionIntegration(context, row);
      return NextResponse.json({
        success: true,
        integration: publicEvolutionIntegration(integration)
      });
    }

    return NextResponse.json({ error: 'Ação de integração inválida.' }, { status: 400 });
  } catch (error: any) {
    if (context && row?.id && action !== 'adopt-pilot') {
      await markManagedEvolutionError(context, row, error);
    }

    return NextResponse.json(
      { error: error?.message || 'Não foi possível administrar o WhatsApp central.' },
      { status: 500 }
    );
  }
}
