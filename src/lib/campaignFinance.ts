export const campaignInstallmentOptions = [12, 24, 36, 48, 60] as const;

export type CampaignFinanceCalculation = {
  vehiclePrice: number;
  downPayment: number;
  financedAmount: number;
  installments: number;
  monthlyRatePercent: number;
  estimatedInstallment: number;
  totalInstallments: number;
  totalWithDownPayment: number;
};

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function currency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCampaignFinance(input: {
  vehiclePrice: unknown;
  downPayment: unknown;
  installments: unknown;
  monthlyRatePercent: unknown;
}): CampaignFinanceCalculation {
  const vehiclePrice = Math.max(finiteNumber(input.vehiclePrice), 0);
  const downPayment = Math.min(Math.max(finiteNumber(input.downPayment), 0), vehiclePrice);
  const financedAmount = Math.max(vehiclePrice - downPayment, 0);
  const installments = Math.max(Math.trunc(finiteNumber(input.installments, 60)), 1);
  const monthlyRatePercent = Math.max(finiteNumber(input.monthlyRatePercent), 0);
  const monthlyRate = monthlyRatePercent / 100;

  const estimatedInstallment = financedAmount > 0 && monthlyRate > 0
    ? (financedAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -installments))
    : financedAmount / installments;
  const totalInstallments = estimatedInstallment * installments;

  return {
    vehiclePrice: currency(vehiclePrice),
    downPayment: currency(downPayment),
    financedAmount: currency(financedAmount),
    installments,
    monthlyRatePercent,
    estimatedInstallment: currency(estimatedInstallment),
    totalInstallments: currency(totalInstallments),
    totalWithDownPayment: currency(totalInstallments + downPayment)
  };
}
