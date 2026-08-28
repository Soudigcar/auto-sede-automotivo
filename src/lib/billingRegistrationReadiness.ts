export type BillingRegistrationDraft = {
  legalName: unknown;
  cnpj: unknown;
  financialEmail: unknown;
  financialPhone: unknown;
};

export type BillingRegistrationReadinessInput = BillingRegistrationDraft & {
  storeStatus: unknown;
  activeSystemUsers: unknown;
};

export type BillingRegistrationCheck = {
  key: 'store' | 'legal_name' | 'cnpj' | 'financial_email' | 'financial_phone';
  label: string;
  valid: boolean;
  message: string;
};

export type BillingRegistrationReadiness = {
  status: 'incomplete' | 'ready_for_activation';
  ready: boolean;
  normalized: {
    legal_name: string;
    cnpj: string;
    financial_email: string;
    financial_phone: string;
  };
  checklist: BillingRegistrationCheck[];
};

function clean(value: unknown, limit: number) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function cnpjCheckDigit(base: string, weights: number[]) {
  const total = base
    .split('')
    .reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: unknown) {
  const normalized = digits(value);
  if (!/^\d{14}$/.test(normalized) || /^(\d)\1{13}$/.test(normalized)) return false;

  const first = cnpjCheckDigit(normalized.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = cnpjCheckDigit(`${normalized.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return normalized.endsWith(`${first}${second}`);
}

export function formatCnpj(value: unknown) {
  const normalized = digits(value).slice(0, 14);
  if (normalized.length !== 14) return normalized;
  return normalized.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function normalizeBillingPhone(value: unknown) {
  let normalized = digits(value);
  if ((normalized.length === 12 || normalized.length === 13) && normalized.startsWith('55')) {
    normalized = normalized.slice(2);
  }
  return normalized.slice(0, 11);
}

export function isValidBillingPhone(value: unknown) {
  const normalized = normalizeBillingPhone(value);
  return /^(?:[1-9]{2})(?:9\d{8}|[2-8]\d{7})$/.test(normalized)
    && !/^(\d)\1+$/.test(normalized);
}

export function formatBillingPhone(value: unknown) {
  const normalized = normalizeBillingPhone(value);
  if (normalized.length === 11) {
    return normalized.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  }
  if (normalized.length === 10) {
    return normalized.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  }
  return normalized;
}

export function isValidBillingEmail(value: unknown) {
  const normalized = clean(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  return !/(?:\.invalid|\.local|\.localhost)$/i.test(normalized.split('@')[1] || '');
}

export function evaluateBillingRegistrationReadiness(
  input: BillingRegistrationReadinessInput
): BillingRegistrationReadiness {
  const legalName = clean(input.legalName, 180);
  const formattedCnpj = formatCnpj(input.cnpj);
  const financialEmail = clean(input.financialEmail, 254).toLowerCase();
  const financialPhone = formatBillingPhone(input.financialPhone);
  const storeReady = String(input.storeStatus || '').trim().toLowerCase() === 'active'
    && Number(input.activeSystemUsers || 0) > 0;

  const checklist: BillingRegistrationCheck[] = [
    {
      key: 'store',
      label: 'Loja com acesso SaaS identificado',
      valid: storeReady,
      message: storeReady
        ? 'Loja ativa com pelo menos um usuário ativo.'
        : 'A futura ativação exige loja e usuário ativos.'
    },
    {
      key: 'legal_name',
      label: 'Razão social',
      valid: legalName.length >= 3,
      message: legalName.length >= 3 ? 'Razão social informada.' : 'Informe a razão social completa.'
    },
    {
      key: 'cnpj',
      label: 'CNPJ válido',
      valid: isValidCnpj(input.cnpj),
      message: isValidCnpj(input.cnpj) ? 'Dígitos verificadores válidos.' : 'Informe um CNPJ válido.'
    },
    {
      key: 'financial_email',
      label: 'E-mail financeiro',
      valid: isValidBillingEmail(financialEmail),
      message: isValidBillingEmail(financialEmail)
        ? 'E-mail financeiro válido.'
        : 'Informe um e-mail financeiro válido e não reservado.'
    },
    {
      key: 'financial_phone',
      label: 'Telefone financeiro',
      valid: isValidBillingPhone(input.financialPhone),
      message: isValidBillingPhone(input.financialPhone)
        ? 'Telefone brasileiro válido.'
        : 'Informe DDD e telefone válidos.'
    }
  ];
  const ready = checklist.every((item) => item.valid);

  return {
    status: ready ? 'ready_for_activation' : 'incomplete',
    ready,
    normalized: {
      legal_name: legalName,
      cnpj: formattedCnpj,
      financial_email: financialEmail,
      financial_phone: financialPhone
    },
    checklist
  };
}
