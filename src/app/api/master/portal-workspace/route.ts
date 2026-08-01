import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pendingStatuses = new Set(['pending', 'reviewing', 'imported', 'processing']);
const marketplaceTerms = ['marketplace', 'landing', 'site', 'simulador', 'portal'];

function normalized(value: unknown, maxLength = 240) {
  return cleanText(value, maxLength).toLowerCase();
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.filter(Boolean).map(String)));
}

function images(vehicle: any) {
  return unique([...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []), vehicle?.image_url]);
}

function vehicleName(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.year]
    .map((value) => cleanText(value, 160))
    .filter(Boolean)
    .join(' ') || 'Veículo sem identificação';
}

function missingFields(vehicle: any) {
  return [
    !cleanText(vehicle?.brand, 100) && 'marca',
    !cleanText(vehicle?.model, 120) && 'modelo',
    !cleanText(vehicle?.year, 40) && 'ano',
    !(Number(vehicle?.price || 0) > 0) && 'valor',
    !images(vehicle).length && 'foto'
  ].filter(Boolean) as string[];
}

function leadOrigin(lead: any) {
  const metadata = lead?.metadata && typeof lead.metadata === 'object' ? lead.metadata : {};
  const values = [lead?.origin, lead?.source, metadata.origin, metadata.source, metadata.channel]
    .map((value) => normalized(value, 160)).filter(Boolean);
  const found = values.find((value) => marketplaceTerms.some((term) => value.includes(term)));
  if (!found) return null;
  if (found.includes('simulador')) return { key: 'simulator', label: 'Simulador do Portal' };
  if (found.includes('landing')) return { key: 'landing', label: 'Landing do Portal' };
  if (found.includes('site')) return { key: 'site', label: 'Portal Oficial' };
  return { key: 'marketplace', label: 'Marketplace' };
}

