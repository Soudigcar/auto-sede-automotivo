export const dynamic = 'force-dynamic';

import { resolvePwaAppVersion } from '@/lib/server/pwaAppVersion';

function buildServiceWorker(version: string) {
  return `const SW_VERSION = ${JSON.stringify(version)};

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    await self.clients.claim();

    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    windowClients.forEach((client) => {
      client.postMessage({ type: 'PWA_UPDATE_AVAILABLE', version: SW_VERSION });
    });
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  event.respondWith(fetch(request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.info('[PWA] Service worker ativo:', SW_VERSION);
`;
}

export function GET() {
  const version = resolvePwaAppVersion();

  return new Response(buildServiceWorker(version), {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/'
    }
  });
}
