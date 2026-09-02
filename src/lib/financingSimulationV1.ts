export const financingSimulationStatuses = ['collecting_data','ready_to_submit','waiting_result','result_available','communicated','scheduling','completed','cancelled','expired'] as const;
export type FinancingSimulationStatus = (typeof financingSimulationStatuses)[number];

export const financingSimulationOutcomes = ['preapproved','approved','declined','needs_review','no_offer'] as const;
export type FinancingSimulationOutcome = (typeof financingSimulationOutcomes)[number];

export const financingSimulationResultSources = ['manual','external_portal','bank_integration','import'] as const;
export type FinancingSimulationResultSource = (typeof financingSimulationResultSources)[number];

export const financingSimulationCommands = ['start','update_request','mark_ready','submit','record_result','mark_communicated','start_scheduling','complete','cancel','expire'] as const;
export type FinancingSimulationCommand = (typeof financingSimulationCommands)[number];

export const financingPaymentTypes = ['cash','financed','consortium','other'] as const;
export type FinancingPaymentType = (typeof financingPaymentTypes)[number];

const paymentAliases: Record<string, FinancingPaymentType> = {
  cash: 'cash', financed: 'financed', consortium: 'consortium', credit_letter: 'consortium', other: 'other'
};
const transitions: Record<FinancingSimulationStatus, FinancingSimulationStatus[]> = {
  collecting_data: ['collecting_data','ready_to_submit','cancelled','expired'],
  ready_to_submit: ['collecting_data','ready_to_submit','waiting_result','cancelled','expired'],
  waiting_result: ['waiting_result','result_available','cancelled','expired'],
  result_available: ['result_available','communicated','cancelled','expired'],
  communicated: ['communicated','scheduling','completed','cancelled','expired'],
  scheduling: ['scheduling','completed','cancelled','expired'],
  completed: ['completed'], cancelled: ['cancelled'], expired: ['expired']
};
const labels: Record<FinancingSimulationStatus,string> = {
  collecting_data:'Coletando dados', ready_to_submit:'Pronta para envio', waiting_result:'Aguardando retorno',
  result_available:'Resultado disponível', communicated:'Resultado comunicado', scheduling:'Convertendo em agendamento',
  completed:'Concluída', cancelled:'Cancelada', expired:'Expirada'
};

export function normalizeFinancingPaymentType(value: unknown): FinancingPaymentType | null {
  return paymentAliases[String(value || '').trim().toLowerCase()] || null;
}
export function financingStatusLabel(value: unknown) { return labels[String(value || '') as FinancingSimulationStatus] || 'Não iniciada'; }
export function isFinancingSimulationStatus(value: unknown): value is FinancingSimulationStatus { return financingSimulationStatuses.includes(String(value || '') as FinancingSimulationStatus); }
export function isFinancingSimulationCommand(value: unknown): value is FinancingSimulationCommand { return financingSimulationCommands.includes(String(value || '') as FinancingSimulationCommand); }
export function isFinancingSimulationOutcome(value: unknown): value is FinancingSimulationOutcome { return financingSimulationOutcomes.includes(String(value || '') as FinancingSimulationOutcome); }
export function isFinancingSimulationResultSource(value: unknown): value is FinancingSimulationResultSource { return financingSimulationResultSources.includes(String(value || '') as FinancingSimulationResultSource); }
export function canTransitionFinancingSimulation(from: unknown,to: unknown) { return isFinancingSimulationStatus(from) && isFinancingSimulationStatus(to) && transitions[from].includes(to); }
export function digitsOnly(value: unknown) { return String(value || '').replace(/\D/g,''); }

export function optionalMoney(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const normalized = typeof value === 'string' ? value.trim().replace(/\s/g,'').replace(/\./g,'').replace(',','.') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : Number.NaN;
}
export function optionalInteger(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value); return Number.isInteger(parsed) ? parsed : Number.NaN;
}

export function buildFinancingReadiness(input: {
  hasVehicle:boolean; hasDriverLicense:boolean|null; cpfDigits:string; birthDate:string|null;
  requestedWithoutDownPayment:boolean|null; requestedDownPaymentValue:number|null; requestedInstallmentCount:number|null;
}) {
  const missing: string[] = [];
  if (!input.hasVehicle) missing.push('vehicle');
  if (!(input.requestedWithoutDownPayment === true || (input.requestedWithoutDownPayment === false && Number(input.requestedDownPaymentValue) > 0))) missing.push('down_payment');
  if (!Number.isInteger(input.requestedInstallmentCount) || Number(input.requestedInstallmentCount) < 1) missing.push('installments');
  if (input.hasDriverLicense === null) missing.push('driver_license');
  if (digitsOnly(input.cpfDigits).length !== 11) missing.push('cpf');
  if (!String(input.birthDate || '').trim()) missing.push('birth_date');
  return {
    ready: missing.length === 0,
    customerDataReady: !missing.some((item) => ['driver_license','cpf','birth_date'].includes(item)),
    requestReady: !missing.some((item) => ['vehicle','down_payment','installments'].includes(item)),
    missing
  };
}

