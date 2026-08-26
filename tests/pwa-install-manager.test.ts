import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { GET } from '../src/app/sw.js/route';

const manager = readFileSync('src/components/PwaInstallManager.tsx', 'utf8');
const serviceWorkerRoute = readFileSync('src/app/sw.js/route.ts', 'utf8');

test('PWA stays registered without showing a recurring install banner', () => {
  assert.match(manager, /\.register\('\/sw\.js'/);
  assert.match(manager, /return null/);
  assert.doesNotMatch(manager, /Instalar Auto Controle/);
  assert.doesNotMatch(manager, /beforeinstallprompt/);
  assert.doesNotMatch(manager, /Fechar aviso de instalação/);
});

test('PWA checks for new versions when it opens, returns online or becomes visible', () => {
  assert.match(manager, /updateViaCache: 'none'/);
  assert.match(manager, /registration\?\.update\(\)/);
  assert.match(manager, /visibilitychange/);
  assert.match(manager, /window\.addEventListener\('online', checkForUpdate\)/);
  assert.match(manager, /setInterval\(checkForUpdate, UPDATE_INTERVAL_MS\)/);
});

test('PWA reloads when a newly activated service worker takes control', () => {
  assert.match(manager, /controllerchange/);
  assert.match(manager, /PWA_UPDATE_AVAILABLE/);
  assert.match(manager, /window\.location\.reload\(\)/);
});

test('service worker changes with every Vercel deploy and activates immediately', async () => {
  assert.match(serviceWorkerRoute, /process\.env\.VERCEL_GIT_COMMIT_SHA/);
  assert.match(serviceWorkerRoute, /process\.env\.VERCEL_DEPLOYMENT_ID/);
  assert.match(serviceWorkerRoute, /self\.skipWaiting\(\)/);
  assert.match(serviceWorkerRoute, /self\.clients\.claim\(\)/);
  assert.match(serviceWorkerRoute, /PWA_UPDATE_AVAILABLE/);
  assert.match(serviceWorkerRoute, /client\.navigate\(client\.url\)/);
  assert.match(serviceWorkerRoute, /Cache-Control': 'private, no-store/);
  assert.match(serviceWorkerRoute, /Service-Worker-Allowed': '\/'/);
  assert.doesNotMatch(serviceWorkerRoute, /caches\.put/);
  assert.equal(existsSync('public/sw.js'), false);

  const previousCommit = process.env.VERCEL_GIT_COMMIT_SHA;
  process.env.VERCEL_GIT_COMMIT_SHA = 'pwa-test-commit';

  try {
    const response = GET();
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0, must-revalidate');
    assert.equal(response.headers.get('content-type'), 'application/javascript; charset=utf-8');
    assert.equal(response.headers.get('service-worker-allowed'), '/');
    assert.match(body, /const SW_VERSION = "pwa-test-commit"/);
  } finally {
    if (previousCommit === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = previousCommit;
  }
});
