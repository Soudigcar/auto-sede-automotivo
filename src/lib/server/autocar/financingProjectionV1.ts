import {
  isFinancingSimulationOutcome,
  isFinancingSimulationResultSource,
  isFinancingSimulationStatus,
  isMissingFinancingSimulationSchema,
  type FinancingSimulationStatus
} from '../../financingSimulationV1';

export const AUTOCAR_FINANCING_PROJECTION_VERSION = 'autocar-financing-projection-v1';

const resultVisibleStatuses = new Set<FinancingSimulationStatus>([
  'result_available',
  'communicated',
  'scheduling',
  'completed'
]);

export type AutocarFinancingProjectionV1 = {
  version: typeof AUTOCAR_FINANCING_PROJECTION_VERSION;
  simulation_id: string;
  status: FinancingSimulationStatus;
  vehicle: { id: string | null; name: string | null };
  customer_data_ready: boolean;
  request: {
    without_down_payment: boolean | null;
    down_payment_value: number | null;
    installment_count: number | null;
    desired_installment_value: number | null;
    financed_amount: number | null;
  };
  result: null | {
    outcome: string;
    source: string;
    source_recorded: true;
    financing_bank: string | null;
    banks_consulted_count: number | null;
    preapproved_count: number | null;
    approval_indicator_percent: number | null;
    approval_indicator_source: string | null;
    approved_amount: number | null;
    approved_installment_count: number | null;
    approved_installment_value: number | null;
    received_at: string;
  };
  next_safe_action: string;
  result_ready_for_governed_communication: boolean;
};

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableText(value: unknown, max = 300) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function safeNextAction(status: FinancingSimulationStatus, outcome: string | null, resultReady: boolean) {
  if (status === 'collecting_data') return 'Continuar a qualificação sem repetir dados já informados.';
  if (status === 'ready_to_submit') return 'Aguardar o envio humano da simulação para análise.';
  if (status === 'waiting_result') return 'Aguardar um resultado real registrado; não prometer aprovação nem condições.';
  if (status === 'result_available') {
    if (!resultReady) return 'Manter o resultado bloqueado até existir origem e dados verificáveis.';
    if (outcome === 'preapproved' || outcome === 'approved') {
      return 'Comunicar apenas os fatos verificados seguindo treinamento publicado e depois conduzir para agendamento.';
    }
    return 'Comunicar o resultado de forma neutra e seguir o próximo passo comercial seguro, sem aplicar a estratégia de pré-aprovação.';
  }
  if (status === 'communicated') return 'Conduzir para agendamento usando somente disponibilidade oficial.';
  if (status === 'scheduling') return 'Continuar o agendamento sem inventar horários.';
  if (status === 'completed') return 'Nenhuma ação automática; jornada concluída.';
  return 'Nenhuma ação automática; jornada encerrada.';
}

export function buildAutocarFinancingProjectionV1(input: {
  simulation: Record<string, unknown> | null;
  customerDataReady: boolean;
}): AutocarFinancingProjectionV1 | null {
  const simulation = input.simulation;
  if (!simulation || !isFinancingSimulationStatus(simulation.status)) return null;

  const status = simulation.status;
  const outcome = nullableText(simulation.outcome, 80);
  const resultSource = nullableText(simulation.result_source, 80);
  const receivedAt = nullableText(simulation.result_received_at, 80);
  const resultCanBeShown = resultVisibleStatuses.has(status)
    && Boolean(outcome && isFinancingSimulationOutcome(outcome))
    && Boolean(resultSource && isFinancingSimulationResultSource(resultSource))
    && Boolean(receivedAt);

  const indicator = nullableNumber(simulation.approval_indicator_percent);
  const indicatorSource = nullableText(simulation.approval_indicator_source, 200);
  const result = resultCanBeShown ? {
    outcome: outcome as string,
    source: resultSource as string,
    source_recorded: true as const,
    financing_bank: nullableText(simulation.financing_bank, 160),
    banks_consulted_count: nullableNumber(simulation.banks_consulted_count),
    preapproved_count: nullableNumber(simulation.preapproved_count),
    approval_indicator_percent: indicator !== null && indicatorSource ? indicator : null,
    approval_indicator_source: indicator !== null && indicatorSource ? indicatorSource : null,
    approved_amount: nullableNumber(simulation.approved_amount),
    approved_installment_count: nullableNumber(simulation.approved_installment_count),
    approved_installment_value: nullableNumber(simulation.approved_installment_value),
    received_at: receivedAt as string
  } : null;

  const resultReady = Boolean(result && ['preapproved', 'approved', 'declined', 'needs_review', 'no_offer'].includes(result.outcome));
  return {
    version: AUTOCAR_FINANCING_PROJECTION_VERSION,
    simulation_id: String(simulation.id || ''),
    status,
    vehicle: {
      id: nullableText(simulation.interested_vehicle_id, 80),
      name: nullableText(simulation.vehicle_name_snapshot, 300)
    },
    customer_data_ready: Boolean(input.customerDataReady),
    request: {
      without_down_payment: typeof simulation.requested_without_down_payment === 'boolean'
        ? simulation.requested_without_down_payment
        : null,
      down_payment_value: nullableNumber(simulation.requested_down_payment_value),
      installment_count: nullableNumber(simulation.requested_installment_count),
      desired_installment_value: nullableNumber(simulation.requested_installment_value),
      financed_amount: nullableNumber(simulation.requested_financed_amount)
    },
    result,
    next_safe_action: safeNextAction(status, outcome, resultReady),
    result_ready_for_governed_communication: resultReady
  };
}

export async function loadAutocarFinancingProjectionV1(input: {
  productionSupabase: any;
  storeId: string;
  leadId: string | null | undefined;
}) {
  if (!input.leadId) return { available: true, projection: null, reason: 'lead_unavailable' as const };

  const [simulationResult, commercialResult] = await Promise.all([
    input.productionSupabase
      .from('lead_financing_simulations')
      .select([
        'id', 'store_id', 'lead_id', 'interested_vehicle_id', 'vehicle_name_snapshot', 'status', 'outcome',
        'requested_without_down_payment', 'requested_down_payment_value', 'requested_installment_count',
        'requested_installment_value', 'requested_financed_amount', 'financing_bank', 'banks_consulted_count',
        'preapproved_count', 'approval_indicator_percent', 'approval_indicator_source', 'approved_amount',
        'approved_installment_count', 'approved_installment_value', 'result_source', 'result_received_at',
        'created_at'
      ].join(','))
      .eq('store_id', input.storeId)
      .eq('lead_id', input.leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    input.productionSupabase
      .from('lead_commercial_details')
      .select('has_driver_license,cpf,birth_date')
      .eq('store_id', input.storeId)
      .eq('lead_id', input.leadId)
      .maybeSingle()
  ]);

  if (simulationResult.error) {
    if (isMissingFinancingSimulationSchema(simulationResult.error)) {
      return { available: false, projection: null, reason: 'schema_not_applied' as const };
    }
    throw simulationResult.error;
  }
  if (commercialResult.error) throw commercialResult.error;

  const commercial = commercialResult.data || null;
  const customerDataReady = Boolean(
    commercial
    && typeof commercial.has_driver_license === 'boolean'
    && String(commercial.cpf || '').replace(/\D/g, '').length === 11
    && commercial.birth_date
  );

  return {
    available: true,
    projection: buildAutocarFinancingProjectionV1({
      simulation: simulationResult.data || null,
      customerDataReady
    }),
    reason: simulationResult.data ? 'loaded' as const : 'not_started' as const
  };
}
