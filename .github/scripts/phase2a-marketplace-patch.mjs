from pathlib import Path
import re
import sys

TARGETS = [
    'src/app/api/store-stock/route.ts',
    'src/app/api/site-bulk-publish/route.ts',
    'src/app/api/marketplace/vehicles/route.ts',
    'src/app/api/store/sale-confirmation/route.ts',
    'src/components/PipelineSaleConfirmation.tsx',
    'src/app/loja/[slug]/pipeline/page.tsx',
    'src/components/AuthGate.tsx',
    'src/app/master/site/page.tsx',
]

MARKERS = {
    'src/app/api/store-stock/route.ts': 'store_id: store.id,',
    'src/app/api/site-bulk-publish/route.ts': "source_url: submission.vehicle_url,",
    'src/app/api/marketplace/vehicles/route.ts': "const directOwnerId = clean(vehicle.store_id);",
    'src/app/api/store/sale-confirmation/route.ts': "export async function DELETE(request: Request)",
    'src/components/PipelineSaleConfirmation.tsx': "vehicle_mode: vehicleMode,",
    'src/app/loja/[slug]/pipeline/page.tsx': "Venda cancelada e veículo restaurado no marketplace.",
    'src/components/AuthGate.tsx': "pathname.startsWith('/master') && profile.role !== 'master'",
    'src/app/master/site/page.tsx': "store_id: '',",
}

originals = {path: Path(path).read_text(encoding='utf-8') for path in TARGETS}
marker_state = {path: marker in originals[path] for path, marker in MARKERS.items()}
if all(marker_state.values()):
    print('Phase 2A patch already applied.')
    sys.exit(0)
if any(marker_state.values()):
    partial = ', '.join(path for path, applied in marker_state.items() if applied)
    raise RuntimeError(f'Partial Phase 2A patch detected: {partial}')

outputs = dict(originals)

def replace_once(path, before, after, label):
    source = outputs[path]
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f'{path}: {label} expected 1 exact occurrence and found {count}.')
    outputs[path] = source.replace(before, after, 1)


def regex_once(path, pattern, replacement, label, flags=0):
    source = outputs[path]
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{path}: {label} expected 1 regex occurrence and found {count}.')
    outputs[path] = updated

# 1) Store publication: permanent marketplace ownership and optional campaign.
replace_once(
    'src/app/api/store-stock/route.ts',
    """      const campaign = await getActiveCampaign(supabase);

      if (!campaign) {
        return NextResponse.json({ error: 'Nenhuma campanha ativa encontrada para publicar o veículo.' }, { status: 400 });
      }

      const vehiclePayload: any = {
        campaign_id: campaign.id,""",
    """      const campaign = await getActiveCampaign(supabase);

      const vehiclePayload: any = {
        campaign_id: campaign?.id || null,
        store_id: store.id,""",
    'store owner and optional campaign',
)

# 2) Master bulk publication: owner required and complete data required.
replace_once(
    'src/app/api/site-bulk-publish/route.ts',
    """    if (!campaign?.id) {
      return NextResponse.json({ error: 'Campanha da landing não encontrada.' }, { status: 400 });
    }

""",
    '',
    'optional campaign',
)
replace_once(
    'src/app/api/site-bulk-publish/route.ts',
    """          .select('id,store_name')
          .eq('id', submission.store_id)
          .maybeSingle();

        const importedResult = await importVehicleFromSubmission(origin, submission);""",
    """          .select('id,store_name,status,portal_enabled')
          .eq('id', submission.store_id)
          .maybeSingle();

        if (!store || store.status !== 'active' || !store.portal_enabled) {
          throw new Error('A loja proprietária está inativa ou sem acesso ao portal.');
        }

        const importedResult = await importVehicleFromSubmission(origin, submission);""",
    'active owner validation',
)
regex_once(
    'src/app/api/site-bulk-publish/route.ts',
    r"        const payload = \{\n          campaign_id: campaign\.id,[\s\S]*?          updated_at: new Date\(\)\.toISOString\(\)\n        \};",
    """        const payload = {
          campaign_id: campaign?.id || null,
          store_id: store.id,
          brand: text(vehicleData.brand) || text(importedResult.preview?.vehicle?.brand),
          model: text(vehicleData.model) || text(importedResult.preview?.vehicle?.model),
          version: text(vehicleData.version) || text(importedResult.preview?.vehicle?.version),
          year: text(vehicleData.year) || text(importedResult.preview?.vehicle?.year),
          mileage: text(vehicleData.mileage),
          color: text(vehicleData.color),
          transmission: text(vehicleData.transmission),
          fuel: text(vehicleData.fuel),
          price: Number(importedResult.imported?.price || importedResult.preview?.price || 0),
          image_url: imageUrl,
          image_urls: imageUrls,
          source_url: submission.vehicle_url,
          store_name: store.store_name,
          status: 'disponivel',
          show_on_landing: true,
          is_featured: false,
          updated_at: new Date().toISOString()
        };

        const missing = [
          !payload.brand && 'marca',
          !payload.model && 'modelo',
          !payload.version && 'versão',
          !payload.year && 'ano',
          !payload.mileage && 'km',
          !payload.color && 'cor',
          !payload.transmission && 'câmbio',
          !payload.fuel && 'combustível',
          !(payload.price > 0) && 'valor',
          !payload.image_url && 'foto',
          !payload.source_url && 'link original'
        ].filter(Boolean);

        if (missing.length) {
          throw new Error(`Dados obrigatórios ausentes: ${missing.join(', ')}.`);
        }""",
    'bulk payload validation',
)

