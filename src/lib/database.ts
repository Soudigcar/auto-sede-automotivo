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

export async function updateLeadStatus(leadId: string, status: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
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

  return {
    totalLeads,
    leadsWithPhone,
    surveysWithoutPhone,
    salesCount,
    lossesCount,
    conversionRate
  };
}
