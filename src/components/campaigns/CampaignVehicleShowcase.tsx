'use client';

import { useEffect, useMemo, useState } from 'react';
import { CarFront, ChevronLeft, ChevronRight, Gauge, Image as ImageIcon, MapPin, X } from 'lucide-react';

type Props = {
  vehicles: any[];
  primaryColor: string;
  onOpenSimulator: (vehicleId: string) => void;
};

function money(value: unknown) {
  const number = Number(value || 0);
  return number > 0
    ? `R$ ${number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'Consulte';
}

function kilometers(value: unknown) {
  const number = Number(value || 0);
  return number > 0 ? `${number.toLocaleString('pt-BR')} km` : '';
}

function vehiclePhotos(vehicle: any) {
  const candidates = [
    vehicle?.image_url,
    vehicle?.main_image_url,
    vehicle?.cover_image_url,
    ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []),
    ...(Array.isArray(vehicle?.images) ? vehicle.images : []),
    ...(Array.isArray(vehicle?.photos) ? vehicle.photos : []),
    ...(Array.isArray(vehicle?.gallery) ? vehicle.gallery : [])
  ];

  return Array.from(new Set(candidates.map((item: any) => {
    if (typeof item === 'string') return item;
    return item?.url || item?.image_url || item?.public_url || '';
  }).filter(Boolean)));
}

function detailRows(vehicle: any) {
  return [
    ['Versão', vehicle?.version],
    ['Ano', vehicle?.year || vehicle?.model_year],
    ['Quilometragem', kilometers(vehicle?.mileage || vehicle?.km)],
    ['Câmbio', vehicle?.transmission],
    ['Combustível', vehicle?.fuel],
    ['Cor', vehicle?.color],
    ['Portas', vehicle?.doors],
    ['Loja', vehicle?.store_name]
  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
}

export function CampaignVehicleShowcase({ vehicles, primaryColor, onOpenSimulator }: Props) {
  const [selected, setSelected] = useState<any>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = useMemo(() => selected ? vehiclePhotos(selected) : [], [selected]);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
      if (event.key === 'ArrowLeft') setPhotoIndex((index) => photos.length ? (index - 1 + photos.length) % photos.length : 0);
      if (event.key === 'ArrowRight') setPhotoIndex((index) => photos.length ? (index + 1) % photos.length : 0);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', close);
    };
  }, [selected, photos.length]);

  function openDetails(vehicle: any) {
    setSelected(vehicle);
    setPhotoIndex(0);
  }

  return (
    <>
      <section id="veiculos" className="bg-slate-100 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <h2 className="text-4xl font-black tracking-[-0.04em]">Veículos disponíveis</h2>
          {vehicles.length ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {vehicles.map((vehicle) => {
                const photos = vehiclePhotos(vehicle);
                const cover = photos[0];
                return (
                  <article key={vehicle.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                    <button type="button" className="block aspect-[16/10] w-full overflow-hidden bg-slate-200 text-left" onClick={() => openDetails(vehicle)} aria-label={`Ver fotos de ${vehicle.brand} ${vehicle.model}`}>
                      {cover ? <img src={cover} alt={`${vehicle.brand || ''} ${vehicle.model || ''}`} className="h-full w-full object-cover transition duration-300 hover:scale-105" /> : <span className="flex h-full items-center justify-center text-slate-400"><CarFront size={56} /></span>}
                    </button>
                    <div className="p-5">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{vehicle.store_name || 'Loja participante'}</p>
                      <h3 className="mt-2 text-xl font-black uppercase">{vehicle.brand} {vehicle.model}</h3>
                      <p className="mt-1 min-h-10 text-sm text-slate-500">{[vehicle.version, vehicle.year || vehicle.model_year].filter(Boolean).join(' • ')}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                        {kilometers(vehicle.mileage || vehicle.km) ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5"><Gauge size={14} /> {kilometers(vehicle.mileage || vehicle.km)}</span> : null}
                        {photos.length ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5"><ImageIcon size={14} /> {photos.length} foto(s)</span> : null}
                      </div>
                      {vehicle.original_price ? <p className="mt-4 text-xs font-bold text-slate-400 line-through">{money(vehicle.original_price)}</p> : null}
                      <strong className="mt-1 block text-2xl font-black">{money(vehicle.price)}</strong>
                      <div className="mt-5 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => onOpenSimulator(vehicle.id)} className="min-h-12 rounded-2xl px-3 text-xs font-black text-white" style={{ backgroundColor: primaryColor }}>VER PARCELAS</button>
                        <button type="button" onClick={() => openDetails(vehicle)} className="min-h-12 rounded-2xl border-2 bg-white px-3 text-xs font-black" style={{ borderColor: primaryColor, color: primaryColor }}>FOTOS</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-8 rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">Nenhum veículo disponível nesta campanha.</div>
          )}
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Fotos e detalhes de ${selected.brand} ${selected.model}`} onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }}>
          <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-[28px] bg-white shadow-2xl">
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">{selected.store_name || 'Loja participante'}</p><h2 className="text-xl font-black">{selected.brand} {selected.model}</h2></div>
              <button type="button" onClick={() => setSelected(null)} className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100" aria-label="Fechar"><X size={22} /></button>
            </div>
            <div className="grid lg:grid-cols-[1.45fr_0.75fr]">
              <div className="bg-slate-950 p-3 sm:p-5">
                <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-slate-900">
                  {photos.length ? <img src={photos[photoIndex]} alt={`${selected.brand} ${selected.model} - foto ${photoIndex + 1}`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-slate-500"><CarFront size={72} /></div>}
                  {photos.length > 1 ? <><button type="button" onClick={() => setPhotoIndex((photoIndex - 1 + photos.length) % photos.length)} className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Foto anterior"><ChevronLeft /></button><button type="button" onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)} className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Próxima foto"><ChevronRight /></button></> : null}
                </div>
                {photos.length > 1 ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{photos.map((photo, index) => <button type="button" key={photo} onClick={() => setPhotoIndex(index)} className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 ${index === photoIndex ? 'border-white' : 'border-transparent opacity-60'}`}><img src={photo} alt="" className="h-full w-full object-cover" /></button>)}</div> : null}
              </div>
              <div className="p-6 sm:p-8">
                <p className="text-sm text-slate-500">{selected.version || 'Versão não informada'}</p>
                {selected.original_price ? <p className="mt-5 text-sm font-bold text-slate-400 line-through">{money(selected.original_price)}</p> : null}
                <strong className="mt-1 block text-3xl font-black">{money(selected.price)}</strong>
                <div className="mt-6 grid grid-cols-2 gap-3">{detailRows(selected).map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-100 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-bold">{String(value)}</p></div>)}</div>
                {selected.description ? <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-slate-600">{selected.description}</p> : null}
                {selected.store_name ? <p className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600"><MapPin size={17} /> {selected.store_name}</p> : null}
                <button type="button" onClick={() => { const id = selected.id; setSelected(null); onOpenSimulator(id); }} className="mt-7 min-h-14 w-full rounded-2xl px-5 text-sm font-black text-white" style={{ backgroundColor: primaryColor }}>VER PARCELAS</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
