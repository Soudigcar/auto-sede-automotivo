'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Building2, CalendarDays, CarFront, CheckCircle2, MapPin, ShieldCheck, Store, X } from 'lucide-react';
import { MetaPixelTracker } from '@/components/MetaPixelTracker';

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
  return digits(value).slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

function dateLabel(start?: string, end?: string) {
  const format = (value?: string) => {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };
  const first = format(start);
  const last = format(end);
  return first && last && first !== last ? `${first} a ${last}` : first || last || 'Data a confirmar';
}

export function EventCampaignLanding() {
  const params = useParams();
  const slug = String(params?.slug || '');
  const [campaign, setCampaign] = useState<any>(null);
  const [eventInfo, setEventInfo] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(true);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', cpf: '', email: '', vehicle_id: '', down_payment: '', installments: '60', consent: false
  });

  useEffect(() => {
    fetch(`/api/site-vehicles?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error(result.error || 'Campanha indisponível.');
        setCampaign(result.campaign);
        setEventInfo(result.event || null);
        setStores(result.stores || []);
        setVehicles(result.vehicles || []);
        setLoading(false);
      })
      .catch((error) => {
        setMessage(error?.message || 'Campanha indisponível.');
        setLoading(false);
      });
  }, [slug]);

  const selectedVehicle = useMemo(() => vehicles.find((item) => item.id === form.vehicle_id) || null, [vehicles, form.vehicle_id]);
  const simulation = useMemo(() => {
    const vehiclePrice = Number(selectedVehicle?.price || 0);
    const downPayment = Math.max(Number(form.down_payment || 0), 0);
    const financedAmount = Math.max(vehiclePrice - downPayment, 0);
    const installments = Math.max(Number(form.installments || 60), 1);
    const monthlyRate = Math.max(Number(campaign?.interest_rate || 1.89), 0) / 100;
    const estimatedInstallment = financedAmount > 0 && monthlyRate > 0
      ? financedAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -installments))
      : installments > 0 ? financedAmount / installments : 0;
    return { vehiclePrice, downPayment, financedAmount, installments, estimatedInstallment };
  }, [selectedVehicle, form.down_payment, form.installments, campaign]);

  const primary = campaign?.primary_color || '#DC2626';
  const secondary = campaign?.secondary_color || '#071020';
  const benefits = Array.isArray(campaign?.benefits) ? campaign.benefits : [];
  const heroImage = campaign?.hero_image_url || '';
  const mobileHero = campaign?.mobile_hero_image_url || heroImage;
  const location = [eventInfo?.location, eventInfo?.city, eventInfo?.state].filter(Boolean).join(' • ');

  function openVehicle(vehicleId: string) {
    setForm((current) => ({ ...current, vehicle_id: vehicleId, down_payment: '' }));
    setSubmitted(false);
    setModalOpen(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!campaign || !selectedVehicle || !form.name || !form.phone || !form.cpf || !form.email || !form.consent) return;
    setSending(true);
    setMessage('');

    const vehicleName = `${selectedVehicle.brand || ''} ${selectedVehicle.model || ''} ${selectedVehicle.version || ''} ${selectedVehicle.year || ''}`.replace(/\s+/g, ' ').trim();
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
    setSending(false);
    if (!response.ok) {
      setMessage(result.error || 'Não foi possível enviar sua simulação.');
      return;
    }
    setSubmitted(true);
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Carregando evento...</main>;
  if (!campaign) return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-white">{message || 'Evento indisponível.'}</main>;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <MetaPixelTracker />

      <section className="relative min-h-[760px] overflow-hidden px-4 pb-20 pt-5 text-white sm:px-6 lg:px-8" style={{ backgroundColor: secondary }}>
        {heroImage ? (
          <picture className="absolute inset-0">
            {mobileHero ? <source media="(max-width: 767px)" srcSet={mobileHero} /> : null}
            <img src={heroImage} alt={`Capa ${campaign.name}`} className="h-full w-full object-cover" />
          </picture>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/40" />

        <div className="relative mx-auto max-w-[1480px]">
          <header className="flex items-center justify-between gap-4">
            <img src="/campaign-assets/auto-sede-logo-cropped.png" alt="Auto Sede" className="h-10 w-auto object-contain sm:h-14" />
            {campaign.logo_url ? <img src={campaign.logo_url} alt={campaign.name} className="max-h-20 max-w-[45vw] object-contain drop-shadow-xl" /> : <strong className="max-w-md text-right text-lg font-black sm:text-2xl">{campaign.name}</strong>}
          </header>

          <div className="grid min-h-[650px] items-center gap-10 py-12 lg:grid-cols-[1fr_430px]">
            <div className="max-w-4xl">
              <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] backdrop-blur">{campaign.hero_eyebrow || 'Evento automotivo'}</span>
              {campaign.logo_url ? <img src={campaign.logo_url} alt={campaign.name} className="mt-7 max-h-56 max-w-full object-contain object-left drop-shadow-2xl" /> : null}
              <h1 className="mt-7 text-4xl font-black leading-[0.98] tracking-[-0.04em] sm:text-6xl lg:text-7xl">{campaign.title}</h1>
              <p className="mt-6 max-w-3xl text-base font-medium leading-relaxed text-slate-200 sm:text-lg">{campaign.description}</p>

              <div className="mt-7 flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-sm font-black backdrop-blur"><CalendarDays size={18} /> {dateLabel(eventInfo?.start_date, eventInfo?.end_date)}</span>
                {location ? <span className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-sm font-black backdrop-blur"><MapPin size={18} /> {location}</span> : null}
                <span className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-sm font-black backdrop-blur"><Building2 size={18} /> {stores.length} loja(s) participante(s)</span>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={() => setModalOpen(true)} className="rounded-full px-8 py-4 text-sm font-black uppercase tracking-wide text-white shadow-2xl" style={{ backgroundColor: primary }}>{campaign.cta_label || 'Simular agora'}</button>
                <a href="#veiculos" className="rounded-full border border-white/25 bg-white/10 px-8 py-4 text-sm font-black uppercase tracking-wide backdrop-blur">Ver veículos</a>
              </div>
            </div>

            <aside className="rounded-[34px] border border-white/15 bg-white/10 p-3 shadow-2xl backdrop-blur">
              <div className="rounded-[28px] bg-white p-6 text-slate-950">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"><ShieldCheck size={15} /> Simulação inicial segura</span>
                <h2 className="mt-5 text-3xl font-black">Financiamento automotivo</h2>
                <p className="mt-2 text-sm text-slate-500">Taxa referencial de {Number(campaign.interest_rate || 1.89).toLocaleString('pt-BR')}% ao mês.</p>
                <div className="mt-6 rounded-3xl bg-slate-100 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Estoque conectado</p>
                  <strong className="mt-2 block text-4xl font-black">{vehicles.length}</strong>
                  <p className="mt-2 text-sm font-semibold text-slate-500">veículo(s) das lojas participantes disponíveis nesta landing.</p>
                </div>
                <button type="button" onClick={() => setModalOpen(true)} className="mt-5 min-h-12 w-full rounded-2xl text-sm font-black text-white" style={{ backgroundColor: primary }}>{campaign.cta_label || 'Começar simulação'}</button>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1480px] px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {(benefits.length ? benefits : [
            { title: 'Simulação rápida', description: 'Faça uma estimativa inicial antes do atendimento.' },
            { title: 'Lojas participantes', description: 'Estoque conectado ao evento em tempo real.' },
            { title: 'Atendimento responsável', description: 'O lead segue para a loja proprietária do veículo.' }
          ]).map((benefit: any, index: number) => (
            <article key={`${benefit.title}-${index}`} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <CheckCircle2 size={24} style={{ color: primary }} />
              <h2 className="mt-4 text-xl font-black">{benefit.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{benefit.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="veiculos" className="bg-slate-100 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: primary }}>Estoque do evento</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">Escolha seu próximo carro</h2>
          <p className="mt-4 max-w-3xl text-base text-slate-500">Os veículos abaixo pertencem às lojas participantes deste evento e são sincronizados automaticamente pelo sistema.</p>

          {vehicles.length ? (
            <div className="mt-9 grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {vehicles.map((vehicle) => (
                <article key={vehicle.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <div className="aspect-[16/10] bg-slate-200">
                    {vehicle.image_url ? <img src={vehicle.image_url} alt={`${vehicle.brand} ${vehicle.model}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><CarFront size={54} /></div>}
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: primary }}>{vehicle.store_name || 'Loja participante'}</p>
                    <h3 className="mt-2 text-xl font-black">{vehicle.brand} {vehicle.model}</h3>
                    <p className="mt-1 min-h-10 text-sm text-slate-500">{[vehicle.version, vehicle.year].filter(Boolean).join(' • ')}</p>
                    {vehicle.original_price ? <p className="mt-4 text-xs font-bold text-slate-400 line-through">{money(vehicle.original_price)}</p> : null}
                    <strong className="mt-1 block text-2xl font-black">{money(vehicle.price)}</strong>
                    <button type="button" onClick={() => openVehicle(vehicle.id)} className="mt-5 min-h-12 w-full rounded-2xl text-sm font-black text-white" style={{ backgroundColor: primary }}>Simular este veículo</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-9 rounded-[30px] border border-dashed border-slate-300 bg-white p-12 text-center">
              <CarFront size={44} className="mx-auto text-slate-300" />
              <h3 className="mt-4 text-2xl font-black">Estoque em preparação</h3>
              <p className="mt-2 text-sm text-slate-500">Os veículos aparecerão automaticamente após as lojas serem vinculadas e o estoque ser sincronizado.</p>
            </div>
          )}
        </div>
      </section>

      {stores.length ? (
        <section className="mx-auto max-w-[1480px] px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: primary }}>Rede participante</p>
          <h2 className="mt-3 text-3xl font-black">Lojas deste evento</h2>
          <div className="mt-7 flex flex-wrap gap-3">
            {stores.map((store) => <span key={store.id} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black shadow-sm"><Store size={17} /> {store.store_name}</span>)}
          </div>
          {Array.isArray(campaign.sponsor_logo_urls) && campaign.sponsor_logo_urls.length ? (
            <div className="mt-12 border-t border-slate-200 pt-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Apoio e realização</p>
              <div className="mt-5 flex flex-wrap items-center gap-6">{campaign.sponsor_logo_urls.map((url: string) => <img key={url} src={url} alt="Patrocinador do evento" className="h-16 max-w-48 object-contain" />)}</div>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className="px-4 py-8 text-center text-xs font-semibold text-slate-400" style={{ backgroundColor: secondary }}>
        <p className="text-slate-300">© {new Date().getFullYear()} Auto Sede. Condições sujeitas à análise e confirmação da loja responsável.</p>
        {campaign.terms_text ? <p className="mx-auto mt-3 max-w-4xl leading-relaxed">{campaign.terms_text}</p> : null}
      </footer>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[30px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:p-6">
              <div><p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: primary }}>Simulador do evento</p><h2 className="mt-1 text-2xl font-black">Faça sua simulação inicial</h2></div>
              <button type="button" onClick={() => setModalOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100"><X size={20} /></button>
            </div>

            {submitted ? (
              <div className="p-8 text-center sm:p-12">
                <CheckCircle2 size={58} className="mx-auto text-emerald-500" />
                <h3 className="mt-5 text-3xl font-black">Simulação enviada</h3>
                <p className="mx-auto mt-3 max-w-xl text-slate-500">Seu interesse foi encaminhado para {selectedVehicle?.store_name || 'a loja responsável pelo veículo'}.</p>
                {digits(campaign.whatsapp_number || '') ? <a href={`https://wa.me/${digits(campaign.whatsapp_number)}?text=${encodeURIComponent('Olá, fiz uma simulação na landing do evento e quero antecipar meu atendimento.')}`} target="_blank" rel="noreferrer" className="mt-6 inline-flex rounded-2xl bg-emerald-600 px-6 py-4 text-sm font-black text-white">Chamar no WhatsApp</a> : null}
              </div>
            ) : (
              <form onSubmit={submit} className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_360px]">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="premium-input sm:col-span-2" placeholder="Nome completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  <input className="premium-input" placeholder="WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} required />
                  <input className="premium-input" placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} required />
                  <input className="premium-input sm:col-span-2" type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                  <select className="premium-input sm:col-span-2" value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value, down_payment: '' })} required>
                    <option value="">Selecione o veículo</option>
                    {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.brand} {vehicle.model} {vehicle.year || ''} — {money(vehicle.price)}</option>)}
                  </select>
                  <input className="premium-input" type="number" min="0" max={selectedVehicle?.price || undefined} placeholder="Valor de entrada" value={form.down_payment} onChange={(e) => setForm({ ...form, down_payment: e.target.value })} required />
                  <select className="premium-input" value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })}>{[12, 24, 36, 48, 60].map((value) => <option key={value} value={value}>{value} parcelas</option>)}</select>
                  <label className="sm:col-span-2 flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-xs font-semibold text-slate-500"><input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} required /> Autorizo o contato comercial da Auto Sede e da loja responsável pelo veículo selecionado.</label>
                </div>

                <aside className="rounded-[26px] bg-slate-950 p-5 text-white">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Resumo</p>
                  {selectedVehicle ? <><h3 className="mt-3 text-xl font-black">{selectedVehicle.brand} {selectedVehicle.model}</h3><p className="mt-1 text-xs text-slate-400">{selectedVehicle.store_name}</p></> : <p className="mt-3 text-sm text-slate-400">Selecione um veículo para calcular.</p>}
                  <div className="mt-5 space-y-3 text-sm"><p className="flex justify-between gap-4"><span className="text-slate-400">Veículo</span><strong>{money(simulation.vehiclePrice)}</strong></p><p className="flex justify-between gap-4"><span className="text-slate-400">Entrada</span><strong>{money(simulation.downPayment)}</strong></p><p className="flex justify-between gap-4"><span className="text-slate-400">Financiado</span><strong>{money(simulation.financedAmount)}</strong></p></div>
                  <div className="mt-5 rounded-2xl bg-white/10 p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Parcela estimada</p><strong className="mt-2 block text-3xl font-black">{money(simulation.estimatedInstallment)}</strong><p className="mt-1 text-xs text-slate-400">em {simulation.installments}x • taxa referencial</p></div>
                  <button type="submit" disabled={sending || !selectedVehicle} className="mt-5 min-h-12 w-full rounded-2xl text-sm font-black text-white disabled:opacity-50" style={{ backgroundColor: primary }}>{sending ? 'Enviando...' : 'Enviar simulação'}</button>
                  {message ? <p className="mt-3 rounded-xl bg-red-500/15 p-3 text-xs font-bold text-red-200">{message}</p> : null}
                </aside>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
