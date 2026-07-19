'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useParams } from 'next/navigation';

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function maskCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

function maskPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

export default function CampaignLandingPage() {
  const params = useParams();
  const slug = String(params?.slug || '');

  const [campaign, setCampaign] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [galleryVehicle, setGalleryVehicle] = useState<any>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [selectedVehicleImageIndex, setSelectedVehicleImageIndex] = useState(0);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    cpf: '',
    email: '',
    vehicle_id: '',
    down_payment: '',
    installments: '60',
    consent: false
  });

  async function loadCampaign() {
    const response = await fetch(`/api/site-vehicles?slug=${slug}`, { cache: 'no-store' });
    const result = await response.json();

    if (!response.ok) {
      setMessage('Campanha indisponível no momento.');
      setLoading(false);
      return;
    }

    setCampaign(result.campaign);
    setVehicles(result.vehicles || []);

    setLoading(false);
  }

  useEffect(() => {
    loadCampaign().catch(() => {
      setMessage('Não foi possível carregar a campanha.');
      setLoading(false);
    });
  }, [slug]);

  const selectedVehicle = useMemo(() => vehicles.find((item) => item.id === form.vehicle_id) || null, [vehicles, form.vehicle_id]);

  const simulation = useMemo(() => {
    const vehiclePrice = Number(selectedVehicle?.price || 0);
    const downPayment = Number(form.down_payment || 0);
    const financedAmount = Math.max(vehiclePrice - downPayment, 0);
    const installments = Number(form.installments || 60);
    const monthlyRate = Number(campaign?.interest_rate || 1.89) / 100;

    const estimatedInstallment = financedAmount > 0 && monthlyRate > 0
      ? financedAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -installments))
      : 0;

    return { vehiclePrice, downPayment, financedAmount, installments, estimatedInstallment };
  }, [selectedVehicle, form.down_payment, form.installments, campaign]);

  const isValid = Boolean(
    form.name &&
    form.phone &&
    form.cpf &&
    form.email &&
    form.vehicle_id &&
    form.down_payment &&
    form.installments &&
    form.consent
  );

  function openCleanSimulation() {
    setForm((current) => ({
      ...current,
      vehicle_id: '',
      down_payment: '',
      installments: '60'
    }));
    setSelectedVehicleImageIndex(0);
    setModalOpen(true);
    setSubmitted(false);
  }

  function openWithVehicle(vehicleId: string) {
    setForm((current) => ({ ...current, vehicle_id: vehicleId }));
    setSelectedVehicleImageIndex(0);
    setModalOpen(true);
    setSubmitted(false);
  }

  function vehicleImages(vehicle: any) {
    const images = [
      ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []),
      vehicle?.image_url
    ].filter(Boolean);

    return Array.from(new Set(images));
  }

  function vehicleSpecs(vehicle: any) {
    return [
      vehicle?.mileage ? { label: 'KM', value: vehicle.mileage } : null,
      vehicle?.fuel ? { label: 'Comb.', value: vehicle.fuel } : null,
      vehicle?.transmission ? { label: 'Câmbio', value: vehicle.transmission } : null,
      vehicle?.color ? { label: 'Cor', value: vehicle.color } : null
    ].filter(Boolean) as { label: string; value: string }[];
  }

  function openGallery(vehicle: any) {
    const images = vehicleImages(vehicle);

    if (!images.length) return;

    setGalleryVehicle(vehicle);
    setGalleryIndex(0);
  }

  async function submitSimulation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid || !selectedVehicle || !campaign) return;

    setSending(true);

    const vehicleName = `${selectedVehicle.brand} ${selectedVehicle.model} ${selectedVehicle.version || ''} ${selectedVehicle.year || ''}`.trim();

    const payload = {
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
      notes: 'Lead captado pelo simulador online da landing.',
      metadata: { slug }
    };

    const response = await fetch('/api/site-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    setSending(false);

    if (!response.ok) {
      setMessage(result.error || 'Não foi possível enviar sua simulação. Tente novamente.');
      return;
    }

    setSubmitted(true);
  }

  function whatsappUrl() {
    const phone = onlyDigits(campaign?.whatsapp_number || '');
    const text = encodeURIComponent('Olá, acabei de fazer minha simulação pelo site e quero antecipar meu atendimento para financiamento de veículo.');
    return `https://wa.me/${phone}?text=${text}`;
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#071020] text-white">Carregando campanha...</main>;
  }

  if (message && !campaign) {
    return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{message}</main>;
  }

  const galleryImages = vehicleImages(galleryVehicle);
  const activeGalleryImage = galleryImages[galleryIndex] || galleryImages[0];
  const selectedVehicleImages = selectedVehicle ? vehicleImages(selectedVehicle) : [];
  const activeSelectedVehicleImage = selectedVehicleImages[selectedVehicleImageIndex] || selectedVehicleImages[0];

  return (
    <main className="min-h-screen bg-[#071020] text-white">
      <section id="home" className="relative overflow-hidden bg-[#071020] px-4 pb-8 pt-4 text-white md:px-8 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(239,68,68,0.22),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(239,68,68,0.32),transparent_34%),radial-gradient(circle_at_70%_90%,rgba(255,255,255,0.08),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(5,13,28,0.99),rgba(7,16,32,0.96)_48%,rgba(38,5,12,0.95))]" />

        <div className="relative mx-auto max-w-7xl">
          <header className="flex min-h-[74px] items-center justify-between gap-4">
            <a href="#home" className="group flex h-16 w-36 shrink-0 items-center justify-start overflow-visible md:h-20 md:w-48">
              <span
                className="block h-full w-full bg-center bg-no-repeat transition group-hover:scale-105"
                style={{
                  backgroundImage: "url('/campaign-assets/auto-sede-logo.png')",
                  backgroundSize: '430%'
                }}
              />
              <span className="sr-only">Auto Sede</span>
            </a>

            <nav className="hidden items-center gap-8 rounded-full border border-white/10 bg-white/5 px-7 py-4 text-xs font-black uppercase tracking-wide text-zinc-300 backdrop-blur lg:flex">
              <a className="border-b-2 border-red-500 pb-1 text-white" href="#home">Home</a>
              <button className="transition hover:text-white" type="button" onClick={openCleanSimulation}>Simulação</button>
              <a className="transition hover:text-white" href="#veiculos">Veículos</a>
              <a className="transition hover:text-white" href="#sobre-festival">Sobre o festival</a>
            </nav>

            <div className="flex h-16 w-36 shrink-0 items-center justify-end overflow-visible md:h-20 md:w-48">
              <span
                className="block h-full w-full bg-center bg-no-repeat"
                style={{
                  backgroundImage: "url('/campaign-assets/festival-seu-carro-agora.png')",
                  backgroundSize: '290%'
                }}
              />
            </div>
          </header>

          <div className="grid gap-8 pt-6 lg:grid-cols-[1fr_430px] lg:items-center lg:pt-8">
            <div className="max-w-3xl">
              <div className="h-44 w-full max-w-[620px] overflow-visible sm:h-56 md:h-64">
                <div
                  className="h-full w-full bg-left bg-no-repeat drop-shadow-[0_20px_45px_rgba(239,68,68,0.38)]"
                  style={{
                    backgroundImage: "url('/campaign-assets/festival-seu-carro-agora.png')",
                    backgroundSize: '185%',
                    backgroundPosition: 'center left'
                  }}
                />
              </div>

              <h1 className="-mt-2 max-w-2xl text-4xl font-black leading-[0.96] tracking-tight text-white md:text-6xl">
                É rápido e fácil. Escolha seu carro e faça uma simulação do seu financiamento
              </h1>

              <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-zinc-300 md:text-lg">
                Escolha um veículo disponível em nosso estoque, informe seus dados e receba uma simulação inicial com taxa referencial de {campaign?.interest_rate || '2.89'}%.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  className="rounded-full bg-red-600 px-7 py-4 text-sm font-black uppercase tracking-wide text-white shadow-xl shadow-red-600/30 transition hover:bg-red-700"
                  type="button"
                  onClick={openCleanSimulation}
                >
                  Simular agora
                </button>

                <a
                  className="rounded-full border border-white/25 bg-white/5 px-7 py-4 text-sm font-black uppercase tracking-wide text-white transition hover:bg-white/10"
                  href="#veiculos"
                >
                  Ver veículos
                </a>
              </div>

              <div className="mt-7 grid gap-3 text-sm font-bold text-zinc-300 sm:grid-cols-2">
                {[
                  'Simulação rápida',
                  'Sem diminuir seu score',
                  'Não solicitamos códigos',
                  'Atendimento consultivo',
                  'Estoque disponível para pronta negociação'
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-red-400" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[34px] border border-white/15 bg-white/10 p-3 shadow-2xl shadow-black/40 backdrop-blur lg:self-center">
              <div className="rounded-[28px] bg-white p-6 text-zinc-950">
                <div className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-600">
                  <ShieldCheck size={15} /> Simulação segura e sem consulta oficial de score
                </div>

                <p className="mt-6 text-xs font-black uppercase tracking-[0.32em] text-red-600">Simulador Online</p>
                <h2 className="mt-2 text-3xl font-black leading-tight">Financiamento automotivo</h2>
                <p className="mt-2 text-sm font-medium text-zinc-500">Taxa referencial de {campaign?.interest_rate || '2.89'}% ao mês.</p>

                <div className="mt-6 rounded-[28px] bg-zinc-50 p-5">
                  <p className="text-sm font-bold text-zinc-500">Parcela estimada</p>
                  <strong className="mt-1 block text-4xl font-black text-red-600">{money(simulation.estimatedInstallment)}</strong>
                  <p className="mt-2 text-xs font-bold text-zinc-400">Valores sujeitos à análise de crédito e condições vigentes.</p>
                </div>

                <button
                  className="mt-6 w-full rounded-full bg-red-600 px-5 py-4 text-sm font-black uppercase tracking-wide text-white shadow-xl shadow-red-600/25 transition hover:bg-red-700"
                  type="button"
                  onClick={openCleanSimulation}
                >
                  Simular meu financiamento
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-3 rounded-[26px] border border-white/15 bg-white/5 p-4 text-white backdrop-blur md:grid-cols-4">
            <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-lg font-black">1</span>
              <div>
                <p className="text-sm font-black uppercase">Condições</p>
                <p className="text-xs font-bold text-zinc-400">Jamais vistas</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-lg font-black">2</span>
              <div>
                <p className="text-sm font-black uppercase">Veículos</p>
                <p className="text-xs font-bold text-zinc-400">{vehicles.length || 0} disponíveis na landing</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-lg font-black">3</span>
              <div>
                <p className="text-sm font-black uppercase">Primeira parcela</p>
                <p className="text-xs font-bold text-zinc-400">Conforme aprovação</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-lg font-black">4</span>
              <div>
                <p className="text-sm font-black uppercase">Lojas</p>
                <p className="text-xs font-bold text-zinc-400">Participantes selecionadas</p>
              </div>
            </div>
          </div>

          <div id="sobre-festival" className="mt-5 rounded-[26px] border border-white/15 bg-black/25 p-4 backdrop-blur">
            <p className="mb-3 text-center text-[11px] font-black uppercase tracking-[0.45em] text-zinc-400">Lojas participantes</p>
            <div className="overflow-hidden rounded-2xl bg-white p-3">
              <img
                src="/campaign-assets/lojas-participantes.png"
                alt="Lojas participantes"
                className="mx-auto max-h-56 w-full object-contain"
                onError={(event) => { event.currentTarget.style.display = 'none'; }}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-5 text-center md:grid-cols-2 md:items-center">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-zinc-400">Realização</p>
              <div className="mx-auto h-20 w-56 overflow-visible">
                <div
                  className="h-full w-full bg-center bg-no-repeat"
                  style={{
                    backgroundImage: "url('/campaign-assets/auto-sede-logo.png')",
                    backgroundSize: '360%'
                  }}
                />
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-zinc-400">Apoio</p>
              <div className="mx-auto h-20 w-72 overflow-visible">
                <div
                  className="h-full w-full bg-center bg-no-repeat"
                  style={{
                    backgroundImage: "url('/campaign-assets/bradesco-financiamentos.png')",
                    backgroundSize: '250%'
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-center text-[11px] font-black uppercase leading-relaxed tracking-wide text-white">
            Atenção: as condições especiais do Festival Seu Carro Agora são válidas somente para as lojas participantes. Condições sujeitas à análise, cadastro, aprovação de crédito e regras das instituições financeiras.
          </div>
        </div>
      </section>

      <section id="veiculos" className="bg-white px-5 py-14 text-zinc-950 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-red-600">Estoque disponível</p>
              <h2 className="mt-2 text-3xl font-black md:text-5xl">Veículos em destaque</h2>
            </div>
            <button className="rounded-2xl bg-[#071020] px-6 py-4 text-sm font-black text-white" type="button" onClick={openCleanSimulation}>
              SIMULAR AGORA
            </button>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {vehicles.map((vehicle) => (
              <div key={vehicle.id} className="overflow-hidden rounded-[32px] border border-zinc-100 bg-zinc-50 shadow-xl shadow-zinc-200/60">
                {vehicle.image_url ? (
                  <button
                    type="button"
                    onClick={() => openGallery(vehicle)}
                    className="group relative block h-56 w-full overflow-hidden text-left"
                  >
                    <img src={vehicle.image_url} alt={vehicle.model} className="h-56 w-full object-cover transition duration-300 group-hover:scale-105" />
                    <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-4 py-2 text-xs font-black uppercase tracking-wide text-white backdrop-blur">
                      Ver fotos
                    </span>
                    {vehicleImages(vehicle).length > 1 ? (
                      <span className="absolute right-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-black text-zinc-950">
                        {vehicleImages(vehicle).length} fotos
                      </span>
                    ) : null}
                  </button>
                ) : (
                  <div className="flex h-56 items-center justify-center bg-zinc-200 font-bold text-zinc-500">Sem imagem</div>
                )}

                <div className="p-5">
                  <h3 className="text-xl font-black">{vehicle.brand} {vehicle.model}</h3>
                  <p className="mt-1 text-sm font-bold text-zinc-500">
                    {[vehicle.version, vehicle.year].filter(Boolean).join(' • ') || 'Informações em atualização'}
                  </p>

                  <strong className="mt-4 block text-3xl font-black text-red-600">{money(vehicle.price)}</strong>

                  {vehicleSpecs(vehicle).length ? (
                    <div className="mt-4 grid gap-2 text-xs font-black text-zinc-600 sm:grid-cols-2">
                      {vehicleSpecs(vehicle).map((spec) => (
                        <span key={`${vehicle.id}-${spec.label}`} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                          <span className="text-zinc-400">{spec.label}:</span> {spec.value}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <button className="mt-5 w-full rounded-2xl bg-red-600 px-5 py-4 text-sm font-black text-white" type="button" onClick={() => openWithVehicle(vehicle.id)}>
                    Simular este veículo
                  </button>
                </div>
              </div>
            ))}

            {!vehicles.length ? <p className="text-sm font-bold text-zinc-500">Nenhum veículo disponível no momento.</p> : null}
          </div>
        </div>
      </section>

      <section className="bg-zinc-50 px-5 py-14 text-zinc-950 md:px-10">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2 xl:grid-cols-4">
          {['Escolha o carro', 'Informe seus dados', 'Simule as parcelas', 'Receba atendimento consultivo'].map((item, index) => (
            <div key={item} className="rounded-[28px] bg-white p-6 shadow-xl shadow-zinc-200/60">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-lg font-black text-red-600">{index + 1}</span>
              <h3 className="mt-5 text-xl font-black">{item}</h3>
              <p className="mt-2 text-sm font-medium text-zinc-500">Processo simples, seguro e orientado por consultor.</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#071020] px-5 py-14 text-center text-white md:px-10">
        <h2 className="mx-auto max-w-3xl text-3xl font-black md:text-5xl">Seu próximo carro pode estar mais perto do que você imagina.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-300">Faça agora sua simulação e receba atendimento prioritário.</p>
        <button className="mt-8 rounded-2xl bg-red-600 px-8 py-4 text-sm font-black uppercase tracking-wide text-white" type="button" onClick={openCleanSimulation}>
          SIMULAR MEU FINANCIAMENTO
        </button>
      </section>


      {galleryVehicle ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[32px] bg-white p-4 text-zinc-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-red-600">Galeria do veículo</p>
                <h2 className="mt-2 text-2xl font-black">
                  {galleryVehicle.brand} {galleryVehicle.model}
                </h2>
                <p className="mt-1 text-sm font-bold text-zinc-500">
                  {galleryVehicle.version} • {galleryVehicle.year} • {money(galleryVehicle.price)}
                </p>
              </div>

              <button
                className="rounded-xl bg-zinc-100 p-2 text-zinc-500"
                type="button"
                onClick={() => setGalleryVehicle(null)}
              >
                <X size={18} />
              </button>
            </div>

            {activeGalleryImage ? (
              <div className="mt-4 overflow-hidden rounded-[28px] bg-zinc-100">
                <img
                  src={activeGalleryImage}
                  alt="Foto do veículo"
                  className="max-h-[62vh] w-full object-contain"
                />
              </div>
            ) : null}

            {galleryImages.length > 1 ? (
              <div className="mt-4 grid gap-3 grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
                {galleryImages.map((image: string, index: number) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => setGalleryIndex(index)}
                    className={`overflow-hidden rounded-2xl border ${index === galleryIndex ? 'border-red-500 ring-4 ring-red-500/10' : 'border-zinc-200'}`}
                  >
                    <img src={image} alt="Miniatura do veículo" className="h-24 w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                className="flex-1 rounded-2xl bg-red-600 px-6 py-4 text-sm font-black uppercase tracking-wide text-white"
                type="button"
                onClick={() => {
                  openWithVehicle(galleryVehicle.id);
                  setGalleryVehicle(null);
                }}
              >
                Simular este veículo
              </button>

              <button
                className="flex-1 rounded-2xl bg-zinc-950 px-6 py-4 text-sm font-black uppercase tracking-wide text-white"
                type="button"
                onClick={() => setGalleryVehicle(null)}
              >
                Fechar galeria
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[32px] bg-white p-5 text-zinc-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">
                  <ShieldCheck size={15} /> Ambiente seguro
                </div>
                <h2 className="mt-3 text-2xl font-black">Simulador Online de Financiamento</h2>
                <p className="mt-1 text-sm font-medium text-zinc-500">Preencha os dados abaixo para iniciar sua simulação.</p>
              </div>
              <button className="rounded-xl bg-zinc-100 p-2 text-zinc-500" type="button" onClick={() => setModalOpen(false)}><X size={18} /></button>
            </div>

            {!submitted ? (
              <form onSubmit={submitSimulation} className="mt-5 grid gap-3">
                <input className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm font-bold outline-none focus:border-red-500" placeholder="Nome completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm font-bold outline-none focus:border-red-500" placeholder="Telefone/WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} />
                <input className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm font-bold outline-none focus:border-red-500" placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} />
                <input className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm font-bold outline-none focus:border-red-500" placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

                <select
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm font-bold outline-none focus:border-red-500"
                  value={form.vehicle_id}
                  onChange={(e) => {
                    setForm({ ...form, vehicle_id: e.target.value });
                    setSelectedVehicleImageIndex(0);
                  }}
                >
                  <option value="">Selecione o veículo</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.brand} {vehicle.model} {vehicle.version} {vehicle.year} - {money(vehicle.price)}
                    </option>
                  ))}
                </select>

                {selectedVehicle ? (
                  <div className="overflow-hidden rounded-[28px] border border-zinc-100 bg-zinc-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start">
                      {activeSelectedVehicleImage ? (
                        <div className="overflow-hidden rounded-2xl bg-zinc-100 md:w-52">
                          <img
                            src={activeSelectedVehicleImage}
                            alt="Foto do veículo selecionado"
                            className="h-36 w-full object-cover md:h-32"
                          />
                        </div>
                      ) : (
                        <div className="flex h-32 items-center justify-center rounded-2xl bg-zinc-200 text-sm font-bold text-zinc-500 md:w-52">
                          Sem foto
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black uppercase tracking-wide text-red-600">Veículo selecionado</p>
                        <h3 className="mt-1 break-words text-lg font-black text-zinc-950">
                          {selectedVehicle.brand} {selectedVehicle.model}
                        </h3>
                        <p className="mt-1 break-words text-sm font-bold text-zinc-500">
                          {[selectedVehicle.version, selectedVehicle.year].filter(Boolean).join(' • ')}
                        </p>
                        <strong className="mt-2 block text-xl font-black text-red-600">
                          {money(selectedVehicle.price)}
                        </strong>

                        {vehicleSpecs(selectedVehicle).length ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black text-zinc-600">
                            {vehicleSpecs(selectedVehicle).map((spec) => (
                              <span key={`selected-${spec.label}`} className="rounded-full bg-white px-3 py-1">
                                <span className="text-zinc-400">{spec.label}:</span> {spec.value}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {selectedVehicleImages.length > 1 ? (
                      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                        {selectedVehicleImages.map((image: string, index: number) => (
                          <button
                            key={image}
                            type="button"
                            onClick={() => setSelectedVehicleImageIndex(index)}
                            className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border ${index === selectedVehicleImageIndex ? 'border-red-500 ring-4 ring-red-500/10' : 'border-zinc-200'}`}
                          >
                            <img src={image} alt="Miniatura do veículo" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm font-bold text-zinc-500">
                    Selecione um veículo para visualizar fotos, valor e prévia da simulação.
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <input className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm font-bold outline-none focus:border-red-500" value={selectedVehicle ? money(selectedVehicle.price) : ''} readOnly placeholder="Valor do veículo" />
                  <input className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm font-bold outline-none focus:border-red-500" type="number" placeholder="Valor de entrada" value={form.down_payment} onChange={(e) => setForm({ ...form, down_payment: e.target.value })} />
                </div>

                <select className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm font-bold outline-none focus:border-red-500" value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })}>
                  {[12, 24, 36, 48, 60].map((item) => <option key={item} value={item}>{item} parcelas</option>)}
                </select>

                {selectedVehicle ? (
                  <div className="rounded-[28px] border border-red-100 bg-red-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-red-600">Prévia da simulação</p>
                    <div className="mt-3 grid gap-2 text-sm font-bold text-zinc-700 md:grid-cols-2">
                      <span>Valor do veículo: {money(simulation.vehiclePrice)}</span>
                      <span>Entrada: {money(simulation.downPayment)}</span>
                      <span>Valor financiado: {money(simulation.financedAmount)}</span>
                      <span>Parcelas: {simulation.installments}x</span>
                    </div>
                    <strong className="mt-3 block text-2xl font-black text-red-600">{money(simulation.estimatedInstallment)}</strong>
                    <p className="mt-2 text-xs font-bold text-zinc-500">Valores sujeitos à análise de crédito, cadastro, aprovação da instituição financeira e condições vigentes.</p>
                  </div>
                ) : null}

                <div className="rounded-2xl bg-zinc-50 p-4 text-xs font-bold leading-relaxed text-zinc-500">
                  Seguimos rigorosamente a LGPD — Lei Geral de Proteção de Dados. Seus dados serão utilizados apenas para atendimento, simulação e contato comercial. Não solicitamos senhas, tokens, códigos de confirmação ou dados bancários sensíveis. Esta simulação não realiza consulta oficial ao seu score e não reduz sua pontuação.
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-sm font-bold text-zinc-600">
                  <input className="mt-1" type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
                  Li e concordo com o uso dos meus dados para receber contato sobre esta simulação.
                </label>

                <button disabled={!isValid || sending} className="rounded-2xl bg-red-600 px-6 py-4 text-sm font-black uppercase tracking-wide text-white shadow-xl shadow-red-600/20 disabled:cursor-not-allowed disabled:bg-zinc-300" type="submit">
                  {sending ? 'Enviando...' : 'SIMULAR AGORA'}
                </button>

                {message ? <p className="text-sm font-bold text-red-600">{message}</p> : null}
              </form>
            ) : (
              <div className="mt-5 overflow-hidden rounded-[28px] border border-red-200 bg-gradient-to-br from-red-700 to-red-950 p-6 text-white shadow-2xl shadow-red-600/30">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-black">
                  <Sparkles size={15} /> Pré-análise concluída
                </div>

                <h3 className="mt-4 text-3xl font-black">Sua simulação foi recebida.</h3>
                <p className="mt-4 text-sm font-medium leading-relaxed text-red-50">
                  Com base nas informações enviadas, sua simulação apresentou alta compatibilidade para análise de crédito, com possibilidade de até 80% de chance de avanço para aprovação, sujeita à validação cadastral e financeira.
                </p>
                <p className="mt-4 text-sm font-medium leading-relaxed text-red-50">
                  Você foi direcionado para atendimento prioritário na campanha {campaign?.name}. Um consultor entrará em contato em breve.
                </p>

                <a href={whatsappUrl()} target="_blank" className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-white px-6 py-4 text-sm font-black uppercase tracking-wide text-red-700">
                  ANTECIPAR ATENDIMENTO
                </a>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
