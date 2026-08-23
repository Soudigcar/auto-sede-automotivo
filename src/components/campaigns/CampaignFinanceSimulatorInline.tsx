'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, MessageCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { CampaignVehicleGallery } from '@/components/campaigns/CampaignVehicleGallery';
import { calculateCampaignFinance, campaignInstallmentOptions } from '@/lib/campaignFinance';

type Props = {
  campaign: any;
  eventInfo?: any;
  vehicles: any[];
  initialVehicleId?: string;
  primaryColor?: string;
  cardRadius?: number;
  stacked?: boolean;
  backgroundColor?: string;
  summaryBackgroundColor?: string;
};

function money(value: number) { return `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function digits(value: string) { return String(value || '').replace(/\D/g, ''); }
function maskPhone(value: string) { const clean = digits(value).slice(0, 11); if (clean.length <= 10) return clean.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2'); return clean.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2'); }
function maskCpf(value: string) { return digits(value).slice(0, 11).replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4'); }
function emptyForm(initialVehicleId = '') { return { name: '', phone: '', cpf: '', birth_date: '', email: '', vehicle_id: initialVehicleId, down_payment: '', installments: '60', consent: false }; }

export function CampaignFinanceSimulatorInline({ campaign, eventInfo, vehicles, initialVehicleId = '', primaryColor, cardRadius = 30, stacked = false, backgroundColor = '#FFFFFF', summaryBackgroundColor = '#020617' }: Props) {
  const primary = primaryColor || campaign?.primary_color || '#DC2626';
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(() => emptyForm(initialVehicleId));

  useEffect(() => {
    setSubmitted(false);
    setMessage('');
    setForm((current) => ({ ...current, vehicle_id: initialVehicleId || current.vehicle_id || '', down_payment: initialVehicleId && initialVehicleId !== current.vehicle_id ? '' : current.down_payment }));
  }, [initialVehicleId]);

  const selectedVehicle = useMemo(() => vehicles.find((item) => item.id === form.vehicle_id) || null, [vehicles, form.vehicle_id]);
  const hasDownPayment = form.down_payment.trim() !== '' && Number.isFinite(Number(form.down_payment));
  const simulation = useMemo(() => calculateCampaignFinance({ vehiclePrice: selectedVehicle?.price, downPayment: hasDownPayment ? form.down_payment : 0, installments: form.installments, monthlyRatePercent: campaign?.interest_rate || 1.89 }), [selectedVehicle, hasDownPayment, form.down_payment, form.installments, campaign]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedVehicle || !hasDownPayment || !form.name || !form.phone || !form.cpf || !form.birth_date || !form.email || !form.consent) {
      setMessage('Preencha todos os campos obrigatórios para continuar.');
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

  const inputClass = 'premium-input mt-1 !rounded-xl !px-3 !py-2 !text-[11px] !leading-4';
  const fieldClass = 'text-[9px] font-bold leading-none text-slate-700';

  const header = <header className="px-1 pb-2 pt-0.5">
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-emerald-700"><ShieldCheck size={12} /> Simulação inicial segura</span>
    <h2 className="mt-2 text-xl font-black tracking-tight">Faça sua simulação inicial</h2>
    <p className="mt-0.5 text-[10px] font-semibold text-slate-500">Taxa referencial de {Number(campaign?.interest_rate || 1.89).toLocaleString('pt-BR')}% ao mês.</p>
  </header>;

  const fields = <div className="grid gap-x-2 gap-y-1.5 sm:grid-cols-2">
    <label className={`${fieldClass} sm:col-span-2`}>Nome completo<input className={inputClass} placeholder="Nome completo" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
    <label className={fieldClass}>WhatsApp<input className={inputClass} placeholder="WhatsApp" value={form.phone} onChange={(event) => setForm({ ...form, phone: maskPhone(event.target.value) })} required /></label>
    <label className={fieldClass}>CPF<input className={inputClass} placeholder="CPF" value={form.cpf} onChange={(event) => setForm({ ...form, cpf: maskCpf(event.target.value) })} required /></label>
    <label className={fieldClass}>Data de nascimento<input className={inputClass} type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} required /></label>
    <label className={fieldClass}>E-mail<input className={inputClass} type="email" placeholder="E-mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
    <select className="premium-input sm:col-span-2 !rounded-xl !px-3 !py-2 !text-[11px] !leading-4" value={form.vehicle_id} onChange={(event) => setForm({ ...form, vehicle_id: event.target.value, down_payment: '' })} required><option value="">Selecione o veículo</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.brand} {vehicle.model} {vehicle.year || ''} — {money(vehicle.price)}</option>)}</select>
    <input className="premium-input !rounded-xl !px-3 !py-2 !text-[11px] !leading-4" type="number" inputMode="decimal" min="0" step="0.01" max={selectedVehicle?.price || undefined} placeholder="Digite o valor da entrada" value={form.down_payment} onChange={(event) => setForm({ ...form, down_payment: event.target.value })} required />
    <select className="premium-input !rounded-xl !px-3 !py-2 !text-[11px] !leading-4" value={form.installments} onChange={(event) => setForm({ ...form, installments: event.target.value })}>{campaignInstallmentOptions.map((value) => <option key={value} value={value}>{value} parcelas</option>)}</select>
    <label className="sm:col-span-2 flex items-start gap-2 rounded-xl bg-slate-50 p-2.5 text-[9px] font-semibold leading-4 text-slate-500"><input className="mt-0.5" type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} required />Autorizo o contato comercial da Auto Sede e de uma das lojas participantes do evento.</label>
  </div>;

  const summary = <aside className="self-start rounded-[20px] p-3 text-white" style={{ backgroundColor: summaryBackgroundColor }}>
    <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-400">Resumo</p>
    {selectedVehicle ? <><div className="mt-2"><CampaignVehicleGallery vehicle={selectedVehicle} compact /></div><h3 className="mt-2 text-sm font-black">{selectedVehicle.brand} {selectedVehicle.model}</h3><p className="mt-0.5 text-[9px] text-slate-400">{selectedVehicle.version || selectedVehicle.year || eventInfo?.name || 'Veículo selecionado'}</p></> : <p className="mt-2 text-[10px] leading-4 text-slate-400">Selecione um veículo para visualizar as fotos e calcular.</p>}
    <div className="mt-3 space-y-1.5 text-[10px]"><p className="flex justify-between gap-3"><span className="text-slate-400">Veículo</span><strong>{selectedVehicle ? money(simulation.vehiclePrice) : '—'}</strong></p><p className="flex justify-between gap-3"><span className="text-slate-400">Entrada</span><strong>{hasDownPayment ? money(simulation.downPayment) : '—'}</strong></p><p className="flex justify-between gap-3"><span className="text-slate-400">Financiado</span><strong>{hasDownPayment ? money(simulation.financedAmount) : '—'}</strong></p></div>
    <div className="mt-3 rounded-xl bg-white/10 p-3"><p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">Parcela estimada</p>{hasDownPayment ? <><strong className="mt-1 block text-xl font-black">{money(simulation.estimatedInstallment)}</strong><p className="mt-0.5 text-[9px] text-slate-400">em {simulation.installments}x • taxa referencial</p></> : <p className="mt-1 text-[10px] font-bold leading-4 text-white">Informe o valor da entrada para calcular.</p>}</div>
    <button type="submit" disabled={!selectedVehicle || !hasDownPayment} className="mt-3 min-h-10 w-full rounded-xl text-[11px] font-black text-white disabled:opacity-50" style={{ backgroundColor: primary }}>Simular agora</button>
    {message ? <p className="mt-2 rounded-xl bg-red-500/15 p-2 text-[9px] font-bold text-red-200">{message}</p> : null}
  </aside>;

  return <section className="border border-white/15 text-slate-950 shadow-2xl" style={{ borderRadius: cardRadius, backgroundColor }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
    {submitted ? <div className="p-5 text-center"><CheckCircle2 size={42} className="mx-auto text-emerald-500" /><h3 className="mt-3 text-xl font-black">Parabéns, {form.name.trim()}! Simulação recebida.</h3><p className="mx-auto mt-2 max-w-xl text-xs text-slate-500">Seu CPF apresenta uma estimativa inicial de 80% de chance de aprovação. O resultado final depende da análise da instituição financeira. Um dos nossos representantes entrará em contato com você.</p><span className="mx-auto mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-black text-white shadow-lg"><MessageCircle size={17} /> ANTECIPAR ATENDIMENTO</span><button type="button" onClick={restart} className="mt-4 inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-[10px] font-black text-slate-700"><RotateCcw size={14} /> Simular novamente</button></div> :
      <form onSubmit={submit} className="grid gap-3 p-3" style={{ gridTemplateColumns: stacked ? '1fr' : 'minmax(0,1fr) minmax(205px,32%)' }}>
        <div className="min-w-0">{header}<div className="mt-1.5">{fields}</div></div>
        {summary}
      </form>}
  </section>;
}
