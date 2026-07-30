import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const vehicleActions = new Set([
  'vehicle_visibility',
  'vehicle_featured',
  'vehicle_status',
  'vehicle_assign_store',
  'vehicle_migrate_legacy_owner',
  'vehicle_hide_problem'
]);
const submissionStatuses = new Set(['reviewing', 'rejected', 'duplicate']);
const stockImportStatuses = new Set(['reviewing', 'processed', 'rejected']);
const invalidLegacyStatuses = new Set(['rejected', 'duplicate', 'deleted', 'excluido']);

function normalized(value: unknown, maxLength = 120) {
  return cleanText(value, maxLength).toLowerCase();
}

function boolValue(value: unknown) {
  return value === true || value === 'true';
}

async function authorize(request: Request) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);
  if (!token) return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;

  const profile = await getProfileFromToken(supabase, token);
  if (!profile || profile.status !== 'active' || profile.role !== 'master') {
    return { error: NextResponse.json({ error: 'Acesso exclusivo para usuários Master.' }, { status: 403 }) } as const;
  }

  return { supabase, profile } as const;
}

async function loadVehicle(supabase: any, vehicleId: string) {
  const { data, error } = await supabase
    .from('site_vehicles')
    .select('id,store_id,store_name,brand,model,version,year,status,show_on_landing,is_featured,sold_lead_id')
    .eq('id', vehicleId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadActiveStore(supabase: any, storeId: string) {
  const { data, error } = await supabase
    .from('stores')
    .select('id,store_name,status,portal_enabled')
    .eq('id', storeId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'active' || !data.portal_enabled) return null;
  return data;
}

function ensureEditableVehicle(vehicle: any) {
  const status = normalized(vehicle?.status, 40);
  if (!vehicle) throw new Error('Veículo não encontrado.');
  if (status === 'vendido') throw new Error('Veículos vendidos só podem ser alterados pelo fluxo de confirmação ou cancelamento da venda.');
  if (status === 'excluido') throw new Error('Veículo excluído não pode ser administrado por esta tela.');
}

async function ensureResolvableOwner(supabase: any, vehicle: any) {
  const directStoreId = cleanText(vehicle?.store_id, 80);
  if (directStoreId) {
    const store = await loadActiveStore(supabase, directStoreId);
    if (!store) throw new Error('A loja proprietária está inativa ou sem acesso ao portal.');
    return store;
  }

  const { data, error } = await supabase
    .from('store_vehicle_link_submissions')
    .select('store_id,status,metadata')
    .eq('imported_vehicle_id', vehicle.id);
  if (error) throw error;

  const storeIds = Array.from(new Set(
    (data || [])
      .filter((item: any) => item.store_id && item?.metadata?.store_removed !== true && !invalidLegacyStatuses.has(normalized(item.status, 40)))
      .map((item: any) => String(item.store_id))
  ));

  if (storeIds.length !== 1) throw new Error('A propriedade do veículo não está resolvida de forma única.');
  const store = await loadActiveStore(supabase, storeIds[0]);
  if (!store) throw new Error('A loja proprietária legada está inativa ou sem acesso ao portal.');
  return store;
}

async function runVehicleAction(supabase: any, action: string, body: any) {
  const vehicleId = cleanText(body.vehicle_id, 80);
  if (!vehicleId) throw new Error('Informe o veículo.');

  const vehicle = await loadVehicle(supabase, vehicleId);
  ensureEditableVehicle(vehicle);
  const now = new Date().toISOString();

  if (action === 'vehicle_visibility') {
    const visible = boolValue(body.visible);
    if (visible) await ensureResolvableOwner(supabase, vehicle);
    const payload = visible
      ? { status: 'disponivel', show_on_landing: true, updated_at: now }
      : { show_on_landing: false, is_featured: false, updated_at: now };
    const { error } = await supabase.from('site_vehicles').update(payload).eq('id', vehicle.id);
    if (error) throw error;
    return visible ? 'Veículo publicado na landing.' : 'Veículo retirado da landing.';
  }

  if (action === 'vehicle_featured') {
    const featured = boolValue(body.featured);
    if (featured) await ensureResolvableOwner(supabase, vehicle);
    const payload = featured
      ? { status: 'disponivel', show_on_landing: true, is_featured: true, updated_at: now }
      : { is_featured: false, updated_at: now };
    const { error } = await supabase.from('site_vehicles').update(payload).eq('id', vehicle.id);
    if (error) throw error;
    return featured ? 'Veículo destacado e publicado.' : 'Destaque removido.';
  }

  if (action === 'vehicle_status') {
    const status = normalized(body.status, 40);
    if (!['disponivel', 'oculto'].includes(status)) throw new Error('Status administrativo inválido.');
    if (status === 'disponivel') await ensureResolvableOwner(supabase, vehicle);
    const payload = status === 'oculto'
      ? { status, show_on_landing: false, is_featured: false, updated_at: now }
      : { status, updated_at: now };
    const { error } = await supabase.from('site_vehicles').update(payload).eq('id', vehicle.id);
    if (error) throw error;
    return status === 'oculto' ? 'Veículo marcado como oculto.' : 'Veículo marcado como disponível.';
  }

  if (action === 'vehicle_assign_store') {
    const storeId = cleanText(body.store_id, 80);
    if (!storeId) throw new Error('Selecione a loja proprietária.');
    const store = await loadActiveStore(supabase, storeId);
    if (!store) throw new Error('A loja selecionada está inativa ou sem acesso ao portal.');
    const { error } = await supabase.from('site_vehicles').update({
      store_id: store.id,
      store_name: store.store_name,
      updated_at: now
    }).eq('id', vehicle.id);
    if (error) throw error;
    return `Propriedade atribuída para ${store.store_name}.`;
  }

  if (action === 'vehicle_migrate_legacy_owner') {
    if (vehicle.store_id) return 'O veículo já possui propriedade direta.';
    const store = await ensureResolvableOwner(supabase, vehicle);
    const { error } = await supabase.from('site_vehicles').update({
      store_id: store.id,
      store_name: store.store_name,
      updated_at: now
    }).eq('id', vehicle.id).is('store_id', null);
    if (error) throw error;
    return `Propriedade legada consolidada para ${store.store_name}.`;
  }

  if (action === 'vehicle_hide_problem') {
    const { error } = await supabase.from('site_vehicles').update({
      status: 'oculto',
      show_on_landing: false,
      is_featured: false,
      updated_at: now
    }).eq('id', vehicle.id);
    if (error) throw error;
    return 'Veículo ocultado preventivamente.';
  }

  throw new Error('Ação de veículo não reconhecida.');
}

async function updateSubmission(supabase: any, profile: any, body: any) {
  const submissionId = cleanText(body.submission_id, 80);
  const status = normalized(body.status, 40);
  const reason = cleanText(body.reason, 500);
  if (!submissionId) throw new Error('Informe o link enviado.');
  if (!submissionStatuses.has(status)) throw new Error('Status do link não permitido.');
  if (['rejected', 'duplicate'].includes(status) && reason.length < 3) throw new Error('Informe um motivo para concluir esta ação.');

  const { data: submission, error: loadError } = await supabase
    .from('store_vehicle_link_submissions')
    .select('id,status,metadata')
    .eq('id', submissionId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!submission) throw new Error('Link enviado não encontrado.');
  if (['published', 'deleted', 'excluido'].includes(normalized(submission.status, 40))) {
    throw new Error('Este link já foi finalizado e não pode receber esse status.');
  }

  const metadata = submission.metadata && typeof submission.metadata === 'object' ? submission.metadata : {};
  const { error } = await supabase.from('store_vehicle_link_submissions').update({
    status,
    metadata: {
      ...metadata,
      master_action_reason: reason || null,
      master_action_by: profile.id || null,
      master_action_at: new Date().toISOString()
    },
    updated_at: new Date().toISOString()
  }).eq('id', submission.id);
  if (error) throw error;

  return status === 'reviewing' ? 'Link marcado em conferência.' : status === 'duplicate' ? 'Link marcado como duplicado.' : 'Link rejeitado.';
}

async function updateStockImport(supabase: any, body: any) {
  const importId = cleanText(body.import_id, 80);
  const status = normalized(body.status, 40);
  if (!importId) throw new Error('Informe o arquivo de estoque.');
  if (!stockImportStatuses.has(status)) throw new Error('Status do arquivo não permitido.');

  const { data: stockImport, error: loadError } = await supabase
    .from('store_stock_imports')
    .select('id,status')
    .eq('id', importId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!stockImport) throw new Error('Arquivo de estoque não encontrado.');

  const { error } = await supabase.from('store_stock_imports').update({
    status,
    updated_at: new Date().toISOString()
  }).eq('id', stockImport.id);
  if (error) throw error;

  return status === 'reviewing' ? 'Arquivo marcado em análise.' : status === 'processed' ? 'Arquivo marcado como processado.' : 'Arquivo rejeitado.';
}

export async function POST(request: Request) {
  try {
    const context = await authorize(request);
    if ('error' in context) return context.error;

    const body = await request.json();
    const action = normalized(body.action, 80);
    let message = '';

    if (vehicleActions.has(action)) {
      message = await runVehicleAction(context.supabase, action, body);
    } else if (action === 'submission_status') {
      message = await updateSubmission(context.supabase, context.profile, body);
    } else if (action === 'stock_import_status') {
      message = await updateStockImport(context.supabase, body);
    } else {
      return NextResponse.json({ error: 'Ação administrativa não permitida.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    const message = cleanText(error?.message || 'Não foi possível executar a ação administrativa.', 500);
    const status = message.includes('não encontrado') ? 404 : message.includes('não pode') || message.includes('não está') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
