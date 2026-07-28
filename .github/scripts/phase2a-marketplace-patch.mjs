import fs from 'node:fs';

const outputs = new Map();

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function replaceOnce(path, source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${path}: alteração "${label}" esperava 1 ocorrência e encontrou ${count}.`);
  }
  return source.replace(before, after);
}

function stage(path, content) {
  outputs.set(path, content);
}

// 1. Publicação da loja: estoque permanente, proprietário direto e campanha opcional.
{
  const path = 'src/app/api/store-stock/route.ts';
  let source = read(path);
  source = replaceOnce(
    path,
    source,
`      const campaign = await getActiveCampaign(supabase);

      if (!campaign) {
        return NextResponse.json({ error: 'Nenhuma campanha ativa encontrada para publicar o veículo.' }, { status: 400 });
      }

      const vehiclePayload: any = {
        campaign_id: campaign.id,`,
`      const campaign = await getActiveCampaign(supabase);

      const vehiclePayload: any = {
        campaign_id: campaign?.id || null,
        store_id: store.id,`,
    'desvincular publicação de campanha e gravar store_id'
  );
  stage(path, source);
}

// 2. Publicação em lote: validação completa e proprietário obrigatório.
{
  const path = 'src/app/api/site-bulk-publish/route.ts';
  let source = read(path);
  source = replaceOnce(
    path,
    source,
`    if (!campaign?.id) {
      return NextResponse.json({ error: 'Campanha da landing não encontrada.' }, { status: 400 });
    }

`,
``,
    'permitir publicação permanente sem campanha'
  );
  source = replaceOnce(
    path,
    source,
`          .select('id,store_name')
          .eq('id', submission.store_id)
          .maybeSingle();

        const importedResult = await importVehicleFromSubmission(origin, submission);`,
`          .select('id,store_name,status,portal_enabled')
          .eq('id', submission.store_id)
          .maybeSingle();

        if (!store || store.status !== 'active' || !store.portal_enabled) {
          throw new Error('A loja proprietária está inativa ou sem acesso ao portal.');
        }

        const importedResult = await importVehicleFromSubmission(origin, submission);`,
    'validar loja proprietária no lote'
  );
  source = replaceOnce(
    path,
    source,
`        const payload = {
          campaign_id: campaign.id,
          brand: text(vehicleData.brand) || text(importedResult.preview?.vehicle?.brand) || 'Veículo',
          model: text(vehicleData.model) || text(importedResult.preview?.vehicle?.model) || 'A conferir',
          version: text(vehicleData.version) || text(importedResult.preview?.vehicle?.version),
          year: text(vehicleData.year) || text(importedResult.preview?.vehicle?.year),
          mileage: text(vehicleData.mileage) || '',
          color: text(vehicleData.color) || '',
          transmission: text(vehicleData.transmission) || '',
          fuel: text(vehicleData.fuel) || '',
          price: Number(importedResult.imported?.price || importedResult.preview?.price || 0),
          image_url: imageUrl,
          image_urls: imageUrls,
          store_name: store?.store_name || '',
          status: 'disponivel',
          show_on_landing: true,
          is_featured: false,
          updated_at: new Date().toISOString()
        };`,
`        const payload = {
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
        }`,
    'validar e publicar lote com store_id'
  );
  stage(path, source);
}

// 3. Catálogo público: store_id como fonte de verdade, com fallback temporário para vínculos antigos.
{
  const path = 'src/app/api/marketplace/vehicles/route.ts';
  stage(path, `import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const invalidLinkStatuses = new Set(['rejected', 'duplicate', 'deleted', 'excluido']);

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) throw new Error('Configuração do servidor incompleta.');

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function clean(value: unknown) {
  return String(value || '').replace(/\\s+/g, ' ').trim();
}

function validOwnerLink(link: any) {
  const status = clean(link?.status).toLowerCase();
  const metadata = link?.metadata || {};
  return Boolean(
    link?.imported_vehicle_id &&
    link?.store_id &&
    metadata.store_removed !== true &&
    !invalidLinkStatuses.has(status)
  );
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
    const unresolvedIds = vehicles.filter((vehicle: any) => !vehicle.store_id).map((vehicle: any) => vehicle.id);

    const { data: fallbackRows, error: fallbackError } = unresolvedIds.length
      ? await supabase
          .from('store_vehicle_link_submissions')
          .select('id,store_id,imported_vehicle_id,status,metadata')
          .in('imported_vehicle_id', unresolvedIds)
      : { data: [], error: null };

    if (fallbackError) throw fallbackError;

    const validFallbackLinks = (fallbackRows || []).filter(validOwnerLink);
    const storeIds = Array.from(new Set([
      ...vehicles.map((vehicle: any) => vehicle.store_id),
      ...validFallbackLinks.map((link: any) => link.store_id)
    ].filter(Boolean)));

    const { data: storeRows, error: storeError } = storeIds.length
      ? await supabase
          .from('stores')
          .select('id,store_name,slug,website_url,status,portal_enabled')
          .in('id', storeIds)
          .eq('status', 'active')
          .eq('portal_enabled', true)
      : { data: [], error: null };

    if (storeError) throw storeError;

    const storesById = new Map<string, any>((storeRows || []).map((store: any) => [store.id, store]));
    const fallbackOwners = new Map<string, any[]>();

    validFallbackLinks.forEach((link: any) => {
      const store = storesById.get(link.store_id);
      if (!store) return;
      const current = fallbackOwners.get(link.imported_vehicle_id) || [];
      if (!current.some((item) => item.id === store.id)) current.push(store);
      fallbackOwners.set(link.imported_vehicle_id, current);
    });

    const safeVehicles = vehicles.map((vehicle: any) => {
      let store = vehicle.store_id ? storesById.get(vehicle.store_id) : null;
      if (!store) {
        const owners = fallbackOwners.get(vehicle.id) || [];
        if (owners.length !== 1) return null;
        store = owners[0];
      }

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
    return NextResponse.json(
      { error: error?.message || 'Não foi possível carregar os veículos.' },
      { status: 500 }
    );
  }
}
`);
}

// 4. API de venda: veículo obrigatório ou declaração fora do portal, além de cancelamento seguro.
{
  const path = 'src/app/api/store/sale-confirmation/route.ts';
  let source = read(path);
  source = replaceOnce(
    path,
    source,
`async function loadSale(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('sales')
    .select('id,lead_id,store_id,seller_name,seller_user_id,pre_sales_user_id,captured_by_user_id,customer_bank,financing_bank,payment_type,sale_value,vehicle_category,sale_vehicle_name,has_trade_in,installment_count,has_down_payment,down_payment_value,financed_amount,installment_value,confirmed_by,confirmed_at,created_at')`,
`async function loadVehicles(supabase: any, storeId: string) {
  const { data, error } = await supabase
    .from('site_vehicles')
    .select('id,store_id,brand,model,version,year,price,status,show_on_landing,sold_lead_id')
    .eq('store_id', storeId)
    .neq('status', 'excluido')
    .order('brand', { ascending: true })
    .order('model', { ascending: true });

  if (error) throw error;
  return (data || []).map((vehicle: any) => ({
    ...vehicle,
    name: [vehicle.brand, vehicle.model, vehicle.version, vehicle.year].filter(Boolean).join(' ')
  }));
}

async function loadSale(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('sales')
    .select('id,lead_id,store_id,vehicle_id,status,cancelled_at,cancelled_by,cancellation_reason,seller_name,seller_user_id,pre_sales_user_id,captured_by_user_id,customer_bank,financing_bank,payment_type,sale_value,vehicle_category,sale_vehicle_name,has_trade_in,installment_count,has_down_payment,down_payment_value,financed_amount,installment_value,confirmed_by,confirmed_at,created_at')`,
    'carregar veículos e situação da venda'
  );
  source = replaceOnce(
    path,
    source,
`  if (sale) {
    return {
      ...sale,
      is_confirmed: true,
      commercial_id: commercial?.id || null
    };
  }`,
`  if (sale) {
    return {
      ...sale,
      is_confirmed: sale.status !== 'cancelled',
      commercial_id: commercial?.id || null
    };
  }`,
    'distinguir venda confirmada e cancelada'
  );
  source = replaceOnce(
    path,
    source,
`    const [sellers, sale, commercial] = await Promise.all([
      loadSellers(supabase, store.id),
      loadSale(supabase, lead.id),
      loadCommercial(supabase, lead.id)
    ]);`,
`    const [sellers, sale, commercial, vehicles] = await Promise.all([
      loadSellers(supabase, store.id),
      loadSale(supabase, lead.id),
      loadCommercial(supabase, lead.id),
      loadVehicles(supabase, store.id)
    ]);`,
    'carregar estoque da loja na confirmação'
  );
  source = replaceOnce(
    path,
    source,
`        interested_vehicle: lead.interested_vehicle,
        interested_vehicle_price: lead.interested_vehicle_price,`,
`        interested_vehicle: lead.interested_vehicle,
        interested_vehicle_id: lead.interested_vehicle_id,
        interested_vehicle_price: lead.interested_vehicle_price,`,
    'expor id do veículo do lead'
  );
  source = replaceOnce(
    path,
    source,
`      sellers,
      suggested_seller_id: suggestedSellerId,
      sale: commercialResponse(sale, commercial),
      sale_confirmed: Boolean(sale),
      commercial`,
`      sellers,
      vehicles,
      suggested_seller_id: suggestedSellerId,
      sale: commercialResponse(sale, commercial),
      sale_confirmed: Boolean(sale && sale.status !== 'cancelled' && lead.status === 'sale_confirmed'),
      commercial`,
    'retornar veículos e status correto'
  );
  source = replaceOnce(
    path,
    source,
`    const leadId = cleanText(body.lead_id, 80);
    const sellerUserId = cleanText(body.seller_user_id, 80);`,
`    const leadId = cleanText(body.lead_id, 80);
    const vehicleId = cleanText(body.vehicle_id, 80);
    const vehicleOutsidePortal = body.vehicle_outside_portal === true;
    const sellerUserId = cleanText(body.seller_user_id, 80);`,
    'ler seleção do veículo'
  );
  source = replaceOnce(
    path,
    source,
`    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });
    if (!sellerUserId) return NextResponse.json({ error: 'Selecione o vendedor responsável pelo fechamento.' }, { status: 400 });`,
`    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });
    if (!vehicleOutsidePortal && !vehicleId) return NextResponse.json({ error: 'Selecione o veículo vendido ou informe que ele não estava anunciado no portal.' }, { status: 400 });
    if (!sellerUserId) return NextResponse.json({ error: 'Selecione o vendedor responsável pelo fechamento.' }, { status: 400 });`,
    'exigir veículo ou declaração externa'
  );
  source = replaceOnce(
    path,
    source,
`    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para confirmar esta venda.' }, { status: 403 });

    const { data: seller, error: sellerError } = await supabase`,
`    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para confirmar esta venda.' }, { status: 403 });

    let selectedVehicle: any = null;
    if (!vehicleOutsidePortal) {
      const { data: vehicle, error: vehicleError } = await supabase
        .from('site_vehicles')
        .select('id,store_id,brand,model,version,year,price,status,sold_lead_id')
        .eq('id', vehicleId)
        .eq('store_id', lead.assigned_store_id)
        .maybeSingle();

      if (vehicleError) throw vehicleError;
      if (!vehicle) return NextResponse.json({ error: 'O veículo selecionado não pertence ao estoque desta loja.' }, { status: 400 });
      if (vehicle.status === 'vendido' && vehicle.sold_lead_id !== lead.id) {
        return NextResponse.json({ error: 'Este veículo já está vendido ou vinculado a outra venda.' }, { status: 409 });
      }
      selectedVehicle = vehicle;
    }

    const selectedVehicleName = selectedVehicle
      ? [selectedVehicle.brand, selectedVehicle.model, selectedVehicle.version, selectedVehicle.year].filter(Boolean).join(' ')
      : lead.interested_vehicle;

    const { error: leadVehicleError } = await supabase
      .from('leads')
      .update({
        interested_vehicle_id: selectedVehicle?.id || null,
        interested_vehicle: selectedVehicleName || lead.interested_vehicle,
        interested_vehicle_price: selectedVehicle?.price ?? lead.interested_vehicle_price,
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id)
      .eq('assigned_store_id', lead.assigned_store_id);

    if (leadVehicleError) throw leadVehicleError;
    lead.interested_vehicle_id = selectedVehicle?.id || null;
    lead.interested_vehicle = selectedVehicleName || lead.interested_vehicle;
    lead.interested_vehicle_price = selectedVehicle?.price ?? lead.interested_vehicle_price;

    const { data: seller, error: sellerError } = await supabase`,
    'validar propriedade e vincular veículo ao lead'
  );
  source = replaceOnce(
    path,
    source,
`          sale_id: saleId,
          seller_user_id: seller.id,`,
`          sale_id: saleId,
          vehicle_id: selectedVehicle?.id || null,
          vehicle_outside_portal: vehicleOutsidePortal,
          seller_user_id: seller.id,`,
    'registrar veículo na atividade'
  );
  source = replaceOnce(
    path,
    source,
`          lead_id: lead.id,
          store_id: lead.assigned_store_id,
          seller_user_id: seller.id,`,
`          lead_id: lead.id,
          store_id: lead.assigned_store_id,
          vehicle_id: selectedVehicle?.id || null,
          vehicle_outside_portal: vehicleOutsidePortal,
          seller_user_id: seller.id,`,
    'registrar veículo na auditoria'
  );
  source = replaceOnce(
    path,
    source,
`      message: \`Venda confirmada com \${sellerName} como vendedor responsável.\`,`,
`      message: selectedVehicle
        ? \`Venda confirmada. O anúncio de \${selectedVehicleName} foi retirado do marketplace.\`
        : \`Venda confirmada com \${sellerName}. Veículo registrado como fora do portal.\`,`,
    'retornar mensagem sobre retirada do anúncio'
  );
  source += `

export async function DELETE(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;

    const { supabase, profile } = context;
    const body = await request.json().catch(() => ({}));
    const leadId = cleanText(body.lead_id, 80);
    const reason = cleanText(body.reason, 500) || 'Venda cancelada no pipeline';

    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });

    const lead = await loadLead(supabase, leadId);
    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para cancelar esta venda.' }, { status: 403 });
    if (lead.status !== 'sale_confirmed') return NextResponse.json({ error: 'Este lead não possui uma venda confirmada ativa.' }, { status: 409 });

    const actorName = profile.full_name || profile.email || 'Usuário';
    const now = new Date().toISOString();
    const { error: leadError } = await supabase
      .from('leads')
      .update({
        status: 'showed_up',
        lost_reason: null,
        updated_at: now,
        last_activity_at: now,
        last_activity_type: 'sale_cancelled',
        last_activity_label: 'Venda cancelada',
        last_activity_by_name: actorName
      })
      .eq('id', lead.id)
      .eq('assigned_store_id', lead.assigned_store_id);

    if (leadError) throw leadError;

    await supabase
      .from('sales')
      .update({
        status: 'cancelled',
        cancelled_at: now,
        cancelled_by: profile.id,
        cancellation_reason: reason
      })
      .eq('lead_id', lead.id);

    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({
        lead_id: lead.id,
        store_id: lead.assigned_store_id,
        user_id: profile.id,
        user_name: actorName,
        activity_type: 'sale_cancelled',
        activity_label: 'Venda cancelada e lead reaberto',
        from_status: 'sale_confirmed',
        to_status: 'showed_up',
        customer_name: lead.customer_name,
        customer_phone: lead.customer_phone,
        vehicle_name: lead.interested_vehicle,
        notes: reason,
        metadata: { interested_vehicle_id: lead.interested_vehicle_id, cancelled_at: now }
      }),
      supabase.from('audit_logs').insert({
        event_id: lead.event_id || null,
        user_id: profile.id,
        action_type: 'sale_cancelled',
        entity_type: 'sales',
        entity_id: lead.id,
        old_value: { status: 'confirmed' },
        new_value: { status: 'cancelled', reason, lead_status: 'showed_up' }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: lead.interested_vehicle_id
        ? 'Venda cancelada. O anúncio foi restaurado ao estado anterior quando estava disponível.'
        : 'Venda cancelada e lead reaberto em Compareceu.'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível cancelar a venda.' }, { status: 500 });
  }
}
`;
  stage(path, source);
}

