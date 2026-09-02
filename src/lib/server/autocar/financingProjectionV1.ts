import {
  isFinancingSimulationOutcome,
  isFinancingSimulationResultSource,
  isFinancingSimulationStatus,
  isMissingFinancingSimulationSchema,
  type FinancingSimulationStatus
} from '../../financingSimulationV1';

export const AUTOCAR_FINANCING_PROJECTION_VERSION = 'autocar-financing-projection-v1';
const visible = new Set<FinancingSimulationStatus>(['result_available','communicated','scheduling','completed']);

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null;
}
function textOrNull(value: unknown,max=300) {
  const text = String(value || '').replace(/\s+/g,' ').trim(); return text ? text.slice(0,max) : null;
}
function nextAction(status: FinancingSimulationStatus,outcome: string|null,ready: boolean) {
  if (status === 'collecting_data') return 'Continuar a qualificação sem repetir dados já informados.';
  if (status === 'ready_to_submit') return 'Aguardar o envio humano da simulação para análise.';
  if (status === 'waiting_result') return 'Aguardar resultado real; não prometer aprovação nem condições.';
  if (status === 'result_available') {
    if (!ready) return 'Manter o resultado bloqueado até existir origem verificável.';
    return ['preapproved','approved'].includes(String(outcome))
      ? 'Comunicar somente fatos verificados conforme treinamento publicado e conduzir para agendamento.'
      : 'Comunicar o resultado de forma neutra, sem aplicar estratégia de pré-aprovação.';
  }
  if (status === 'communicated') return 'Conduzir para agendamento usando disponibilidade oficial.';
  if (status === 'scheduling') return 'Continuar o agendamento sem inventar horários.';
  return 'Nenhuma ação automática.';
}

export function buildAutocarFinancingProjectionV1(input: { simulation: Record<string,unknown>|null; customerDataReady:boolean }) {
  const simulation = input.simulation;
  if (!simulation || !isFinancingSimulationStatus(simulation.status)) return null;
  const status = simulation.status;
  const outcome = textOrNull(simulation.outcome,80);
  const source = textOrNull(simulation.result_source,80);
  const receivedAt = textOrNull(simulation.result_received_at,80);
  const showResult = visible.has(status)
    && Boolean(outcome && isFinancingSimulationOutcome(outcome))
    && Boolean(source && isFinancingSimulationResultSource(source))
    && Boolean(receivedAt);
  const indicator = numberOrNull(simulation.approval_indicator_percent);
  const indicatorSource = textOrNull(simulation.approval_indicator_source,200);
  const result = showResult ? {
    outcome: outcome as string,
    source: source as string,
    source_recorded: true as const,
    financing_bank: textOrNull(simulation.financing_bank,160),
    banks_consulted_count: numberOrNull(simulation.banks_consulted_count),
    preapproved_count: numberOrNull(simulation.preapproved_count),
    approval_indicator_percent: indicator !== null && indicatorSource ? indicator : null,
    approval_indicator_source: indicator !== null && indicatorSource ? indicatorSource : null,
    approved_amount: numberOrNull(simulation.approved_amount),
    approved_installment_count: numberOrNull(simulation.approved_installment_count),
    approved_installment_value: numberOrNull(simulation.approved_installment_value),
    received_at: receivedAt as string
  } : null;
  const ready = Boolean(result);
  return {
    version: AUTOCAR_FINANCING_PROJECTION_VERSION,
    simulation_id: String(simulation.id || ''),
    status,
    vehicle: { id:textOrNull(simulation.interested_vehicle_id,80), name:textOrNull(simulation.vehicle_name_snapshot,300) },
    customer_data_ready: Boolean(input.customerDataReady),
    request: {
      without_down_payment: typeof simulation.requested_without_down_payment === 'boolean' ? simulation.requested_without_down_payment : null,
      down_payment_value:numberOrNull(simulation.requested_down_payment_value),
      installment_count:numberOrNull(simulation.requested_installment_count),
      desired_installment_value:numberOrNull(simulation.requested_installment_value),
      financed_amount:numberOrNull(simulation.requested_financed_amount)
    },
    result,
    next_safe_action: nextAction(status,outcome,ready),
    result_ready_for_governed_communication: ready
  };
}

export async function loadAutocarFinancingProjectionV1(input: { productionSupabase:any; storeId:string; leadId:string|null|undefined }) {
  if (!input.leadId) return { available:true,projection:null,reason:'lead_unavailable' as const };
  const [simulationResult,commercialResult] = await Promise.all([
    input.productionSupabase.from('lead_financing_simulations')
      .select('id,store_id,lead_id,interested_vehicle_id,vehicle_name_snapshot,status,outcome,requested_without_down_payment,requested_down_payment_value,requested_installment_count,requested_installment_value,requested_financed_amount,financing_bank,banks_consulted_count,preapproved_count,approval_indicator_percent,approval_indicator_source,approved_amount,approved_installment_count,approved_installment_value,result_source,result_received_at,created_at')
      .eq('store_id',input.storeId).eq('lead_id',input.leadId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    input.productionSupabase.from('lead_commercial_details').select('has_driver_license,cpf,birth_date')
      .eq('store_id',input.storeId).eq('lead_id',input.leadId).maybeSingle()
  ]);
  if (simulationResult.error) {
    if (isMissingFinancingSimulationSchema(simulationResult.error)) return { available:false,projection:null,reason:'schema_not_applied' as const };
    throw simulationResult.error;
  }
  if (commercialResult.error) throw commercialResult.error;
  const commercial = commercialResult.data;
  const customerDataReady = Boolean(commercial && typeof commercial.has_driver_license === 'boolean'
    && String(commercial.cpf || '').replace(/\D/g,'').length === 11 && commercial.birth_date);
  return {
    available:true,
    projection:buildAutocarFinancingProjectionV1({simulation:simulationResult.data || null,customerDataReady}),
    reason:simulationResult.data ? 'loaded' as const : 'not_started' as const
  };
}
