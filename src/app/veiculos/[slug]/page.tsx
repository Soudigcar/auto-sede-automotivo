import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, CarFront, Fuel, Gauge, Palette, Settings2, Store } from 'lucide-react';
import { PublicPortalFooter } from '@/components/marketplace/PublicPortalFooter';
import { PublicPortalHeader } from '@/components/marketplace/PublicPortalHeader';
import { VehicleDetailActions } from '@/components/marketplace/VehicleDetailActions';
import { loadPortalSettings } from '@/lib/server/portalSettings';
import { getPublicVehicleById } from '@/lib/server/marketplace';
import { absolutePortalUrl, extractVehicleIdFromSlug, publicStorePath, publicVehiclePath } from '@/lib/publicRoutes';

export const revalidate = 300;

const loadVehicleFromSlug = cache(async (slug: string) => {
  const id = extractVehicleIdFromSlug(slug);
  return id ? getPublicVehicleById(id) : null;
});

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function vehicleTitle(vehicle: { brand: string; model: string; version: string; year: string }) {
  return [vehicle.brand, vehicle.model, vehicle.version, vehicle.year].filter(Boolean).join(' ') || 'Veículo disponível';
}

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [vehicle, settings] = await Promise.all([loadVehicleFromSlug(slug), loadPortalSettings()]);
  if (!vehicle) return { title: `Veículo indisponível | ${settings.brand_name}`, robots: { index: false, follow: false } };

  const canonicalPath = publicVehiclePath(vehicle);
  const title = `${vehicleTitle(vehicle)} | ${vehicle.store.name}`;
  const description = `${vehicleTitle(vehicle)} por ${money(vehicle.price)}. Consulte detalhes e simule o financiamento com atendimento direcionado à loja responsável.`;

  return {
    title,
    description,
    alternates: { canonical: absolutePortalUrl(canonicalPath) },
    openGraph: {
      title,
      description,
      url: absolutePortalUrl(canonicalPath),
      siteName: settings.brand_name,
      locale: 'pt_BR',
      type: 'website',
      images: vehicle.image_url ? [{ url: vehicle.image_url, alt: vehicleTitle(vehicle) }] : undefined
    },
    robots: { index: true, follow: true }
  };
}

export default async function VehicleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [vehicle, settings] = await Promise.all([loadVehicleFromSlug(slug), loadPortalSettings()]);
  if (!vehicle) notFound();

  const title = vehicleTitle(vehicle);
  const canonicalPath = publicVehiclePath(vehicle);
  const images = vehicle.image_urls.length ? vehicle.image_urls : vehicle.image_url ? [vehicle.image_url] : [];
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Vehicle',
    name: title,
    url: absolutePortalUrl(canonicalPath),
    image: images,
    vehicleModelDate: vehicle.year || undefined,
    mileageFromOdometer: vehicle.mileage ? { '@type': 'QuantitativeValue', value: vehicle.mileage } : undefined,
    fuelType: vehicle.fuel || undefined,
    vehicleTransmission: vehicle.transmission || undefined,
    color: vehicle.color || undefined,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BRL',
      price: vehicle.price,
      availability: 'https://schema.org/InStock',
      url: absolutePortalUrl(canonicalPath),
      seller: {
        '@type': 'AutoDealer',
        name: vehicle.store.name,
        url: absolutePortalUrl(publicStorePath(vehicle.store.slug))
      }
    }
  };

  const specifications = [
    { label: 'Ano', value: vehicle.year, icon: CarFront },
    { label: 'Quilometragem', value: vehicle.mileage, icon: Gauge },
    { label: 'Câmbio', value: vehicle.transmission, icon: Settings2 },
    { label: 'Combustível', value: vehicle.fuel, icon: Fuel },
    { label: 'Cor', value: vehicle.color, icon: Palette }
  ];

  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <PublicPortalHeader settings={settings} />

      <section className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500" aria-label="Navegação estrutural">
          <Link href="/" className="hover:text-red-600">Início</Link><span>/</span>
          <Link href="/veiculos" className="hover:text-red-600">Veículos</Link><span>/</span>
          <span className="text-slate-900">{vehicle.brand} {vehicle.model}</span>
        </nav>
      </section>

      <section className="mx-auto grid max-w-[1480px] gap-8 px-4 pb-14 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:pb-20">
        <div>
          <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.10)]">
            {images[0] ? (
              <img src={images[0]} alt={title} className="aspect-[16/10] w-full object-cover" />
            ) : (
              <div className="flex aspect-[16/10] items-center justify-center bg-slate-100 text-slate-300"><CarFront size={88} /></div>
            )}
          </div>

          {images.length > 1 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {images.slice(1, 5).map((image, index) => <img key={`${image}-${index}`} src={image} alt={`${title} — foto ${index + 2}`} className="aspect-[16/10] w-full rounded-2xl border border-slate-200 bg-white object-cover" loading="lazy" />)}
            </div>
          ) : null}
        </div>

        <aside className="self-start rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-8 lg:sticky lg:top-24">
          {vehicle.is_featured ? <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-red-700"><BadgeCheck size={14} /> Veículo em destaque</span> : null}
          <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-red-600">{vehicle.year || 'Ano não informado'}</p>
          <h1 className="mt-2 text-3xl font-black leading-tight tracking-[-0.035em] sm:text-4xl">{vehicle.brand} {vehicle.model}</h1>
          <p className="mt-2 text-base font-semibold text-slate-500">{vehicle.version || 'Versão não informada'}</p>

          <div className="mt-6 border-y border-slate-100 py-5">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Valor anunciado</p>
            <p className="mt-2 text-4xl font-black tracking-[-0.04em] text-slate-950">{money(vehicle.price)}</p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {specifications.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                  <Icon size={18} className="text-red-600" />
                  <p className="mt-3 text-[10px] font-black uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className="mt-1 text-sm font-black text-slate-800">{item.value || 'Não informado'}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-6"><VehicleDetailActions vehicle={vehicle} /></div>

          <Link href={publicStorePath(vehicle.store.slug)} className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-red-200">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><Store size={20} /></span>
            <span><span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">Loja responsável</span><span className="mt-1 block font-black text-slate-900">{vehicle.store.name}</span></span>
          </Link>
        </aside>
      </section>

      <PublicPortalFooter settings={settings} />
    </main>
  );
}
