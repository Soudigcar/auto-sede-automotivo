'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  CarFront,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Fuel,
  Gauge,
  Loader2,
  MapPin,
  Settings2,
  ShieldCheck,
  Store,
  X
} from 'lucide-react';
import type { MarketplaceVehicle } from '@/components/marketplace/types';

const installmentOptions = [12, 24, 36, 48, 60];
const interestRate = 1.89;

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function maskPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

function maskCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

function parseMoney(value: string) {
  const clean = String(value || '').replace(/\s/g, '');
  if (!clean) return 0;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const parsed = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number, decimals = 2) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(Number(value || 0));
}

function vehicleTitle(vehicle: MarketplaceVehicle) {
  return [vehicle.brand, vehicle.model, vehicle.version, vehicle.year].filter(Boolean).join(' ');
}

export function MarketplaceVehicleModal({
  vehicle,
  onClose
}: {
  vehicle: MarketplaceVehicle;
  onClose: () => void;
}) {
  const images = useMemo(() => Array.from(new Set([
    ...(Array.isArray(vehicle.image_urls) ? vehicle.image_urls : []),
    vehicle.image_url || ''
  ].filter(Boolean))), [vehicle]);

  const [imageIndex, setImageIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ storeName: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    cpf: '',
    email: '',
    downPayment: '',
    installments: 60,
    consent: false
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') setImageIndex((current) => current <= 0 ? Math.max(images.length - 1, 0) : current - 1);
      if (event.key === 'ArrowRight') setImageIndex((current) => images.length ? (current + 1) % images.length : 0);
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [images.length, onClose]);

  const simulation = useMemo(() => {
    const downPayment = Math.max(parseMoney(form.downPayment), 0);
    const financedAmount = Math.max(Number(vehicle.price || 0) - downPayment, 0);
    const monthlyRate = interestRate / 100;
    const installments = Number(form.installments || 60);
    const estimatedInstallment = financedAmount > 0 && monthlyRate > 0
      ? financedAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -installments))
      : installments > 0
        ? financedAmount / installments
        : 0;

    return { downPayment, financedAmount, installments, estimatedInstallment };
  }, [form.downPayment, form.installments, vehicle.price]);

  const valid = Boolean(
    form.name.trim() &&
    onlyDigits(form.phone).length >= 10 &&
    onlyDigits(form.cpf).length === 11 &&
    form.email.includes('@') &&
    form.consent
  );

  function changeImage(direction: number) {
    if (!images.length) return;
    setImageIndex((current) => (current + direction + images.length) % images.length);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || sending) return;

    setSending(true);
    setError('');

    try {
      const response = await fetch('/api/marketplace/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          cpf: form.cpf,
          email: form.email,
          vehicle_id: vehicle.id,
          down_payment: simulation.downPayment,
          installments: simulation.installments,
          interest_rate: interestRate,
          consent: form.consent
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar seu interesse.');

      setSuccess({ storeName: payload.assigned_store_name || vehicle.store.name });
    } catch (submitError: any) {
      setError(submitError?.message || 'Não foi possível enviar seu interesse.');
    } finally {
      setSending(false);
    }
  }

  const activeImage = images[imageIndex] || images[0] || '';

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-2 backdrop-blur-sm sm:p-5 lg:items-center" role="dialog" aria-modal="true" aria-label={`Detalhes de ${vehicleTitle(vehicle)}`}>
      <div className="relative my-2 w-full max-w-7xl overflow-hidden rounded-[28px] bg-white text-slate-950 shadow-2xl sm:my-5 lg:max-h-[calc(100vh-40px)]">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-slate-950/55 text-white backdrop-blur transition hover:bg-slate-950" aria-label="Fechar">
          <X size={21} />
        </button>

        <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
          <section className="bg-slate-950 p-3 sm:p-5 lg:overflow-y-auto">
            <div className="relative aspect-[16/10] overflow-hidden rounded-[24px] bg-slate-900">
              {activeImage ? (
                <img src={activeImage} alt={vehicleTitle(vehicle)} className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-600"><CarFront size={70} /></div>
              )}

              {images.length > 1 ? (
                <>
                  <button type="button" onClick={() => changeImage(-1)} className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/65 text-white backdrop-blur" aria-label="Foto anterior"><ChevronLeft size={24} /></button>
                  <button type="button" onClick={() => changeImage(1)} className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/65 text-white backdrop-blur" aria-label="Próxima foto"><ChevronRight size={24} /></button>
                  <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-black text-white">{imageIndex + 1}/{images.length}</span>
                </>
              ) : null}
            </div>

            {images.length > 1 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {images.map((image, index) => (
                  <button type="button" key={`${image}-${index}`} onClick={() => setImageIndex(index)} className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 ${index === imageIndex ? 'border-red-500' : 'border-white/10'}`}>
                    <img src={image} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.05] p-5 text-white">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-red-400">Veículo disponível</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{vehicleTitle(vehicle)}</h2>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3 text-right">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor anunciado</p>
                  <p className="mt-1 text-2xl font-black">{money(vehicle.price, 0)}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-white/[0.06] p-3"><Gauge size={17} className="text-red-400" /><p className="mt-2 text-xs font-black">{vehicle.mileage || 'KM não informado'}</p></div>
                <div className="rounded-2xl bg-white/[0.06] p-3"><Settings2 size={17} className="text-red-400" /><p className="mt-2 text-xs font-black">{vehicle.transmission || 'Câmbio não informado'}</p></div>
                <div className="rounded-2xl bg-white/[0.06] p-3"><Fuel size={17} className="text-red-400" /><p className="mt-2 text-xs font-black">{vehicle.fuel || 'Combustível não informado'}</p></div>
                <div className="rounded-2xl bg-white/[0.06] p-3"><MapPin size={17} className="text-red-400" /><p className="mt-2 text-xs font-black">{vehicle.color || 'Cor não informada'}</p></div>
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <Store size={20} className="shrink-0 text-emerald-400" />
                <div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Loja responsável</p><p className="mt-1 text-sm font-black">{vehicle.store.name}</p></div>
              </div>
            </div>
          </section>

          <section className="p-5 sm:p-7 lg:max-h-[calc(100vh-40px)] lg:overflow-y-auto">
            {success ? (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 size={42} /></div>
                <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Interesse enviado</p>
                <h3 className="mt-2 text-3xl font-black tracking-tight text-slate-950">A loja recebeu seu contato</h3>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500">Seu atendimento foi direcionado diretamente para <strong className="text-slate-800">{success.storeName}</strong>, proprietária deste veículo.</p>
                <button type="button" onClick={onClose} className="mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-6 font-black text-white">Continuar vendo veículos</button>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Calculator size={23} /></div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-red-600">Simulação inicial</p>
                    <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Calcule e solicite atendimento</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">A simulação é estimativa. A condição definitiva depende da análise da instituição financeira.</p>
                  </div>
                </div>

                <div className="mt-5 rounded-[24px] border border-blue-100 bg-blue-50 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-black text-slate-700">
                      Valor de entrada
                      <div className="relative mt-2">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">R$</span>
                        <input value={form.downPayment} onChange={(event) => setForm((current) => ({ ...current, downPayment: event.target.value }))} inputMode="decimal" placeholder="0,00" className="w-full rounded-2xl border border-blue-200 bg-white py-3 pl-12 pr-4 text-sm font-bold outline-none focus:border-blue-500" />
                      </div>
                    </label>

                    <label className="text-sm font-black text-slate-700">
                      Quantidade de parcelas
                      <select value={form.installments} onChange={(event) => setForm((current) => ({ ...current, installments: Number(event.target.value) }))} className="mt-2 w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500">
                        {installmentOptions.map((option) => <option key={option} value={option}>{option} parcelas</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor financiado</p><p className="mt-2 text-lg font-black text-slate-950">{money(simulation.financedAmount)}</p></div>
                    <div className="rounded-2xl bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Parcela estimada</p><p className="mt-2 text-lg font-black text-blue-700">{money(simulation.estimatedInstallment)}</p></div>
                  </div>
                  <p className="mt-3 text-[11px] font-semibold text-blue-700">Taxa referencial utilizada: {interestRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% ao mês.</p>
                </div>

                <form onSubmit={submit} className="mt-5 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-black text-slate-700">Nome completo<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-red-500" placeholder="Seu nome" required /></label>
                    <label className="text-sm font-black text-slate-700">Telefone / WhatsApp<input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: maskPhone(event.target.value) }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-red-500" placeholder="(61) 99999-9999" inputMode="tel" required /></label>
                    <label className="text-sm font-black text-slate-700">CPF<input value={form.cpf} onChange={(event) => setForm((current) => ({ ...current, cpf: maskCpf(event.target.value) }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-red-500" placeholder="000.000.000-00" inputMode="numeric" required /></label>
                    <label className="text-sm font-black text-slate-700">E-mail<input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-red-500" placeholder="voce@email.com" type="email" required /></label>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold leading-relaxed text-slate-600">
                    <input type="checkbox" checked={form.consent} onChange={(event) => setForm((current) => ({ ...current, consent: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-red-600" />
                    Autorizo o contato da loja responsável por telefone, WhatsApp ou e-mail para atendimento desta solicitação.
                  </label>

                  {error ? <p className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

                  <button type="submit" disabled={!valid || sending} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-black text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {sending ? <Loader2 size={19} className="animate-spin" /> : <ShieldCheck size={19} />}
                    {sending ? 'Enviando para a loja...' : 'Solicitar atendimento'}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
