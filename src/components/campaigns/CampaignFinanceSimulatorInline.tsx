'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, MessageCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { CampaignVehicleGallery } from '@/components/campaigns/CampaignVehicleGallery';
import { calculateCampaignFinance, campaignInstallmentOptions } from '@/lib/campaignFinance';

type SimulatorLayoutMode = 'auto' | 'desktop' | 'tablet' | 'mobile';

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
  mode?: 'preview' | 'live';
  slug?: string;
  layoutMode?: SimulatorLayoutMode;
};

function money(value: number) { return `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function digits(value: string) { return String(value || '').replace(/\D/g, ''); }
function maskPhone(value: string) { const clean = digits(value).slice(0, 11); if (clean.length <= 10) return clean.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2'); return clean.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2'); }
function maskCpf(value: string) { return digits(value).slice(0, 11).replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4'); }
function emptyForm(initialVehicleId = '') { return { name: '', phone: '', cpf: '', birth_date: '', email: '', vehicle_id: initialVehicleId, down_payment: '', installments: '60', consent: false }; }

export function CampaignFinanceSimulatorInline({ campaign, eventInfo, vehicles, initialVehicleId = '', primaryColor, cardRadius = 30, stacked = false, backgroundColor = '#FFFFFF', summaryBackgroundColor = '#020617', mode = 'preview', slug = '', layoutMode = 'auto' }: Props) {
  const primary = primaryColor || campaign?.primary_color || '#DC2626';
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(() => emptyForm(initialVehicleId));

  useEffect(() => {
    setSubmitted(false); setMessage('');
    setForm((current) => ({ ...current, vehicle_id: initialVehicleId || current.vehicle_id || '', down_payment: initialVehicleId && initialVehicleId !== current.vehicle_id ? '' : current.down_payment }));
  }, [initialVehicleId]);

  const selectedVehicle = useMemo(() => vehicles.find((item) => item.id === form.vehicle_id) || null, [vehicles, form.vehicle_id]);
  const hasDownPayment = form.down_payment.trim() !== '' && Number.isFinite(Number(form.down_payment));
  const simulation = useMemo(() => calculateCampaignFinance({ vehiclePrice: selectedVehicle?.price, downPayment: hasDownPayment ? form.down_payment : 0, installments: form.installments, monthlyRatePercent: campaign?.interest_rate || 1.89 }), [selectedVehicle, hasDownPayment, form.down_payment, form.installments, campaign]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); event.stopPropagation();
    if (!selectedVehicle || !hasDownPayment || !form.name || !form.phone || !form.cpf || !form.birth_date || !form.email || !form.consent) { setMessage('Preencha todos os campos obrigatórios para continuar.'); return; }
    if (mode === 'preview') { setMessage(''); setSubmitted(true); return; }
    setSending(true); setMessage('');
    try {
      const vehicleName = `${selectedVehicle.brand || ''} ${selectedVehicle.model || ''} ${selectedVehicle.version || ''} ${selectedVehicle.year || ''}`.replace(/\s+/g, ' ').trim();
      const response = await fetch('/api/site-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, phone: form.phone, cpf: form.cpf, birth_date: form.birth_date, email: form.email, source: 'Landing Page Simulador', campaign_id: campaign?.id, campaign_name: campaign?.name, vehicle_id: selectedVehicle.id, vehicle_name: vehicleName, down_payment: simulation.downPayment, installments: simulation.installments, consent: form.consent, notes: 'Lead captado pelo simulador inline da landing.', metadata: { slug, event_id: eventInfo?.id || null } }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar sua simulação.');
      setSubmitted(true);
    } catch (error: any) { setMessage(error?.message || 'Não foi possível enviar sua simulação.'); }
    finally { setSending(false); }
  }

  function restart() { setSubmitted(false); setMessage(''); setForm(emptyForm(initialVehicleId)); }

  const forcedMobile = layoutMode === 'mobile' || stacked;
  const forcedTablet = layoutMode === 'tablet';
  const forcedDesktop = layoutMode === 'desktop';
  const automatic = layoutMode === 'auto' && !stacked;
  const titleClass = forcedMobile ? 'text-lg' : forcedTablet ? 'text-xl' : forcedDesktop ? 'text-2xl' : 'text-lg sm:text-xl lg:text-2xl';
  const fieldGridClass = forcedMobile ? 'grid grid-cols-1 gap-2.5' : (forcedTablet || forcedDesktop) ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-1 gap-2.5 sm:grid-cols-2';
  const fullSpanClass = forcedMobile ? '' : (forcedTablet || forcedDesktop) ? 'col-span-2' : 'sm:col-span-2';
  const formLayoutClass = forcedMobile
    ? 'grid grid-cols-1 gap-4 p-4'
    : forcedTablet
      ? 'grid grid-cols-[minmax(0,1fr)_minmax(220px,38%)] gap-4 p-4'
      : forcedDesktop
        ? 'grid grid-cols-[minmax(0,1fr)_minmax(260px,32%)] gap-5 p-4'
        : 'grid grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(250px,34%)] md:gap-5';
  const mobileSubmitClass = forcedMobile
    ? 'mt-3 flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-xs font-black text-white disabled:opacity-50'
    : (forcedTablet || forcedDesktop)
      ? 'hidden'
      : 'mt-3 flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-xs font-black text-white disabled:opacity-50 md:hidden';
  const summarySubmitClass = forcedMobile
    ? 'hidden'
    : (forcedTablet || forcedDesktop)
      ? 'mt-3 min-h-10 w-full rounded-xl px-3 text-[11px] font-black text-white disabled:opacity-50'
      : 'mt-3 hidden min-h-10 w-full rounded-xl px-3 text-[11px] font-black text-white disabled:opacity-50 md:block';
  const inputClass = 'premium-input mt-1 h-10 w-full min-w-0 !rounded-xl !px-3 !py-2 !text-[11px] !leading-4';
  const fieldClass = 'min-w-0 text-[9px] font-bold leading-none text-slate-700';

  const header = <header className="pb-2">
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-emerald-700"><ShieldCheck size={11} /> Simulação inicial segura</span>
    <h2 className={`mt-2 font-black leading-[1.05] tracking-[-0.035em] text-slate-950 ${titleClass}`}>Faça sua simulação inicial</h2>
    <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">Taxa referencial de {Number(campaign?.interest_rate || 1.89).toLocaleString('pt-BR')}% ao mês.</p>
  </header>;

  const fields = <div className={fieldGridClass}>
    <label className={`${fieldClass} ${fullSpanClass}`}>Nome completo<input className={inputClass} placeholder="Nome completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
    <label className={fieldClass}>WhatsApp<input className={inputClass} placeholder="WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} required /></label>
    <label className={fieldClass}>CPF<input className={inputClass} placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} required /></label>
    <label className={fieldClass}>Data de nascimento<input className={inputClass} type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} required /></label>
    <label className={fieldClass}>E-mail<input className={inputClass} type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
    <label className={`${fieldClass} ${fullSpanClass}`}>Veículo<select className={inputClass} value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value, down_payment: '' })} required><option value="">Selecione o veículo</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.brand} {vehicle.model} {vehicle.year || ''} — {money(vehicle.price)}</option>)}</select></label>
    <label className={fieldClass}>Entrada<input className={inputClass} type="number" inputMode="decimal" min="0" step="0.01" max={selectedVehicle?.price || undefined} placeholder="Valor da entrada" value={form.down_payment} onChange={(e) => setForm({ ...form, down_payment: e.target.value })} required /></label>
    <label className={fieldClass}>Parcelas<select className={inputClass} value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })}>{campaignInstallmentOptions.map((value) => <option key={value} value={value}>{value} parcelas</option>)}</select></label>
    <label className={`${fullSpanClass} flex min-w-0 items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-[9px] font-semibold leading-[1.45] text-slate-500`}><input className="mt-0.5 h-3.5 w-3.5 shrink-0" type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} required /><span className="min-w-0">Autorizo o contato comercial da Auto Sede e de uma das lojas participantes do evento.</span></label>
  </div>;

  const mobileSubmit = <button type="submit" disabled={!selectedVehicle || !hasDownPayment || sending} className={mobileSubmitClass} style={{ backgroundColor: primary }}>{sending ? 'Enviando...' : 'Simular agora'}</button>;

  const summary = <aside className="self-start rounded-2xl p-4 text-white shadow-xl" style={{ backgroundColor: summaryBackgroundColor }}>
    <div className="flex items-center justify-between gap-3"><p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-400">Resumo</p>{selectedVehicle ? <span className="rounded-full bg-white/10 px-2 py-1 text-[8px] font-black text-white">SELECIONADO</span> : null}</div>
    {selectedVehicle ? <><div className="mt-2 overflow-hidden rounded-xl"><CampaignVehicleGallery vehicle={selectedVehicle} compact /></div><h3 className="mt-2 text-sm font-black leading-tight">{selectedVehicle.brand} {selectedVehicle.model}</h3><p className="mt-0.5 text-[9px] leading-4 text-slate-400">{selectedVehicle.version || selectedVehicle.year || eventInfo?.name || 'Veículo selecionado'}</p></> : <p className="mt-2 text-[10px] leading-4 text-slate-400">Selecione um veículo para visualizar as fotos e calcular.</p>}
    <div className="mt-3 divide-y divide-white/10 rounded-xl bg-white/[0.06] px-3 text-[10px]"><p className="flex justify-between gap-3 py-2"><span className="text-slate-400">Veículo</span><strong className="text-right">{selectedVehicle ? money(simulation.vehiclePrice) : '—'}</strong></p><p className="flex justify-between gap-3 py-2"><span className="text-slate-400">Entrada</span><strong className="text-right">{hasDownPayment ? money(simulation.downPayment) : '—'}</strong></p><p className="flex justify-between gap-3 py-2"><span className="text-slate-400">Financiado</span><strong className="text-right">{hasDownPayment ? money(simulation.financedAmount) : '—'}</strong></p></div>
    <div className="mt-3 rounded-xl bg-white/10 p-3"><p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">Parcela estimada</p>{hasDownPayment ? <><strong className="mt-1 block text-xl font-black tracking-tight">{money(simulation.estimatedInstallment)}</strong><p className="mt-0.5 text-[9px] text-slate-400">em {simulation.installments}x • taxa referencial</p></> : <p className="mt-1 text-[10px] font-bold leading-4 text-white">Informe o valor da entrada para calcular.</p>}</div>
    <button type="submit" disabled={!selectedVehicle || !hasDownPayment || sending} className={summarySubmitClass} style={{ backgroundColor: primary }}>{sending ? 'Enviando...' : 'Simular agora'}</button>
    {message ? <p className="mt-2 rounded-xl bg-red-500/15 p-2 text-[9px] font-bold leading-4 text-red-200">{message}</p> : null}
  </aside>;

  return <section className="w-full min-w-0 overflow-hidden border border-slate-200/70 text-slate-950 shadow-xl" style={{ borderRadius: cardRadius, backgroundColor }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
    {submitted ? <div className="p-5 text-center sm:p-7"><CheckCircle2 size={38} className="mx-auto text-emerald-500" /><h3 className="mt-3 text-lg font-black tracking-tight sm:text-xl">Parabéns, {form.name.trim()}! Simulação recebida.</h3><p className="mx-auto mt-2 max-w-xl text-[11px] leading-5 text-slate-500">Seu CPF apresenta uma estimativa inicial de 80% de chance de aprovação. O resultado final depende da análise da instituição financeira. Um dos nossos representantes entrará em contato com você.</p><div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row"><span className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-[10px] font-black text-white shadow-md"><MessageCircle size={15} /> ANTECIPAR ATENDIMENTO</span><button type="button" onClick={restart} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-[10px] font-black text-slate-700"><RotateCcw size={14} /> Simular novamente</button></div></div> : <form onSubmit={submit} className={formLayoutClass}><div className="min-w-0">{header}<div className="mt-1">{fields}</div>{mobileSubmit}</div>{summary}</form>}
    {automatic ? <style jsx>{`@media (max-width: 767px){section{border-radius:${Math.min(cardRadius, 22)}px!important}}`}</style> : null}
  </section>;
}
