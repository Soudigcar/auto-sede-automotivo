import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Store } from 'lucide-react';
import { PublicPortalFooter } from '@/components/marketplace/PublicPortalFooter';
import { PublicPortalHeader } from '@/components/marketplace/PublicPortalHeader';
import { PublicVehicleCard } from '@/components/marketplace/PublicVehicleCard';
import { loadPortalSettings } from '@/lib/server/portalSettings';
import { getPublicStoreBySlug, getPublicVehicles } from '@/lib/server/marketplace';
import { absolutePortalUrl, publicStorePath, publicVehiclePath } from '@/lib/publicRoutes';

export const revalidate = 300;

const loadStore = cache(async (slug: string) => getPublicStoreBySlug(slug));

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [store, settings] = await Promise.all([loadStore(slug), loadPortalSettings()]);
  if (!store) return { title: `Loja indisponível | ${settings.brand_name}`, robots: { index: false, follow: false } };

  const canonical = absolutePortalUrl(publicStorePath(store.slug));
  const title = `${store.name} | Loja parceira ${settings.brand_name}`;
  const description = `Consulte os veículos publicados por ${store.name} no Portal Auto Sede e solicite atendimento diretamente para a loja responsável.`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: settings.brand_name,
      locale: 'pt_BR',
      type: 'website',
      images: store.featured_vehicle_image ? [{ url: store.featured_vehicle_image, alt: store.name }] : settings.og_image_url ? [{ url: settings.og_image_url, alt: settings.brand_name }] : undefined
    },
    robots: { index: true, follow: true }
  };
}

export default async function StoreDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store) notFound();

  const [settings, vehicles] = await Promise.all([
    loadPortalSettings(),
    getPublicVehicles({ storeId: store.id, limit: 500 })
  ]);

  const canonical = absolutePortalUrl(publicStorePath(store.slug));
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    name: store.name,
    url: canonical,
    sameAs: store.website_url ? [store.website_url] : undefined,
    image: store.featured_vehicle_image || undefined,
    makesOffer: vehicles.slice(0, 50).map((vehicle) => ({
      '@type': 'Offer',
      priceCurrency: 'BRL',
      price: vehicle.price,
      availability: 'https://schema.org/InStock',
      url: absolutePortalUrl(publicVehiclePath(vehicle)),
      itemOffered: {
        '@type': 'Vehicle',
        name: [vehicle.brand, vehicle.model, vehicle.version, vehicle.year].filter(Boolean).join(' ')
      }
    }))
  };

  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <PublicPortalHeader settings={settings} />

      <section className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500" aria-label="Navegação estrutural">
          <Link href="/" className="hover:text-red-600">Início</Link><span>/</span>
          <Link href="/lojas" className="hover:text-red-600">Lojas</Link><span>/</span>
          <span className="text-slate-900">{store.name}</span>
        </nav>
      </section>

      <section className="mx-auto max-w-[1480px] px-4 pb-10 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[34px] bg-slate-950 p-6 text-white sm:p-9 lg:p-12">
          {store.featured_vehicle_image ? <img src={store.featured_vehicle_image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" /> : null}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/95 to-slate-950/70" />
          <div className="relative max-w-4xl">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white"><Store size={27} /></span>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-red-400">Loja parceira habilitada</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">{store.name}</h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300">Os veículos abaixo foram publicados por esta loja. Ao solicitar atendimento em um anúncio, o contato permanece direcionado à proprietária do estoque.</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <span className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black">{vehicles.length} veículo(s) disponível(is)</span>
              {store.website_url ? <a href={store.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3 text-sm font-black transition hover:bg-white/[0.12]">Site oficial da loja <ExternalLink size={17} /></a> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1480px] px-4 pb-14 sm:px-6 lg:px-8 lg:pb-20">
        <div className="mb-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Estoque publicado</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.035em]">Veículos desta loja</h2>
        </div>

        {vehicles.length ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {vehicles.map((vehicle) => <PublicVehicleCard key={vehicle.id} vehicle={vehicle} detailsHref={publicVehiclePath(vehicle)} />)}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-slate-300 bg-white p-12 text-center">
            <Store size={44} className="mx-auto text-slate-300" />
            <h2 className="mt-4 text-2xl font-black">Sem veículos publicados</h2>
            <p className="mt-2 text-sm text-slate-500">Esta loja está habilitada, mas ainda não possui estoque disponível no portal.</p>
          </div>
        )}
      </section>

      <PublicPortalFooter settings={settings} />
    </main>
  );
}
