import type { NextConfig } from 'next';

const HOMOLOGATION_BRANCH = 'test/autocar-follow-up-v2-final-homologation';

function projectRefFromSupabaseUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) return null;
    return parsed.hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

if (
  process.env.VERCEL_ENV === 'preview'
  && process.env.VERCEL_GIT_COMMIT_REF === HOMOLOGATION_BRANCH
) {
  const modernAutocarUrl = String(process.env.AUTOCAR_DEV_SUPABASE_URL || '').trim();
  const modernAutocarKey = String(process.env.AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const legacyAutocarUrl = String(process.env.AUTOCAR_KNOWLEDGE_SUPABASE_URL || '').trim();
  const legacyAutocarKey = String(process.env.AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const selectedAutocarUrl = modernAutocarUrl && modernAutocarKey
    ? modernAutocarUrl
    : legacyAutocarUrl && legacyAutocarKey
      ? legacyAutocarUrl
      : '';

  console.log('[AUTOCAR_HOMOLOGATION_ENV]', JSON.stringify({
    vercel_env: process.env.VERCEL_ENV,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    crm_ref: projectRefFromSupabaseUrl(String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()),
    autocar_ref: projectRefFromSupabaseUrl(selectedAutocarUrl)
  }));
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Audio recording is a first-party CRM feature. Keep it unavailable to
          // embedded/cross-origin contexts while allowing this origin to request it.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(self), payment=(), usb=(), browsing-topics=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline' https://connect.facebook.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://graph.facebook.com https://www.facebook.com; frame-src 'self' https://www.facebook.com; worker-src 'self' blob:; upgrade-insecure-requests"
          }
        ]
      },
      {
        source: '/cadastro-loja/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'private, no-store' }
        ]
      },
      {
        source: '/equipe/cadastro/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'private, no-store' }
        ]
      }
    ];
  }
};

export default nextConfig;