# 3) Public marketplace: direct store_id is the source of truth, with legacy fallback.
outputs['src/app/api/marketplace/vehicles/route.ts'] = """import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const invalidLinkStatuses = new Set(['rejected', 'duplicate', 'deleted', 'excluido']);

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) throw new Error('Configuração do servidor incompleta.');
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function validOwnerLink(link: any) {
  const status = clean(link?.status).toLowerCase();
  if (!link?.imported_vehicle_id || !link?.store_id) return false;
  if (link?.metadata?.store_removed === true) return false;
  return !invalidLinkStatuses.has(status);
}

function uniqueSorted(values: unknown[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export async function GET() {
  try {
    const supabase = getAdminClient();
    const { data: vehicleRows, error: vehicleError } = await supabase
      .from('site_vehicles')
      .select('id,store_id,brand,model,version,year,mileage,color,transmission,fuel,price,image_url,image_urls,is_featured,created_at')
      .eq('show_on_landing', true)
      .eq('status', 'disponivel')
      .gt('price', 0)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);

    if (vehicleError) throw vehicleError;
    const vehicles = (vehicleRows || []).filter((vehicle: any) => Number(vehicle.price || 0) > 0);
    const legacyVehicleIds = vehicles.filter((vehicle: any) => !vehicle.store_id).map((vehicle: any) => vehicle.id);

    const { data: linkRows, error: linkError } = legacyVehicleIds.length
      ? await supabase
          .from('store_vehicle_link_submissions')
          .select('id,store_id,imported_vehicle_id,status,metadata')
          .in('imported_vehicle_id', legacyVehicleIds)
      : { data: [], error: null };

    if (linkError) throw linkError;
    const validLinks = (linkRows || []).filter(validOwnerLink);
    const legacyOwnersByVehicle = new Map<string, string[]>();
    validLinks.forEach((link: any) => {
      const current = legacyOwnersByVehicle.get(link.imported_vehicle_id) || [];
      if (!current.includes(link.store_id)) current.push(link.store_id);
      legacyOwnersByVehicle.set(link.imported_vehicle_id, current);
    });

    const directStoreIds = vehicles.map((vehicle: any) => clean(vehicle.store_id)).filter(Boolean);
    const legacyStoreIds = validLinks.map((link: any) => clean(link.store_id)).filter(Boolean);
    const storeIds = Array.from(new Set([...directStoreIds, ...legacyStoreIds]));

    const { data: storeRows, error: storeError } = storeIds.length
      ? await supabase
          .from('stores')
          .select('id,store_name,slug,website_url,status,portal_enabled')
          .in('id', storeIds)
          .eq('status', 'active')
          .eq('portal_enabled', true)
      : { data: [], error: null };

    if (storeError) throw storeError;
    const storesById = new Map((storeRows || []).map((store: any) => [store.id, store]));

    const safeVehicles = vehicles.map((vehicle: any) => {
      const directOwnerId = clean(vehicle.store_id);
      const legacyOwners = legacyOwnersByVehicle.get(vehicle.id) || [];
      const ownerId = directOwnerId || (legacyOwners.length === 1 ? legacyOwners[0] : '');
      const store = ownerId ? storesById.get(ownerId) : null;
      if (!store) return null;

      const images = Array.from(new Set([
        ...(Array.isArray(vehicle.image_urls) ? vehicle.image_urls : []),
        vehicle.image_url
      ].map(clean).filter(Boolean)));

      return {
        id: vehicle.id,
        brand: clean(vehicle.brand),
        model: clean(vehicle.model),
        version: clean(vehicle.version),
        year: clean(vehicle.year),
        mileage: clean(vehicle.mileage),
        color: clean(vehicle.color),
        transmission: clean(vehicle.transmission),
        fuel: clean(vehicle.fuel),
        price: Number(vehicle.price),
        image_url: images[0] || null,
        image_urls: images,
        is_featured: Boolean(vehicle.is_featured),
        store: {
          id: store.id,
          name: clean(store.store_name),
          slug: clean(store.slug),
          website_url: clean(store.website_url) || null
        }
      };
    }).filter(Boolean);

    const prices = safeVehicles.map((vehicle: any) => Number(vehicle.price)).filter((price) => price > 0);
    return NextResponse.json({
      vehicles: safeVehicles,
      total: safeVehicles.length,
      filters: {
        brands: uniqueSorted(safeVehicles.map((vehicle: any) => vehicle.brand)),
        transmissions: uniqueSorted(safeVehicles.map((vehicle: any) => vehicle.transmission)),
        fuels: uniqueSorted(safeVehicles.map((vehicle: any) => vehicle.fuel)),
        min_price: prices.length ? Math.min(...prices) : 0,
        max_price: prices.length ? Math.max(...prices) : 0
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar os veículos.' }, { status: 500 });
  }
}
"""

