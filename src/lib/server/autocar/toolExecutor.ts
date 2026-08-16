import { cleanText } from '@/lib/server/storeTeam';
import type { AutocarExecutionContext } from '@/lib/server/autocar/context';
import type { AutocarReadToolName } from '@/lib/server/autocar/types';

function vehicleFields() {
  return 'id,brand,model,version,year,manufacture_year,model_year,mileage,color,transmission,fuel,price,image_url,image_urls,status';
}

async function requireVehicle(supabase: any, context: AutocarExecutionContext, vehicleId: unknown) {
  const id = cleanText(vehicleId, 100);
  if (!id) throw new Error('Veículo obrigatório.');
  const { data, error } = await supabase
    .from('site_vehicles')
    .select(vehicleFields())
    .eq('id', id)
    .eq('store_id', context.storeId)
    .eq('status', 'disponivel')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Veículo não disponível no estoque desta loja.');
  return data;
}

export async function executeAutocarReadTool(input: {
  supabase: any;
  context: AutocarExecutionContext;
  toolName: AutocarReadToolName;
  args?: Record<string, unknown>;
}) {
  const { supabase, context, toolName } = input;
  const args = input.args || {};

  if (toolName === 'consultar_dados_loja') {
    const { data, error } = await supabase
      .from('stores')
      .select('id,store_name,city,state,address_text,responsible_phone,responsible_email,website_url,instagram_url')
      .eq('id', context.storeId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  if (toolName === 'consultar_regras_comerciais') {
    const [knowledgeResult, policiesResult] = await Promise.all([
      supabase.from('ai_store_knowledge')
        .select('category,title,content,structured_data,version')
        .eq('store_id', context.storeId).eq('status', 'active').order('category'),
      supabase.from('ai_store_policies')
        .select('policy_key,effect,priority,configuration,version')
        .eq('store_id', context.storeId).eq('is_active', true).order('priority')
    ]);
    if (knowledgeResult.error) throw knowledgeResult.error;
    if (policiesResult.error) throw policiesResult.error;
    return { knowledge: knowledgeResult.data || [], policies: policiesResult.data || [] };
  }

  if (toolName === 'consultar_estoque') {
    let query = supabase.from('site_vehicles').select(vehicleFields())
      .eq('store_id', context.storeId).eq('status', 'disponivel')
      .order('brand').order('model').limit(30);
    const brand = cleanText(args.brand, 80);
    const model = cleanText(args.model, 120);
    const year = cleanText(args.year, 20);
    const maxPrice = Number(args.max_price || 0);
    if (brand) query = query.ilike('brand', `%${brand}%`);
    if (model) query = query.ilike('model', `%${model}%`);
    if (year) query = query.eq('year', year);
    if (Number.isFinite(maxPrice) && maxPrice > 0) query = query.lte('price', maxPrice);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  if (toolName === 'buscar_veiculo') {
    return requireVehicle(supabase, context, args.vehicle_id);
  }

  if (toolName === 'consultar_preco') {
    const vehicle = await requireVehicle(supabase, context, args.vehicle_id);
    return { vehicle_id: vehicle.id, price: vehicle.price };
  }

  if (toolName === 'buscar_fotos_veiculo') {
    const vehicle = await requireVehicle(supabase, context, args.vehicle_id);
    const urls = Array.from(new Set([vehicle.image_url, ...(vehicle.image_urls || [])].filter(Boolean))).slice(0, 10);
    return { vehicle_id: vehicle.id, photos: urls };
  }

  if (toolName === 'consultar_lead') {
    if (!context.leadId) return null;
    const [leadResult, commercialResult] = await Promise.all([
      supabase.from('leads')
        .select('id,customer_name,customer_phone,interested_vehicle,interested_vehicle_id,interested_vehicle_price,status,scheduled_at,notes,assigned_user_id')
        .eq('id', context.leadId).eq('assigned_store_id', context.storeId).maybeSingle(),
      supabase.from('lead_commercial_details')
        .select('payment_type,financing_bank,has_down_payment,down_payment_value,financed_amount,installment_count,installment_value,has_trade_in,trade_vehicle_name,trade_vehicle_manufacture_year,trade_vehicle_model_year')
        .eq('lead_id', context.leadId).eq('store_id', context.storeId).maybeSingle()
    ]);
    if (leadResult.error) throw leadResult.error;
    if (commercialResult.error) throw commercialResult.error;
    return { lead: leadResult.data || null, commercial: commercialResult.data || null };
  }

  if (toolName === 'consultar_pipeline') {
    if (!context.leadId) return null;
    const { data, error } = await supabase.from('leads')
      .select('id,status,stage_entered_at,last_activity_at,last_activity_type,last_activity_label,scheduled_at')
      .eq('id', context.leadId).eq('assigned_store_id', context.storeId).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  if (toolName === 'consultar_agenda') {
    if (!context.leadId) return { lead_appointment: null, tasks: [] };
    const [leadResult, taskResult] = await Promise.all([
      supabase.from('leads').select('scheduled_at,appointment_notes,status')
        .eq('id', context.leadId).eq('assigned_store_id', context.storeId).maybeSingle(),
      supabase.from('store_calendar_tasks').select('id,title,description,task_type,starts_at,ends_at,status')
        .eq('store_id', context.storeId).eq('lead_id', context.leadId).order('starts_at', { ascending: true }).limit(20)
    ]);
    if (leadResult.error) throw leadResult.error;
    if (taskResult.error) throw taskResult.error;
    return { lead_appointment: leadResult.data || null, tasks: taskResult.data || [] };
  }

  throw new Error(`Tool AUTOCAR de leitura não registrada: ${toolName}`);
}
