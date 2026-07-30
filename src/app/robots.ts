import type { MetadataRoute } from 'next';
import { OFFICIAL_PORTAL_URL } from '@/lib/publicRoutes';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/login',
        '/logout',
        '/master/',
        '/pre-sales/',
        '/prospector/',
        '/routes/',
        '/store/',
        '/loja/',
        '/trocar-senha'
      ]
    },
    sitemap: `${OFFICIAL_PORTAL_URL}/sitemap.xml`,
    host: OFFICIAL_PORTAL_URL
  };
}
