'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, CarFront, ChevronLeft, ChevronRight, Fuel, Gauge, Heart, Image as ImageIcon, MapPin, MessageCircle, Palette, Share2, SlidersHorizontal, X } from 'lucide-react';

type Props = {
  vehicles: any[];
  primaryColor: string;
  onOpenSimulator: (vehicleId: string) => void;
};

function money(value: unknown) {
  const number = Number(value || 0);
  return number > 0 ? `R$ ${number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Consulte';
}

function kilometers(value: unknown) {
  const number = Number(value || 0);
  return number > 0 ? `${number.toLocaleString('pt-BR')} km` : '';
}

function vehiclePhotos(vehicle: any) {
  const candidates = [vehicle?.image_url, vehicle?.main_image_url, vehicle?.cover_image_url, ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []), ...(Array.isArray(vehicle?.images) ? vehicle.images : []), ...(Array.isArray(vehicle?.photos) ? vehicle.photos : []), ...(Array.isArray(vehicle?.gallery) ? vehicle.gallery : [])];
  return Array.from(new Set(candidates.map((item: any) => typeof item === 'string' ? item : item?.url || item?.image_url || item?.public_url || '').filter(Boolean)));
}

function vehicleDescription(vehicle: any) {
  return String(vehicle?.description || vehicle?.public_description || vehicle?.site_description || vehicle?.ai_description || vehicle?.details || '').trim();
}

function whatsappLink(vehicle: any) {
  const phone = String(vehicle?.store_whatsapp || vehicle?.whatsapp || vehicle?.whatsapp_number || '').replace(/\D/g, '');
  return phone ? `https://wa.me/${phone}` : '';
}

