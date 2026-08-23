import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import {
  archiveAutocarKnowledge,
  finalizeAutocarKnowledgeUpload,
  prepareAutocarKnowledgeUpload
} from '@/lib/server/autocar/knowledgeLibrary';
import { getAutocarDevClient, setAutocarMasterAccess } from '@/lib/server/autocar/devAdmin';
import { getAutocarRuntimePublicStatus } from '@/lib/server/autocar/runtimeEnvironment';
import { aiPlatformModelRegistry } from '@/lib/server/ai-platform/models/registry';
import { readAutocarClaimTelemetry } from '@/lib/server/ai-platform/telemetry/autocarClaims';
import {
  readAutocarControlPlaneReport,
  readAutocarMasterControlPlane,
  setAutocarGlobalPolicy,
  setAutocarModelPricing
} from '@/lib/server/autocar/masterControlPlane';
import type { AutocarCapability, AutocarPolicyEffect } from '@/lib/server/autocar/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function humanError(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/entity too large|request too large|payload too large|413/i.test(message)) {
    return 'Arquivo grande demais para a API. Use o upload direto da Central AUTOCAR.';
  }
  if (/25 MB|file size|tamanho/i.test(message)) {
    return 'O arquivo deve ter no máximo 25 MB.';
  }
  return message || 'Não foi possível concluir a operação da AUTOCAR.';
}

async function masterContext(request: Request) {
  const production = getAdminClient();
  const master = await requireMaster(request, production);
  if (!master) {
    return {
      error: NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 })
    } as const;
  }
  return { production, master } as const;
}

async function productionStore(production: any, storeId: string) {
  const { data: store, error } = await production
    .from('stores')
    .select('id,store_name,slug,status,portal_enabled')
    .eq('id', storeId)
    .maybeSingle();
  if (error) throw error;
  return store;
}

