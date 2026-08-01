import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pendingStatuses = new Set(['pending', 'reviewing', 'imported', 'processing']);
const problemStatuses = new Set(['error', 'rejected', 'duplicate']);

function normalized(value: unknown, maxLength = 180) {
  return cleanText(value, maxLength).toLowerCase();
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.filter(Boolean).map(String)));
}

function vehicleName(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.year]
    .map((value) => cleanText(value, 160))
    .filter(Boolean)
    .join(' ') || 'Veículo sem identificação';
}

function vehicleImages(vehicle: any) {
  return unique([
    ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []),
    vehicle?.image_url
  ]);
}

function missingVehicleFields(vehicle: any) {
  return [
    !cleanText(vehicle?.brand, 100) && 'marca',
    !cleanText(vehicle?.model, 120) && 'modelo',
    !cleanText(vehicle?.year, 40) && 'ano',
    !(Number(vehicle?.price || 0) > 0) && 'valor',
    !vehicleImages(vehicle).length && 'foto'
  ].filter(Boolean) as string[];
}

function linkSource(item: any) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const values = [metadata.provider, metadata.source, metadata.origin, item?.vehicle_url]
    .map((value) => normalized(value, 1400));

  if (values.some((value) => value.includes('olx'))) {
    return { key: 'olx', label: 'OLX', tone: 'purple' };
  }

  return { key: 'website', label: 'Site da loja', tone: 'blue' };
}

function leadOrigin(lead: any, kind: 'event' | 'base') {
  const metadata = lead?.metadata && typeof lead.metadata === 'object' ? lead.metadata : {};
  const raw = normalized(
    lead?.origin || lead?.source || metadata.origin || metadata.source || metadata.channel,
    160
  );

  if (raw.includes('whatsapp')) return { key: 'whatsapp', label: 'WhatsApp' };
  if (raw.includes('manual')) return { key: 'manual', label: 'Manual' };
  if (raw.includes('simulador')) return { key: 'simulator', label: 'Simulador do evento' };
  if (raw.includes('landing') || raw.includes('site') || kind === 'base') return { key: 'landing', label: 'Landing do evento' };
  return { key: 'event', label: 'Evento' };
}

