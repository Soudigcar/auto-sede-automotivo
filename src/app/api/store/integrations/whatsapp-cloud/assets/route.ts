import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import { assertWhatsappCloudPreviewWriteEnabled, auditStoreWhatsappCloud, loadStoreWhatsappCloudIntegration } from '@/lib/server/storeWhatsappCloud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AssetKind = 'template' | 'flow' | 'journey';

async function authorizeManager(request: Request, slug: string) {
  const context = await authorizeStorePortal(request, slug);
  if ('error' in context) return context;
  if (context.role !== 'master' && context.role !== 'store') {
    return { error: NextResponse.json({ error: 'Somente Gestor ou Master pode administrar estes recursos.' }, { status: 403 }) } as const;
  }
  return context;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const context = await authorizeManager(request, slug);
    if ('error' in context) return context.error;

    const [templates, flows, journeys] = await Promise.all([
      context.supabase.from('store_whatsapp_message_templates').select('id, logical_key, name, language, category, status, version, is_synthetic, created_at, updated_at').eq('store_id', context.store.id).order('created_at', { ascending: false }),
      context.supabase.from('store_whatsapp_flows').select('id, logical_key, name, status, version, data_endpoint_path, is_synthetic, created_at, updated_at').eq('store_id', context.store.id).order('created_at', { ascending: false }),
      context.supabase.from('store_whatsapp_journeys').select('id, name, trigger_type, status, execution_enabled, safe_core_required, is_synthetic, created_at, updated_at').eq('store_id', context.store.id).order('created_at', { ascending: false })
    ]);
    for (const result of [templates, flows, journeys]) if (result.error) throw result.error;

    return NextResponse.json({ success: true, templates: templates.data || [], flows: flows.data || [], journeys: journeys.data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar os recursos da Cloud API.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let context: any = null;
  try {
    assertWhatsappCloudPreviewWriteEnabled();
    const body = await request.json();
    const slug = cleanText(body?.slug, 120);
    const kind = cleanText(body?.kind, 30) as AssetKind;
    context = await authorizeManager(request, slug);
    if ('error' in context) return context.error;

    const integration = await loadStoreWhatsappCloudIntegration(context.supabase, context.store.id);
    if (!integration) return NextResponse.json({ error: 'Configure primeiro a integração Cloud API desta loja.' }, { status: 409 });

    const logicalKey = cleanText(body?.logical_key, 120).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    const name = cleanText(body?.name, 180);
    if (!name || (kind !== 'journey' && !logicalKey)) {
      return NextResponse.json({ error: 'Informe nome e chave lógica válidos.' }, { status: 400 });
    }

    let result: any;
    if (kind === 'template') {
      result = await context.supabase.from('store_whatsapp_message_templates').insert({
        store_id: context.store.id,
        integration_id: integration.id,
        logical_key: logicalKey,
        name,
        language: cleanText(body?.language, 20) || 'pt_BR',
        category: cleanText(body?.category, 80) || null,
        status: 'draft',
        version: 1,
        components: [],
        is_synthetic: true,
        created_by: context.profile.id,
        updated_by: context.profile.id
      }).select('id, logical_key, name, language, category, status, version, is_synthetic').single();
    } else if (kind === 'flow') {
      result = await context.supabase.from('store_whatsapp_flows').insert({
        store_id: context.store.id,
        integration_id: integration.id,
        logical_key: logicalKey,
        name,
        status: 'draft',
        version: 1,
        definition: {},
        is_synthetic: true,
        created_by: context.profile.id,
        updated_by: context.profile.id
      }).select('id, logical_key, name, status, version, is_synthetic').single();
    } else if (kind === 'journey') {
      const triggerType = cleanText(body?.trigger_type, 80) || 'manual_preview';
      result = await context.supabase.from('store_whatsapp_journeys').insert({
        store_id: context.store.id,
        integration_id: integration.id,
        name,
        trigger_type: triggerType,
        status: 'draft',
        execution_enabled: false,
        safe_core_required: true,
        config: {},
        is_synthetic: true,
        created_by: context.profile.id,
        updated_by: context.profile.id
      }).select('id, name, trigger_type, status, execution_enabled, safe_core_required, is_synthetic').single();
    } else {
      return NextResponse.json({ error: 'Tipo de recurso inválido.' }, { status: 400 });
    }

    if (result.error) throw result.error;
    await auditStoreWhatsappCloud(context.supabase, {
      storeId: context.store.id,
      integrationId: integration.id,
      actorUserId: context.profile.id,
      action: `create_synthetic_${kind}`,
      entityType: kind,
      entityId: result.data.id,
      outcome: 'success',
      metadata: { synthetic: true, external_execution: false }
    });

    return NextResponse.json({ success: true, asset: result.data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível criar o recurso sintético.' }, { status: 500 });
  }
}
