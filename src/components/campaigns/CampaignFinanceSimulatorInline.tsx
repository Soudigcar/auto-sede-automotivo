'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-react';

type Props = {
  campaign: any;
  eventInfo?: any;
  vehicles: any[];
  initialVehicleId?: string;
  primaryColor?: string;
  cardRadius?: number;
  stacked?: boolean;
};

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function digits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function maskPhone(value: string) {
  const clean = digits(value).slice(0, 11);
  if (clean.length <= 10) {
    return clean.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return clean.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

function maskCpf(value: string) {
  return digits(value)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

function emptyForm(initialVehicleId = '') {
  return {
    name: '',
    phone: '',
    cpf: '',
    email: '',
    vehicle_id: initialVehicleId,
    down_payment: '',
    installments: '60',
    consent: false
  };
}

export function CampaignFinanceSimulatorInline({
  campaign,
  eventInfo,
  vehicles,
  initialVehicleId = '',
  primaryColor,
  cardRadius = 30,
  stacked = false
}: Props) {
  const primary = primaryColor || campaign?.primary_color || '#DC2626';
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(() => emptyForm(initialVehicleId));

  useEffect(() => {
    setSubmitted(false);
    setMessage('');
    setForm((current) => ({
      ...current,
      vehicle_id: initialVehicleId || current.vehicle_id || '',
      down_payment: initialVehicleId && initialVehicleId !== current.vehicle_id ? '' : current.down_payment
    }));
  }, [initialVehicleId]);

  const selectedVehicle = useMemo(
    () => vehicles.find((item) => item.id === form.vehicle_id) || null,
    [vehicles, form.vehicle_id]
  );

  const simulation = useMemo(() => {
    const vehiclePrice = Number(selectedVehicle?.price || 0);
    const downPayment = Math.max(Number(form.down_payment || 0), 0);
    const financedAmount = Math.max(vehiclePrice - downPayment, 0);
    const installments = Math.max(Number(form.installments || 60), 1);
    const monthlyRate = Math.max(Number(campaign?.interest_rate || 1.89), 0) / 100;
    const estimatedInstallment = financedAmount > 0 && monthlyRate > 0
      ? (financedAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -installments))
      : installments > 0
        ? financedAmount / installments
        : 0;
    return { vehiclePrice, downPayment, financedAmount, installments, estimatedInstallment };
  }, [selectedVehicle, form.down_payment, form.installments, campaign]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedVehicle || !form.name || !form.phone || !form.cpf || !form.email || !form.consent) {
      setMessage('Preencha todos os campos obrigatórios para testar a simulação.');
      return;
    }
    setMessage('');
    setSubmitted(true);
  }

  function restart() {
    setSubmitted(false);
    setMessage('');
    setForm(emptyForm(initialVehicleId));
  }

  return (
    <section
      className="border border-white/15 bg-white text-slate-950 shadow-2xl"
      style={{ borderRadius: cardRadius }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
              <ShieldCheck size={14} /> Simulação inicial segura
            </span>
            <h2 className="mt-3 text-2xl font-black tracking-tight">Faça sua simulação inicial</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Taxa referencial de {Number(campaign?.interest_rate || 1.89).toLocaleString('pt-BR')}% ao mês.
            </p>
          </div>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-indigo-700">
            Preview sem envio
          </span>
        </div>
      </header>

      {submitted ? (
        <div className="p-7 text-center">
          <CheckCircle2 size={50} className="mx-auto text-emerald-500" />
          <h3 className="mt-4 text-2xl font-black">Simulação testada</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            O cálculo, os campos e as máscaras foram validados. Nenhum lead ou contato foi criado.
          </p>
          <button
            type="button"
            onClick={restart}
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 text-xs font-black text-slate-700"
          >
            <RotateCcw size={15} /> Testar novamente
          </button>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="grid gap-5 p-5"
          style={{ gridTemplateColumns: stacked ? '1fr' : 'minmax(0,1fr) minmax(230px,34%)' }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="premium-input sm:col-span-2" placeholder="Nome completo" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            <input className="premium-input" placeholder="WhatsApp" value={form.phone} onChange={(event) => setForm({ ...form, phone: maskPhone(event.target.value) })} required />
            <input className="premium-input" placeholder="CPF" value={form.cpf} onChange={(event) => setForm({ ...form, cpf: maskCpf(event.target.value) })} required />
            <input className="premium-input sm:col-span-2" type="email" placeholder="E-mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            <select className="premium-input sm:col-span-2" value={form.vehicle_id} onChange={(event) => setForm({ ...form, vehicle_id: event.target.value, down_payment: '' })} required>
              <option value="">Selecione o veículo</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.brand} {vehicle.model} {vehicle.year || ''} — {money(vehicle.price)}
                </option>
              ))}
            </select>
            <input className="premium-input" type="number" min="0" max={selectedVehicle?.price || undefined} placeholder="Valor de entrada" value={form.down_payment} onChange={(event) => setForm({ ...form, down_payment: event.target.value })} required />
            <select className="premium-input" value={form.installments} onChange={(event) => setForm({ ...form, installments: event.target.value })}>
              {[12, 24, 36, 48, 60].map((value) => <option key={value} value={value}>{value} parcelas</option>)}
            </select>
            <label className="sm:col-span-2 flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-xs font-semibold text-slate-500">
              <input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} required />
              Autorizo o contato comercial da Auto Sede e da loja responsável pelo veículo selecionado.
            </label>
          </div>

          <aside className="rounded-[24px] bg-slate-950 p-5 text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Resumo</p>
            {selectedVehicle ? (
              <>
                <h3 className="mt-3 text-lg font-black">{selectedVehicle.brand} {selectedVehicle.model}</h3>
                <p className="mt-1 text-xs text-slate-400">{selectedVehicle.store_name || eventInfo?.name || 'Loja responsável'}</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">Selecione um veículo para calcular.</p>
            )}
            <div className="mt-5 space-y-3 text-sm">
              <p className="flex justify-between gap-4"><span className="text-slate-400">Veículo</span><strong>{money(simulation.vehiclePrice)}</strong></p>
              <p className="flex justify-between gap-4"><span className="text-slate-400">Entrada</span><strong>{money(simulation.downPayment)}</strong></p>
              <p className="flex justify-between gap-4"><span className="text-slate-400">Financiado</span><strong>{money(simulation.financedAmount)}</strong></p>
            </div>
            <div className="mt-5 rounded-2xl bg-white/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Parcela estimada</p>
              <strong className="mt-2 block text-2xl font-black">{money(simulation.estimatedInstallment)}</strong>
              <p className="mt-1 text-xs text-slate-400">em {simulation.installments}x • taxa referencial</p>
            </div>
            <button
              type="submit"
              disabled={!selectedVehicle}
              className="mt-5 min-h-12 w-full rounded-2xl text-sm font-black text-white disabled:opacity-50"
              style={{ backgroundColor: primary }}
            >
              Testar simulação
            </button>
            {message ? <p className="mt-3 rounded-xl bg-red-500/15 p-3 text-xs font-bold text-red-200">{message}</p> : null}
          </aside>
        </form>
      )}
    </section>
  );
}
