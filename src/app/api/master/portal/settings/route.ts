import { NextResponse } from 'next/server';
import { defaultPortalSettings, normalizePortalSettings } from '@/lib/portalSettings';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';
import { isMissingPortalTable } from '@/lib/server/portalSettings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const invalidLinkStatuses = new Set(['rejected', 'duplicate', 'deleted', 'excluido']);

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

function validUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function validateSettings(settings: ReturnType<typeof normalizePortalSettings>) {
  if (settings.brand_name.length < 2) throw new Error('Informe o nome público da marca.');
  if (settings.hero_title.length < 10) throw new Error('O título principal precisa ser mais descritivo.');
  if (settings.hero_description.length < 20) throw new Error('A descrição principal precisa ter pelo menos 20 caracteres.');
  if (settings.seo_title.length < 10) throw new Error('Informe um título de SEO válido.');
  if (settings.seo_description.length < 30) throw new Error('A descrição de SEO precisa ter pelo menos 30 caracteres.');
  if (settings.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(settings.email)) throw new Error('Informe um e-mail válido.');
  if (settings.whatsapp_number) {
    const digits = settings.whatsapp_number.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) throw new Error('Informe um WhatsApp válido, incluindo DDD.');
  }
  if (!validUrl(settings.logo_url)) throw new Error('A URL da logomarca é inválida.');
  if (!validUrl(settings.instagram_url)) throw new Error('A URL do Instagram é inválida.');
  if (!validUrl(settings.og_image_url)) throw new Error('A URL da imagem de compartilhamento é inválida.');
  if (!settings.benefits.length) throw new Error('Cadastre pelo menos um benefício do portal.');
}

async function loadSnapshot(supabase: any) {
  const [vehiclesResult, storesResult, campaignsResult, leadsResult] = await Promise.all([
    supabase.from('site_vehicles').select('id,store_id,status,show_on_landing,price').neq('status', 'excluido'),
    supabase.from('stores').select('id,status,portal_enabled').neq('status', 'deleted'),
    supabase.from('site_campaigns').select('id,is_active'),
    supabase.from('leads').select('id').eq('origin', 'marketplace_site')
  ]);

  const firstError = vehiclesResult.error || storesResult.error || campaignsResult.error || leadsResult.error;
  if (firstError) throw firstError;

  const stores = storesResult.data || [];
  const activeStoreIds = new Set(
    stores
      .filter((store: any) => store.status === 'active' && store.portal_enabled === true)
      .map((store: any) => String(store.id))
  );
  const candidates = (vehiclesResult.data || []).filter((vehicle: any) =>
    vehicle.status === 'disponivel' && vehicle.show_on_landing === true && Number(vehicle.price || 0) > 0
  );
  const legacyIds = candidates.filter((vehicle: any) => !vehicle.store_id).map((vehicle: any) => vehicle.id);

  const { data: linkRows, error: linkError } = legacyIds.length
    ? await supabase
        .from('store_vehicle_link_submissions')
        .select('imported_vehicle_id,store_id,status,metadata')
        .in('imported_vehicle_id', legacyIds)
    : { data: [], error: null };
  if (linkError) throw linkError;

  const ownersByVehicle = new Map<string, Set<string>>();
  (linkRows || []).forEach((link: any) => {
    const status = cleanText(link.status, 40).toLowerCase();
    if (!link.store_id || link?.metadata?.store_removed === true || invalidLinkStatuses.has(status)) return;
    const owners = ownersByVehicle.get(link.imported_vehicle_id) || new Set<string>();
    owners.add(String(link.store_id));
    ownersByVehicle.set(link.imported_vehicle_id, owners);
  });

  const publicVehicles = candidates.filter((vehicle: any) => {
    if (vehicle.store_id) return activeStoreIds.has(String(vehicle.store_id));
    const owners = Array.from(ownersByVehicle.get(vehicle.id) || []);
    return owners.length === 1 && activeStoreIds.has(owners[0]);
  }).length;

  return {
    activeStores: stores.filter((store: any) => store.status === 'active').length,
    enabledStores: activeStoreIds.size,
    publicVehicles,
    orphanVehicles: Math.max(candidates.length - publicVehicles, 0),
    activeCampaigns: (campaignsResult.data || []).filter((campaign: any) => campaign.is_active === true).length,
    marketplaceLeads: (leadsResult.data || []).length
  };
}

async function loadSettings(supabase: any) {
  const { data, error } = await supabase
    .from('portal_settings')
    .select('*')
    .eq('key', 'official')
    .maybeSingle();

  if (error) {
    if (isMissingPortalTable(error)) return { cmsReady: false, settings: defaultPortalSettings };
    throw error;
  }

  return { cmsReady: true, settings: normalizePortalSettings(data || defaultPortalSettings) };
}

export async function GET(request: Request) {
  try {
    const context = await authorize(request);
    if ('error' in context) return context.error;

    const [settingsResult, snapshot] = await Promise.all([
      loadSettings(context.supabase),
      loadSnapshot(context.supabase)
    ]);

    return NextResponse.json({
      cms_ready: settingsResult.cmsReady,
      settings: settingsResult.settings,
      snapshot
    });
  } catch (error: any) {
    return NextResponse.json({ error: cleanText(error?.message || 'Não foi possível carregar o CMS do portal.', 500) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const context = await authorize(request);
    if ('error' in context) return context.error;

    const body = await request.json();
    const settings = normalizePortalSettings(body?.settings || body);
    validateSettings(settings);

    const { data, error } = await context.supabase.rpc('save_portal_settings_transaction', {
      p_actor_user_id: context.profile.id,
      p_settings: settings
    });

    if (error) {
      const message = cleanText(error.message, 500);
      if (isMissingPortalTable(error) || message.toLowerCase().includes('save_portal_settings_transaction')) {
        return NextResponse.json({ error: 'A estrutura do CMS ainda não foi aplicada no Supabase.' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: settings.is_published ? 'Configuração salva e publicada no portal.' : 'Configuração salva como rascunho.',
      settings: normalizePortalSettings(data || settings)
    });
  } catch (error: any) {
    const message = cleanText(error?.message || 'Não foi possível salvar o CMS do portal.', 500);
    const status = message.includes('não foi aplicada') ? 409 : message.includes('Acesso') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