# 4) Secure sale API: vehicle selection, outside-portal declaration and cancellation.
outputs['src/app/api/store/sale-confirmation/route.ts'] = """import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

const allowedRoles = ['master', 'store', 'pre_sales', 'seller', 'prospector'];
const paymentTypes = ['cash', 'financed', 'consortium', 'other'];
const vehicleModes = ['portal', 'outside_portal'];

function canAccessLead(profile: any, lead: any) {
  if (profile.role === 'master') return true;
  if (!profile.store_id || profile.store_id !== lead.assigned_store_id) return false;
  if (profile.role === 'store') return true;
  if (profile.role === 'pre_sales') return lead.pre_sales_user_id === profile.id || lead.assigned_user_id === profile.id;
  if (profile.role === 'seller') return lead.seller_user_id === profile.id || lead.assigned_user_id === profile.id;
  if (profile.role === 'prospector') return lead.captured_by_user_id === profile.id || lead.assigned_user_id === profile.id;
  return false;
}

function moneyValue(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function integerValue(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function paymentDescription(type: string, bank: string) {
  if (type === 'cash') return 'À vista';
  if (type === 'financed') return `Financiado por ${bank}`;
  if (type === 'consortium') return `Consórcio${bank && bank !== 'Consórcio' ? ` — ${bank}` : ''}`;
  return `Outra forma${bank && bank !== 'Outro' ? ` — ${bank}` : ''}`;
}

function vehicleName(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.year].map((item) => cleanText(item, 100)).filter(Boolean).join(' ');
}

async function getContext(request: Request) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);
  if (!token) return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;
  const profile = await getProfileFromToken(supabase, token);
  if (!profile || profile.status !== 'active' || !allowedRoles.includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para acessar condições comerciais.' }, { status: 403 }) } as const;
  }
  return { supabase, profile } as const;
}

async function loadLead(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('leads')
    .select('id,event_id,assigned_store_id,assigned_user_id,assigned_user_role,pre_sales_user_id,seller_user_id,captured_by_user_id,prospector_id,customer_name,customer_phone,customer_bank,interested_vehicle,interested_vehicle_id,interested_vehicle_price,vehicle_category_interest,status')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadStore(supabase: any, storeId: string) {
  const { data, error } = await supabase.from('stores').select('id,store_name,slug,event_id,status,portal_enabled').eq('id', storeId).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'active' || !data.portal_enabled) return null;
  return data;
}

async function loadSellers(supabase: any, storeId: string) {
  const { data, error } = await supabase.from('users').select('id,full_name,email,role,status,store_id').eq('store_id', storeId).eq('role', 'seller').eq('status', 'active').order('full_name', { ascending: true });
  if (error) throw error;
  return (data || []).map((seller: any) => ({ id: seller.id, full_name: seller.full_name || seller.email || 'Vendedor sem nome', email: seller.email || null }));
}

async function loadSale(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('sales')
    .select('id,lead_id,store_id,vehicle_id,status,cancelled_at,cancelled_by,cancellation_reason,seller_name,seller_user_id,pre_sales_user_id,captured_by_user_id,customer_bank,financing_bank,payment_type,sale_value,vehicle_category,sale_vehicle_name,has_trade_in,installment_count,has_down_payment,down_payment_value,financed_amount,installment_value,confirmed_by,confirmed_at,created_at')
    .eq('lead_id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadCommercial(supabase: any, leadId: string) {
  const { data, error } = await supabase.from('lead_commercial_details').select('id,lead_id,store_id,payment_type,financing_bank,negotiated_value,installment_count,has_down_payment,down_payment_value,financed_amount,installment_value,has_trade_in,updated_by,created_at,updated_at').eq('lead_id', leadId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadVehicles(supabase: any, storeId: string, selectedIds: string[]) {
  const { data, error } = await supabase
    .from('site_vehicles')
    .select('id,store_id,brand,model,version,year,price,status,show_on_landing,sold_lead_id')
    .eq('store_id', storeId)
    .neq('status', 'excluido')
    .order('brand', { ascending: true })
    .order('model', { ascending: true });
  if (error) throw error;
  return (data || []).filter((vehicle: any) => vehicle.status !== 'vendido' || selectedIds.includes(vehicle.id)).map((vehicle: any) => ({ ...vehicle, name: vehicleName(vehicle) }));
}

function commercialResponse(sale: any, commercial: any) {
  if (sale) return { ...sale, is_confirmed: sale.status === 'confirmed', commercial_id: commercial?.id || null };
  return {
    id: commercial?.id || 'lead-commercial-draft', lead_id: commercial?.lead_id || null, store_id: commercial?.store_id || null,
    payment_type: commercial?.payment_type || null, financing_bank: commercial?.financing_bank || null,
    sale_value: commercial?.negotiated_value ?? null, has_trade_in: commercial?.has_trade_in ?? null,
    installment_count: commercial?.installment_count ?? null, has_down_payment: commercial?.has_down_payment ?? null,
    down_payment_value: commercial?.down_payment_value ?? null, financed_amount: commercial?.financed_amount ?? null,
    installment_value: commercial?.installment_value ?? null, vehicle_id: null, is_confirmed: false,
    commercial_id: commercial?.id || null, updated_at: commercial?.updated_at || null
  };
}

export async function GET(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;
    const leadId = cleanText(new URL(request.url).searchParams.get('lead_id'), 80);
    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });
    const { supabase, profile } = context;
    const lead = await loadLead(supabase, leadId);
    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para acessar este lead.' }, { status: 403 });
    const store = await loadStore(supabase, lead.assigned_store_id);
    if (!store) return NextResponse.json({ error: 'Loja indisponível.' }, { status: 404 });
    const [sellers, sale, commercial] = await Promise.all([loadSellers(supabase, store.id), loadSale(supabase, lead.id), loadCommercial(supabase, lead.id)]);
    const vehicles = await loadVehicles(supabase, store.id, [lead.interested_vehicle_id, sale?.vehicle_id].filter(Boolean));
    return NextResponse.json({
      lead: { ...lead }, store, sellers, vehicles,
      suggested_seller_id: sale?.seller_user_id || lead.seller_user_id || (profile.role === 'seller' ? profile.id : null),
      sale: commercialResponse(sale, commercial), sale_confirmed: sale?.status === 'confirmed', commercial
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar as condições comerciais.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;
    const { supabase, profile } = context;
    const body = await request.json();
    const leadId = cleanText(body.lead_id, 80);
    const sellerUserId = cleanText(body.seller_user_id, 80);
    const paymentType = cleanText(body.payment_type, 30);
    const financingBankInput = cleanText(body.financing_bank, 160);
    const vehicleMode = cleanText(body.vehicle_mode, 30) || 'portal';
    const vehicleId = cleanText(body.vehicle_id, 80);
    const outsideVehicleName = cleanText(body.vehicle_name, 220);
    const hasTradeIn = body.has_trade_in;
    const saleValue = moneyValue(body.sale_value);
    const installmentCount = integerValue(body.installment_count);
    const hasDownPayment = paymentType === 'cash' ? false : body.has_down_payment;
    const downPaymentValue = moneyValue(body.down_payment_value);
    const financedAmount = moneyValue(body.financed_amount);
    const installmentValue = moneyValue(body.installment_value);

    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });
    if (!sellerUserId) return NextResponse.json({ error: 'Selecione o vendedor responsável pelo fechamento.' }, { status: 400 });
    if (!vehicleModes.includes(vehicleMode)) return NextResponse.json({ error: 'Informe onde está o veículo vendido.' }, { status: 400 });
    if (vehicleMode === 'portal' && !vehicleId) return NextResponse.json({ error: 'Selecione o veículo vendido no estoque da loja.' }, { status: 400 });
    if (!paymentTypes.includes(paymentType)) return NextResponse.json({ error: 'Selecione a forma de pagamento.' }, { status: 400 });
    if (paymentType === 'financed' && !financingBankInput) return NextResponse.json({ error: 'Selecione o banco do financiamento.' }, { status: 400 });
    if (['financed', 'consortium'].includes(paymentType) && (!Number.isInteger(installmentCount) || Number(installmentCount) < 1 || Number(installmentCount) > 120)) return NextResponse.json({ error: 'Informe uma quantidade de parcelas entre 1 e 120.' }, { status: 400 });
    if (paymentType !== 'cash' && typeof hasDownPayment !== 'boolean') return NextResponse.json({ error: 'Informe se houve entrada.' }, { status: 400 });
    if (hasDownPayment === true && (downPaymentValue === null || !Number.isFinite(downPaymentValue) || downPaymentValue <= 0)) return NextResponse.json({ error: 'Informe um valor de entrada maior que zero.' }, { status: 400 });
    if (typeof hasTradeIn !== 'boolean') return NextResponse.json({ error: 'Informe se houve veículo na troca.' }, { status: 400 });
    if (saleValue !== null && (!Number.isFinite(saleValue) || saleValue < 0)) return NextResponse.json({ error: 'Informe um valor de venda válido.' }, { status: 400 });
    if (saleValue !== null && downPaymentValue !== null && downPaymentValue > saleValue) return NextResponse.json({ error: 'O valor da entrada não pode ser maior que o valor da venda.' }, { status: 400 });
    if (financedAmount !== null && (!Number.isFinite(financedAmount) || financedAmount < 0)) return NextResponse.json({ error: 'Informe um valor financiado válido.' }, { status: 400 });
    if (installmentValue !== null && (!Number.isFinite(installmentValue) || installmentValue < 0)) return NextResponse.json({ error: 'Informe um valor de parcela válido.' }, { status: 400 });

    const lead = await loadLead(supabase, leadId);
    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para confirmar esta venda.' }, { status: 403 });

    let selectedVehicle: any = null;
    let selectedVehicleName = outsideVehicleName || cleanText(lead.interested_vehicle, 220);
    if (vehicleMode === 'portal') {
      const { data, error } = await supabase.from('site_vehicles').select('id,store_id,brand,model,version,year,price,status,sold_lead_id').eq('id', vehicleId).eq('store_id', lead.assigned_store_id).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'O veículo selecionado não pertence ao estoque desta loja.' }, { status: 400 });
      if (data.status === 'vendido' && data.sold_lead_id !== lead.id) return NextResponse.json({ error: 'Este veículo já está vinculado a outra venda.' }, { status: 409 });
      selectedVehicle = data;
      selectedVehicleName = vehicleName(data);
    } else if (!selectedVehicleName) {
      return NextResponse.json({ error: 'Informe qual veículo foi vendido fora do portal.' }, { status: 400 });
    }

    const { error: leadVehicleError } = await supabase.from('leads').update({
      interested_vehicle_id: selectedVehicle?.id || null,
      interested_vehicle: selectedVehicleName,
      interested_vehicle_price: selectedVehicle ? Number(selectedVehicle.price || 0) || null : lead.interested_vehicle_price,
      updated_at: new Date().toISOString()
    }).eq('id', lead.id);
    if (leadVehicleError) throw leadVehicleError;

    const { data: seller, error: sellerError } = await supabase.from('users').select('id,full_name,email,role,status,store_id').eq('id', sellerUserId).eq('store_id', lead.assigned_store_id).eq('role', 'seller').eq('status', 'active').maybeSingle();
    if (sellerError) throw sellerError;
    if (!seller) return NextResponse.json({ error: 'O vendedor selecionado não está ativo nesta loja.' }, { status: 400 });

    const actorName = profile.full_name || profile.email || 'Usuário';
    const normalizedBank = paymentType === 'cash' ? 'Não se aplica' : paymentType === 'financed' ? financingBankInput : paymentType === 'consortium' ? financingBankInput || 'Consórcio' : financingBankInput || 'Outro';
    const { data: saleId, error: rpcError } = await supabase.rpc('confirm_lead_sale_record', {
      p_lead_id: lead.id, p_store_id: lead.assigned_store_id, p_seller_user_id: seller.id,
      p_payment_type: paymentType, p_financing_bank: normalizedBank, p_has_trade_in: hasTradeIn,
      p_sale_value: saleValue, p_installment_count: paymentType === 'cash' ? null : installmentCount,
      p_has_down_payment: paymentType === 'cash' ? false : hasDownPayment,
      p_down_payment_value: hasDownPayment === true ? downPaymentValue : null,
      p_financed_amount: financedAmount, p_installment_value: installmentValue,
      p_confirmed_by: profile.id, p_actor_name: actorName
    });
    if (rpcError) throw rpcError;

    const paymentLabel = paymentDescription(paymentType, normalizedBank);
    const installmentsLabel = installmentCount ? `${installmentCount} parcela(s)` : 'Sem parcelamento';
    const entryLabel = hasDownPayment ? `Entrada de R$ ${Number(downPaymentValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Sem entrada';
    const tradeLabel = hasTradeIn ? 'Com veículo na troca' : 'Sem veículo na troca';
    const sellerName = seller.full_name || seller.email || 'Vendedor';
    const now = new Date().toISOString();

    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({
        lead_id: lead.id, store_id: lead.assigned_store_id, store_name: null, user_id: profile.id, user_name: actorName,
        activity_type: 'sale_confirmed', activity_label: `Venda confirmada por ${sellerName}`, from_status: lead.status,
        to_status: 'sale_confirmed', customer_name: lead.customer_name, customer_phone: lead.customer_phone,
        vehicle_name: selectedVehicleName, notes: `${paymentLabel}. ${installmentsLabel}. ${entryLabel}. ${tradeLabel}.`,
        metadata: { sale_id: saleId, vehicle_id: selectedVehicle?.id || null, vehicle_mode: vehicleMode, seller_user_id: seller.id, seller_name: sellerName, payment_type: paymentType, financing_bank: normalizedBank, has_trade_in: hasTradeIn, sale_value: saleValue, installment_count: installmentCount, has_down_payment: hasDownPayment, down_payment_value: downPaymentValue, financed_amount: financedAmount, installment_value: installmentValue, confirmed_by_role: profile.role, confirmed_at: now }
      }),
      supabase.from('lead_activities').insert({ event_id: lead.event_id || null, lead_id: lead.id, user_id: profile.id, activity_type: 'sale_confirmed', description: `${actorName} confirmou a venda de ${selectedVehicleName}. Vendedor: ${sellerName}. ${paymentLabel}. ${installmentsLabel}. ${entryLabel}. ${tradeLabel}.`, metadata: { sale_id: saleId, vehicle_id: selectedVehicle?.id || null, vehicle_mode: vehicleMode } }),
      supabase.from('audit_logs').insert({ event_id: lead.event_id || null, user_id: profile.id, action_type: 'sale_confirmed', entity_type: 'sales', entity_id: saleId, new_value: { lead_id: lead.id, store_id: lead.assigned_store_id, vehicle_id: selectedVehicle?.id || null, vehicle_mode: vehicleMode, seller_user_id: seller.id, payment_type: paymentType, financing_bank: normalizedBank, sale_value: saleValue, confirmed_by: profile.id } })
    ]);

    const [sale, commercial] = await Promise.all([loadSale(supabase, lead.id), loadCommercial(supabase, lead.id)]);
    return NextResponse.json({ success: true, message: selectedVehicle ? `Venda confirmada. O anúncio de ${selectedVehicleName} foi retirado do marketplace.` : `Venda confirmada para ${selectedVehicleName}, informado como veículo fora do portal.`, listing_removed: Boolean(selectedVehicle), sale: commercialResponse(sale, commercial), sale_confirmed: true, commercial });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível confirmar a venda.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;
    const { supabase, profile } = context;
    const body = await request.json();
    const leadId = cleanText(body.lead_id, 80);
    const reason = cleanText(body.reason, 300) || 'Venda cancelada no pipeline';
    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });
    const lead = await loadLead(supabase, leadId);
    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para cancelar esta venda.' }, { status: 403 });
    if (lead.status !== 'sale_confirmed') return NextResponse.json({ error: 'Este lead não possui uma venda confirmada ativa.' }, { status: 400 });
    const sale = await loadSale(supabase, lead.id);
    const actorName = profile.full_name || profile.email || 'Usuário';
    const { error: leadError } = await supabase.from('leads').update({ status: 'showed_up', updated_at: new Date().toISOString() }).eq('id', lead.id);
    if (leadError) throw leadError;
    if (sale?.id) {
      const { error: saleError } = await supabase.from('sales').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: profile.id, cancellation_reason: reason }).eq('id', sale.id);
      if (saleError) throw saleError;
    }
    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({ lead_id: lead.id, store_id: lead.assigned_store_id, user_id: profile.id, user_name: actorName, activity_type: 'sale_cancelled', activity_label: 'Venda cancelada', from_status: 'sale_confirmed', to_status: 'showed_up', customer_name: lead.customer_name, customer_phone: lead.customer_phone, vehicle_name: lead.interested_vehicle, notes: reason, metadata: { sale_id: sale?.id || null, vehicle_id: sale?.vehicle_id || lead.interested_vehicle_id || null } }),
      supabase.from('lead_activities').insert({ event_id: lead.event_id || null, lead_id: lead.id, user_id: profile.id, activity_type: 'sale_cancelled', description: `${actorName} cancelou a venda. Motivo: ${reason}.`, metadata: { sale_id: sale?.id || null } }),
      supabase.from('audit_logs').insert({ event_id: lead.event_id || null, user_id: profile.id, action_type: 'sale_cancelled', entity_type: 'sales', entity_id: sale?.id || null, old_value: { lead_status: 'sale_confirmed', sale_status: sale?.status || null }, new_value: { lead_status: 'showed_up', sale_status: 'cancelled', cancellation_reason: reason } })
    ]);
    return NextResponse.json({ success: true, message: lead.interested_vehicle_id ? 'Venda cancelada e veículo restaurado no marketplace.' : 'Venda cancelada e lead reaberto em Compareceu.' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível cancelar a venda.' }, { status: 500 });
  }
}
"""

