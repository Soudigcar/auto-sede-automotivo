import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pendingStatuses = new Set(['pending', 'reviewing', 'imported']);
const invalidLinkStatuses = new Set(['rejected', 'duplicate', 'deleted', 'excluido']);
const marketplaceTerms = ['marketplace', 'landing', 'site', 'simulador', 'vehicle_owner'];

function integerParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), min), max) : fallback;
}

function normalized(value: unknown, maxLength = 250) {
  return cleanText(value, maxLength).toLowerCase();
}

function imageUrls(vehicle: any) {
  return Array.from(new Set<string>([
    ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []),
    vehicle?.image_url
  ].map((value) => cleanText(value, 1200)).filter(Boolean)));
}

function vehicleName(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.year]
    .map((value) => cleanText(value, 160))
    .filter(Boolean)
    .join(' ');
}

function missingVehicleFields(vehicle: any) {
  return [
    !cleanText(vehicle?.brand, 120) && 'marca',
    !cleanText(vehicle?.model, 120) && 'modelo',
    !cleanText(vehicle?.year, 40) && 'ano',
    !(Number(vehicle?.price || 0) > 0) && 'valor',
    !imageUrls(vehicle).length && 'foto'
  ].filter(Boolean) as string[];
}

function isValidLegacyLink(link: any) {
  if (!link?.store_id || !link?.imported_vehicle_id) return false;
  if (link?.metadata?.store_removed === true) return false;
  return !invalidLinkStatuses.has(normalized(link.status, 80));
}

function marketplaceOrigin(lead: any) {
  const metadata = lead?.metadata && typeof lead.metadata === 'object' ? lead.metadata : {};
  const values = [
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
  ].map((value) => normalized(value, 120)).filter(Boolean);

  const detected = values.find((value) => marketplaceTerms.some((term) => value.includes(term)));
  if (detected) return detected;
  if (lead?.marketplace_vehicle_id || metadata?.marketplace === true) return 'marketplace';
  return '';
}

function compactStore(store: any) {
  return store ? {
    id: store.id,
    name: store.store_name || 'Loja sem nome',
    slug: store.slug || null
  } : null;
}

function compactVehicle(vehicle: any) {
  return vehicle ? {
    id: vehicle.id,
    name: vehicleName(vehicle) || 'Veículo sem identificação'
  } : null;
}

function issue(input: {
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
    store: compactStore(input.store),
    vehicle: compactVehicle(input.vehicle),
    created_at: input.created_at || null
  };
}

async function authorize(request: Request) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);
  if (!token) return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;

  const profile = await getProfileFromToken(supabase, token);
  if (!profile || profile.status !== 'active' || profile.role !== 'master') {
    return { error: NextResponse.json({ error: 'Acesso exclusivo para usuários Master.' }, { status: 403 }) } as const;
  }

  return { supabase } as const;
}

