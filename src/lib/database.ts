import { createClient } from '@/lib/supabase';

export type StreetSurveyInput = {
  eventId: string;
  prospectorId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerBank?: string | null;
  purchaseIntention?: string | null;
  vehicleCategoryInterest?: string | null;
  purchaseTimeline?: string | null;
  hasTradeInVehicle?: boolean | null;
  assignedStoreId: string;
  notes?: string | null;
};

export type QuickRegistrationInput = {
  eventId: string;
  prospectorId?: string | null;
  customerName: string;
  customerPhone: string;
  customerBank?: string | null;
  interestedVehicle?: string | null;
  vehicleCategoryInterest?: string | null;
  assignedStoreId: string;
  notes?: string | null;
};

export type ConfirmSaleInput = {
  leadId: string;
  vehicleId: string;
  sellerName: string;
  financingBank: string;
  paymentType: string;
  saleValue?: number | null;
};

export type RegisterLossInput = {
  leadId: string;
  reason: string;
  description?: string | null;
  lostStage?: string | null;
};

export async function getActiveEvent() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;
  return data;
}

export async function getActiveStores(eventId?: string) {
  const supabase = createClient();
  let query = supabase.from('stores').select('*').eq('status', 'active').order('store_name');

  if (eventId) query = query.eq('event_id', eventId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createStreetSurvey(input: StreetSurveyInput) {
  const supabase = createClient();
  const leadStatus = input.customerPhone ? 'new_lead' : 'survey_without_phone';

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert({
      event_id: input.eventId,
      customer_name: input.customerName,
      customer_phone: input.customerPhone || null,
      customer_bank: input.customerBank || null,
      interested_vehicle: null,
      vehicle_category_interest: input.vehicleCategoryInterest || null,
      origin: 'street_survey',
      prospector_id: input.prospectorId || null,
      assigned_store_id: input.assignedStoreId,
      status: leadStatus,
      notes: input.notes || null
    })
    .select('*')
    .single();

  if (leadError) throw leadError;

  const { error: surveyError } = await supabase.from('street_surveys').insert({
    event_id: input.eventId,
    lead_id: lead.id,
    prospector_id: input.prospectorId || null,
    customer_name: input.customerName,
    customer_phone: input.customerPhone || null,
    customer_bank: input.customerBank || null,
    purchase_intention: input.purchaseIntention || null,
    vehicle_category_interest: input.vehicleCategoryInterest || null,
    purchase_timeline: input.purchaseTimeline || null,
    has_trade_in_vehicle: input.hasTradeInVehicle,
    assigned_store_id: input.assignedStoreId,
    notes: input.notes || null
  });

  if (surveyError) throw surveyError;

  await createLeadActivity({
    eventId: input.eventId,
    leadId: lead.id,
    activityType: 'lead_created',
    description: 'Pesquisa de rua cadastrada'
  });

  await createAuditLog({
    eventId: input.eventId,
    actionType: 'lead_created',
    entityType: 'leads',
    entityId: lead.id,
    newValue: { origin: 'street_survey', assigned_store_id: input.assignedStoreId }
  });

  return lead;
}

export async function createQuickRegistration(input: QuickRegistrationInput) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('leads')
    .insert({
      event_id: input.eventId,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_bank: input.customerBank || null,
      interested_vehicle: input.interestedVehicle || null,
      vehicle_category_interest: input.vehicleCategoryInterest || null,
      origin: 'quick_registration',
      prospector_id: input.prospectorId || null,
      assigned_store_id: input.assignedStoreId,
      status: 'new_lead',
      notes: input.notes || null
    })
    .select('*')
    .single();

  if (error) throw error;

  await createLeadActivity({
    eventId: input.eventId,
    leadId: data.id,
    activityType: 'lead_created',
    description: 'Cadastro rapido criado'
  });

  await createAuditLog({
    eventId: input.eventId,
    actionType: 'lead_created',
    entityType: 'leads',
    entityId: data.id,
    newValue: { origin: 'quick_registration', assigned_store_id: input.assignedStoreId }
  });

  return data;
}

export async function getStoreLeads(storeId?: string) {
  const supabase = createClient();
  let query = supabase.from('leads').select('*').order('created_at', { ascending: false });

  if (storeId) query = query.eq('assigned_store_id', storeId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getAvailableInventory(storeId?: string) {
  const supabase = createClient();
  let query = supabase.from('inventory').select('*').eq('status', 'available').order('created_at', { ascending: false });

  if (storeId) query = query.eq('store_id', storeId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateLeadStatus(leadId: string, status: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .select('*')
    .single();

  if (error) throw error;

  await createLeadActivity({
    eventId: data.event_id,
    leadId,
    activityType: 'lead_status_updated',
    description: `Status atualizado para ${status}`
  });

  await createAuditLog({
    eventId: data.event_id,
    actionType: 'lead_status_updated',
    entityType: 'leads',
    entityId: leadId,
    newValue: { status }
  });

  return data;
}

export async function confirmSale(input: ConfirmSaleInput) {
  const supabase = createClient();

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', input.leadId)
    .single();

  if (leadError) throw leadError;

  const { data: vehicle, error: vehicleError } = await supabase
    .from('inventory')
    .select('*')
    .eq('id', input.vehicleId)
    .single();

  if (vehicleError) throw vehicleError;

  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      event_id: lead.event_id,
      lead_id: lead.id,
      store_id: lead.assigned_store_id,
      vehicle_id: vehicle.id,
      prospector_id: lead.prospector_id,
      seller_name: input.sellerName,
      customer_bank: lead.customer_bank,
      financing_bank: input.financingBank,
      payment_type: input.paymentType,
      sale_value: input.saleValue || null,
      vehicle_category: vehicle.vehicle_category
    })
    .select('*')
    .single();

  if (saleError) throw saleError;

  const { error: leadUpdateError } = await supabase
    .from('leads')
    .update({ status: 'sale_confirmed', updated_at: new Date().toISOString() })
    .eq('id', lead.id);

  if (leadUpdateError) throw leadUpdateError;

  const { error: vehicleUpdateError } = await supabase
    .from('inventory')
    .update({ status: 'sold', updated_at: new Date().toISOString() })
    .eq('id', vehicle.id);

  if (vehicleUpdateError) throw vehicleUpdateError;

  await createLeadActivity({
    eventId: lead.event_id,
    leadId: lead.id,
    activityType: 'sale_confirmed',
    description: 'Venda confirmada'
  });

  await createAuditLog({
    eventId: lead.event_id,
    actionType: 'sale_confirmed',
    entityType: 'sales',
    entityId: sale.id,
    newValue: {
      lead_id: lead.id,
      vehicle_id: vehicle.id,
      financing_bank: input.financingBank,
      payment_type: input.paymentType,
      sale_value: input.saleValue || null
    }
  });

  return sale;
}

export async function registerLoss(input: RegisterLossInput) {
  const supabase = createClient();

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', input.leadId)
    .single();

  if (leadError) throw leadError;

  const { data: loss, error: lossError } = await supabase
    .from('losses')
    .insert({
      event_id: lead.event_id,
      lead_id: lead.id,
      store_id: lead.assigned_store_id,
      reason: input.reason,
      description: input.description || null,
      lost_stage: input.lostStage || lead.status
    })
    .select('*')
    .single();

  if (lossError) throw lossError;

  const { error: leadUpdateError } = await supabase
    .from('leads')
    .update({ status: 'lost', updated_at: new Date().toISOString() })
    .eq('id', lead.id);

  if (leadUpdateError) throw leadUpdateError;

  await createLeadActivity({
    eventId: lead.event_id,
    leadId: lead.id,
    activityType: 'loss_registered',
    description: 'Perda registrada'
  });

  await createAuditLog({
    eventId: lead.event_id,
    actionType: 'loss_registered',
    entityType: 'losses',
    entityId: loss.id,
    newValue: {
      lead_id: lead.id,
      reason: input.reason,
      lost_stage: input.lostStage || lead.status
    }
  });

  return loss;
}

export async function createLeadActivity(input: {
  eventId: string;
  leadId: string;
  activityType: string;
  description?: string;
}) {
  const supabase = createClient();
  const { error } = await supabase.from('lead_activities').insert({
    event_id: input.eventId,
    lead_id: input.leadId,
    activity_type: input.activityType,
    description: input.description || null
  });

  if (error) throw error;
}

export async function createAuditLog(input: {
  eventId: string;
  actionType: string;
  entityType?: string;
  entityId?: string;
  newValue?: Record<string, unknown>;
  oldValue?: Record<string, unknown>;
}) {
  const supabase = createClient();
  const { error } = await supabase.from('audit_logs').insert({
    event_id: input.eventId,
    action_type: input.actionType,
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    old_value: input.oldValue || null,
    new_value: input.newValue || null
  });

  if (error) throw error;
}

export async function getDashboardSummary() {
  const supabase = createClient();
  const { data: leads, error: leadsError } = await supabase.from('leads').select('*');
  if (leadsError) throw leadsError;

  const { data: sales, error: salesError } = await supabase.from('sales').select('*');
  if (salesError) throw salesError;

  const { data: losses, error: lossesError } = await supabase.from('losses').select('*');
  if (lossesError) throw lossesError;

  const totalLeads = leads?.length || 0;
  const leadsWithPhone = leads?.filter((lead) => Boolean(lead.customer_phone)).length || 0;
  const surveysWithoutPhone = leads?.filter((lead) => lead.status === 'survey_without_phone').length || 0;
  const salesCount = sales?.length || 0;
  const lossesCount = losses?.length || 0;
  const conversionRate = leadsWithPhone > 0 ? Math.round((salesCount / leadsWithPhone) * 100) : 0;
  const totalSalesValue = sales?.reduce((sum, sale) => sum + Number(sale.sale_value || 0), 0) || 0;
  const averageTicket = salesCount > 0 ? Math.round(totalSalesValue / salesCount) : 0;

  return {
    totalLeads,
    leadsWithPhone,
    surveysWithoutPhone,
    salesCount,
    lossesCount,
    conversionRate,
    averageTicket
  };
}