# 5) Sale modal: vehicle selection and marketplace warning.
replace_once(
    'src/components/PipelineSaleConfirmation.tsx',
    """type Seller = {
  id: string;
  full_name: string;
  email: string | null;
};

type SaleContext = {""",
    """type Seller = {
  id: string;
  full_name: string;
  email: string | null;
};

type VehicleOption = {
  id: string;
  name: string;
  price: number | string | null;
  status: string;
  show_on_landing: boolean;
};

type SaleContext = {""",
    'vehicle type',
)
replace_once(
    'src/components/PipelineSaleConfirmation.tsx',
    """    interested_vehicle: string | null;
    interested_vehicle_price: number | string | null;""",
    """    interested_vehicle: string | null;
    interested_vehicle_id: string | null;
    interested_vehicle_price: number | string | null;""",
    'lead vehicle id type',
)
replace_once(
    'src/components/PipelineSaleConfirmation.tsx',
    """  sellers: Seller[];
  suggested_seller_id: string | null;""",
    """  sellers: Seller[];
  vehicles: VehicleOption[];
  suggested_seller_id: string | null;""",
    'vehicles in context',
)
replace_once(
    'src/components/PipelineSaleConfirmation.tsx',
    """  const [tradeIn, setTradeIn] = useState<'' | 'yes' | 'no'>('');
  const [saleValue, setSaleValue] = useState('');""",
    """  const [tradeIn, setTradeIn] = useState<'' | 'yes' | 'no'>('');
  const [saleValue, setSaleValue] = useState('');
  const [vehicleMode, setVehicleMode] = useState<'portal' | 'outside_portal'>('portal');
  const [vehicleId, setVehicleId] = useState('');
  const [outsideVehicleName, setOutsideVehicleName] = useState('');""",
    'vehicle states',
)
replace_once(
    'src/components/PipelineSaleConfirmation.tsx',
    """    setTradeIn('');
    setSaleValue('');""",
    """    setTradeIn('');
    setSaleValue('');
    setVehicleMode('portal');
    setVehicleId('');
    setOutsideVehicleName('');""",
    'vehicle state reset',
)
replace_once(
    'src/components/PipelineSaleConfirmation.tsx',
    """      setContext(loaded);
      setSellerUserId(loaded.suggested_seller_id || '');""",
    """      setContext(loaded);
      const initialVehicleId = loaded.sale?.vehicle_id || loaded.lead.interested_vehicle_id || '';
      setVehicleMode(initialVehicleId ? 'portal' : 'outside_portal');
      setVehicleId(initialVehicleId);
      setOutsideVehicleName(loaded.lead.interested_vehicle || '');
      setSellerUserId(loaded.suggested_seller_id || '');""",
    'vehicle defaults',
)
replace_once(
    'src/components/PipelineSaleConfirmation.tsx',
    """    if (!sellerUserId) return setMessage('Selecione o vendedor responsável pelo fechamento.');
    if (!paymentType) return setMessage('Selecione a forma de pagamento.');""",
    """    if (!sellerUserId) return setMessage('Selecione o vendedor responsável pelo fechamento.');
    if (vehicleMode === 'portal' && !vehicleId) return setMessage('Selecione o veículo vendido no estoque da loja.');
    if (vehicleMode === 'outside_portal' && !outsideVehicleName.trim()) return setMessage('Informe qual veículo foi vendido fora do portal.');
    if (!paymentType) return setMessage('Selecione a forma de pagamento.');""",
    'vehicle validation',
)
replace_once(
    'src/components/PipelineSaleConfirmation.tsx',
    """          lead_id: leadId,
          seller_user_id: sellerUserId,""",
    """          lead_id: leadId,
          vehicle_mode: vehicleMode,
          vehicle_id: vehicleMode === 'portal' ? vehicleId : null,
          vehicle_name: vehicleMode === 'outside_portal' ? outsideVehicleName.trim() : null,
          seller_user_id: sellerUserId,""",
    'vehicle request body',
)
replace_once(
    'src/components/PipelineSaleConfirmation.tsx',
    """              <label className=\"text-sm font-black text-slate-700\">
                Vendedor responsável pelo fechamento""",
    """              <div className=\"grid gap-4 rounded-3xl border border-amber-200 bg-amber-50/70 p-4\">
                <div>
                  <p className=\"text-sm font-black text-amber-900\">Qual veículo foi vendido?</p>
                  <p className=\"mt-1 text-xs font-bold text-amber-800\">Ao confirmar um veículo do portal, o anúncio será retirado imediatamente do marketplace.</p>
                </div>
                <div className=\"grid gap-3 sm:grid-cols-2\">
                  <button type=\"button\" onClick={() => setVehicleMode('portal')} className={`rounded-2xl border p-4 text-left ${vehicleMode === 'portal' ? 'border-amber-500 bg-white ring-2 ring-amber-100' : 'border-amber-200 bg-white/70'}`}>
                    <p className=\"font-black\">Veículo do estoque</p><p className=\"mt-1 text-xs text-slate-500\">Retira automaticamente o anúncio.</p>
                  </button>
                  <button type=\"button\" onClick={() => setVehicleMode('outside_portal')} className={`rounded-2xl border p-4 text-left ${vehicleMode === 'outside_portal' ? 'border-amber-500 bg-white ring-2 ring-amber-100' : 'border-amber-200 bg-white/70'}`}>
                    <p className=\"font-black\">Veículo fora do portal</p><p className=\"mt-1 text-xs text-slate-500\">Registra a venda sem retirar outro anúncio.</p>
                  </button>
                </div>
                {vehicleMode === 'portal' ? (
                  <label className=\"text-sm font-black text-slate-700\">Veículo vendido
                    <select value={vehicleId} onChange={(event) => { const next = event.target.value; setVehicleId(next); const selected = context.vehicles.find((item) => item.id === next); if (selected?.price) setSaleValue(moneyInput(selected.price)); }} className=\"mt-2 w-full rounded-2xl border border-amber-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-amber-500\" required>
                      <option value=\"\">Selecione o veículo</option>
                      {context.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} — R$ {moneyInput(vehicle.price)}</option>)}
                    </select>
                    {context.vehicles.length === 0 ? <span className=\"mt-2 block text-xs font-bold text-red-600\">Nenhum veículo disponível foi encontrado para esta loja.</span> : null}
                  </label>
                ) : (
                  <label className=\"text-sm font-black text-slate-700\">Descrição do veículo vendido
                    <input value={outsideVehicleName} onChange={(event) => setOutsideVehicleName(event.target.value)} placeholder=\"Ex.: Chevrolet Classic 2015\" className=\"mt-2 w-full rounded-2xl border border-amber-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-amber-500\" required />
                  </label>
                )}
              </div>

              <label className=\"text-sm font-black text-slate-700\">
                Vendedor responsável pelo fechamento""",
    'vehicle selector UI',
)
replace_once(
    'src/components/PipelineSaleConfirmation.tsx',
    """                {saving ? 'Confirmando venda...' : 'Confirmar venda e responsável'}""",
    """                {saving ? 'Confirmando venda...' : 'Confirmar venda e retirar anúncio'}""",
    'submit label',
)

