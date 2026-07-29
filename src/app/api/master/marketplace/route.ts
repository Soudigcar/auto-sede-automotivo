import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pendingSubmissionStatuses = new Set(['pending', 'reviewing', 'imported']);
const invalidLinkStatuses = new Set(['rejected', 'duplicate', 'deleted', 'excluido']);
const marketplaceTerms = ['marketplace', 'landing', 'site', 'simulador', 'vehicle_owner'];

function numberParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function cleanSearch(value: string | null) {
  return cleanText(value, 120).replace(/[,%()]/g, ' ');
}

function sinceDate(days: number) {
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeStatus(value: unknown) {
  return cleanText(value, 80).toLowerCase();
}

function imageList(vehicle: any) {
  return Array.from(new Set([
    ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []),
    vehicle?.image_url
  ].map((item) => cleanText(item, 1200)).filter(Boolean)));
}

function vehicleName(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.year]
    .map((item) => cleanText(item, 120))
    .filter(Boolean)
    .join(' ');
}

function isValidOwnerLink(link: any) {
  const status = normalizeStatus(link?.status);
  if (!link?.imported_vehicle_id || !link?.store_id) return false;
  if (link?.metadata?.store_removed === true) return false;
  return !invalidLinkStatuses.has(status);
}

function leadOrigin(lead: any) {
  const metadata = lead?.metadata && typeof lead.metadata === 'object' ? lead.metadata : {};
  const raw = [
    lead?.origin,
    lead?.source,
    lead?.lead_source,
    lead?.source_type,
    lead?.capture_source,
    lead?.channel,
    lead?.routing_strategy,
    metadata?.origin,
    metadata?.source,
    metadata?.channel,
    metadata?.routing_strategy
  ].map((item) => cleanText(item, 120).toLowerCase()).filter(Boolean);

  const matched = raw.find((item) => marketplaceTerms.some((term) => item.includes(term)));
  if (matched) return matched;
  if (lead?.marketplace_vehicle_id || metadata?.marketplace === true) return 'marketplace';
  return '';
}

function missingVehicleFields(vehicle: any) {
  const images = imageList(vehicle);
  return [
    !cleanText(vehicle?.brand, 120) && 'marca',
    !cleanText(vehicle?.model, 120) && 'modelo',
    !cleanText(vehicle?.year, 40) && 'ano',
    !(Number(vehicle?.price || 0) > 0) && 'valor',
    !images.length && 'foto'
  ].filter(Boolean) as string[];
}

function problemItem(input: {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  store?: any;
  vehicle?: any;
  created_at?: string | null;
}) {
  return {
    id: input.id,
    type: input.type,
    severity: input.severity,
    title: input.title,
    description: input.description,
    store: input.store ? {
      id: input.store.id,
      name: input.store.store_name || 'Loja sem nome',
      slug: input.store.slug || null
    } : null,
    vehicle: input.vehicle ? {
      id: input.vehicle.id,
      name: vehicleName(input.vehicle) || 'Veículo sem identificação'
    } : null,
    created_at: input.created_at || null
  };
}

async function getContext(request: Request) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;
  }

  const profile = await getProfileFromToken(supabase, token);
  if (!profile || profile.status !== 'active' || profile.role !== 'master') {
    return { error: NextResponse.json({ error: 'Acesso exclusivo para usuários Master.' }, { status: 403 }) } as const;
  }

  return { supabase, profile } as const;
}

