'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Images } from 'lucide-react';

type Props = {
  vehicle: any;
  compact?: boolean;
};

function vehicleImages(vehicle: any) {
  const candidates = [
    vehicle?.image_url,
    ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : [])
  ];

  return Array.from(new Set(candidates.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

export function CampaignVehicleGallery({ vehicle, compact = false }: Props) {
  const images = useMemo(() => vehicleImages(vehicle), [vehicle]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [vehicle?.id]);

  if (!vehicle) return null;

  const vehicleLabel = [vehicle.brand, vehicle.model, vehicle.version, vehicle.year].filter(Boolean).join(' ');
  const activeImage = images[activeIndex] || images[0] || '';

  if (!activeImage) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 text-center text-xs font-bold text-slate-400">
        <span><Images className="mx-auto mb-2" size={24} />Fotos indisponíveis</span>
      </div>
    );
  }

  function previous() {
    setActiveIndex((current) => (current - 1 + images.length) % images.length);
  }

  function next() {
    setActiveIndex((current) => (current + 1) % images.length);
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className={`relative w-full max-w-full overflow-hidden rounded-2xl bg-slate-900 ${compact ? 'aspect-[16/9]' : 'aspect-[4/3]'}`}>
        {/* URLs vêm de múltiplas integrações de estoque, por isso a imagem permanece sem otimização de domínio. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={activeImage} alt={`${vehicleLabel} — foto ${activeIndex + 1}`} className="h-full w-full object-cover" />
        <span className="absolute right-3 top-3 rounded-full bg-slate-950/75 px-3 py-1 text-[10px] font-black text-white backdrop-blur">
          {activeIndex + 1}/{images.length}
        </span>
        {images.length > 1 ? (
          <>
            <button type="button" onClick={previous} aria-label="Foto anterior" className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/70 text-white backdrop-blur">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={next} aria-label="Próxima foto" className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/70 text-white backdrop-blur">
              <ChevronRight size={18} />
            </button>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="mt-2 flex min-w-0 w-full max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1">
          {images.map((image, index) => (
            <button
              type="button"
              key={`${image}-${index}`}
              onClick={() => setActiveIndex(index)}
              aria-label={`Abrir foto ${index + 1}`}
              className={`h-10 w-14 shrink-0 overflow-hidden rounded-xl border-2 sm:h-12 sm:w-16 ${index === activeIndex ? 'border-emerald-400' : 'border-transparent opacity-65'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