# 6) Pipeline: block status shortcuts and cancel through secure API.
replace_once(
    'src/app/loja/[slug]/pipeline/page.tsx',
    """  async function confirmSale() {
    if (!saleLead) return;

    await updateLead(saleLead.id, { status: 'sale_confirmed' }, 'Confirmando venda...');
    closeSaleModal();
  }

  async function reopenLead(lead: any, targetStatus = 'in_service') {
    await updateLead(
      lead.id,
      {
        status: targetStatus,
        lost_reason: null
      },
      'Reabrindo lead...'
    );
  }""",
    """  async function confirmSale() {
    if (!saleLead) return;
    setMessage('Use o formulário completo de venda para selecionar veículo, vendedor e condições comerciais.');
  }

  async function reopenLead(lead: any, targetStatus = 'in_service') {
    if (lead.status === 'sale_confirmed') {
      const confirmed = window.confirm('Cancelar esta venda? O lead voltará para Compareceu e o anúncio será restaurado quando for seguro.');
      if (!confirmed) return;
      const reason = window.prompt('Informe o motivo do cancelamento da venda:')?.trim() || 'Venda cancelada pela equipe da loja';
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return setMessage('Sessão expirada. Faça login novamente.');
      setMessage('Cancelando venda e restaurando o veículo...');
      const response = await fetch('/api/store/sale-confirmation', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lead_id: lead.id, reason })
      });
      const result = await response.json();
      if (!response.ok) return setMessage(result.error || 'Não foi possível cancelar a venda.');
      await loadData();
      setMessage(result.message || 'Venda cancelada e veículo restaurado no marketplace.');
      return;
    }

    await updateLead(lead.id, { status: targetStatus, lost_reason: null }, 'Reabrindo lead...');
  }""",
    'secure cancel sale',
)
replace_once(
    'src/app/loja/[slug]/pipeline/page.tsx',
    """  async function saveLeadEditor() {
    if (!editingLead) return;

    const payload: Record<string, any> = {""",
    """  async function saveLeadEditor() {
    if (!editingLead) return;

    if (editStatus === 'sale_confirmed' && editingLead.status !== 'sale_confirmed') {
      const lead = editingLead;
      closeLeadEditor();
      openSaleModal(lead);
      setMessage('Preencha o formulário completo para confirmar a venda.');
      return;
    }

    if (editingLead.status === 'sale_confirmed' && editStatus !== 'sale_confirmed') {
      setMessage('Use o botão Cancelar venda no card para reabrir o lead e restaurar o anúncio com segurança.');
      return;
    }

    const payload: Record<string, any> = {""",
    'block editor sale shortcuts',
)