// 5. Formulário visual: seleção do veículo e aviso de retirada automática.
{
  const path = 'src/components/PipelineSaleConfirmation.tsx';
  let source = read(path);
  source = replaceOnce(
    path,
    source,
`type Seller = {
  id: string;
  full_name: string;
  email: string | null;
};`,
`type Seller = {
  id: string;
  full_name: string;
  email: string | null;
};

type SaleVehicle = {
  id: string;
  name: string;
  price: number | string | null;
  status: string;
  sold_lead_id?: string | null;
};`,
    'adicionar tipo de veículo da venda'
  );
  source = replaceOnce(
    path,
    source,
`    interested_vehicle: string | null;
    interested_vehicle_price: number | string | null;`,
`    interested_vehicle: string | null;
    interested_vehicle_id: string | null;
    interested_vehicle_price: number | string | null;`,
    'tipar id do veículo do lead'
  );
  source = replaceOnce(
    path,
    source,
`  sellers: Seller[];
  suggested_seller_id: string | null;`,
`  sellers: Seller[];
  vehicles: SaleVehicle[];
  suggested_seller_id: string | null;`,
    'tipar lista de veículos'
  );
  source = replaceOnce(
    path,
    source,
`  const [success, setSuccess] = useState(false);
  const [sellerUserId, setSellerUserId] = useState('');`,
`  const [success, setSuccess] = useState(false);
  const [vehicleId, setVehicleId] = useState('');
  const [vehicleOutsidePortal, setVehicleOutsidePortal] = useState(false);
  const [sellerUserId, setSellerUserId] = useState('');`,
    'adicionar estados do veículo'
  );
  source = replaceOnce(
    path,
    source,
`    setSuccess(false);
    setSellerUserId('');`,
`    setSuccess(false);
    setVehicleId('');
    setVehicleOutsidePortal(false);
    setSellerUserId('');`,
    'limpar seleção de veículo'
  );
  source = replaceOnce(
    path,
    source,
`      setContext(loaded);
      setSellerUserId(loaded.suggested_seller_id || '');`,
`      setContext(loaded);
      const initialVehicleId = loaded.sale?.vehicle_id || loaded.lead.interested_vehicle_id || '';
      setVehicleId(initialVehicleId);
      setVehicleOutsidePortal(Boolean(loaded.sale?.is_confirmed && !initialVehicleId));
      setSellerUserId(loaded.suggested_seller_id || '');`,
    'preencher veículo atual'
  );
  source = replaceOnce(
    path,
    source,
`    if (!sellerUserId) return setMessage('Selecione o vendedor responsável pelo fechamento.');
    if (!paymentType) return setMessage('Selecione a forma de pagamento.');`,
`    if (!vehicleOutsidePortal && !vehicleId) return setMessage('Selecione o veículo vendido ou marque que ele não estava anunciado no portal.');
    if (!sellerUserId) return setMessage('Selecione o vendedor responsável pelo fechamento.');
    if (!paymentType) return setMessage('Selecione a forma de pagamento.');`,
    'validar veículo no formulário'
  );
  source = replaceOnce(
    path,
    source,
`    setMessage('Confirmando venda e atualizando o dashboard Master...');`,
`    setMessage('Confirmando venda e retirando o anúncio do marketplace...');`,
    'mensagem de processamento'
  );
  source = replaceOnce(
    path,
    source,
`          lead_id: leadId,
          seller_user_id: sellerUserId,`,
`          lead_id: leadId,
          vehicle_id: vehicleOutsidePortal ? null : vehicleId,
          vehicle_outside_portal: vehicleOutsidePortal,
          seller_user_id: sellerUserId,`,
    'enviar veículo selecionado'
  );
  source = replaceOnce(
    path,
    source,
`              <p className="mt-1 text-sm text-slate-500">Registre vendedor, pagamento, entrada, parcelas e troca.</p>`,
`              <p className="mt-1 text-sm text-slate-500">Registre o veículo vendido, vendedor, pagamento, entrada, parcelas e troca.</p>`,
    'atualizar descrição do formulário'
  );
  source = replaceOnce(
    path,
    source,
`              </div>

              <label className="text-sm font-black text-slate-700">
                Vendedor responsável pelo fechamento`,
`              </div>

              <div className="grid gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                <label className="text-sm font-black text-slate-700">
                  Veículo vendido
                  <select
                    value={vehicleId}
                    onChange={(event) => setVehicleId(event.target.value)}
                    disabled={vehicleOutsidePortal}
                    className="mt-2 w-full rounded-2xl border border-amber-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-amber-500 disabled:opacity-50"
                    required={!vehicleOutsidePortal}
                  >
                    <option value="">Selecione o veículo da loja</option>
                    {context.vehicles.map((vehicle) => (
                      <option
                        key={vehicle.id}
                        value={vehicle.id}
                        disabled={vehicle.status === 'vendido' && vehicle.id !== context.lead.interested_vehicle_id}
                      >
                        {vehicle.name}{vehicle.price ? ` — R$ ${moneyInput(vehicle.price)}` : ''}{vehicle.status === 'vendido' ? ' — vendido' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-white p-4 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={vehicleOutsidePortal}
                    onChange={(event) => {
                      setVehicleOutsidePortal(event.target.checked);
                      if (event.target.checked) setVehicleId('');
                    }}
                    className="mt-1"
                  />
                  <span>
                    O veículo vendido não estava anunciado no portal.
                    <small className="mt-1 block font-semibold text-slate-500">Use esta opção somente quando o carro não existir no estoque online da loja.</small>
                  </span>
                </label>

                <p className="text-xs font-bold text-amber-800">
                  Ao confirmar, o anúncio selecionado será marcado como vendido e retirado imediatamente do marketplace. O histórico permanecerá salvo.
                </p>
              </div>

              <label className="text-sm font-black text-slate-700">
                Vendedor responsável pelo fechamento`,
    'inserir seleção e aviso do veículo'
  );
  stage(path, source);
}