export async function GET(request: Request) {
  try {
    const context = await masterContext(request);
    if ('error' in context) return context.error;

    const autocar = getAutocarDevClient();
    const [storesResult, agentsResult, documentsResult, telemetry, runtimeStatus, controlPlane, controlPlaneReport] = await Promise.all([
      context.production
        .from('stores')
        .select('id,store_name,slug,status,portal_enabled,city,state')
        .order('store_name', { ascending: true }),
      autocar
        .from('ai_store_agents')
        .select('id,store_id,name,status,mode,tone,language,version,master_enabled,master_autopilot_allowed,store_selected_mode,updated_at')
        .order('updated_at', { ascending: false }),
      autocar
        .from('ai_knowledge_documents')
        .select('id,scope,store_id,title,original_filename,mime_type,file_size_bytes,status,extracted_characters,chunk_count,embedding_model,extraction_error,metadata,created_at,updated_at')
        .eq('scope', 'method')
        .neq('status', 'archived')
        .order('created_at', { ascending: false }),
      readAutocarClaimTelemetry(autocar),
      getAutocarRuntimePublicStatus(),
      readAutocarMasterControlPlane(autocar),
      readAutocarControlPlaneReport(autocar)
    ]);

    if (storesResult.error) throw storesResult.error;
    if (agentsResult.error) throw agentsResult.error;
    if (documentsResult.error) throw documentsResult.error;

    const agentMap = new Map(
      (agentsResult.data || []).map((agent: any) => [agent.store_id, agent])
    );
    const stores = (storesResult.data || [])
      .filter((store: any) => !['deleted', 'excluido'].includes(String(store.status || '').toLowerCase()))
      .map((store: any) => ({
        ...store,
        autocar: agentMap.get(store.id) || null,
        ai_telemetry: telemetry.stores[store.id] || null
      }));

    return NextResponse.json({
      success: true,
      environment: runtimeStatus.runtime_environment,
      runtime: runtimeStatus,
      ai_platform: {
        version: 'ai-control-plane-v2-preview',
        environment: runtimeStatus.runtime_environment,
        model_registry: aiPlatformModelRegistry(),
        telemetry
      },
      control_plane: controlPlane,
      control_plane_report: controlPlaneReport,
      stores,
      documents: documentsResult.data || [],
      summary: {
        total_stores: stores.length,
        enabled: stores.filter((store: any) => store.autocar?.master_enabled).length,
        copilot: stores.filter((store: any) => store.autocar?.mode === 'copilot').length,
        autopilot: stores.filter((store: any) => store.autocar?.mode === 'autopilot').length,
        autopilot_allowed: stores.filter((store: any) => store.autocar?.master_autopilot_allowed).length,
        global_documents: (documentsResult.data || []).length
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await masterContext(request);
    if ('error' in context) return context.error;
    const body = await request.json().catch(() => ({}));
    const action = cleanText(body?.action, 60);

    if (action === 'set-global-policy') {
      const row = await setAutocarGlobalPolicy(getAutocarDevClient(), {
        capability: cleanText(body?.capability, 100) as AutocarCapability,
        effect: cleanText(body?.effect, 30) as AutocarPolicyEffect | 'default',
        reason: cleanText(body?.reason, 1000),
        actorProfileId: context.master.id,
        expectedVersion: Number(body?.expected_version || 0)
      });
      return NextResponse.json({ success: true, policy: row });
    }

    if (action === 'set-model-pricing') {
      const row = await setAutocarModelPricing(getAutocarDevClient(), {
        model: cleanText(body?.model, 160),
        inputBrlPerMillion: body?.input_brl_per_million,
        outputBrlPerMillion: body?.output_brl_per_million,
        audioBrlPerMinute: body?.audio_brl_per_minute,
        imageBrlPerUnit: body?.image_brl_per_unit,
        sourceNote: cleanText(body?.source_note, 1000),
        active: body?.is_active !== false,
        actorProfileId: context.master.id,
        expectedVersion: Number(body?.expected_version || 0)
      });
      return NextResponse.json({ success: true, pricing: row });
    }

    if (action === 'set-store-access' || action === 'set-store-mode') {
      const storeId = cleanText(body?.store_id, 100);
      if (!storeId) {
        return NextResponse.json({ error: 'Loja AUTOCAR inválida.' }, { status: 400 });
      }
      const store = await productionStore(context.production, storeId);
      if (!store) {
        return NextResponse.json({ error: 'Loja não encontrada no CRM.' }, { status: 404 });
      }

      let enabled = Boolean(body?.enabled);
      let autopilotAllowed = Boolean(body?.autopilot_allowed);

      if (action === 'set-store-mode') {
        const legacyMode = cleanText(body?.mode, 30);
        if (!['off', 'copilot', 'autopilot'].includes(legacyMode)) {
          return NextResponse.json({ error: 'Modo AUTOCAR inválido.' }, { status: 400 });
        }
        enabled = legacyMode !== 'off';
        autopilotAllowed = legacyMode === 'autopilot';
      }

      const agent = await setAutocarMasterAccess(
        getAutocarDevClient(),
        store,
        { enabled, autopilotAllowed }
      );
      const runtimeStatus = await getAutocarRuntimePublicStatus();
      return NextResponse.json({
        success: true,
        environment: runtimeStatus.runtime_environment,
        runtime: runtimeStatus,
        agent
      });
    }

    if (action === 'prepare-upload') {
      const fileName = cleanText(body?.file_name, 220);
      const upload = await prepareAutocarKnowledgeUpload({
        scope: 'method',
        storeId: null,
        title: cleanText(body?.title, 200) || fileName,
        fileName,
        mimeType: cleanText(body?.mime_type, 160),
        fileSizeBytes: Number(body?.file_size_bytes || 0)
      });
      return NextResponse.json({ success: true, upload });
    }

    if (action === 'finalize-upload') {
      const originalFilename = cleanText(body?.file_name, 220);
      const document = await finalizeAutocarKnowledgeUpload({
        scope: 'method',
        storeId: null,
        userId: context.master.id,
        title: cleanText(body?.title, 200) || originalFilename,
        originalFilename,
        mimeType: cleanText(body?.mime_type, 160),
        fileSizeBytes: Number(body?.file_size_bytes || 0),
        storagePath: cleanText(body?.storage_path, 500)
      });
      return NextResponse.json({ success: true, document });
    }

    return NextResponse.json({ error: 'Ação Master AUTOCAR inválida.' }, { status: 400 });
  } catch (error: any) {
    console.error('Master AUTOCAR error:', error?.message || error);
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await masterContext(request);
    if ('error' in context) return context.error;
    const body = await request.json().catch(() => ({}));
    const documentId = cleanText(body?.document_id, 100);
    if (!documentId) {
      return NextResponse.json({ error: 'Documento obrigatório.' }, { status: 400 });
    }
    await archiveAutocarKnowledge(documentId, '', true);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}
