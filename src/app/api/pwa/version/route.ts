import { resolvePwaAppVersion } from '@/lib/server/pwaAppVersion';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Expires: '0',
  Pragma: 'no-cache'
};

export function GET() {
  const version = resolvePwaAppVersion();

  return Response.json(
    { version },
    {
      headers: {
        ...NO_STORE_HEADERS,
        'X-Auto-Controle-Version': version
      }
    }
  );
}
