'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ShieldCheck, X } from 'lucide-react';

type SimulatorMode = 'live' | 'preview';

type CampaignSimulatorCardProps = {
  campaign: any;
  vehicles: any[];
  primaryColor?: string;
  onOpen: () => void;
  cardRadius?: number;
  buttonRadius?: number;
  buttonTextColor?: string;
};

type CampaignFinanceSimulatorModalProps = {
  campaign: any;
  eventInfo?: any;
  vehicles: any[];
  open: boolean;
  onClose: () => void;
  initialVehicleId?: string;
  mode?: SimulatorMode;
  primaryColor?: string;
  slug?: string;
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

export function CampaignSimulatorCard({
  campaign,
  vehicles,
  primaryColor,
  onOpen,
  cardRadius = 34,
  buttonRadius = 16,
  buttonTextColor = '#FFFFFF'
}: CampaignSimulatorCardProps) {
  const primary = primaryColor || campaign?.primary_color || '#DC2626';

  return (
    <aside
      className="rounded-[34px] border border-white/15 bg-white/10 p-3 shadow-2xl backdrop-blur"
      style={{ borderRadius: cardRadius }}
    >
      <div
        className="bg-white p-6 text-slate-950"
        style={{ borderRadius: Math.max(8, cardRadius - 6) }}
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
          <ShieldCheck size={15} /> Simulação inicial segura
        </span>
        <h2 className="mt-5 text-3xl font-black">Financiamento automotivo</h2>
        <p className="mt-2 text-sm text-slate-500">
          Taxa referencial de {Number(campaign?.interest_rate || 1.89).toLocaleString('pt-BR')}% ao mês.
        </p>
        <div className="mt-6 rounded-3xl bg-slate-100 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Estoque conectado</p>
          <strong className="mt-2 block text-4xl font-black">{vehicles.length}</strong>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            veículo(s) das lojas participantes disponíveis nesta landing.
          </p>
        </div>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="mt-5 min-h-12 w-full text-sm font-black shadow-lg"
          style={{ backgroundColor: primary, color: buttonTextColor, borderRadius: buttonRadius }}
        >
          {campaign?.cta_label || 'Começar simulação'}
        </button>
      </div>
    </aside>
  );
}

export function CampaignFinanceSimulatorModal({
  campaign,
  eventInfo,
  vehicles,
  open,
  onClose,
  initialVehicleId = '',
  mode = 'live',
  primaryColor,
  slug = ''
}: CampaignFinanceSimulatorModalProps) {
  const primary = primaryColor || campaign?.primary_color || '#DC2626';
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    cpf: '',
    email: '',
    vehicle_id: initialVehicleId,
    down_payment: '',
    installments: '60',
    consent: false
  });

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setMessage('');
    setForm((current) => ({
      ...current,
      vehicle_id: initialVehicleId || current.vehicle_id || '',
      down_payment: initialVehicleId && initialVehicleId !== current.vehicle_id ? '' : current.down_payment
    }));
  }, [open, initialVehicleId]);

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
    const estimatedInstallment =
      financedAmount > 0 && monthlyRate > 0
        ? (financedAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -installments))
        : installments > 0
          ? financedAmount / installments
          : 0;
    return { vehiclePrice, downPayment, financedAmount, installments, estimatedInstallment };
  }, [selectedVehicle, form.down_payment, form.installments, campaign]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVehicle || !form.name || !form.phone || !form.cpf || !form.email || !form.consent) {
      setMessage('Preencha todos os campos obrigatórios para continuar.');
      return;
    }

    if (mode === 'preview') {
      setSubmitted(true);
      setMessage('');
      return;
    }

    if (!campaign) return;
    setSending(true);
    setMessage('');

    try {
      const vehicleName = `${selectedVehicle.brand || ''} ${selectedVehicle.model || ''} ${selectedVehicle.version || ''} ${selectedVehicle.year || ''}`
        .replace(/\s+/g, ' ')
        .trim();
      const response = await fetch('/api/site-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          cpf: form.cpf,
          email: form.email,
          source: 'Landing Page Simulador',
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          vehicle_id: selectedVehicle.id,
          vehicle_name: vehicleName,
          vehicle_price: simulation.vehiclePrice,
          down_payment: simulation.downPayment,
          financed_amount: simulation.financedAmount,
          installments: simulation.installments,
          estimated_installment: simulation.estimatedInstallment,
          interest_rate: Number(campaign.interest_rate || 1.89),
          notes: 'Lead captado pela landing vinculada ao evento.',
          metadata: { slug, event_id: eventInfo?.id || null }
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar sua simulação.');
      setSubmitted(true);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível enviar sua simulação.');
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[30px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: primary }}>
              Simulador do evento
            </p>
            <h2 className="mt-1 text-2xl font-black">Faça sua simulação inicial</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100"
            aria-label="Fechar simulador"
          >
            <X size={20} />
          </button>
        </div>

        {mode === 'preview' ? (
          <div className="mx-5 mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-xs font-bold text-indigo-700 sm:mx-6">
            Modo Preview: os campos, máscaras, cálculo e fluxo são os mesmos da landing oficial, mas nenhum lead será enviado.
          </div>
        ) : null}

        {submitted ? (
          <div className="p-8 text-center sm:p-12">
            <CheckCircle2 size={58} className="mx-auto text-emerald-500" />
            <h3 className="mt-5 text-3xl font-black">
              {mode === 'preview' ? 'Simulação testada' : 'Simulação enviada'}
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-slate-500">
              {mode === 'preview'
                ? 'O cálculo e a experiência foram validados em modo Preview. Nenhum contato foi criado.'
                : `Seu interesse foi encaminhado para ${selectedVehicle?.store_name || 'a loja responsável pelo veículo'}.`}
            </p>
            {mode === 'live' && digits(campaign?.whatsapp_number || '') ? (
              <a
                href={`https://wa.me/${digits(campaign.whatsapp_number)}?text=${encodeURIComponent('Olá, fiz uma simulação na landing do evento e quero antecipar meu atendimento.')}`}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex rounded-2xl bg-emerald-600 px-6 py-4 text-sm font-black text-white"
              >
                Chamar no WhatsApp
              </a>
            ) : null}
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_360px]">
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="premium-input sm:col-span-2" placeholder="Nome completo" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              <input className="premium-input" placeholder="WhatsApp" value={form.phone} onChange={(event) => setForm({ ...form, phone: maskPhone(event.target.value) })} required />
              <input className="premium-input" placeholder="CPF" value={form.cpf} onChange={(event) => setForm({ ...form, cpf: maskCpf(event.target.value) })} required />
              <input className="premium-input sm:col-span-2" type="email" placeholder="E-mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              <select className="premium-input sm:col-span-2" value={form.vehicle_id} onChange={(event) => setForm({ ...form, vehicle_id: event.target.value, down_payment: '' })} required>
                <option value="">Selecione o veículo</option>
                {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.brand} {vehicle.model} {vehicle.year || ''} — {money(vehicle.price)}</option>)}
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

            <aside className="rounded-[26px] bg-slate-950 p-5 text-white">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Resumo</p>
              {selectedVehicle ? <><h3 className="mt-3 text-xl font-black">{selectedVehicle.brand} {selectedVehicle.model}</h3><p className="mt-1 text-xs text-slate-400">{selectedVehicle.store_name}</p></> : <p className="mt-3 text-sm text-slate-400">Selecione um veículo para calcular.</p>}
              <div className="mt-5 space-y-3 text-sm">
                <p className="flex justify-between gap-4"><span className="text-slate-400">Veículo</span><strong>{money(simulation.vehiclePrice)}</strong></p>
                <p className="flex justify-between gap-4"><span className="text-slate-400">Entrada</span><strong>{money(simulation.downPayment)}</strong></p>
                <p className="flex justify-between gap-4"><span className="text-slate-400">Financiado</span><strong>{money(simulation.financedAmount)}</strong></p>
              </div>
              <div className="mt-5 rounded-2xl bg-white/10 p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Parcela estimada</p><strong className="mt-2 block text-3xl font-black">{money(simulation.estimatedInstallment)}</strong><p className="mt-1 text-xs text-slate-400">em {simulation.installments}x • taxa referencial</p></div>
              <button type="submit" disabled={sending || !selectedVehicle} className="mt-5 min-h-12 w-full rounded-2xl text-sm font-black text-white disabled:opacity-50" style={{ backgroundColor: primary }}>
                {sending ? 'Enviando...' : mode === 'preview' ? 'Testar simulação' : 'Enviar simulação'}
              </button>
              {message ? <p className="mt-3 rounded-xl bg-red-500/15 p-3 text-xs font-bold text-red-200">{message}</p> : null}
            </aside>
          </form>
        )}
      </div>
    </div>
  );
}
