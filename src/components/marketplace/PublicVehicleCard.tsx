'use client';

import Link from 'next/link';
import { ArrowRight, BadgeCheck, CarFront, Fuel, Gauge, Settings2, Store } from 'lucide-react';
import type { MarketplaceVehicle } from '@/components/marketplace/types';
import { publicVehiclePath } from '@/lib/publicRoutes';

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function specification(value: string, fallback = 'Não informado') {
  return String(value || '').trim() || fallback;
}

export function PublicVehicleCard({
  vehicle,
  onOpen,
  detailsHref
}: {
  vehicle: MarketplaceVehicle;
  onOpen?: (vehicle: MarketplaceVehicle) => void;
  detailsHref?: string;
}) {
  const image = vehicle.image_url || vehicle.image_urls?.[0] || '';
  const title = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Veículo disponível';
  const href = detailsHref || publicVehiclePath(vehicle);

  return (
    <article className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-1 hover:border-red-200 hover:shadow-[0_22px_55px_rgba(15,23,42,0.14)]">
      <Link href={href} className="block" aria-label={`Ver detalhes de ${title}`}>
        <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
          {image ? (
            <img
              src={image}
              alt={title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-300"><CarFront size={54} /></div>
          )}

          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/65 to-transparent" />

          {vehicle.is_featured ? (
            <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white shadow-lg">
              <BadgeCheck size={13} /> Destaque
            </span>
          ) : null}

          <span className="absolute bottom-4 left-4 inline-flex max-w-[calc(100%-32px)] items-center gap-1.5 rounded-full border border-white/20 bg-slate-950/55 px-3 py-1.5 text-[11px] font-black text-white backdrop-blur">
            <Store size={13} /> <span className="truncate">{vehicle.store.name}</span>
          </span>
        </div>

        <div className="p-5 pb-4">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-600">{vehicle.year || 'Sem ano informado'}</p>
          <h2 className="mt-2 line-clamp-1 text-xl font-black tracking-tight text-slate-950">{title}</h2>
          <p className="mt-1 line-clamp-1 min-h-5 text-sm font-semibold text-slate-500">{vehicle.version || 'Versão não informada'}</p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-slate-50 p-3">
              <Gauge size={16} className="text-slate-400" />
              <p className="mt-2 truncate text-[11px] font-black text-slate-700">{specification(vehicle.mileage, 'KM n/d')}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <Settings2 size={16} className="text-slate-400" />
              <p className="mt-2 truncate text-[11px] font-black text-slate-700">{specification(vehicle.transmission, 'Câmbio n/d')}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <Fuel size={16} className="text-slate-400" />
              <p className="mt-2 truncate text-[11px] font-black text-slate-700">{specification(vehicle.fuel, 'Comb. n/d')}</p>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Valor anunciado</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-slate-950">{money(vehicle.price)}</p>
          </div>
        </div>
      </Link>

      <div className="flex items-center gap-2 px-5 pb-5">
        <Link href={href} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800">
          Ver detalhes <ArrowRight size={17} />
        </Link>
        {onOpen ? (
          <button type="button" onClick={() => onOpen(vehicle)} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-500">
            Simular
          </button>
        ) : null}
      </div>
    </article>
  );
}
