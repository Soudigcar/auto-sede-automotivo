'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator, CarFront, CheckCircle2, Info, LockKeyhole, MessageCircle, ShieldCheck, UserRound, X } from 'lucide-react';
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
  return `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function digits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function maskPhone(value: string) {
  const clean = digits(value).slice(0, 11);
  if (clean.length <= 10) return clean.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return clean.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

function maskCpf(value: string) {
  return digits(value).slice(0, 11).replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200';

function SectionTitle({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600"><Icon size={19} /></span><div><h3 className="text-base font-black text-slate-900">{title}</h3><p className="mt-0.5 text-xs text-slate-500">{description}</p></div></div>;
}

export function CampaignSimulatorCard({ campaign, vehicles, primaryColor, onOpen, cardRadius = 34, buttonRadius = 16, buttonTextColor = '#FFFFFF' }: CampaignSimulatorCardProps) {
  const primary = primaryColor || campaign?.primary_color || '#DC2626';
  return <aside className="rounded-[34px] border border-white/15 bg-white/10 p-3 shadow-2xl backdrop-blur" style={{ borderRadius: cardRadius }}><div className="bg-white p-6 text-slate-950" style={{ borderRadius: Math.max(8, cardRadius - 6) }}><span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"><ShieldCheck size={15} /> Simulação inicial segura</span><h2 className="mt-5 text-3xl font-black">Financiamento automotivo</h2><p className="mt-2 text-sm text-slate-500">Taxa referencial de {Number(campaign?.interest_rate || 1.89).toLocaleString('pt-BR')}% ao mês.</p><div className="mt-6 rounded-3xl bg-slate-100 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Estoque conectado</p><strong className="mt-2 block text-4xl font-black">{vehicles.length}</strong><p className="mt-2 text-sm font-semibold text-slate-500">veículo(s) das lojas participantes disponíveis nesta landing.</p></div><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpen(); }} className="mt-5 min-h-12 w-full text-sm font-black shadow-lg" style={{ backgroundColor: primary, color: buttonTextColor, borderRadius: buttonRadius }}>{campaign?.cta_label || 'Começar simulação'}</button></div></aside>;
}

export function CampaignFinanceSimulatorModal({ campaign, eventInfo, vehicles, open, onClose, initialVehicleId = '', mode = 'live', primaryColor, slug = '' }: CampaignFinanceSimulatorModalProps) {
  const primary = primaryColor || campaign?.primary_color || '#DC2626';
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', cpf: '', email: '', vehicle_id: initialVehicleId, down_payment: '', installments: '60', consent: false });

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setMessage('');
    setForm((current) => ({ ...current, vehicle_id: initialVehicleId || current.vehicle_id || '', down_payment: initialVehicleId && initialVehicleId !== current.vehicle_id ? '' : current.down_payment }));
  }, [open, initialVehicleId]);

  const selectedVehicle = useMemo(() => vehicles.find((item) => item.id === form.vehicle_id) || null, [vehicles, form.vehicle_id]);
  const hasDownPayment = form.down_payment.trim() !== '' && Number.isFinite(Number(form.down_payment));
  const simulation = useMemo(() => calculateCampaignFinance({ vehiclePrice: selectedVehicle?.price, downPayment: hasDownPayment ? form.down_payment : 0, installments: form.installments, monthlyRatePercent: campaign?.interest_rate || 1.89 }), [selectedVehicle, hasDownPayment, form.down_payment, form.installments, campaign]);

  function setDownPaymentPercent(percent: number) {
    if (!selectedVehicle?.price) return;
    setForm({ ...form, down_payment: String(Math.round(Number(selectedVehicle.price) * percent / 100)) });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVehicle || !hasDownPayment || !form.name || !form.phone || !form.cpf || !form.email || !form.consent) { setMessage('Preencha todos os campos obrigatórios para continuar.'); return; }
    if (mode === 'preview') { setSubmitted(true); setMessage(''); return; }
    if (!campaign) return;
    setSending(true); setMessage('');
    try {
      const vehicleName = `${selectedVehicle.brand || ''} ${selectedVehicle.model || ''} ${selectedVehicle.version || ''} ${selectedVehicle.year || ''}`.replace(/\s+/g, ' ').trim();
      const response = await fetch('/api/site-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, phone: form.phone, cpf: form.cpf, email: form.email, source: 'Landing Page Simulador', campaign_id: campaign.id, campaign_name: campaign.name, vehicle_id: selectedVehicle.id, vehicle_name: vehicleName, down_payment: simulation.downPayment, installments: simulation.installments, consent: form.consent, notes: 'Lead captado pela landing vinculada ao evento.', metadata: { slug, event_id: eventInfo?.id || null } }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar sua simulação.');
      setSubmitted(true);
    } catch (error: any) { setMessage(error?.message || 'Não foi possível enviar sua simulação.'); } finally { setSending(false); }
  }

  if (!open) return null;

  return <div className="fixed inset-0 z-[350] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-sm sm:p-4">
    <div className="max-h-[96vh] w-full max-w-[1380px] overflow-y-auto rounded-[26px] bg-white shadow-2xl">
      <div className="flex items-start justify-between px-5 pb-4 pt-5 sm:px-8 sm:pt-7"><div><p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: primary }}>Simulador do evento</p><h2 className="mt-1 text-2xl font-black tracking-[-0.03em] sm:text-3xl">Faça sua simulação</h2></div><button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100" aria-label="Fechar simulador"><X size={21} /></button></div>

      {mode === 'preview' ? <div className="mx-5 mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs font-bold text-indigo-700 sm:mx-8">Modo Preview: nenhum lead será enviado.</div> : null}

      {submitted ? <div className="p-5 sm:p-8"><div className="mx-auto max-w-3xl rounded-[28px] bg-gradient-to-br from-emerald-600 to-emerald-700 p-8 text-center text-white"><CheckCircle2 size={58} className="mx-auto" /><h3 className="mt-4 text-3xl font-black">Simulação recebida</h3><p className="mt-3 text-emerald-50">Um representante entrará em contato com você.</p>{mode === 'live' && digits(campaign?.whatsapp_number || '') ? <a href={`https://wa.me/${digits(campaign.whatsapp_number)}`} target="_blank" rel="noreferrer" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white px-6 text-sm font-black text-emerald-700"><MessageCircle size={19} /> Falar no WhatsApp</a> : null}</div></div> : <form onSubmit={submit} className="grid gap-5 px-5 pb-5 sm:px-8 sm:pb-8 xl:grid-cols-[minmax(0,1fr)_410px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-6"><div className="grid grid-cols-3 items-center gap-3 text-xs font-bold text-slate-500"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white">1</span><span>Seus dados</span></div><div className="flex items-center gap-2"><span className="h-px flex-1 bg-red-500" /><span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-500 bg-white text-red-500">2</span><span>Condições</span></div><div className="flex items-center justify-end gap-2"><span className="h-px flex-1 bg-slate-200" /><span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white">3</span><span>Revisão</span></div></div></div>

          <section className="rounded-2xl border border-slate-200 p-4 sm:p-5"><SectionTitle icon={UserRound} title="Seus dados" description="Precisamos dessas informações para realizar sua simulação." /><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">Nome completo<input className={`${inputClass} mt-1.5`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label className="text-xs font-bold text-slate-700">Telefone<input className={`${inputClass} mt-1.5`} value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} required /></label><label className="text-xs font-bold text-slate-700">CPF<input className={`${inputClass} mt-1.5`} value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} required /></label><label className="text-xs font-bold text-slate-700">E-mail<input type="email" className={`${inputClass} mt-1.5`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label></div></section>

          <section className="rounded-2xl border border-slate-200 p-4 sm:p-5"><SectionTitle icon={CarFront} title="Escolha do veículo" description="Selecione o veículo que deseja financiar." /><div className="mt-4 grid items-end gap-4 md:grid-cols-[1fr_210px]"><label className="text-xs font-bold text-slate-700">Veículo<select className={`${inputClass} mt-1.5`} value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value, down_payment: '' })} required><option value="">Selecione o veículo</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.brand} {vehicle.model} {vehicle.year || ''}</option>)}</select></label><div><p className="text-xs font-bold text-slate-700">Preço do veículo</p><strong className="mt-1.5 block text-xl font-black">{money(selectedVehicle?.price || 0)}</strong></div></div></section>

          <section className="rounded-2xl border border-slate-200 p-4 sm:p-5"><SectionTitle icon={Calculator} title="Condições da simulação" description="Informe sua entrada e escolha o prazo para ver sua parcela estimada." /><div className="mt-4 grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4"><label className="text-xs font-bold text-slate-700">Entrada<input type="number" min="0" step="0.01" max={selectedVehicle?.price || undefined} className={`${inputClass} mt-1.5`} value={form.down_payment} onChange={(e) => setForm({ ...form, down_payment: e.target.value })} required /></label><p className="mt-3 text-[11px] text-slate-500">Ou escolha um percentual do valor do veículo</p><div className="mt-2 flex gap-2">{[20,30,40].map((percent) => <button key={percent} type="button" onClick={() => setDownPaymentPercent(percent)} className="h-8 rounded-lg border px-4 text-xs font-bold" style={{ borderColor: Number(form.down_payment) === Math.round(Number(selectedVehicle?.price || 0) * percent / 100) ? primary : '#CBD5E1', color: Number(form.down_payment) === Math.round(Number(selectedVehicle?.price || 0) * percent / 100) ? primary : '#475569' }}>{percent}%</button>)}</div></div><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold text-slate-700">Prazo (nº de parcelas)</p><div className="mt-3 grid grid-cols-4 gap-2">{campaignInstallmentOptions.map((value) => <button key={value} type="button" onClick={() => setForm({ ...form, installments: String(value) })} className="h-9 rounded-lg border text-xs font-bold" style={{ borderColor: String(value) === form.installments ? primary : '#CBD5E1', color: String(value) === form.installments ? primary : '#475569' }}>{value}x</button>)}</div><p className="mt-4 flex items-center gap-2 border-t border-slate-200 pt-3 text-[11px] text-slate-500"><Info size={14} /> Prazos maiores podem resultar em juros mais altos.</p></div></div></section>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-xs text-slate-600"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-red-600" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} required /><span><strong className="block text-slate-800">Autorizo o contato comercial da Auto Sede e de uma das lojas participantes do evento</strong><span className="mt-1 block text-slate-500">Podemos entrar em contato por telefone, e-mail ou WhatsApp com sua proposta.</span></span></label>
          <p className="flex items-start gap-3 px-4 text-xs text-slate-500"><LockKeyhole size={16} className="mt-0.5" /><span><strong className="block text-slate-700">Seus dados são usados apenas para retornar a proposta.</strong> Não compartilhamos suas informações.</span></p>
        </div>

        <aside className="self-start rounded-2xl bg-slate-950 p-5 text-white xl:sticky xl:top-4"><h3 className="text-lg font-black">Resumo da simulação</h3>{selectedVehicle ? <div className="mt-4"><CampaignVehicleGallery vehicle={selectedVehicle} /><h4 className="mt-4 text-2xl font-black">{selectedVehicle.brand} {selectedVehicle.model}</h4><p className="mt-1 text-sm text-slate-400">{[selectedVehicle.year, selectedVehicle.fuel, selectedVehicle.transmission].filter(Boolean).join(' • ')}</p></div> : <p className="mt-4 text-sm text-slate-400">Selecione um veículo para visualizar o resumo.</p>}<div className="mt-5 space-y-3 text-sm"><p className="flex justify-between border-b border-white/10 pb-3"><span className="text-slate-400">Preço do veículo</span><strong>{money(simulation.vehiclePrice)}</strong></p><p className="flex justify-between border-b border-white/10 pb-3"><span className="text-slate-400">Entrada</span><strong>{hasDownPayment ? money(simulation.downPayment) : '—'}</strong></p><p className="flex justify-between"><span className="text-slate-400">Valor financiado</span><strong>{hasDownPayment ? money(simulation.financedAmount) : '—'}</strong></p></div><div className="mt-5 rounded-2xl bg-white/10 p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Parcela estimada</p>{hasDownPayment ? <><strong className="mt-2 block text-4xl font-black">{money(simulation.estimatedInstallment)} <span className="text-sm font-semibold text-slate-400">/mês</span></strong><p className="mt-1 text-xs text-slate-400">em {simulation.installments}x • taxa referencial</p><div className="mt-4 space-y-2 border-t border-white/10 pt-3 text-xs"><p className="flex justify-between"><span className="text-slate-400">Total das parcelas ({simulation.installments}x)</span><strong>{money(simulation.totalInstallments)}</strong></p><p className="flex justify-between"><span className="text-slate-400">Total com entrada</span><strong>{money(simulation.totalWithDownPayment)}</strong></p></div></> : <p className="mt-2 text-sm font-bold">Informe o valor da entrada para calcular.</p>}</div><button type="submit" disabled={sending || !selectedVehicle || !hasDownPayment} className="mt-5 min-h-13 w-full rounded-2xl text-sm font-black text-white disabled:opacity-50" style={{ backgroundColor: primary }}>{sending ? 'Enviando...' : mode === 'preview' ? 'Testar simulação' : 'SIMULAR FINANCIAMENTO'}</button><p className="mt-4 text-[11px] leading-relaxed text-slate-400">Estimativa inicial. Taxa, CET, tarifas e aprovação final dependem da instituição financeira.</p>{message ? <p className="mt-3 rounded-xl bg-red-500/15 p-3 text-xs font-bold text-red-200">{message}</p> : null}</aside>
      </form>}
    </div>
  </div>;
}
