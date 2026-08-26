export const dynamic = 'force-dynamic';

const UPDATE_MARKER_CACHE = 'auto-controle-pwa-update-manager-v2';

function buildServiceWorker(version: string) {
  return `const SW_VERSION = ${JSON.stringify(version)};
const UPDATE_MARKER_CACHE = ${JSON.stringify(UPDATE_MARKER_CACHE)};

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys();
    const firstManagedActivation = !cacheKeys.includes(UPDATE_MARKER_CACHE);

    await Promise.all(
      cacheKeys
        .filter((key) => key !== UPDATE_MARKER_CACHE)
        .map((key) => caches.delete(key))
    );
    await caches.open(UPDATE_MARKER_CACHE);
    await self.clients.claim();

    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    await Promise.all(windowClients.map(async (client) => {
      client.postMessage({ type: 'PWA_UPDATE_AVAILABLE', version: SW_VERSION });

      if (firstManagedActivation && 'navigate' in client) {
        try {
          await client.navigate(client.url);
        } catch {
          // A próxima abertura ou retomada do PWA fará a atualização.
        }
      }
    }));
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  event.respondWith(fetch(request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.info('[PWA] Service worker ativo:', SW_VERSION);
`;
}

export function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    'auto-controle-pwa-v2-local';

  return new Response(buildServiceWorker(version), {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/'
    }
  });
}