export function isMissingFinancingSimulationSchema(error: unknown) {
  const source = error && typeof error === 'object' ? error as Record<string,unknown> : {};
  const code = String(source.code || '');
  const message = `${source.message || ''} ${source.details || ''} ${source.hint || ''}`.toLowerCase();
  return ['42P01','42883','PGRST202','PGRST205'].includes(code) || message.includes('lead_financing_simulations') || message.includes('apply_lead_financing_simulation_command_v1');
}

export function financingRequestPayload(input: Record<string,unknown>) {
  const without = typeof input.requested_without_down_payment === 'boolean' ? input.requested_without_down_payment : null;
  const down = without === true ? null : optionalMoney(input.requested_down_payment_value);
  const count = optionalInteger(input.requested_installment_count);
  const desired = optionalMoney(input.requested_installment_value);
  const financed = optionalMoney(input.requested_financed_amount);
  if (down !== null && (!Number.isFinite(down) || down <= 0)) throw new Error('Informe um valor de entrada maior que zero ou marque sem entrada.');
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 120)) throw new Error('Informe uma quantidade de parcelas entre 1 e 120.');
  if (desired !== null && (!Number.isFinite(desired) || desired < 0)) throw new Error('Informe parcela desejada válida.');
  if (financed !== null && (!Number.isFinite(financed) || financed < 0)) throw new Error('Informe valor financiado válido.');
  return { requested_without_down_payment:without, requested_down_payment_value:down, requested_installment_count:count, requested_installment_value:desired, requested_financed_amount:financed };
}

export function sanitizeFinancingOperatorNotes(value: unknown) {
  return String(value || '').replace(/\u0000/g,'')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[CPF removido]')
    .replace(/\b\d{11}\b/g,'[identificador removido]')
    .replace(/\b[A-Z]{2}\d{9}\b/gi,'[documento removido]')
    .replace(/\b\d{2}[/-]\d{2}[/-]\d{4}\b/g,'[data removida]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[e-mail removido]').trim().slice(0,2000) || null;
}

export function financingResultPayload(input: Record<string,unknown>) {
  const outcome = String(input.outcome || '').trim();
  const source = String(input.result_source || '').trim();
  if (!isFinancingSimulationOutcome(outcome)) throw new Error('Selecione um resultado válido da simulação.');
  if (!isFinancingSimulationResultSource(source)) throw new Error('Selecione a origem real do resultado.');
  const banks = optionalInteger(input.banks_consulted_count);
  const preapproved = optionalInteger(input.preapproved_count);
  const indicator = optionalMoney(input.approval_indicator_percent);
  const bank = String(input.financing_bank || '').replace(/\s+/g,' ').trim().slice(0,160) || null;
  if (banks !== null && (!Number.isInteger(banks) || banks < 0 || banks > 200)) throw new Error('A quantidade de bancos consultados deve estar entre 0 e 200.');
  if (preapproved !== null && (!Number.isInteger(preapproved) || preapproved < 0)) throw new Error('A quantidade de pré-aprovações não pode ser negativa.');
  if (banks !== null && preapproved !== null && preapproved > banks) throw new Error('Pré-aprovações não podem superar bancos consultados.');
  if (indicator !== null && (!Number.isFinite(indicator) || indicator < 0 || indicator > 100)) throw new Error('O indicador de aprovação deve estar entre 0 e 100.');
  if (indicator !== null && !String(input.approval_indicator_source || '').trim()) throw new Error('Informe a origem do indicador percentual.');
  if (indicator !== null && !['preapproved','approved'].includes(outcome)) throw new Error('Indicador percentual só pode ser registrado para pré-aprovação ou aprovação.');
  if (['preapproved','approved'].includes(outcome) && !bank) throw new Error('Informe o banco responsável pela pré-aprovação ou aprovação.');
  return {
    outcome, result_source:source, financing_bank:bank, banks_consulted_count:banks, preapproved_count:preapproved,
    approval_indicator_percent:indicator,
    approval_indicator_source:String(input.approval_indicator_source || '').replace(/\s+/g,' ').trim().slice(0,200) || null,
    approved_amount:optionalMoney(input.approved_amount), approved_installment_count:optionalInteger(input.approved_installment_count),
    approved_installment_value:optionalMoney(input.approved_installment_value),
    result_reference:sanitizeFinancingOperatorNotes(input.result_reference)?.replace(/\s+/g,' ').slice(0,300) || null,
    sanitized_notes:sanitizeFinancingOperatorNotes(input.sanitized_notes)
  };
}