// 6. Pipeline: impedir atalhos de venda e cancelar por API segura.
{
  const path = 'src/app/loja/[slug]/pipeline/page.tsx';
  let source = read(path);
  source = replaceOnce(
    path,
    source,
`  { value: 'sale_confirmed', label: 'Venda confirmada' },`,
`  { value: 'sale_confirmed', label: 'Venda confirmada — use o botão Venda', disabled: true },`,
    'desabilitar venda pelo editor'
  );
  source = replaceOnce(
    path,
    source,
`  async function reopenLead(lead: any, targetStatus = 'in_service') {`,
`  async function cancelSale(lead: any) {
    const reason = window.prompt('Informe o motivo do cancelamento da venda:');
    if (reason === null) return;
    if (!window.confirm('Cancelar esta venda e restaurar o anúncio quando for seguro?')) return;

    setMessage('Cancelando venda e restaurando o anúncio...');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMessage('Sessão expirada. Faça login novamente.');
      return;
    }

    const response = await fetch('/api/store/sale-confirmation', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lead_id: lead.id, reason: reason.trim() || 'Venda cancelada no pipeline' })
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || 'Não foi possível cancelar a venda.');
      return;
    }

    await loadData();
    setMessage(payload.message || 'Venda cancelada com sucesso.');
  }

  async function reopenLead(lead: any, targetStatus = 'in_service') {`,
    'adicionar cancelamento seguro'
  );
  source = replaceOnce(
    path,
    source,
`    const payload: Record<string, any> = {
      customer_name: editCustomerName.trim() || null,`,
`    if (editingLead.status === 'sale_confirmed' && editStatus !== 'sale_confirmed') {
      setMessage('Use o botão Cancelar venda para reabrir uma venda confirmada.');
      return;
    }
    if (editingLead.status !== 'sale_confirmed' && editStatus === 'sale_confirmed') {
      setMessage('Use o botão Venda para preencher os dados completos da negociação.');
      return;
    }

    const payload: Record<string, any> = {
      customer_name: editCustomerName.trim() || null,`,
    'bloquear alteração manual de venda'
  );
  source = replaceOnce(
    path,
    source,
`    if (!lead || lead.status === targetStatus) return;

    if (targetStatus === 'scheduled') {`,
`    if (!lead || lead.status === targetStatus) return;

    if (lead.status === 'sale_confirmed') {
      await cancelSale(lead);
      return;
    }

    if (targetStatus === 'scheduled') {`,
    'cancelar venda ao arrastar card vendido'
  );
  source = replaceOnce(
    path,
    source,
`                           onReopen={() => reopenLead(lead, column.key === 'sale_confirmed' ? 'showed_up' : 'in_service')}`,
`                           onReopen={() => column.key === 'sale_confirmed' ? cancelSale(lead) : reopenLead(lead, 'in_service')}`,
    'ligar botão cancelar venda à API'
  );
  source = replaceOnce(
    path,
    source,
`                  {editableStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}`,
`                  {editableStatusOptions.map((option: any) => <option key={option.value} value={option.value} disabled={Boolean(option.disabled)}>{option.label}</option>)}`,
    'renderizar opção de venda desabilitada'
  );
  stage(path, source);
}