export async function GET(request: Request) {
  try {
    const context = await authorize(request);
    if ('error' in context) return context.error;

    const { supabase } = context;
    const url = new URL(request.url);
    const page = integerParam(url.searchParams.get('page'), 1, 1, 10_000);
    const limit = integerParam(url.searchParams.get('limit'), 20, 10, 50);
    const days = integerParam(url.searchParams.get('days'), 30, 0, 365);
    const status = normalized(url.searchParams.get('status'), 40) || 'all';
    const storeId = cleanText(url.searchParams.get('store_id'), 80);
    const search = cleanText(url.searchParams.get('q'), 120).replace(/[,%()]/g, ' ');
    const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : '';
    const from = (page - 1) * limit;

    let pagedVehicles: any = supabase
      .from('site_vehicles')
      .select('*', { count: 'exact' })
      .neq('status', 'excluido')
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    let diagnosticVehicles: any = supabase
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

    let importsQuery: any = supabase
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
      pagedVehicles = pagedVehicles.eq('store_id', storeId);
      diagnosticVehicles = diagnosticVehicles.eq('store_id', storeId);
      submissionsQuery = submissionsQuery.eq('store_id', storeId);
      importsQuery = importsQuery.eq('store_id', storeId);
      leadsQuery = leadsQuery.eq('assigned_store_id', storeId);
    }

    if (status !== 'all') pagedVehicles = pagedVehicles.eq('status', status);

    if (since) {
      pagedVehicles = pagedVehicles.gte('created_at', since);
      diagnosticVehicles = diagnosticVehicles.gte('created_at', since);
      submissionsQuery = submissionsQuery.gte('created_at', since);
      importsQuery = importsQuery.gte('created_at', since);
      leadsQuery = leadsQuery.gte('created_at', since);
    }

    if (search) {
      pagedVehicles = pagedVehicles.or([
        `brand.ilike.%${search}%`,
        `model.ilike.%${search}%`,
        `version.ilike.%${search}%`,
        `year.ilike.%${search}%`,
        `store_name.ilike.%${search}%`
      ].join(','));
    }

    const [vehiclesResult, diagnosticResult, storesResult, submissionsResult, importsResult, leadsResult] = await Promise.all([
      pagedVehicles,
      diagnosticVehicles,
      supabase
        .from('stores')
        .select('id,store_name,slug,website_url,status,portal_enabled,responsible_name,responsible_email,responsible_phone,created_at')
        .neq('status', 'deleted')
        .order('store_name', { ascending: true }),
      submissionsQuery,
      importsQuery,
      leadsQuery
    ]);

    if (vehiclesResult.error) throw vehiclesResult.error;
    if (diagnosticResult.error) throw diagnosticResult.error;
    if (storesResult.error) throw storesResult.error;

    const vehicleRows: any[] = vehiclesResult.data || [];
    const diagnosticRows: any[] = diagnosticResult.data || [];
    const stores: any[] = storesResult.data || [];
    const submissions: any[] = submissionsResult.error ? [] : submissionsResult.data || [];
    const imports: any[] = importsResult.error ? [] : importsResult.data || [];
    const recentLeads: any[] = leadsResult.error ? [] : leadsResult.data || [];

    const storesById = new Map<string, any>(
      stores.map((store: any): [string, any] => [String(store.id), store])
    );
    const vehiclesById = new Map<string, any>(
      diagnosticRows.map((vehicle: any): [string, any] => [String(vehicle.id), vehicle])
    );
    const ownersByVehicle = new Map<string, string[]>();

    submissions.filter(isValidLegacyLink).forEach((link: any) => {
      const vehicleId = String(link.imported_vehicle_id);
      const storeIds = ownersByVehicle.get(vehicleId) || [];
      if (!storeIds.includes(String(link.store_id))) storeIds.push(String(link.store_id));
      ownersByVehicle.set(vehicleId, storeIds);
    });

    const marketplaceLeads = recentLeads.filter((lead: any) => Boolean(marketplaceOrigin(lead)));
    const leadIds = marketplaceLeads.map((lead: any) => lead.id).filter(Boolean);
    const userIds = Array.from(new Set<string>(
      marketplaceLeads
        .flatMap((lead: any) => [lead.assigned_user_id, lead.seller_user_id, lead.pre_sales_user_id])
        .filter(Boolean)
        .map(String)
    ));

    const [salesResult, usersResult] = await Promise.all([
      leadIds.length
        ? supabase.from('sales').select('*').in('lead_id', leadIds).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from('users').select('id,full_name,email,role,status').in('id', userIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const sales: any[] = salesResult.error ? [] : salesResult.data || [];
    const users: any[] = usersResult.error ? [] : usersResult.data || [];
    const salesByLead = new Map<string, any>(
      sales.map((sale: any): [string, any] => [String(sale.lead_id), sale])
    );
    const usersById = new Map<string, any>(
      users.map((user: any): [string, any] => [String(user.id), user])
    );

    function resolveOwner(vehicle: any) {
      const directId = cleanText(vehicle?.store_id, 80);
      const legacyIds = ownersByVehicle.get(String(vehicle?.id)) || [];
      const ownerId = directId || (legacyIds.length === 1 ? legacyIds[0] : '');
      return {
        directId,
        legacyIds,
        ownerId,
        store: ownerId ? storesById.get(String(ownerId)) || null : null
      };
    }

    const problems: any[] = [];

    diagnosticRows.forEach((vehicle: any) => {
      const ownership = resolveOwner(vehicle);
      const missing = missingVehicleFields(vehicle);

      if (!ownership.ownerId) {
        problems.push(issue({
          id: `owner-${vehicle.id}`,
          type: 'vehicle_owner',
          severity: 'critical',
          title: 'Veículo sem loja proprietária',
          description: ownership.legacyIds.length > 1
            ? 'Mais de uma loja aparece como proprietária no vínculo legado.'
            : 'Não foi encontrado store_id direto nem vínculo legado único.',
          vehicle,
          created_at: vehicle.created_at
        }));
      } else if (!ownership.store) {
        problems.push(issue({
          id: `store-${vehicle.id}`,
          type: 'store_missing',
          severity: 'critical',
          title: 'Loja proprietária não encontrada',
          description: 'O veículo aponta para uma loja inexistente ou removida.',
          vehicle,
          created_at: vehicle.created_at
        }));
      } else if (ownership.store.status !== 'active' || !ownership.store.portal_enabled) {
        problems.push(issue({
          id: `store-disabled-${vehicle.id}`,
          type: 'store_disabled',
          severity: 'critical',
          title: 'Veículo ligado a loja indisponível',
          description: 'A loja está inativa ou sem acesso habilitado ao portal.',
          store: ownership.store,
          vehicle,
          created_at: vehicle.created_at
        }));
      } else if (!ownership.directId) {
        problems.push(issue({
          id: `legacy-${vehicle.id}`,
          type: 'legacy_owner',
          severity: 'info',
          title: 'Veículo ainda usa propriedade legada',
          description: 'O proprietário foi resolvido pelo vínculo antigo.',
          store: ownership.store,
          vehicle,
          created_at: vehicle.created_at
        }));
      }

      if (missing.length) {
        problems.push(issue({
          id: `data-${vehicle.id}`,
          type: 'vehicle_data',
          severity: 'warning',
          title: 'Dados obrigatórios incompletos',
          description: `Campos ausentes: ${missing.join(', ')}.`,
          store: ownership.store,
          vehicle,
          created_at: vehicle.created_at
        }));
      }
    });

    submissions.forEach((submission: any) => {
      const submissionStatus = normalized(submission.status, 80);
      const store = storesById.get(String(submission.store_id));
      const createdAt = submission.created_at ? new Date(submission.created_at).getTime() : 0;
      const ageHours = createdAt ? (Date.now() - createdAt) / 3_600_000 : 0;

      if (['rejected', 'duplicate'].includes(submissionStatus)) {
        problems.push(issue({
          id: `submission-${submission.id}`,
          type: `submission_${submissionStatus}`,
          severity: 'warning',
          title: submissionStatus === 'duplicate' ? 'Link de veículo duplicado' : 'Link de veículo rejeitado',
          description: cleanText(
            submission.error_message || submission.rejection_reason || submission.metadata?.error || submission.vehicle_url,
            280
          ) || 'Revise o envio realizado pela loja.',
          store,
          vehicle: submission.imported_vehicle_id ? vehiclesById.get(String(submission.imported_vehicle_id)) : null,
          created_at: submission.created_at
        }));
      } else if (pendingStatuses.has(submissionStatus) && ageHours > 48) {
        problems.push(issue({
          id: `stale-${submission.id}`,
          type: 'submission_stale',
          severity: 'warning',
          title: 'Envio pendente há mais de 48 horas',
          description: cleanText(submission.vehicle_url, 280) || 'O envio precisa de conferência.',
          store,
          created_at: submission.created_at
        }));
      }
    });

    const pending = [
      ...submissions
        .filter((item: any) => pendingStatuses.has(normalized(item.status, 80)))
        .map((item: any) => ({
          id: item.id,
          kind: 'link',
          status: normalized(item.status, 80),
          title: cleanText(item.vehicle_url, 300) || 'Link de veículo',
          file_name: null,
          store: compactStore(storesById.get(String(item.store_id))),
          created_at: item.created_at || null
        })),
      ...imports
        .filter((item: any) => ['pending', 'reviewing', 'error'].includes(normalized(item.status, 80)))
        .map((item: any) => ({
          id: item.id,
          kind: 'file',
          status: normalized(item.status, 80),
          title: cleanText(item.file_name, 300) || 'Arquivo de estoque',
          file_name: cleanText(item.file_name, 300) || null,
          store: compactStore(storesById.get(String(item.store_id))),
          created_at: item.created_at || null
        }))
    ].sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    const vehicles = vehicleRows.map((vehicle: any) => {
      const ownership = resolveOwner(vehicle);
      const store = ownership.store;

      return {
        id: vehicle.id,
        name: vehicleName(vehicle) || 'Veículo sem identificação',
        brand: cleanText(vehicle.brand, 120),
        model: cleanText(vehicle.model, 120),
        version: cleanText(vehicle.version, 160),
        year: cleanText(vehicle.year, 40),
        mileage: cleanText(vehicle.mileage, 80),
        price: Number(vehicle.price || 0),
        image_url: imageUrls(vehicle)[0] || null,
        source_url: cleanText(vehicle.source_url, 1200) || null,
        status: normalized(vehicle.status, 80) || 'sem_status',
        show_on_landing: vehicle.show_on_landing === true,
        is_featured: vehicle.is_featured === true,
        ownership: ownership.directId ? 'direct' : ownership.legacyIds.length === 1 ? 'legacy' : 'unresolved',
        missing_fields: missingVehicleFields(vehicle),
        store: store ? {
          ...compactStore(store),
          status: store.status,
          portal_enabled: store.portal_enabled === true
        } : null,
        created_at: vehicle.created_at || null,
        updated_at: vehicle.updated_at || null
      };
    });

    const leads = marketplaceLeads.slice(0, 150).map((lead: any) => {
      const store = storesById.get(String(lead.assigned_store_id));
      const vehicle = vehiclesById.get(String(lead.interested_vehicle_id));
      const responsibleId = lead.assigned_user_id || lead.seller_user_id || lead.pre_sales_user_id;
      const responsible = responsibleId ? usersById.get(String(responsibleId)) : null;
      const sale = salesByLead.get(String(lead.id));

      return {
        id: lead.id,
        customer_name: cleanText(lead.customer_name || lead.name, 180) || 'Cliente sem nome',
        customer_phone: cleanText(lead.customer_phone || lead.phone, 60) || null,
        interested_vehicle: cleanText(lead.interested_vehicle, 220) || vehicleName(vehicle) || 'Veículo não identificado',
        interested_vehicle_id: lead.interested_vehicle_id || null,
        origin: marketplaceOrigin(lead) || 'marketplace',
        status: normalized(lead.status, 80) || 'new_lead',
        store: compactStore(store),
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
          status: normalized(sale.status, 80),
          value: Number(sale.sale_value || 0),
          confirmed_at: sale.confirmed_at || null
        } : null,
        created_at: lead.created_at || null
      };
    });

    const storeSummaries = stores.map((store: any) => {
      const storeVehicles = diagnosticRows.filter((vehicle: any) => String(vehicle.store_id || '') === String(store.id));
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
        published: storeVehicles.filter((vehicle: any) => vehicle.show_on_landing === true && normalized(vehicle.status, 80) === 'disponivel').length,
        pending: pending.filter((item: any) => item.store?.id === store.id).length,
        leads: leads.filter((lead: any) => lead.store?.id === store.id).length
      };
    });

    const total = vehiclesResult.count === null || vehiclesResult.count === undefined
      ? diagnosticRows.length
      : Number(vehiclesResult.count);
    const published = diagnosticRows.filter((vehicle: any) =>
      vehicle.show_on_landing === true && normalized(vehicle.status, 80) === 'disponivel'
    ).length;
    const sold = diagnosticRows.filter((vehicle: any) => normalized(vehicle.status, 80) === 'vendido').length;
    const confirmedSales = leads.filter((lead: any) => lead.sale?.status === 'confirmed').length;

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      summary: {
        total_vehicles: total,
        published_vehicles: published,
        sold_vehicles: sold,
        pending_items: pending.length,
        problems: problems.length,
        active_stores: stores.filter((store: any) => store.status === 'active' && store.portal_enabled).length,
        marketplace_leads: leads.length,
        confirmed_sales: confirmedSales
      },
      filters: {
        stores: storeSummaries.map((store: any) => ({ id: store.id, name: store.name })),
        vehicle_statuses: ['disponivel', 'vendido', 'oculto']
      },
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit))
      },
      vehicles,
      pending: pending.slice(0, 150),
      problems: problems
        .sort((a: any, b: any) => {
          const weight: Record<string, number> = { critical: 3, warning: 2, info: 1 };
          return (weight[b.severity] || 0) - (weight[a.severity] || 0)
            || String(b.created_at || '').localeCompare(String(a.created_at || ''));
        })
        .slice(0, 150),
      stores: storeSummaries,
      leads,
      diagnostics: {
        submissions_available: !submissionsResult.error,
        stock_imports_available: !importsResult.error,
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