function problem(input: {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  store?: any;
  vehicle?: any;
  source?: string;
  created_at?: string | null;
}) {
  return {
    id: input.id,
    type: input.type,
    severity: input.severity,
    title: input.title,
    description: input.description,
    source: input.source || 'event',
    store: input.store ? { id: input.store.id, name: input.store.store_name || 'Loja sem nome' } : null,
    vehicle: input.vehicle ? { id: input.vehicle.id, name: vehicleName(input.vehicle) } : null,
    created_at: input.created_at || null
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) {
      return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    }

    const eventId = cleanText(new URL(request.url).searchParams.get('event_id'), 80);
    if (!eventId) return NextResponse.json({ error: 'Informe o evento.' }, { status: 400 });

    const [eventResult, participationResult, legacyStoreResult, assignmentResult, submissionResult, importResult, leadResult, baseLeadResult] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).neq('status', 'deleted').maybeSingle(),
      supabase.from('store_event_participations').select('*').eq('event_id', eventId).order('joined_at', { ascending: false }),
      supabase.from('stores').select('*').eq('event_id', eventId).neq('status', 'deleted').order('store_name'),
      supabase.from('event_vehicle_assignments').select('*').eq('event_id', eventId).order('display_order'),
      supabase.from('store_vehicle_link_submissions').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).limit(500),
      supabase.from('store_stock_imports').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).limit(300),
      supabase.from('leads').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).limit(1000),
      supabase.from('leads_base').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).limit(1000)
    ]);

    if (eventResult.error) throw eventResult.error;
    if (!eventResult.data) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });

    const event = eventResult.data;
    const participations = participationResult.error ? [] : participationResult.data || [];
    const legacyStores = legacyStoreResult.error ? [] : legacyStoreResult.data || [];
    const assignments = assignmentResult.error ? [] : assignmentResult.data || [];
    const submissions = submissionResult.error ? [] : submissionResult.data || [];
    const imports = importResult.error ? [] : importResult.data || [];
    const eventLeads = leadResult.error ? [] : leadResult.data || [];
    const baseLeads = baseLeadResult.error ? [] : baseLeadResult.data || [];

    const storeIds = unique([
      ...participations.filter((item: any) => normalized(item.status) !== 'deleted').map((item: any) => item.store_id),
      ...legacyStores.map((item: any) => item.id),
      ...assignments.map((item: any) => item.store_id),
      ...submissions.map((item: any) => item.store_id),
      ...imports.map((item: any) => item.store_id),
      ...eventLeads.map((item: any) => item.assigned_store_id),
      ...baseLeads.map((item: any) => item.assigned_store_id)
    ]);

    const vehicleIds = unique(assignments.map((item: any) => item.vehicle_id));
    const userIds = unique([
      ...submissions.map((item: any) => item.submitted_by_user_id),
      ...imports.map((item: any) => item.submitted_by_user_id),
      ...eventLeads.flatMap((item: any) => [item.captured_by_user_id, item.prospector_id, item.assigned_user_id, item.pre_sales_user_id, item.seller_user_id])
    ]);

    const [storesResult, vehiclesResult, usersResult] = await Promise.all([
      storeIds.length
        ? supabase.from('stores').select('*').in('id', storeIds).neq('status', 'deleted').order('store_name')
        : Promise.resolve({ data: [], error: null }),
      vehicleIds.length
        ? supabase.from('site_vehicles').select('*').in('id', vehicleIds).neq('status', 'excluido')
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from('users').select('id,full_name,email,role,status').in('id', userIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const stores = storesResult.error ? legacyStores : storesResult.data || [];
    const vehicles = vehiclesResult.error ? [] : vehiclesResult.data || [];
    const users = usersResult.error ? [] : usersResult.data || [];

    const storeById = new Map(stores.map((item: any) => [String(item.id), item]));
    const vehicleById = new Map(vehicles.map((item: any) => [String(item.id), item]));
    const userById = new Map(users.map((item: any) => [String(item.id), item]));
    const participationByStore = new Map<string, any>();

    participations
      .filter((item: any) => normalized(item.status) !== 'deleted')
      .forEach((item: any) => participationByStore.set(String(item.store_id), item));

    legacyStores.forEach((store: any) => {
      if (!participationByStore.has(String(store.id))) {
        participationByStore.set(String(store.id), {
          id: `legacy-${store.id}`,
          store_id: store.id,
          event_id: eventId,
          status: store.status === 'active' ? 'active' : 'inactive',
          source: store.registration_source || 'legacy_event_registration',
          joined_at: store.created_at,
          auto_sync_inventory: false,
          legacy: true
        });
      }
    });

    const normalizedEventLeads = eventLeads.map((lead: any) => {
      const origin = leadOrigin(lead, 'event');
      const responsibleId = lead.assigned_user_id || lead.seller_user_id || lead.pre_sales_user_id || lead.prospector_id;
      const responsible = responsibleId ? userById.get(String(responsibleId)) : null;
      return {
        id: lead.id,
        source_table: 'leads',
        customer_name: cleanText(lead.customer_name, 180) || 'Cliente sem nome',
        customer_phone: cleanText(lead.customer_phone, 60) || null,
        interested_vehicle: cleanText(lead.interested_vehicle, 220) || 'Veículo não informado',
        status: normalized(lead.status, 80) || 'new_lead',
        origin: origin.key,
        origin_label: origin.label,
        store: lead.assigned_store_id ? {
          id: lead.assigned_store_id,
          name: storeById.get(String(lead.assigned_store_id))?.store_name || 'Loja não encontrada'
        } : null,
        responsible: responsible ? {
          id: responsible.id,
          name: responsible.full_name || responsible.email || 'Responsável',
          role: responsible.role || null
        } : null,
        created_at: lead.created_at || null
      };
    });

    const routedIds = new Set(normalizedEventLeads.map((lead: any) => String(lead.id)));
    const normalizedBaseLeads = baseLeads
      .filter((lead: any) => !lead.routed_lead_id || !routedIds.has(String(lead.routed_lead_id)))
      .map((lead: any) => {
        const origin = leadOrigin(lead, 'base');
        return {
          id: lead.id,
          source_table: 'leads_base',
          customer_name: cleanText(lead.name, 180) || 'Cliente sem nome',
          customer_phone: cleanText(lead.phone, 60) || null,
          interested_vehicle: cleanText(lead.vehicle_name, 220) || 'Veículo não informado',
          status: normalized(lead.status, 80) || 'new_lead',
          origin: origin.key,
          origin_label: origin.label,
          store: lead.assigned_store_id ? {
            id: lead.assigned_store_id,
            name: storeById.get(String(lead.assigned_store_id))?.store_name || lead.assigned_store_name || 'Loja não encontrada'
          } : null,
          responsible: null,
          created_at: lead.created_at || null
        };
      });

    const leads = [...normalizedEventLeads, ...normalizedBaseLeads]
      .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    const pending = [
      ...submissions.map((item: any) => {
        const source = linkSource(item);
        const preview = item.metadata?.imported_preview || {};
        const submitter = item.submitted_by_user_id ? userById.get(String(item.submitted_by_user_id)) : null;
        return {
          id: item.id,
          kind: 'link',
          source: source.key,
          source_label: source.label,
          source_tone: source.tone,
          status: normalized(item.status, 80) || 'pending',
          title: cleanText(preview.title, 300) || cleanText(item.vehicle_url, 500) || 'Link de veículo',
          url: cleanText(item.vehicle_url, 1400) || null,
          file_name: null,
          store: item.store_id ? { id: item.store_id, name: storeById.get(String(item.store_id))?.store_name || 'Loja não encontrada' } : null,
          submitter: submitter ? submitter.full_name || submitter.email || 'Usuário' : null,
          photos: Array.isArray(preview.image_urls) ? preview.image_urls.length : 0,
          missing_fields: Array.isArray(item.metadata?.missing_fields) ? item.metadata.missing_fields : [],
          error: cleanText(item.metadata?.error || item.metadata?.last_error, 500) || null,
          created_at: item.created_at || null
        };
      }),
      ...imports.map((item: any) => {
        const submitter = item.submitted_by_user_id ? userById.get(String(item.submitted_by_user_id)) : null;
        return {
          id: item.id,
          kind: 'file',
          source: 'file',
          source_label: 'Arquivo ou planilha',
          source_tone: 'amber',
          status: normalized(item.status, 80) || 'pending',
          title: cleanText(item.file_name, 300) || 'Arquivo de estoque',
          url: cleanText(item.file_url, 1400) || null,
          file_name: cleanText(item.file_name, 300) || null,
          store: item.store_id ? { id: item.store_id, name: storeById.get(String(item.store_id))?.store_name || 'Loja não encontrada' } : null,
          submitter: submitter ? submitter.full_name || submitter.email || 'Usuário' : null,
          photos: 0,
          missing_fields: [],
          error: cleanText(item.metadata?.error || item.notes, 500) || null,
          created_at: item.created_at || null
        };
      })
    ].sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    const eventVehicles = assignments.map((assignment: any) => {
      const vehicle = vehicleById.get(String(assignment.vehicle_id));
      const store = storeById.get(String(assignment.store_id || vehicle?.store_id));
      return {
        id: assignment.id,
        assignment_id: assignment.id,
        vehicle_id: assignment.vehicle_id,
        name: vehicle ? vehicleName(vehicle) : 'Veículo não encontrado',
        image_url: vehicle ? vehicleImages(vehicle)[0] || null : null,
        price: Number(assignment.promotional_price || vehicle?.price || 0),
        original_price: Number(vehicle?.price || 0),
        status: normalized(assignment.status, 80) || 'active',
        event_visible: assignment.show_on_landing === true,
        event_featured: assignment.is_featured === true,
        portal_visible: vehicle?.show_on_landing === true && store?.portal_enabled === true,
        store: store ? { id: store.id, name: store.store_name || 'Loja sem nome' } : null,
        missing_fields: vehicle ? missingVehicleFields(vehicle) : ['veículo'],
        created_at: assignment.created_at || vehicle?.created_at || null
      };
    });

    const problems: any[] = [];

    stores.forEach((store: any) => {
      const participation = participationByStore.get(String(store.id));
      if (!participation) return;
      if (normalized(store.status, 80) !== 'active') {
        problems.push(problem({
          id: `store-inactive-${store.id}`,
          type: 'store_inactive',
          severity: 'critical',
          title: 'Loja participante inativa',
          description: 'A loja participa do evento, mas está inativa no cadastro geral.',
          store,
          created_at: store.updated_at
        }));
      }
      if (!cleanText(store.responsible_name, 160) || !cleanText(store.responsible_phone, 80)) {
        problems.push(problem({
          id: `store-contact-${store.id}`,
          type: 'store_contact',
          severity: 'warning',
          title: 'Loja sem responsável completo',
          description: 'Nome ou telefone do responsável não foi preenchido.',
          store,
          created_at: store.updated_at
        }));
      }
    });

    assignments.forEach((assignment: any) => {
      const vehicle = vehicleById.get(String(assignment.vehicle_id));
      const store = storeById.get(String(assignment.store_id || vehicle?.store_id));
      if (!vehicle) {
        problems.push(problem({
          id: `assignment-vehicle-${assignment.id}`,
          type: 'assignment_vehicle_missing',
          severity: 'critical',
          title: 'Veículo vinculado não encontrado',
          description: 'A atribuição do evento aponta para um veículo removido ou inexistente.',
          store,
          created_at: assignment.created_at
        }));
        return;
      }
      if (!store || !participationByStore.has(String(store.id))) {
        problems.push(problem({
          id: `assignment-store-${assignment.id}`,
          type: 'assignment_store_missing',
          severity: 'critical',
          title: 'Veículo ligado a loja fora do evento',
          description: 'A loja proprietária não está entre as participantes deste evento.',
          store,
          vehicle,
          created_at: assignment.created_at
        }));
      }
      const missing = missingVehicleFields(vehicle);
      if (missing.length) {
        problems.push(problem({
          id: `vehicle-data-${vehicle.id}`,
          type: 'vehicle_data',
          severity: 'warning',
          title: 'Veículo com cadastro incompleto',
          description: `Campos ausentes: ${missing.join(', ')}.`,
          store,
          vehicle,
          created_at: vehicle.updated_at || vehicle.created_at
        }));
      }
    });

    pending.forEach((item: any) => {
      const store = item.store?.id ? storeById.get(String(item.store.id)) : null;
      if (!store || !participationByStore.has(String(item.store?.id))) {
        problems.push(problem({
          id: `pending-store-${item.id}`,
          type: 'pending_store_missing',
          severity: 'critical',
          title: 'Pendência vinculada a loja fora do evento',
          description: 'O envio existe, mas a loja não está corretamente vinculada ao evento.',
          store,
          source: item.source,
          created_at: item.created_at
        }));
      }
      if (problemStatuses.has(item.status)) {
        problems.push(problem({
          id: `pending-error-${item.id}`,
          type: `pending_${item.status}`,
          severity: 'warning',
          title: item.status === 'duplicate' ? 'Importação duplicada' : item.status === 'rejected' ? 'Importação rejeitada' : 'Erro na importação',
          description: item.error || item.title,
          store,
          source: item.source,
          created_at: item.created_at
        }));
      }
    });

    leads.forEach((lead: any) => {
      if (!lead.store) {
        problems.push(problem({
          id: `lead-store-${lead.id}`,
          type: 'lead_without_store',
          severity: 'critical',
          title: 'Lead sem loja direcionada',
          description: `${lead.customer_name} ainda não possui uma loja responsável.`,
          source: lead.origin,
          created_at: lead.created_at
        }));
      } else if (!participationByStore.has(String(lead.store.id))) {
        problems.push(problem({
          id: `lead-outside-${lead.id}`,
          type: 'lead_store_outside_event',
          severity: 'critical',
          title: 'Lead direcionado para loja fora do evento',
          description: `${lead.customer_name} foi direcionado para ${lead.store.name}, que não participa deste evento.`,
          store: storeById.get(String(lead.store.id)),
          source: lead.origin,
          created_at: lead.created_at
        }));
      }
    });

    const storeSummaries = stores
      .filter((store: any) => participationByStore.has(String(store.id)))
      .map((store: any) => {
        const participation = participationByStore.get(String(store.id));
        const storeVehicles = eventVehicles.filter((vehicle: any) => vehicle.store?.id === store.id);
        const storePending = pending.filter((item: any) => item.store?.id === store.id);
        const storeLeads = leads.filter((lead: any) => lead.store?.id === store.id);
        const storeProblems = problems.filter((item: any) => item.store?.id === store.id);
        const registrationSource = normalized(store.registration_source || participation?.source, 120);
        return {
          id: store.id,
          name: store.store_name || 'Loja sem nome',
          slug: store.slug || null,
          status: normalized(store.status, 80) || 'unknown',
          participation_status: normalized(participation?.status, 80) || 'active',
          registration_source: registrationSource.includes('event') ? 'event' : registrationSource || 'manual',
          registration_source_label: registrationSource.includes('event') ? 'Cadastro pelo evento' : registrationSource.includes('portal') ? 'Cadastro pelo portal' : 'Cadastro administrativo',
          portal_enabled: store.portal_enabled === true,
          presence: store.portal_enabled === true ? 'event_portal' : 'event_only',
          presence_label: store.portal_enabled === true ? 'Evento + Portal' : 'Somente evento',
          responsible_name: store.responsible_name || null,
          responsible_phone: store.responsible_phone || null,
          website_url: store.website_url || null,
          auto_sync_inventory: participation?.auto_sync_inventory === true,
          vehicles: storeVehicles.length,
          pending: storePending.filter((item: any) => pendingStatuses.has(item.status)).length,
          problems: storeProblems.length,
          leads: storeLeads.length,
          sales: storeLeads.filter((lead: any) => ['sale_confirmed', 'sold', 'confirmed'].includes(lead.status)).length,
          joined_at: participation?.joined_at || participation?.created_at || store.created_at || null
        };
      })
      .sort((a: any, b: any) => a.name.localeCompare(b.name, 'pt-BR'));

    const visiblePending = pending.filter((item: any) => pendingStatuses.has(item.status) || problemStatuses.has(item.status));
    const salesConfirmed = leads.filter((lead: any) => ['sale_confirmed', 'sold', 'confirmed'].includes(lead.status)).length;

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      event: {
        id: event.id,
        name: event.event_name,
        status: normalized(event.status, 80) || 'inactive',
        start_date: event.start_date || null,
        end_date: event.end_date || null,
        state: event.state || null,
        city: event.city || null,
        location: event.location || null,
        sponsor_bank: event.sponsor_bank || null,
        slug: event.slug || null,
        historical_mode: normalized(event.status, 80) !== 'active'
      },
      summary: {
        stores: storeSummaries.length,
        stores_portal: storeSummaries.filter((store: any) => store.portal_enabled).length,
        stores_event_only: storeSummaries.filter((store: any) => !store.portal_enabled).length,
        vehicles: eventVehicles.length,
        vehicles_portal: eventVehicles.filter((vehicle: any) => vehicle.portal_visible).length,
        pending: visiblePending.length,
        problems: problems.length,
        leads: leads.length,
        sales: salesConfirmed
      },
      vehicles: eventVehicles,
      pending: visiblePending,
      problems: problems.sort((a: any, b: any) => {
        const weight: Record<string, number> = { critical: 3, warning: 2, info: 1 };
        return (weight[b.severity] || 0) - (weight[a.severity] || 0)
          || String(b.created_at || '').localeCompare(String(a.created_at || ''));
      }),
      stores: storeSummaries,
      leads,
      diagnostics: {
        participations_available: !participationResult.error,
        legacy_stores_available: !legacyStoreResult.error,
        assignments_available: !assignmentResult.error,
        submissions_available: !submissionResult.error,
        stock_imports_available: !importResult.error,
        event_leads_available: !leadResult.error,
        base_leads_available: !baseLeadResult.error
      }
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    return NextResponse.json({
      error: cleanText(error?.message || 'Não foi possível carregar o painel do evento.', 400)
    }, { status: 500 });
  }
}