// 7. Proteção de rotas por cargo.
{
  const path = 'src/components/AuthGate.tsx';
  stage(path, `'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const protectedPrefixes = ['/master', '/prospector', '/store', '/pre-sales', '/routes', '/loja'];
const storePortalRoles = ['master', 'store', 'pre_sales', 'seller', 'prospector'];

function canAccessPath(pathname: string, role: string) {
  if (pathname.startsWith('/master')) return role === 'master';
  if (pathname.startsWith('/loja')) return storePortalRoles.includes(role);
  if (pathname.startsWith('/prospector')) return role === 'master' || role === 'prospector';
  if (pathname.startsWith('/pre-sales')) return role === 'master' || role === 'pre_sales';
  if (pathname.startsWith('/store')) return role === 'master' || role === 'store';
  return true;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      setIsChecking(true);
      const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
      if (!isProtected) {
        if (!cancelled) setIsChecking(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      const authUser = data.session?.user;
      if (!authUser?.email) {
        router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
        return;
      }

      let profile: any = null;
      const { data: profileByAuth } = await supabase
        .from('users')
        .select('role,status,must_change_password')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      profile = profileByAuth;

      if (!profile) {
        const { data: profileByEmail } = await supabase
          .from('users')
          .select('role,status,must_change_password')
          .ilike('email', authUser.email)
          .maybeSingle();
        profile = profileByEmail;
      }

      if (cancelled) return;
      if (!profile || profile.status !== 'active') {
        router.replace('/logout');
        return;
      }

      if (!canAccessPath(pathname, profile.role)) {
        router.replace('/logout');
        return;
      }

      if (profile.role !== 'master' && profile.must_change_password) {
        router.replace(`/trocar-senha?next=${encodeURIComponent(pathname)}`);
        return;
      }

      setIsChecking(false);
    }

    void checkSession();
    return () => { cancelled = true; };
  }, [pathname, router, supabase]);

  if (isChecking && protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-black px-6 text-white">
        <div className="card p-8 text-center">
          <p className="text-sm uppercase tracking-[0.25em] text-brand-red">Acesso</p>
          <h1 className="mt-3 text-2xl font-black">Validando sessão...</h1>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
`);
}