export async function GET(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;

    const { supabase } = context;
    const url = new URL(request.url);
    const page = numberParam(url.searchParams.get('page'), 1, 1, 10_000);
    const limit = numberParam(url.searchParams.get('limit'), 20, 10, 50);
    const days = numberParam(url.searchParams.get('days'), 30, 0, 365);
    const q = cleanSearch(url.searchParams.get('q'));
    const storeId = cleanText(url.searchParams.get('store_id'), 80);
    const status = normalizeStatus(url.searchParams.get('status')) || 'all';
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const since = sinceDate(days);

    let vehiclesQuery: any = supabase
      .from('site_vehicles')
      .select('*', { count: 'exact' })
      .neq('status', 'excluido')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (storeId) vehiclesQuery = vehiclesQuery.eq('store_id', storeId);
    if (status !== 'all') vehiclesQuery = vehiclesQuery.eq('status', status);
    if (since) vehiclesQuery = vehiclesQuery.gte('created_at', since);
    if (q) {
      vehiclesQuery = vehiclesQuery.or([
        `brand.ilike.%${q}%`,
        `model.ilike.%${q}%`,
        `version.ilike.%${q}%`,
        `year.ilike.%${q}%`,
        `store_name.ilike.%${q}%`
      ].join(','));
    }

    let diagnosticVehiclesQuery: any = supabase
      .from('site_vehicles')
      .select('*')
      .neq('status', 'excluido')
      .order('created_at', { ascending: false })
      .limit(500);

    let submissionsQuery: any = supabase
      .from('store_vehicle_link_submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    let stockImportsQuery: any = supabase
      .from('store_stock_imports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    let leadsQuery: any = supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (storeId) {
      diagnosticVehiclesQuery = diagnosticVehiclesQuery.eq('store_id', storeId);
      submissionsQuery = submissionsQuery.eq('store_id', storeId);
      stockImportsQuery = stockImportsQuery.eq('store_id', storeId);
      leadsQuery = leadsQuery.eq('assigned_store_id', storeId);
    }

    if (since) {
      diagnosticVehiclesQuery = diagnosticVehiclesQuery.gte('created_at', since);
      submissionsQuery = submissionsQuery.gte('created_at', since);
      stockImportsQuery = stockImportsQuery.gte('created_at', since);
      leadsQuery = leadsQuery.gte('created_at', since);
    }

    const [
      vehiclesResult,
      diagnosticVehiclesResult,
      storesResult,
      submissionsResult,
      stockImportsResult,
      leadsResult
    ] = await Promise.all([
      vehiclesQuery,
      diagnosticVehiclesQuery,
      supabase
        .from('stores')
        .select('id,store_name,slug,website_url,status,portal_enabled,responsible_name,responsible_email,responsible_phone,created_at')
        .neq('status', 'deleted')
        .order('store_name', { ascending: true }),
      submissionsQuery,
      stockImportsQuery,
      leadsQuery
    ]);

    if (vehiclesResult.error) throw vehiclesResult.error;
    if (diagnosticVehiclesResult.error) throw diagnosticVehiclesResult.error;
    if (storesResult.error) throw storesResult.error;

    const vehicleRows = vehiclesResult.data || [];
    const diagnosticVehicles = diagnosticVehiclesResult.data || [];
    const stores = storesResult.data || [];
    const submissions = submissionsResult.error ? [] : submissionsResult.data || [];
    const stockImports = stockImportsResult.error ? [] : stockImportsResult.data || [];
    const allRecentLeads = leadsResult.error ? [] : leadsResult.data || [];

    const storesById = new Map(stores.map((store: any) => [store.id, store]));
    const vehicleById = new Map(diagnosticVehicles.map((vehicle: any) => [vehicle.id, vehicle]));
    const validLinks = submissions.filter(isValidOwnerLink);
    const legacyOwnersByVehicle = new Map<string, string[]>();

    validLinks.forEach((link: any) => {
      const current = legacyOwnersByVehicle.get(link.imported_vehicle_id) || [];
      if (!current.includes(link.store_id)) current.push(link.store_id);
      legacyOwnersByVehicle.set(link.imported_vehicle_id, current);
    });

    const marketplaceLeads = allRecentLeads.filter((lead: any) => Boolean(leadOrigin(lead)));
    const leadIds = marketplaceLeads.map((lead: any) => lead.id).filter(Boolean);
    const userIds = Array.from(new Set(
      marketplaceLeads
        .flatMap((lead: any) => [lead.assigned_user_id, lead.pre_sales_user_id, lead.seller_user_id])
        .filter(Boolean)
    ));

    const [salesResult, usersResult] = await Promise.all([
      leadIds.length
        ? supabase
            .from('sales')
            .select('*')
            .in('lead_id', leadIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase
            .from('users')
            .select('id,full_name,email,role,status')
            .in('id', userIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const sales = salesResult.error ? [] : salesResult.data || [];
    const users = usersResult.error ? [] : usersResult.data || [];
    const salesByLead = new Map(sales.map((sale: any) => [sale.lead_id, sale]));
    const usersById = new Map(users.map((user: any) => [user.id, user]));

    const problems: any[] = [];

    diagnosticVehicles.forEach((vehicle: any) => {
      const directOwnerId = cleanText(vehicle.store_id, 80);
      const legacyOwners = legacyOwnersByVehicle.get(vehicle.id) || [];
      const resolvedOwnerId = directOwnerId || (legacyOwners.length === 1 ? legacyOwners[0] : '');
      const owner = resolvedOwnerId ? storesById.get(resolvedOwnerId) : null;
      const missing = missingVehicleFields(vehicle);

      if (!resolvedOwnerId) {
        problems.push(problemItem({
          id: `vehicle-owner-${vehicle.id}`,
          type: 'vehicle_owner',
          severity: 'critical',
          title: 'Veículo sem loja proprietária',
          description: legacyOwners.length > 1
            ? 'Mais de uma loja aparece como proprietária no vínculo legado.'
            : 'Não foi encontrado store_id direto nem um vínculo legado único.',
          vehicle,
          created_at: vehicle.created_at
        }));
      } else if (!owner) {
        problems.push(problemItem({
          id: `vehicle-store-${vehicle.id}`,
          type: 'store_missing',
          severity: 'critical',
          title: 'Loja proprietária não encontrada',
          description: 'O veículo aponta para uma loja inexistente ou removida.',
          vehicle,
          created_at: vehicle.created_at
        }));
      } else if (owner.status !== 'active' || !owner.portal_enabled) {
        problems.push(problemItem({
          id: `vehicle-store-disabled-${vehicle.id}`,
          type: 'store_disabled',
          severity: 'critical',
          title: 'Veículo ligado a loja indisponível',
          description: 'A loja está inativa ou sem acesso habilitado ao portal.',
          store: owner,
          vehicle,
          created_at: vehicle.created_at
        }));
      } else if (!directOwnerId && legacyOwners.length === 1) {
        problems.push(problemItem({
          id: `vehicle-legacy-${vehicle.id}`,
          type: 'legacy_owner',
          severity: 'info',
          title: 'Veículo ainda usa propriedade legada',
          description: 'O proprietário foi resolvido pelo vínculo antigo e deve ser acompanhado até a normalização.',
          store: owner,
          vehicle,
          created_at: vehicle.created_at
        }));
      }

      if (missing.length) {
        problems.push(problemItem({
          id: `vehicle-data-${vehicle.id}`,
          type: 'vehicle_data',
          severity: 'warning',
          title: 'Dados obrigatórios incompletos',
          description: `Campos ausentes: ${missing.join(', ')}.`,
          store: owner,
          vehicle,
          created_at: vehicle.created_at
        }));
      }
    });

    submissions.forEach((submission: any) => {
      const submissionStatus = normalizeStatus(submission.status);
      const store = storesById.get(submission.store_id);
      const createdAt = submission.created_at ? new Date(submission.created_at).getTime() : 0;
      const ageHours = createdAt ? (Date.now() - createdAt) / (60 * 60 * 1000) : 0;

      if (['rejected', 'duplicate'].includes(submissionStatus)) {
        problems.push(problemItem({
          id: `submission-${submission.id}`,
          type: `submission_${submissionStatus}`,
          severity: 'warning',
          title: submissionStatus === 'duplicate' ? 'Link de veículo duplicado' : 'Link de veículo rejeitado',
          description: cleanText(
            submission.error_message || submission.rejection_reason || submission.metadata?.error || submission.vehicle_url,
            280
          ) || 'Revise o envio realizado pela loja.',
          store,
          vehicle: submission.imported_vehicle_id ? vehicleById.get(submission.imported_vehicle_id) : null,
          created_at: submission.created_at
        }));
      } else if (pendingSubmissionStatuses.has(submissionStatus) && ageHours > 48) {
        problems.push(problemItem({
          id: `submission-stale-${submission.id}`,
          type: 'submission_stale',
          severity: 'warning',
          title: 'Envio pendente há mais de 48 horas',
          description: cleanText(submission.vehicle_url, 280) || 'O envio precisa de conferência.',
          store,
          created_at: submission.created_at
        }));
      }
    });

    stores.forEach((store: any) => {
      const publishedForStore = diagnosticVehicles.filter((vehicle: any) =>
        vehicle.store_id === store.id &&
        vehicle.show_on_landing === true &&
        normalizeStatus(vehicle.status) === 'disponivel'
      ).length;

      if (publishedForStore > 0 && (store.status !== 'active' || !store.portal_enabled)) {
        problems.push(problemItem({
          id: `store-published-${store.id}`,
          type: 'published_store_disabled',
          severity: 'critical',
          title: 'Loja indisponível com veículos publicados',
          description: `${publishedForStore} veículo(s) continuam publicados para uma loja inativa ou sem portal.`,
          store,
          created_at: store.created_at
        }));
      }
    });

    const mappedVehicles = vehicleRows.map((vehicle: any) => {
      const directOwnerId = cleanText(vehicle.store_id, 80);
      const legacyOwners = legacyOwnersByVehicle.get(vehicle.id) || [];
      const ownerId = directOwnerId || (legacyOwners.length === 1 ? legacyOwners[0] : '');
      const store = ownerId ? storesById.get(ownerId) : null;
      const missing = missingVehicleFields(vehicle);

      return {
        id: vehicle.id,
        name: vehicleName(vehicle) || 'Veículo sem identificação',
        brand: cleanText(vehicle.brand, 120),
        model: cleanText(vehicle.model, 120),
        version: cleanText(vehicle.version, 160),
        year: cleanText(vehicle.year, 40),
        mileage: cleanText(vehicle.mileage, 80),
        price: Number(vehicle.price || 0),
        image_url: imageList(vehicle)[0] || null,
        source_url: cleanText(vehicle.source_url, 1200) || null,
        status: normalizeStatus(vehicle.status) || 'sem_status',
        show_on_landing: vehicle.show_on_landing === true,
        is_featured: vehicle.is_featured === true,
        ownership: directOwnerId ? 'direct' : legacyOwners.length === 1 ? 'legacy' : 'unresolved',
        missing_fields: missing,
        store: store ? {
          id: store.id,
          name: store.store_name || 'Loja sem nome',
          slug: store.slug || null,
          status: store.status,
          portal_enabled: store.portal_enabled === true
        } : null,
        created_at: vehicle.created_at || null,
        updated_at: vehicle.updated_at || null
      };
    });

    const pendingItems = [
      ...submissions
        .filter((item: any) => pendingSubmissionStatuses.has(normalizeStatus(item.status)))
        .map((item: any) => ({
          id: item.id,
          kind: 'link',
          status: normalizeStatus(item.status),
          title: cleanText(item.vehicle_url, 300) || 'Link de veículo',
          file_name: null,
          store: storesById.get(item.store_id) ? {
            id: item.store_id,
            name: storesById.get(item.store_id).store_name || 'Loja sem nome'
          } : null,
          created_at: item.created_at || null
        })),
      ...stockImports
        .filter((item: any) => ['pending', 'reviewing', 'error'].includes(normalizeStatus(item.status)))
        .map((item: any) => ({
          id: item.id,
          kind: 'file',
          status: normalizeStatus(item.status),
          title: cleanText(item.file_name, 300) || 'Arquivo de estoque',
          file_name: cleanText(item.file_name, 300) || null,
          store: storesById.get(item.store_id) ? {
            id: item.store_id,
            name: storesById.get(item.store_id).store_name || 'Loja sem nome'
          } : null,
          created_at: item.created_at || null
        }))
    ].sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    const mappedLeads = marketplaceLeads.slice(0, 150).map((lead: any) => {
      const store = storesById.get(lead.assigned_store_id);
      const vehicle = vehicleById.get(lead.interested_vehicle_id);
      const responsible = usersById.get(lead.assigned_user_id || lead.seller_user_id || lead.pre_sales_user_id);
      const sale = salesByLead.get(lead.id);

      return {
        id: lead.id,
        customer_name: cleanText(lead.customer_name || lead.name, 180) || 'Cliente sem nome',
        customer_phone: cleanText(lead.customer_phone || lead.phone, 60) || null,
        interested_vehicle: cleanText(lead.interested_vehicle, 220) || vehicleName(vehicle) || 'Veículo não identificado',
        interested_vehicle_id: lead.interested_vehicle_id || null,
        origin: leadOrigin(lead) || 'marketplace',
        status: normalizeStatus(lead.status) || 'new_lead',
        store: store ? { id: store.id, name: store.store_name || 'Loja sem nome', slug: store.slug || null } : null,
        responsible: responsible ? {
          id: responsible.id,
          name: responsible.full_name || responsible.email || 'Responsável sem nome',
          role: responsible.role || lead.assigned_user_role || null
        } : lead.assigned_user_role ? {
          id: null,
          name: 'Aguardando atribuição nominal',
          role: lead.assigned_user_role
        } : null,
        sale: sale ? {
          id: sale.id,
          status: normalizeStatus(sale.status),
          value: Number(sale.sale_value || 0),
          confirmed_at: sale.confirmed_at || null
        } : null,
        created_at: lead.created_at || null
      };
    });

    const storeSummaries = stores.map((store: any) => {
      const storeVehicles = diagnosticVehicles.filter((vehicle: any) => vehicle.store_id === store.id);
      const storePending = pendingItems.filter((item: any) => item.store?.id === store.id);
      const storeLeads = mappedLeads.filter((lead: any) => lead.store?.id === store.id);

      return {
        id: store.id,
        name: store.store_name || 'Loja sem nome',
        slug: store.slug || null,
        website_url: store.website_url || null,
        status: store.status || 'unknown',
        portal_enabled: store.portal_enabled === true,
        responsible_name: store.responsible_name || null,
        responsible_email: store.responsible_email || null,
        vehicles: storeVehicles.length,
        published: storeVehicles.filter((vehicle: any) => vehicle.show_on_landing === true && normalizeStatus(vehicle.status) === 'disponivel').length,
        pending: storePending.length,
        leads: storeLeads.length
      };
    });

    const publishedVehicles = diagnosticVehicles.filter((vehicle: any) =>
      vehicle.show_on_landing === true && normalizeStatus(vehicle.status) === 'disponivel'
    ).length;
    const soldVehicles = diagnosticVehicles.filter((vehicle: any) => normalizeStatus(vehicle.status) === 'vendido').length;
    const confirmedSales = mappedLeads.filter((lead: any) => lead.sale?.status === 'confirmed').length;

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      summary: {
        total_vehicles: Number(vehiclesResult.count || diagnosticVehicles.length),
        published_vehicles: publishedVehicles,
        sold_vehicles: soldVehicles,
        pending_items: pendingItems.length,
        problems: problems.length,
        active_stores: stores.filter((store: any) => store.status === 'active' && store.portal_enabled).length,
        marketplace_leads: mappedLeads.length,
        confirmed_sales: confirmedSales
      },
      filters: {
        stores: storeSummaries.map((store: any) => ({ id: store.id, name: store.name })),
        vehicle_statuses: ['disponivel', 'vendido', 'oculto']
      },
      pagination: {
        page,
        limit,
        total: Number(vehiclesResult.count || 0),
        total_pages: Math.max(1, Math.ceil(Number(vehiclesResult.count || 0) / limit))
      },
      vehicles: mappedVehicles,
      pending: pendingItems.slice(0, 150),
      problems: problems
        .sort((a: any, b: any) => {
          const weight: Record<string, number> = { critical: 3, warning: 2, info: 1 };
          return (weight[b.severity] || 0) - (weight[a.severity] || 0)
            || String(b.created_at || '').localeCompare(String(a.created_at || ''));
        })
        .slice(0, 150),
      stores: storeSummaries,
      leads: mappedLeads,
      diagnostics: {
        submissions_available: !submissionsResult.error,
        stock_imports_available: !stockImportsResult.error,
        leads_available: !leadsResult.error,
        sales_available: !salesResult.error,
        users_available: !usersResult.error,
        vehicle_scan_limit: 500,
        period_days: days
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: cleanText(error?.message || 'Não foi possível carregar o painel do marketplace.', 300) },
      { status: 500 }
    );
  }
}
