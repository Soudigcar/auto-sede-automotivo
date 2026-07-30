import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2, CarFront, Store } from 'lucide-react';
import { PublicPortalFooter } from '@/components/marketplace/PublicPortalFooter';
import { PublicPortalHeader } from '@/components/marketplace/PublicPortalHeader';
import { loadPortalSettings } from '@/lib/server/portalSettings';
import { getPublicStores } from '@/lib/server/marketplace';
import { OFFICIAL_PORTAL_URL, publicStorePath } from '@/lib/publicRoutes';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadPortalSettings();
  const title = `Lojas parceiras | ${settings.brand_name}`;
  const description = 'Conheça as lojas parceiras habilitadas no Portal Auto Sede e consulte os veículos publicados por cada revenda.';

  return {
    title,
    description,
    alternates: { canonical: `${OFFICIAL_PORTAL_URL}/lojas` },
    openGraph: {
      title,
      description,
      url: `${OFFICIAL_PORTAL_URL}/lojas`,
      siteName: settings.brand_name,
      locale: 'pt_BR',
      type: 'website',
      images: settings.og_image_url ? [{ url: settings.og_image_url, alt: settings.brand_name }] : undefined
    }
  };
}

export default async function StoresPage() {
  const [settings, stores] = await Promise.all([loadPortalSettings(), getPublicStores()]);

  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <PublicPortalHeader settings={settings} />

      <section className="bg-slate-950 px-4 py-14 text-white sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1480px]">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-400">Rede parceira</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">Lojas habilitadas no Portal Auto Sede</h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300">Cada loja possui uma página própria com os veículos que publicou. O interesse em um anúncio permanece direcionado à proprietária daquele estoque.</p>
          <div className="mt-7 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black"><Building2 size={20} className="text-red-400" /> {stores.length} loja(s) habilitada(s)</div>
        </div>
      </section>

      <section className="mx-auto max-w-[1480px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {stores.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {stores.map((store) => (
              <article key={store.id} className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.08)]">
                <Link href={publicStorePath(store.slug)} className="block">
                  <div className="relative aspect-[16/8] overflow-hidden bg-slate-100">
                    {store.featured_vehicle_image ? <img src={store.featured_vehicle_image} alt={`Veículo publicado por ${store.name}`} className="h-full w-full object-cover transition duration-500 hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center text-slate-300"><Store size={58} /></div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
                    <span className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-slate-950/50 px-3 py-1.5 text-xs font-black text-white backdrop-blur">{store.vehicle_count} veículo(s)</span>
                  </div>
                  <div className="p-6">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-600">Loja parceira</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{store.name}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-slate-500">Consulte o estoque publicado por esta loja e abra a página individual de cada veículo.</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-red-600">Ver página da loja <ArrowRight size={17} /></span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-slate-300 bg-white p-12 text-center">
            <CarFront size={44} className="mx-auto text-slate-300" />
            <h2 className="mt-4 text-2xl font-black">Nenhuma loja publicada</h2>
            <p className="mt-2 text-sm text-slate-500">As lojas aparecerão aqui após a habilitação no portal.</p>
          </div>
        )}
      </section>

      <PublicPortalFooter settings={settings} />
    </main>
  );
}
