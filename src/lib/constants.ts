export const appName = 'AUTO CONTROLE AUTOMOTIVO';

export const vehicleCategories = [
  { value: 'hatch', label: 'Hatch' },
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'pickup', label: 'Picape' },
  { value: 'motorcycle', label: 'Moto' },
  { value: 'other', label: 'Outro' },
  { value: 'undefined', label: 'Indefinido' }
];

export const banks = [
  'Bradesco',
  'Itaú',
  'Santander',
  'Caixa',
  'Banco do Brasil',
  'Nubank',
  'Outro'
];

export const leadStatusLabels: Record<string, string> = {
  new_lead: 'Novo Lead',
  in_service: 'Em Atendimento',
  scheduled: 'Agendado',
  showed_up: 'Compareceu',
  no_show: 'Não Compareceu',
  sale_confirmed: 'Venda Confirmada',
  lost: 'Perda',
  survey_without_phone: 'Pesquisa sem telefone'
};

export const lossReasons = [
  { value: 'no_credit_approval', label: 'Cliente sem aprovação' },
  { value: 'customer_did_not_reply', label: 'Cliente não respondeu' },
  { value: 'bought_elsewhere', label: 'Cliente comprou em outra loja' },
  { value: 'no_down_payment', label: 'Cliente sem entrada' },
  { value: 'customer_gave_up', label: 'Cliente desistiu' },
  { value: 'vehicle_mismatch', label: 'Veículo incompatível' },
  { value: 'interest_rate_issue', label: 'Taxa não agradou' },
  { value: 'installment_too_high', label: 'Parcela não coube' },
  { value: 'no_show', label: 'Não compareceu' },
  { value: 'other', label: 'Outro motivo' }
];