# 7) Master route guard.
replace_once(
    'src/components/AuthGate.tsx',
    """      if (profile.role !== 'master' && profile.must_change_password) {""",
    """      if (pathname.startsWith('/master') && profile.role !== 'master') {
        router.replace('/');
        return;
      }

      if (profile.role !== 'master' && profile.must_change_password) {""",
    'master role guard',
)

# 8) Master site: mandatory owner and marketplace-aware lifecycle.
replace_once(
    'src/app/master/site/page.tsx',
    """  source_url: '',
  store_name: '',""",
    """  source_url: '',
  store_id: '',
  store_name: '',""",
    'empty owner field',
)
replace_once(
    'src/app/master/site/page.tsx',
    """    if (currentCampaign?.id) {
      const { data: vehicleRows } = await supabase
        .from('site_vehicles')
        .select('*')
        .eq('campaign_id', currentCampaign.id)
        .neq('status', 'excluido')
        .order('created_at', { ascending: false });

      setVehicles(vehicleRows || []);
    }""",
    """    const { data: vehicleRows } = await supabase
      .from('site_vehicles')
      .select('*')
      .neq('status', 'excluido')
      .order('created_at', { ascending: false });

    setVehicles(vehicleRows || []);""",
    'load permanent marketplace inventory',
)
replace_once(
    'src/app/master/site/page.tsx',
    """    if (!campaign.id) {
      setMessage('Salve a campanha antes de cadastrar veículos.');
      return null;
    }

    const payload = {
      campaign_id: campaign.id,""",
    """    const ownerStore = vehicleForm.store_id ? storeMap[vehicleForm.store_id] : null;
    if (!ownerStore?.id) {
      setMessage('Selecione obrigatoriamente a loja proprietária do veículo.');
      return null;
    }

    const sold = vehicleForm.status === 'vendido';
    const payload = {
      campaign_id: campaign.id || null,
      store_id: ownerStore.id,""",
    'mandatory owner payload',
)
replace_once(
    'src/app/master/site/page.tsx',
    """      store_name: vehicleForm.store_name,
      status: vehicleForm.status,
      show_on_landing: Boolean(vehicleForm.show_on_landing),
      is_featured: Boolean(vehicleForm.is_featured),""",
    """      store_name: ownerStore.store_name,
      status: vehicleForm.status,
      show_on_landing: sold ? false : Boolean(vehicleForm.show_on_landing),
      is_featured: sold ? false : Boolean(vehicleForm.is_featured),""",
    'owner name and sold visibility',
)
replace_once(
    'src/app/master/site/page.tsx',
    """    setMessage('Veículo publicado na landing.');""",
    """    setMessage(sold ? 'Veículo marcado como vendido e retirado do marketplace.' : 'Veículo publicado no marketplace.');""",
    'save message',
)
replace_once(
    'src/app/master/site/page.tsx',
    """  async function runPreviewFromUrl(url: string, storeName?: string, submissionId?: string) {""",
    """  async function runPreviewFromUrl(url: string, storeName?: string, submissionId?: string, storeId?: string) {""",
    'preview owner parameter',
)
replace_once(
    'src/app/master/site/page.tsx',
    """      source_url: result.vehicle?.source_url || url || current.source_url,
      store_name: storeName || current.store_name""",
    """      source_url: result.vehicle?.source_url || url || current.source_url,
      store_id: storeId || current.store_id,
      store_name: storeName || current.store_name""",
    'preview owner assignment',
)
replace_once(
    'src/app/master/site/page.tsx',
    """    await runPreviewFromUrl(item.vehicle_url, store?.store_name || '', item.id);""",
    """    await runPreviewFromUrl(item.vehicle_url, store?.store_name || '', item.id, item.store_id);""",
    'submission owner assignment',
)
replace_once(
    'src/app/master/site/page.tsx',
    """  async function editVehicle(item: any) {
    setVehicleForm({
      ...item,""",
    """  async function editVehicle(item: any) {
    const inferredStoreId = item.store_id || Object.values(storeMap).find((store: any) => store.store_name === item.store_name)?.id || '';
    setVehicleForm({
      ...item,
      store_id: inferredStoreId,""",
    'edit owner inference',
)
replace_once(
    'src/app/master/site/page.tsx',
    """                <input className=\"premium-input\" placeholder=\"Loja responsável\" value={vehicleForm.store_name} onChange={(e) => setVehicleForm({ ...vehicleForm, store_name: e.target.value })} />""",
    """                <select className=\"premium-input\" value={vehicleForm.store_id || ''} onChange={(e) => { const store = storeMap[e.target.value]; setVehicleForm({ ...vehicleForm, store_id: e.target.value, store_name: store?.store_name || '' }); }} required>
                  <option value=\"\">Selecione a loja proprietária</option>
                  {Object.values(storeMap).sort((a: any, b: any) => String(a.store_name || '').localeCompare(String(b.store_name || ''), 'pt-BR')).map((store: any) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
                </select>""",
    'owner select UI',
)
replace_once(
    'src/app/master/site/page.tsx',
    """    if (!campaign.id) {
      setMessage('Salve a campanha antes de subir imagem.');
      return;
    }

    setUploading(true);

    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${campaign.slug}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;""",
    """    setUploading(true);

    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${campaign.slug || 'marketplace'}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;""",
    'marketplace image upload without campaign',
)

for path in TARGETS:
    if outputs[path] == originals[path]:
        raise RuntimeError(f'{path}: no changes were staged.')

for path in TARGETS:
    Path(path).write_text(outputs[path], encoding='utf-8')

print('Phase 2A marketplace patch applied to 8 authorized files.')
