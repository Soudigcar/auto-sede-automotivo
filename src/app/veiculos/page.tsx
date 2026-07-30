import type { Metadata } from 'next';
import { CarFront } from 'lucide-react';
import { PublicPortalFooter } from '@/components/marketplace/PublicPortalFooter';
import { PublicPortalHeader } from '@/components/marketplace/PublicPortalHeader';
import { PublicVehicleCard } from '@/components/marketplace/PublicVehicleCard';
import { loadPortalSettings } from '@/lib/server/portalSettings';
import { getPublicVehicles } from '@/lib/server/marketplace';
import { OFFICIAL_PORTAL_URL, publicVehiclePath } from '@/lib/publicRoutes';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadPortalSettings();
  const title = `Veículos disponíveis | ${settings.brand_name}`;
  const description = 'Consulte veículos publicados por lojas parceiras, compare especificações e solicite uma simulação diretamente para a loja responsável.';

  return {
    title,
    description,
    alternates: { canonical: `${OFFICIAL_PORTAL_URL}/veiculos` },
    openGraph: {
      title,
      description,
      url: `${OFFICIAL_PORTAL_URL}/veiculos`,
      siteName: settings.brand_name,
      locale: 'pt_BR',
      type: 'website',
      images: settings.og_image_url ? [{ url: settings.og_image_url, alt: settings.brand_name }] : undefined
    }
  };
}

export default async function VehiclesPage() {
  const [settings, vehicles] = await Promise.all([
    loadPortalSettings(),
    getPublicVehicles({ limit: 500 })
  ]);

  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <PublicPortalHeader settings={settings} />

      <section className="bg-slate-950 px-4 py-14 text-white sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1480px]">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-400">Catálogo oficial</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">Veículos disponíveis nas lojas parceiras</h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300">Cada anúncio permanece associado à loja responsável. Ao abrir um veículo, você encontra as especificações, a galeria e a simulação de financiamento em uma página própria.</p>
          <div className="mt-7 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black"><CarFront size={20} className="text-red-400" /> {vehicles.length} veículo(s) publicado(s)</div>
        </div>
      </section>

      <section className="mx-auto max-w-[1480px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {vehicles.length ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {vehicles.map((vehicle) => <PublicVehicleCard key={vehicle.id} vehicle={vehicle} detailsHref={publicVehiclePath(vehicle)} />)}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-slate-300 bg-white p-12 text-center">
            <CarFront size={44} className="mx-auto text-slate-300" />
            <h2 className="mt-4 text-2xl font-black">Nenhum veículo publicado</h2>
            <p className="mt-2 text-sm text-slate-500">O catálogo será atualizado assim que as lojas publicarem novos veículos.</p>
          </div>
        )}
      </section>

      <PublicPortalFooter settings={settings} />
    </main>
  );
}
