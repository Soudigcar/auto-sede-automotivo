import { NextResponse } from 'next/server';
import { buildFinancingReadiness,financingRequestPayload,financingResultPayload,isFinancingSimulationCommand,isMissingFinancingSimulationSchema } from '@/lib/financingSimulationV1';
import { cleanText } from '@/lib/server/storeTeam';
import { authorizeStorePortal,canAccessStoreLead } from '@/lib/server/storePortal';

export const runtime = 'nodejs';
const manageRoles = new Set(['master','store','pre_sales','seller']);
const resultRoles = new Set(['master','store','seller']);
const expireRoles = new Set(['master','store']);
const terminal = new Set(['completed','cancelled','expired']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = 'id,store_id,lead_id,interested_vehicle_id,vehicle_name_snapshot,status,outcome,requested_without_down_payment,requested_down_payment_value,requested_installment_count,requested_installment_value,requested_financed_amount,financing_bank,banks_consulted_count,preapproved_count,approval_indicator_percent,approval_indicator_source,approved_amount,approved_installment_count,approved_installment_value,result_source,result_reference,sanitized_notes,requested_at,submitted_at,result_received_at,communicated_at,scheduling_started_at,completed_at,cancelled_at,expired_at,version,created_at,updated_at';

function previewBlocked() { return process.env.VERCEL_ENV === 'preview' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'; }
function schemaPending() { return NextResponse.json({error:'A migration do Financiamento V1 ainda não foi aplicada neste ambiente.',code:'FINANCING_SCHEMA_PENDING'},{status:503}); }

async function leadFor(context:any,leadId:string) {
  const {data,error}=await context.supabase.from('leads')
    .select('id,assigned_store_id,assigned_user_id,assigned_user_role,pre_sales_user_id,seller_user_id,captured_by_user_id,status,customer_name,interested_vehicle,interested_vehicle_id')
    .eq('id',leadId).maybeSingle();
  if (error) throw error;
  if (!data || data.assigned_store_id!==context.store.id || !canAccessStoreLead(context.profile,context.role,data)) return null;
  return data;
}

async function bundle(context:any,lead:any) {
  const [commercialResult,simulationsResult,eventsResult]=await Promise.all([
    context.supabase.from('lead_commercial_details').select('has_driver_license,cpf,birth_date').eq('lead_id',lead.id).eq('store_id',context.store.id).maybeSingle(),
    context.supabase.from('lead_financing_simulations').select(fields).eq('lead_id',lead.id).eq('store_id',context.store.id).order('created_at',{ascending:false}).limit(10),
    context.supabase.from('lead_financing_simulation_events').select('id,simulation_id,event_type,from_status,to_status,detail,created_at').eq('lead_id',lead.id).eq('store_id',context.store.id).order('created_at',{ascending:false}).limit(30)
  ]);
  if (commercialResult.error) throw commercialResult.error;
  if (simulationsResult.error) throw simulationsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  const simulations=simulationsResult.data || [];
  const current=simulations.find((item:any)=>!terminal.has(String(item.status || ''))) || simulations[0] || null;
  const commercial=commercialResult.data || null;
  const readiness=buildFinancingReadiness({
    hasVehicle:Boolean(current?.interested_vehicle_id || current?.vehicle_name_snapshot || lead.interested_vehicle_id || lead.interested_vehicle),
    hasDriverLicense:typeof commercial?.has_driver_license==='boolean' ? commercial.has_driver_license : null,
    cpfDigits:String(commercial?.cpf || ''),birthDate:commercial?.birth_date || null,
    requestedWithoutDownPayment:typeof current?.requested_without_down_payment==='boolean' ? current.requested_without_down_payment : null,
    requestedDownPaymentValue:current?.requested_down_payment_value==null ? null : Number(current.requested_down_payment_value),
    requestedInstallmentCount:current?.requested_installment_count==null ? null : Number(current.requested_installment_count)
  });
  return {
    lead:{id:lead.id,customer_name:lead.customer_name,status:lead.status,interested_vehicle:lead.interested_vehicle,interested_vehicle_id:lead.interested_vehicle_id},
    current,simulations,events:eventsResult.data || [],readiness,
    permissions:{can_manage:manageRoles.has(context.role),can_record_result:resultRoles.has(context.role),can_expire:expireRoles.has(context.role)}
  };
}

function rpcError(error:any) {
  const message=String(error?.message || 'Não foi possível atualizar a simulação.');
  if (isMissingFinancingSimulationSchema(error)) return schemaPending();
  if (message.includes('version_conflict')) return NextResponse.json({error:'A simulação foi atualizada em outra sessão. Recarregue.'},{status:409});
  if (message.includes('idempotency')) return NextResponse.json({error:'A chave desta operação já foi usada com outro conteúdo.'},{status:409});
  if (message.includes('qualification_incomplete')) return NextResponse.json({error:'Complete veículo, entrada, parcelas, CNH, CPF e nascimento.'},{status:422});
  if (message.includes('bank_required')) return NextResponse.json({error:'Informe o banco responsável pelo resultado positivo.'},{status:422});
  if (String(error?.code || '')==='42501' || message.includes('not_allowed') || message.includes('outside_actor_portfolio')) return NextResponse.json({error:'Você não tem permissão para esta etapa.'},{status:403});
  return NextResponse.json({error:message.slice(0,500)},{status:500});
}

export async function GET(request:Request) {
  try {
    const url=new URL(request.url); const slug=cleanText(url.searchParams.get('slug'),120); const leadId=cleanText(url.searchParams.get('lead_id'),80);
    if (!slug || !leadId) return NextResponse.json({error:'Informe a loja e o lead.'},{status:400});
    const context=await authorizeStorePortal(request,slug); if ('error' in context) return context.error;
    if (!manageRoles.has(context.role)) return NextResponse.json({error:'Seu perfil não possui acesso aos dados de financiamento.'},{status:403});
    const lead=await leadFor(context,leadId); if (!lead) return NextResponse.json({error:'Lead não encontrado na carteira deste usuário.'},{status:404});
    return NextResponse.json(await bundle(context,lead));
  } catch (error:any) {
    if (isMissingFinancingSimulationSchema(error)) return schemaPending();
    return NextResponse.json({error:String(error?.message || 'Não foi possível carregar a simulação.').slice(0,500)},{status:500});
  }
}

export async function POST(request:Request) {
  try {
    if (previewBlocked()) return NextResponse.json({error:'Este Preview é somente leitura.',code:'FINANCING_PREVIEW_READ_ONLY'},{status:403});
    const body=await request.json(); const slug=cleanText(body.slug,120); const leadId=cleanText(body.lead_id,80);
    const simulationId=cleanText(body.simulation_id,80) || null; const command=cleanText(body.command,80); const requestId=cleanText(body.request_id,80);
    const expectedVersion=body.expected_version==null || body.expected_version==='' ? null : Number(body.expected_version);
    if (!slug || !leadId) return NextResponse.json({error:'Informe a loja e o lead.'},{status:400});
    if (!isFinancingSimulationCommand(command) || !uuid.test(requestId)) return NextResponse.json({error:'Comando ou identificador inválido.'},{status:400});
    if (command!=='start' && (!simulationId || !uuid.test(simulationId))) return NextResponse.json({error:'Informe a simulação atual.'},{status:400});
    if (expectedVersion!==null && (!Number.isInteger(expectedVersion) || expectedVersion<1)) return NextResponse.json({error:'Versão inválida.'},{status:400});
    const context=await authorizeStorePortal(request,slug); if ('error' in context) return context.error;
    const lead=await leadFor(context,leadId); if (!lead) return NextResponse.json({error:'Lead não encontrado na carteira deste usuário.'},{status:404});
    if (!manageRoles.has(context.role)) return NextResponse.json({error:'Seu perfil possui acesso somente para consulta.'},{status:403});
    if (command==='record_result' && !resultRoles.has(context.role)) return NextResponse.json({error:'Somente Master, Gestor ou Vendedor pode registrar resultado.'},{status:403});
    if (command==='expire' && !expireRoles.has(context.role)) return NextResponse.json({error:'Somente Master ou Gestor pode expirar.'},{status:403});
    let payload:Record<string,unknown>={};
    if (command==='start' || command==='update_request') payload=financingRequestPayload(body);
    if (command==='record_result') payload=financingResultPayload(body);
    const {error}=await context.supabase.rpc('apply_lead_financing_simulation_command_v1',{
      p_store_id:context.store.id,p_lead_id:lead.id,p_simulation_id:command==='start'?null:simulationId,p_command:command,
      p_request_id:requestId,p_expected_version:expectedVersion,p_payload:payload,p_actor_user_id:context.profile.id
    });
    if (error) return rpcError(error);
    return NextResponse.json({success:true,...(await bundle(context,lead))});
  } catch (error:any) {
    if (error instanceof Error && /Informe|Selecione|Pré-aprovações|Indicador|parcelas|valor|quantidade|origem|bancos/i.test(error.message)) return NextResponse.json({error:error.message},{status:400});
    return rpcError(error);
  }
}
