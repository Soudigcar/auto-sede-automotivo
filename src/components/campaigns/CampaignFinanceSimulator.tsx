'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { CampaignVehicleGallery } from '@/components/campaigns/CampaignVehicleGallery';
import { calculateCampaignFinance, campaignInstallmentOptions } from '@/lib/campaignFinance';

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

  const hasDownPayment = form.down_payment.trim() !== '' && Number.isFinite(Number(form.down_payment));

  const simulation = useMemo(() => {
    return calculateCampaignFinance({
      vehiclePrice: selectedVehicle?.price,
      downPayment: hasDownPayment ? form.down_payment : 0,
      installments: form.installments,
      monthlyRatePercent: campaign?.interest_rate || 1.89
    });
  }, [selectedVehicle, hasDownPayment, form.down_payment, form.installments, campaign]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVehicle || !hasDownPayment || !form.name || !form.phone || !form.cpf || !form.email || !form.consent) {
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
          down_payment: simulation.downPayment,
          installments: simulation.installments,
          consent: form.consent,
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
    <div className="fixed inset-0 z-[350] flex items-center justify-center overflow-x-hidden bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6">
      <div className="max-h-[94vh] min-w-0 w-full max-w-5xl overflow-x-hidden overflow-y-auto overscroll-contain rounded-[30px] bg-white shadow-2xl">
        <div className="flex min-w-0 items-center justify-between border-b border-slate-100 p-5 sm:p-6">
          <div className="min-w-0 pr-3">
            <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: primary }}>
              Simulador do evento
            </p>
            <h2 className="mt-1 break-words text-xl font-black sm:text-2xl">Faça sua simulação inicial</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100"
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
          <div className="p-5 sm:p-8">
            <div className="mx-auto max-w-3xl rounded-[28px] bg-gradient-to-br from-emerald-600 to-emerald-700 p-7 text-center text-white shadow-2xl sm:p-10">
              <CheckCircle2 size={64} className="mx-auto" />
              <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-emerald-100">Pré-análise inicial</p>
              <h3 className="mt-3 text-3xl font-black sm:text-4xl">
                Parabéns, {form.name.trim()}! Sua simulação foi recebida.
              </h3>
              <p className="mx-auto mt-4 max-w-2xl text-base font-semibold leading-relaxed text-emerald-50">
                Pelos dados informados, seu perfil avançou para a pré-análise com 80% de aprovação. O resultado final depende da análise da instituição financeira. Um dos nossos representantes entrará em contato com você.
              </p>
              {mode === 'preview' ? (
                <p className="mx-auto mt-4 max-w-xl rounded-2xl bg-white/15 p-3 text-xs font-bold text-emerald-50">
                  Modo Preview: a experiência foi testada, mas nenhum lead ou contato foi criado.
                </p>
              ) : null}
            {mode === 'live' && digits(campaign?.whatsapp_number || '') ? (
              <a
                href={`https://wa.me/${digits(campaign.whatsapp_number)}?text=${encodeURIComponent(`Olá, sou ${form.name.trim()}. Fiz uma simulação para o ${[selectedVehicle?.brand, selectedVehicle?.model, selectedVehicle?.year].filter(Boolean).join(' ')} com entrada de ${money(simulation.downPayment)} em ${simulation.installments}x e quero antecipar meu atendimento.`)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-7 inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-black text-emerald-700 shadow-xl"
              >
                <MessageCircle size={20} /> Quero antecipar meu atendimento agora
              </a>
            ) : null}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)] items-start gap-6 overflow-x-hidden p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid min-w-0 max-w-full content-start self-start gap-3 sm:grid-cols-2">
              <input className="premium-input min-w-0 max-w-full sm:col-span-2" placeholder="Nome completo" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              <input className="premium-input min-w-0 max-w-full" placeholder="WhatsApp" value={form.phone} onChange={(event) => setForm({ ...form, phone: maskPhone(event.target.value) })} required />
              <input className="premium-input min-w-0 max-w-full" placeholder="CPF" value={form.cpf} onChange={(event) => setForm({ ...form, cpf: maskCpf(event.target.value) })} required />
              <input className="premium-input min-w-0 max-w-full sm:col-span-2" type="email" placeholder="E-mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              <select className="premium-input min-w-0 max-w-full sm:col-span-2" value={form.vehicle_id} onChange={(event) => setForm({ ...form, vehicle_id: event.target.value, down_payment: '' })} required>
                <option value="">Selecione o veículo</option>
                {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.brand} {vehicle.model} {vehicle.year || ''} — {money(vehicle.price)}</option>)}
              </select>
              <input className="premium-input min-w-0 max-w-full" type="number" inputMode="decimal" min="0" step="0.01" max={selectedVehicle?.price || undefined} placeholder="Digite o valor da entrada" value={form.down_payment} onChange={(event) => setForm({ ...form, down_payment: event.target.value })} required />
              <select className="premium-input min-w-0 max-w-full" value={form.installments} onChange={(event) => setForm({ ...form, installments: event.target.value })}>
                {campaignInstallmentOptions.map((value) => <option key={value} value={value}>{value} parcelas</option>)}
              </select>
              <label className="flex min-w-0 max-w-full items-start gap-3 rounded-2xl bg-slate-50 p-4 text-xs font-semibold text-slate-500 sm:col-span-2">
                <input className="shrink-0" type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} required />
                <span className="min-w-0 break-words">Autorizo o contato comercial da Auto Sede e de uma das lojas participantes do evento.</span>
              </label>
            </div>

            <aside className="min-w-0 max-w-full overflow-hidden rounded-[26px] bg-slate-950 p-5 text-white">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Resumo</p>
              {selectedVehicle ? <div className="mt-3 min-w-0 max-w-full"><CampaignVehicleGallery vehicle={selectedVehicle} /><h3 className="mt-4 break-words text-xl font-black">{selectedVehicle.brand} {selectedVehicle.model}</h3><p className="mt-1 break-words text-xs text-slate-400">{selectedVehicle.version || selectedVehicle.year || 'Veículo selecionado'}</p></div> : <p className="mt-3 text-sm text-slate-400">Selecione um veículo para visualizar as fotos e calcular.</p>}
              <div className="mt-5 space-y-3 text-sm">
                <p className="flex justify-between gap-4"><span className="text-slate-400">Veículo</span><strong>{money(simulation.vehiclePrice)}</strong></p>
                <p className="flex justify-between gap-4"><span className="text-slate-400">Entrada</span><strong>{hasDownPayment ? money(simulation.downPayment) : '—'}</strong></p>
                <p className="flex justify-between gap-4"><span className="text-slate-400">Financiado</span><strong>{hasDownPayment ? money(simulation.financedAmount) : '—'}</strong></p>
              </div>
              <div className="mt-5 rounded-2xl bg-white/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Parcela estimada</p>
                {hasDownPayment ? <><strong className="mt-2 block text-3xl font-black">{money(simulation.estimatedInstallment)}</strong><p className="mt-1 text-xs text-slate-400">em {simulation.installments}x • taxa referencial</p><div className="mt-4 space-y-2 border-t border-white/10 pt-3 text-xs"><p className="flex justify-between gap-3"><span className="text-slate-400">Total das parcelas</span><strong>{money(simulation.totalInstallments)}</strong></p><p className="flex justify-between gap-3"><span className="text-slate-400">Total com entrada</span><strong>{money(simulation.totalWithDownPayment)}</strong></p></div></> : <p className="mt-2 text-sm font-bold text-white">Informe o valor da entrada para calcular.</p>}
              </div>
              <p className="mt-3 text-[10px] font-semibold leading-relaxed text-slate-400">Estimativa inicial. Taxa, CET, tarifas e aprovação final dependem da instituição financeira.</p>
              <button type="submit" disabled={sending || !selectedVehicle || !hasDownPayment} className="mt-5 min-h-12 w-full rounded-2xl text-sm font-black text-white disabled:opacity-50" style={{ backgroundColor: primary }}>
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
