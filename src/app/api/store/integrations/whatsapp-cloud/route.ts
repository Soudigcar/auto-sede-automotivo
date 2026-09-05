import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import {
  assertWhatsappCloudPreviewWriteEnabled,
  auditStoreWhatsappCloud,
  loadStoreWhatsappCloudIntegration,
  publicWhatsappCloudIntegration,
  saveStoreWhatsappCloudDraft,
  saveStoreWhatsappCloudSyntheticSecrets
} from '@/lib/server/storeWhatsappCloud';

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

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeManager(request, slug);
    if ('error' in context) return context.error;

    const row = await loadStoreWhatsappCloudIntegration(context.supabase, context.store.id);
    const [templates, flows, journeys] = await Promise.all([
      context.supabase.from('store_whatsapp_message_templates').select('id', { count: 'exact', head: true }).eq('store_id', context.store.id),
      context.supabase.from('store_whatsapp_flows').select('id', { count: 'exact', head: true }).eq('store_id', context.store.id),
      context.supabase.from('store_whatsapp_journeys').select('id', { count: 'exact', head: true }).eq('store_id', context.store.id)
    ]);

    for (const result of [templates, flows, journeys]) {
      if (result.error) throw result.error;
    }

    return NextResponse.json({
      success: true,
      integration: publicWhatsappCloudIntegration(row),
      capabilities: {
        templates: templates.count || 0,
        flows: flows.count || 0,
        journeys: journeys.count || 0,
        external_execution: false,
        synthetic_only: true
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Não foi possível consultar a WhatsApp Cloud API.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let context: any = null;
  let integration: any = null;
  let action = '';

  try {
    assertWhatsappCloudPreviewWriteEnabled();
    const body = await request.json();
    const slug = cleanText(body?.slug, 120);
    action = cleanText(body?.action, 60).toLowerCase();
    context = await authorizeManager(request, slug);
    if ('error' in context) return context.error;

    integration = await loadStoreWhatsappCloudIntegration(context.supabase, context.store.id);

    if (action === 'save-draft') {
      integration = await saveStoreWhatsappCloudDraft(
        context.supabase,
        { storeId: context.store.id, profileId: context.profile.id },
        body
      );
      await auditStoreWhatsappCloud(context.supabase, {
        storeId: context.store.id,
        integrationId: integration.id,
        actorUserId: context.profile.id,
        action: 'save_draft',
        entityType: 'cloud_integration',
        entityId: integration.id,
        outcome: 'success',
        metadata: { synthetic: true, enabled: false }
      });
      return NextResponse.json({ success: true, integration: publicWhatsappCloudIntegration(integration) });
    }

    if (action === 'save-synthetic-secrets') {
      if (!integration) {
        return NextResponse.json({ error: 'Salve a configuração sintética antes das credenciais.' }, { status: 409 });
      }
      await saveStoreWhatsappCloudSyntheticSecrets(context.supabase, integration.id, body);
      const refreshed = await loadStoreWhatsappCloudIntegration(context.supabase, context.store.id);
      await auditStoreWhatsappCloud(context.supabase, {
        storeId: context.store.id,
        integrationId: integration.id,
        actorUserId: context.profile.id,
        action: 'save_synthetic_secrets',
        entityType: 'cloud_integration',
        entityId: integration.id,
        outcome: 'success',
        metadata: { synthetic: true }
      });
      return NextResponse.json({ success: true, integration: publicWhatsappCloudIntegration(refreshed) });
    }

    if (action === 'disable') {
      if (!integration) {
        return NextResponse.json({ success: true, integration: publicWhatsappCloudIntegration(null) });
      }
      const { data, error } = await context.supabase
        .from('store_whatsapp_cloud_integrations')
        .update({ enabled: false, status: 'disabled', updated_by: context.profile.id, updated_at: new Date().toISOString() })
        .eq('id', integration.id)
        .eq('store_id', context.store.id)
        .select('*')
        .single();
      if (error) throw error;
      await auditStoreWhatsappCloud(context.supabase, {
        storeId: context.store.id,
        integrationId: integration.id,
        actorUserId: context.profile.id,
        action: 'disable',
        entityType: 'cloud_integration',
        entityId: integration.id,
        outcome: 'success'
      });
      return NextResponse.json({ success: true, integration: publicWhatsappCloudIntegration(data) });
    }

    if (action === 'revoke-synthetic-secrets') {
      if (!integration) {
        return NextResponse.json({ success: true, integration: publicWhatsappCloudIntegration(null) });
      }
      const { error } = await context.supabase.rpc('store_whatsapp_cloud_revoke_secrets', {
        p_integration_id: integration.id
      });
      if (error) throw error;
      const refreshed = await loadStoreWhatsappCloudIntegration(context.supabase, context.store.id);
      await auditStoreWhatsappCloud(context.supabase, {
        storeId: context.store.id,
        integrationId: integration.id,
        actorUserId: context.profile.id,
        action: 'revoke_synthetic_secrets',
        entityType: 'cloud_integration',
        entityId: integration.id,
        outcome: 'success',
        metadata: { synthetic: true }
      });
      return NextResponse.json({ success: true, integration: publicWhatsappCloudIntegration(refreshed) });
    }

    return NextResponse.json({ error: 'Ação da WhatsApp Cloud API inválida.' }, { status: 400 });
  } catch (error: any) {
    if (context && !('error' in context)) {
      try {
        await auditStoreWhatsappCloud(context.supabase, {
          storeId: context.store.id,
          integrationId: integration?.id || null,
          actorUserId: context.profile.id,
          action: action || 'unknown',
          entityType: 'cloud_integration',
          entityId: integration?.id || null,
          outcome: 'error',
          metadata: { message: cleanText(error?.message || 'unknown error', 500) }
        });
      } catch {}
    }
    return NextResponse.json(
      { error: error?.message || 'Não foi possível administrar a WhatsApp Cloud API.' },
      { status: 500 }
    );
  }
}