// 8. Painel Master: proprietário obrigatório e estoque permanente.
{
  const path = 'src/app/master/site/page.tsx';
  let source = read(path);
  source = replaceOnce(
    path,
    source,
`  source_url: '',
  store_name: '',`,
`  source_url: '',
  store_id: '',
  store_name: '',`,
    'adicionar store_id ao formulário Master'
  );
  source = replaceOnce(
    path,
    source,
`    if (currentCampaign?.id) {
      const { data: vehicleRows } = await supabase
        .from('site_vehicles')
        .select('*')
        .eq('campaign_id', currentCampaign.id)
        .neq('status', 'excluido')
        .order('created_at', { ascending: false });

      setVehicles(vehicleRows || []);
    }`,
`    const { data: vehicleRows } = await supabase
      .from('site_vehicles')
      .select('*')
      .neq('status', 'excluido')
      .order('created_at', { ascending: false });

    setVehicles(vehicleRows || []);`,
    'carregar estoque permanente completo'
  );
  source = replaceOnce(
    path,
    source,
`  async function saveVehiclePayload() {
    if (!campaign.id) {
      setMessage('Salve a campanha antes de cadastrar veículos.');
      return null;
    }

    const payload = {
      campaign_id: campaign.id,`,
`  async function saveVehiclePayload() {
    const ownerStore = storeMap[vehicleForm.store_id];
    if (!ownerStore) {
      setMessage('Selecione obrigatoriamente a loja proprietária do veículo.');
      return null;
    }

    const payload = {
      campaign_id: campaign.id || null,
      store_id: ownerStore.id,`,
    'exigir proprietário no cadastro Master'
  );
  source = replaceOnce(
    path,
    source,
`      source_url: vehicleForm.source_url,
      store_name: vehicleForm.store_name,`,
`      source_url: vehicleForm.source_url,
      store_name: ownerStore.store_name,`,
    'derivar nome da loja pelo store_id'
  );
  source = replaceOnce(
    path,
    source,
`  async function runPreviewFromUrl(url: string, storeName?: string, submissionId?: string) {`,
`  async function runPreviewFromUrl(url: string, storeName?: string, submissionId?: string, storeId?: string) {`,
    'receber id da loja na prévia'
  );
  source = replaceOnce(
    path,
    source,
`      source_url: result.vehicle?.source_url || url || current.source_url,
      store_name: storeName || current.store_name`,
`      source_url: result.vehicle?.source_url || url || current.source_url,
      store_id: storeId || current.store_id,
      store_name: storeName || current.store_name`,
    'preencher proprietário pela fila'
  );
  source = replaceOnce(
    path,
    source,
`    await runPreviewFromUrl(item.vehicle_url, store?.store_name || '', item.id);`,
`    await runPreviewFromUrl(item.vehicle_url, store?.store_name || '', item.id, item.store_id);`,
    'passar store_id ao revisar envio'
  );
  source = replaceOnce(
    path,
    source,
`    setVehicleForm({
      ...item,
      price: String(item.price || ''),`,
`    setVehicleForm({
      ...item,
      store_id: item.store_id || Object.values(storeMap).find((store: any) => store.store_name === item.store_name)?.id || '',
      price: String(item.price || ''),`,
    'preservar proprietário ao editar'
  );
  source = replaceOnce(
    path,
    source,
`                <input className="premium-input" placeholder="Loja responsável" value={vehicleForm.store_name} onChange={(e) => setVehicleForm({ ...vehicleForm, store_name: e.target.value })} />`,
`                <select
                  className="premium-input"
                  value={vehicleForm.store_id || ''}
                  onChange={(e) => {
                    const owner = storeMap[e.target.value];
                    setVehicleForm({ ...vehicleForm, store_id: e.target.value, store_name: owner?.store_name || '' });
                  }}
                  required
                >
                  <option value="">Selecione a loja proprietária</option>
                  {Object.values(storeMap).sort((a: any, b: any) => String(a.store_name).localeCompare(String(b.store_name), 'pt-BR')).map((store: any) => (
                    <option key={store.id} value={store.id}>{store.store_name}</option>
                  ))}
                </select>`,
    'substituir nome livre por seletor de loja'
  );
  source = source
    .replaceAll('Veículo publicado na landing.', 'Veículo publicado no marketplace.')
    .replaceAll('Estoque da Landing', 'Estoque do Marketplace')
    .replaceAll('Adicionar veículo na landing', 'Adicionar veículo ao marketplace');
  stage(path, source);
}

// Somente grava depois que todas as verificações e transformações foram concluídas.
for (const [path, content] of outputs) {
  fs.writeFileSync(path, content, 'utf8');
  console.log(`Atualizado: ${path}`);
}

console.log(`Fase 2A aplicada em ${outputs.size} arquivos.`);