function pendingSource(item: any) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const raw = normalized(`${metadata.provider || ''} ${metadata.source || ''} ${item?.vehicle_url || ''}`, 1800);
  if (raw.includes('olx')) return { key: 'olx', label: 'OLX' };
  return { key: 'website', label: 'Site da loja' };
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const [storesResult, participationsResult, eventsResult] = await Promise.all([
      supabase
        .from('stores')
        .select('*')
        .eq('portal_enabled', true)
        .neq('status', 'deleted')
        .order('store_name'),
      supabase
        .from('store_event_participations')
        .select('id,store_id,event_id,status,source,joined_at')
        .order('joined_at', { ascending: false }),
      supabase
        .from('events')
        .select('id,event_name,status,start_date,end_date')
        .neq('status', 'deleted')
    ]);

    if (storesResult.error) throw storesResult.error;
    const stores = storesResult.data || [];
    const storeIds = stores.map((store: any) => store.id);
    const participations = participationsResult.error ? [] : participationsResult.data || [];
    const events = eventsResult.error ? [] : eventsResult.data || [];

    const vehiclePromise = storeIds.length
      ? supabase.from('site_vehicles').select('*').in('store_id', storeIds).neq('status', 'excluido').order('created_at', { ascending: false }).limit(1000)
      : Promise.resolve({ data: [], error: null });
    const submissionPromise = storeIds.length
      ? supabase.from('store_vehicle_link_submissions').select('*').in('store_id', storeIds).is('event_id', null).order('created_at', { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null });
    const importPromise = storeIds.length
      ? supabase.from('store_stock_imports').select('*').in('store_id', storeIds).is('event_id', null).order('created_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null });
    const leadPromise = supabase.from('leads').select('*').is('event_id', null).order('created_at', { ascending: false }).limit(700);
    const baseLeadPromise = supabase.from('leads_base').select('*').is('event_id', null).order('created_at', { ascending: false }).limit(700);

    const [vehiclesResult, submissionsResult, importsResult, leadsResult, baseLeadsResult] = await Promise.all([
      vehiclePromise,
      submissionPromise,
      importPromise,
      leadPromise,
      baseLeadPromise
    ]);

    const vehicles = vehiclesResult.error ? [] : vehiclesResult.data || [];
    const submissions = submissionsResult.error ? [] : submissionsResult.data || [];
    const imports = importsResult.error ? [] : importsResult.data || [];
    const rawLeads = leadsResult.error ? [] : leadsResult.data || [];
    const rawBaseLeads = baseLeadsResult.error ? [] : baseLeadsResult.data || [];

    const storeById = new Map(stores.map((store: any) => [String(store.id), store]));
    const eventById = new Map(events.map((event: any) => [String(event.id), event]));
    const participationByStore = new Map<string, any[]>();

    participations
      .filter((item: any) => !['deleted', 'ended'].includes(normalized(item.status, 80)))
      .forEach((item: any) => {
        const list = participationByStore.get(String(item.store_id)) || [];
        list.push(item);
        participationByStore.set(String(item.store_id), list);
      });

    stores.forEach((store: any) => {
      if (store.event_id && !participationByStore.has(String(store.id))) {
        participationByStore.set(String(store.id), [{
          id: `legacy-${store.id}`,
          store_id: store.id,
          event_id: store.event_id,
          status: 'active',
          source: store.registration_source || 'event_registration',
          joined_at: store.created_at,
          legacy: true
        }]);
      }
    });

    const pending = [
      ...submissions
        .filter((item: any) => pendingStatuses.has(normalized(item.status, 80)))
        .map((item: any) => {
          const source = pendingSource(item);
          const preview = item.metadata?.imported_preview || {};
          return {
            id: item.id,
            kind: 'link',
            source: source.key,
            source_label: source.label,
            status: normalized(item.status, 80) || 'pending',
            title: cleanText(preview.title, 300) || cleanText(item.vehicle_url, 1000) || 'Link de veículo',
            url: cleanText(item.vehicle_url, 1400) || null,
            store: item.store_id ? { id: item.store_id, name: storeById.get(String(item.store_id))?.store_name || 'Loja não encontrada' } : null,
            photos: Array.isArray(preview.image_urls) ? preview.image_urls.length : 0,
            missing_fields: Array.isArray(item.metadata?.missing_fields) ? item.metadata.missing_fields : [],
            created_at: item.created_at || null
          };
        }),
      ...imports
        .filter((item: any) => ['pending', 'reviewing', 'processing', 'error'].includes(normalized(item.status, 80)))
        .map((item: any) => ({
          id: item.id,
          kind: 'file',
          source: 'file',
          source_label: 'Arquivo ou planilha',
          status: normalized(item.status, 80) || 'pending',
          title: cleanText(item.file_name, 300) || 'Arquivo de estoque',
          url: cleanText(item.file_url, 1400) || null,
          store: item.store_id ? { id: item.store_id, name: storeById.get(String(item.store_id))?.store_name || 'Loja não encontrada' } : null,
          photos: 0,
          missing_fields: [],
          created_at: item.created_at || null
        }))
    ].sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    const mappedVehicles = vehicles.map((vehicle: any) => {
      const store = storeById.get(String(vehicle.store_id));
      return {
        id: vehicle.id,
        name: vehicleName(vehicle),
        brand: vehicle.brand || null,
        model: vehicle.model || null,
        year: vehicle.year || null,
        mileage: vehicle.mileage || null,
        price: Number(vehicle.price || 0),
        image_url: images(vehicle)[0] || null,
        source_url: vehicle.source_url || null,
        status: normalized(vehicle.status, 80) || 'unknown',
        show_on_landing: vehicle.show_on_landing === true,
        is_featured: vehicle.is_featured === true,
        missing_fields: missingFields(vehicle),
        store: store ? { id: store.id, name: store.store_name || 'Loja sem nome' } : null,
        created_at: vehicle.created_at || null
      };
    });

    const mappedLeads = rawLeads
      .map((lead: any) => ({ lead, origin: leadOrigin(lead) }))
      .filter((entry: any) => Boolean(entry.origin))
      .map(({ lead, origin }: any) => ({
        id: lead.id,
        customer_name: cleanText(lead.customer_name, 180) || 'Cliente sem nome',
        customer_phone: cleanText(lead.customer_phone, 60) || null,
        interested_vehicle: cleanText(lead.interested_vehicle, 220) || 'Veículo não informado',
        status: normalized(lead.status, 80) || 'new_lead',
        origin: origin.key,
        origin_label: origin.label,
        store: lead.assigned_store_id ? { id: lead.assigned_store_id, name: storeById.get(String(lead.assigned_store_id))?.store_name || 'Loja não encontrada' } : null,
        created_at: lead.created_at || null
      }));

    const routedIds = new Set(mappedLeads.map((lead: any) => String(lead.id)));
    const mappedBaseLeads = rawBaseLeads
      .filter((lead: any) => !lead.routed_lead_id || !routedIds.has(String(lead.routed_lead_id)))
      .map((lead: any) => ({
        id: lead.id,
        customer_name: cleanText(lead.name, 180) || 'Cliente sem nome',
        customer_phone: cleanText(lead.phone, 60) || null,
        interested_vehicle: cleanText(lead.vehicle_name, 220) || 'Veículo não informado',
        status: normalized(lead.status, 80) || 'new_lead',
        origin: normalized(lead.source, 120).includes('simulador') ? 'simulator' : 'landing',
        origin_label: normalized(lead.source, 120).includes('simulador') ? 'Simulador do Portal' : 'Landing do Portal',
        store: lead.assigned_store_id ? { id: lead.assigned_store_id, name: storeById.get(String(lead.assigned_store_id))?.store_name || lead.assigned_store_name || 'Loja não encontrada' } : null,
        created_at: lead.created_at || null
      }));

    const leads = [...mappedLeads, ...mappedBaseLeads]
      .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    const problems: any[] = [];
    mappedVehicles.forEach((vehicle: any) => {
      if (!vehicle.store) {
        problems.push({
          id: `vehicle-store-${vehicle.id}`,
          type: 'vehicle_store',
          severity: 'critical',
          title: 'Veículo sem loja proprietária',
          description: 'O veículo do Portal Oficial não possui uma loja válida.',
          store: null,
          vehicle: { id: vehicle.id, name: vehicle.name },
          created_at: vehicle.created_at
        });
      }
      if (vehicle.missing_fields.length) {
        problems.push({
          id: `vehicle-data-${vehicle.id}`,
          type: 'vehicle_data',
          severity: 'warning',
          title: 'Veículo com cadastro incompleto',
          description: `Campos ausentes: ${vehicle.missing_fields.join(', ')}.`,
          store: vehicle.store,
          vehicle: { id: vehicle.id, name: vehicle.name },
          created_at: vehicle.created_at
        });
      }
    });

    leads.forEach((lead: any) => {
      if (!lead.store) {
        problems.push({
          id: `lead-store-${lead.id}`,
          type: 'lead_without_store',
          severity: 'critical',
          title: 'Lead do Portal sem direcionamento',
          description: `${lead.customer_name} ainda não possui uma loja responsável.`,
          store: null,
          vehicle: null,
          created_at: lead.created_at
        });
      }
    });

    const storeSummaries = stores.map((store: any) => {
      const storeVehicles = mappedVehicles.filter((vehicle: any) => vehicle.store?.id === store.id);
      const storeParticipations = participationByStore.get(String(store.id)) || [];
      const eventNames = unique(storeParticipations.map((item: any) => eventById.get(String(item.event_id))?.event_name));
      const registration = normalized(store.registration_source, 120);
      const enteredByEvent = registration.includes('event') || storeParticipations.some((item: any) => normalized(item.source, 120).includes('event'));
      return {
        id: store.id,
        name: store.store_name || 'Loja sem nome',
        slug: store.slug || null,
        website_url: store.website_url || null,
        status: normalized(store.status, 80) || 'unknown',
        portal_enabled: true,
        responsible_name: store.responsible_name || null,
        responsible_email: store.responsible_email || null,
        responsible_phone: store.responsible_phone || null,
        registration_source: enteredByEvent ? 'event' : registration.includes('portal') ? 'portal' : 'manual',
        registration_source_label: enteredByEvent ? 'Cadastro pelo evento' : registration.includes('portal') ? 'Cadastro pelo portal' : 'Cadastro administrativo',
        presence: eventNames.length ? 'event_portal' : 'portal_only',
        presence_label: eventNames.length ? 'Evento + Portal' : 'Somente Portal',
        event_names: eventNames,
        vehicles: storeVehicles.length,
        published: storeVehicles.filter((vehicle: any) => vehicle.show_on_landing && vehicle.status === 'disponivel').length,
        pending: pending.filter((item: any) => item.store?.id === store.id).length,
        leads: leads.filter((lead: any) => lead.store?.id === store.id).length
      };
    });

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      summary: {
        total_vehicles: mappedVehicles.length,
        published_vehicles: mappedVehicles.filter((vehicle: any) => vehicle.show_on_landing && vehicle.status === 'disponivel').length,
        sold_vehicles: mappedVehicles.filter((vehicle: any) => vehicle.status === 'vendido').length,
        pending_items: pending.length,
        problems: problems.length,
        active_stores: storeSummaries.filter((store: any) => store.status === 'active').length,
        marketplace_leads: leads.length,
        confirmed_sales: leads.filter((lead: any) => ['sale_confirmed', 'confirmed', 'sold'].includes(lead.status)).length,
        portal_only_stores: storeSummaries.filter((store: any) => store.presence === 'portal_only').length,
        event_portal_stores: storeSummaries.filter((store: any) => store.presence === 'event_portal').length
      },
      vehicles: mappedVehicles,
      pending,
      problems,
      stores: storeSummaries,
      leads,
      diagnostics: {
        scope: 'portal_only',
        event_rows_excluded: true,
        submissions_available: !submissionsResult.error,
        stock_imports_available: !importsResult.error,
        leads_available: !leadsResult.error,
        base_leads_available: !baseLeadsResult.error
      }
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    return NextResponse.json({ error: cleanText(error?.message || 'Não foi possível carregar o Portal Oficial.', 400) }, { status: 500 });
  }
}