export function CampaignVehicleShowcase({ vehicles, primaryColor, onOpenSimulator }: Props) {
  const [selected, setSelected] = useState<any>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const swipeStartX = useRef<number | null>(null);
  const photos = useMemo(() => selected ? vehiclePhotos(selected) : [], [selected]);
  const description = useMemo(() => selected ? vehicleDescription(selected) : '', [selected]);

  function previousPhoto() {
    setPhotoIndex((index) => photos.length ? (index - 1 + photos.length) % photos.length : 0);
  }

  function nextPhoto() {
    setPhotoIndex((index) => photos.length ? (index + 1) % photos.length : 0);
  }

  useEffect(() => {
    if (!selected) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
      if (event.key === 'ArrowLeft') previousPhoto();
      if (event.key === 'ArrowRight') nextPhoto();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', keyboard); };
  }, [selected, photos.length]);

  function openDetails(vehicle: any) {
    setSelected(vehicle);
    setPhotoIndex(0);
    setFavorite(false);
  }

  function startSwipe(clientX: number) {
    swipeStartX.current = clientX;
  }

  function finishSwipe(clientX: number) {
    if (swipeStartX.current === null || photos.length < 2) return;
    const distance = clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(distance) < 45) return;
    if (distance < 0) nextPhoto();
    else previousPhoto();
  }

  async function shareVehicle() {
    const data = { title: `${selected.brand || ''} ${selected.model || ''}`.trim(), text: `Confira este veículo: ${selected.brand || ''} ${selected.model || ''}`.trim(), url: window.location.href };
    if (navigator.share) await navigator.share(data).catch(() => undefined);
    else await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
  }

  const overview = selected ? [
    [CalendarDays, 'Ano', selected.year || selected.model_year],
    [Gauge, 'Quilometragem', kilometers(selected.mileage || selected.km)],
    [SlidersHorizontal, 'Câmbio', selected.transmission],
    [Fuel, 'Combustível', selected.fuel],
    [Palette, 'Cor', selected.color],
    [CarFront, 'Versão', selected.version]
  ].filter(([, , value]) => value) : [];

  return <>
    <section id="veiculos" className="bg-slate-100 px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        <h2 className="text-4xl font-black tracking-[-0.04em]">Veículos disponíveis</h2>
        {vehicles.length ? <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{vehicles.map((vehicle) => {
          const cardPhotos = vehiclePhotos(vehicle); const cover = cardPhotos[0];
          return <article key={vehicle.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <button type="button" className="block aspect-[16/10] w-full overflow-hidden bg-slate-200" onClick={() => openDetails(vehicle)}>{cover ? <img src={cover} alt={`${vehicle.brand || ''} ${vehicle.model || ''}`} className="h-full w-full object-cover transition duration-300 hover:scale-105" /> : <span className="flex h-full items-center justify-center text-slate-400"><CarFront size={56} /></span>}</button>
            <div className="p-5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{vehicle.store_name || 'Loja participante'}</p>
              <h3 className="mt-2 text-xl font-black uppercase">{vehicle.brand} {vehicle.model}</h3>
              <p className="mt-1 min-h-10 text-sm text-slate-500">{[vehicle.version, vehicle.year || vehicle.model_year].filter(Boolean).join(' • ')}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">{kilometers(vehicle.mileage || vehicle.km) ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5"><Gauge size={14} /> {kilometers(vehicle.mileage || vehicle.km)}</span> : null}{cardPhotos.length ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5"><ImageIcon size={14} /> {cardPhotos.length} foto(s)</span> : null}</div>
              {vehicle.original_price ? <p className="mt-4 text-xs font-bold text-slate-400 line-through">{money(vehicle.original_price)}</p> : null}<strong className="mt-1 block text-2xl font-black">{money(vehicle.price)}</strong>
              <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => onOpenSimulator(vehicle.id)} className="min-h-12 rounded-2xl px-3 text-xs font-black text-white" style={{ backgroundColor: primaryColor }}>VER PARCELAS</button><button type="button" onClick={() => openDetails(vehicle)} className="min-h-12 rounded-2xl border-2 bg-white px-3 text-xs font-black" style={{ borderColor: primaryColor, color: primaryColor }}>FOTOS</button></div>
            </div>
          </article>;
        })}</div> : <div className="mt-8 rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">Nenhum veículo disponível nesta campanha.</div>}
      </div>
    </section>

    {selected ? <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-100" role="dialog" aria-modal="true" aria-label={`Detalhes de ${selected.brand} ${selected.model}`}>
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-2 text-sm font-bold text-slate-700"><ArrowLeft size={19} /><span className="hidden sm:inline">Voltar à lista</span></button><span className="h-7 w-px bg-slate-200" /><strong className="truncate text-sm sm:text-lg">{selected.store_name || 'Loja participante'}</strong></div>
        <div className="flex items-center gap-1 sm:gap-3"><button type="button" onClick={shareVehicle} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-bold hover:bg-slate-100"><Share2 size={18} /><span className="hidden md:inline">Compartilhar</span></button><button type="button" onClick={() => setFavorite((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-bold hover:bg-slate-100"><Heart size={18} fill={favorite ? 'currentColor' : 'none'} /><span className="hidden md:inline">Favoritar</span></button><button type="button" onClick={() => setSelected(null)} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-bold hover:bg-slate-100"><X size={19} /><span className="hidden md:inline">Fechar</span></button></div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section className="relative min-h-[420px] touch-pan-y select-none overflow-hidden rounded-[28px] bg-slate-950 sm:min-h-[560px]" onTouchStart={(event) => startSwipe(event.touches[0].clientX)} onTouchEnd={(event) => finishSwipe(event.changedTouches[0].clientX)} onMouseDown={(event) => startSwipe(event.clientX)} onMouseUp={(event) => finishSwipe(event.clientX)} onMouseLeave={() => { swipeStartX.current = null; }}>
            {photos.length ? <img key={photos[photoIndex]} src={photos[photoIndex]} alt={`${selected.brand} ${selected.model}`} draggable={false} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300" /> : <div className="absolute inset-0 flex items-center justify-center text-slate-500"><CarFront size={90} /></div>}
            {photoIndex === 0 ? <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/35 to-transparent" /> : null}
            {photoIndex === 0 ? <div className="pointer-events-none relative z-10 flex min-h-[420px] max-w-2xl flex-col justify-end p-6 text-white sm:min-h-[560px] sm:p-10">
              {selected.store_name ? <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full bg-black/45 px-4 py-2 text-sm font-bold backdrop-blur"><MapPin size={17} /> {selected.store_name}</span> : null}
              <h1 className="text-4xl font-black leading-none tracking-[-0.04em] sm:text-6xl">{selected.brand} {selected.model}</h1>
              <h2 className="mt-3 text-2xl font-black sm:text-4xl">{selected.version || ''}</h2>
              <p className="mt-5 text-sm font-bold text-slate-200 sm:text-base">{[selected.year || selected.model_year, kilometers(selected.mileage || selected.km), selected.transmission, selected.fuel].filter(Boolean).join('  •  ')}</p>
              <strong className="mt-6 text-4xl font-black sm:text-5xl">{money(selected.price)}</strong>
              <div className="pointer-events-auto mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => { const id = selected.id; setSelected(null); onOpenSimulator(id); }} className="min-h-12 rounded-2xl px-6 text-sm font-black text-white" style={{ backgroundColor: primaryColor }}>SIMULAR FINANCIAMENTO</button>{whatsappLink(selected) ? <a href={whatsappLink(selected)} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/50 bg-black/25 px-6 text-sm font-black text-white backdrop-blur"><MessageCircle size={18} /> FALAR COM A LOJA</a> : null}</div>
            </div> : null}
            {photos.length > 1 ? <><button type="button" onClick={(event) => { event.stopPropagation(); previousPhoto(); }} className="absolute left-3 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition hover:scale-105 hover:bg-black/75" aria-label="Foto anterior"><ChevronLeft size={28} /></button><button type="button" onClick={(event) => { event.stopPropagation(); nextPhoto(); }} className="absolute right-3 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition hover:scale-105 hover:bg-black/75" aria-label="Próxima foto"><ChevronRight size={28} /></button><span className="absolute bottom-4 right-4 z-30 rounded-full bg-black/60 px-3 py-1.5 text-xs font-black text-white">{photoIndex + 1}/{photos.length}</span></> : null}
          </section>

          {photos.length ? <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><h3 className="text-xl font-black">Galeria</h3><div className="mt-4 flex gap-3 overflow-x-auto pb-2">{photos.map((photo, index) => <button type="button" key={photo} onClick={() => setPhotoIndex(index)} className={`h-28 w-44 shrink-0 overflow-hidden rounded-2xl border-2 ${index === photoIndex ? '' : 'border-transparent opacity-75'}`} style={index === photoIndex ? { borderColor: primaryColor } : undefined}><img src={photo} alt="" className="h-full w-full object-cover" /></button>)}</div><button type="button" onClick={() => window.scrollTo({ top: 64, behavior: 'smooth' })} className="mx-auto mt-4 block rounded-xl border border-slate-300 px-5 py-3 text-sm font-black">VER TODAS AS {photos.length} FOTOS</button></section> : null}

          {description ? <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><h3 className="text-xl font-black">Descrição do veículo</h3><p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">{description}</p></section> : null}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-20 xl:self-start">
          <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-lg"><p className="text-sm font-bold text-slate-500">Preço</p>{selected.original_price ? <p className="mt-2 text-sm font-bold text-slate-400 line-through">{money(selected.original_price)}</p> : null}<strong className="mt-1 block text-4xl font-black">{money(selected.price)}</strong><button type="button" onClick={() => { const id = selected.id; setSelected(null); onOpenSimulator(id); }} className="mt-6 min-h-14 w-full rounded-2xl text-sm font-black text-white" style={{ backgroundColor: primaryColor }}>SIMULAR FINANCIAMENTO</button>
            {overview.length ? <div className="mt-5 border-t border-slate-200 pt-5"><h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Informações do veículo</h3><div className="mt-4 grid grid-cols-2 gap-3">{overview.map(([Icon, label, value]: any) => <div key={label} className="min-w-0 rounded-2xl bg-slate-50 p-3"><Icon size={19} className="text-slate-500" /><p className="mt-2 text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-bold leading-snug text-slate-800">{String(value)}</p></div>)}</div></div> : null}
            {whatsappLink(selected) ? <a href={whatsappLink(selected)} target="_blank" rel="noreferrer" className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-500 text-sm font-black text-emerald-600"><MessageCircle size={19} /> WHATSAPP</a> : null}<div className="mt-5 border-t border-slate-200 pt-5"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Loja responsável</p><p className="mt-2 flex items-center gap-2 text-sm font-bold"><MapPin size={17} /> {selected.store_name || 'Loja participante'}</p></div></section>
          {description ? <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-black">Destaques do veículo</h3><p className="mt-3 line-clamp-6 text-sm leading-6 text-slate-600">{description}</p></section> : null}
        </aside>
      </main>
    </div> : null}
  </>;
}
