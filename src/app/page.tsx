import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PublicMarketplace } from '@/components/marketplace/PublicMarketplace';
import { loadPortalSettings } from '@/lib/server/portalSettings';
import { INTERNAL_SYSTEM_HOST, resolveInternalAccessUrl } from '@/lib/publicPortalAccess';

const OFFICIAL_PORTAL_URL = 'https://www.autosede.com.br';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadPortalSettings();

  return {
    title: settings.seo_title,
    description: settings.seo_description,
    alternates: {
      canonical: OFFICIAL_PORTAL_URL
    },
    openGraph: {
      title: settings.seo_title,
      description: settings.seo_description,
      url: OFFICIAL_PORTAL_URL,
      siteName: settings.brand_name,
      locale: 'pt_BR',
      type: 'website',
      images: settings.og_image_url ? [{ url: settings.og_image_url, alt: settings.brand_name }] : undefined
    }
  };
}

export default async function HomePage() {
  const headerStore = await headers();
  const host = (headerStore.get('x-forwarded-host') || headerStore.get('host') || '')
    .split(':')[0]
    .trim()
    .toLowerCase();

  if (host === INTERNAL_SYSTEM_HOST) {
    redirect('/login');
  }

  const portalSettings = await loadPortalSettings();
  const internalAccessUrl = resolveInternalAccessUrl(process.env.VERCEL_ENV);
  return <PublicMarketplace internalAccessUrl={internalAccessUrl} portalSettings={portalSettings} />;
}
