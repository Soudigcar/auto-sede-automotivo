import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { GET as getServiceWorker } from '../src/app/sw.js/route';
import { GET as getPwaVersion } from '../src/app/api/pwa/version/route';
import { resolvePwaAppVersion } from '../src/lib/server/pwaAppVersion';
import { normalizePwaVersion, shouldApplyPwaUpdate } from '../src/lib/pwaVersion';

const manager = readFileSync('src/components/PwaInstallManager.tsx', 'utf8');
const serviceWorkerRoute = readFileSync('src/app/sw.js/route.ts', 'utf8');
const audioRecorder = readFileSync('src/components/WhatsappAudioRecorderButton.tsx', 'utf8');
const rootLayout = readFileSync('src/app/layout.tsx', 'utf8');

test('PWA stays registered without showing a recurring install banner', () => {
  assert.match(manager, /\.register\('\/sw\.js'/);
  assert.match(manager, /return null/);
  assert.doesNotMatch(manager, /Instalar Auto Controle/);
  assert.doesNotMatch(manager, /beforeinstallprompt/);
  assert.doesNotMatch(manager, /Fechar aviso de instalação/);
});

test('PWA compares its loaded build with the active deployment on every important resume path', () => {
  assert.match(rootLayout, /<PwaInstallManager currentVersion=\{appVersion\}/);
  assert.match(manager, /PWA_VERSION_ENDPOINT/);
  assert.match(manager, /cache: 'no-store'/);
  assert.match(manager, /registration\?\.update\(\)/);
  assert.match(manager, /visibilitychange/);
  assert.match(manager, /window\.addEventListener\('focus', checkForUpdate\)/);
  assert.match(manager, /window\.addEventListener\('online', checkForUpdate\)/);
  assert.match(manager, /window\.addEventListener\('pageshow', checkForUpdate\)/);
  assert.match(manager, /setInterval\(checkForUpdate, UPDATE_INTERVAL_MS\)/);
});

test('PWA applies a different version automatically while preventing reload loops', () => {
  assert.equal(shouldApplyPwaUpdate('build-a', 'build-b'), true);
  assert.equal(shouldApplyPwaUpdate('build-a', 'build-a'), false);
  assert.equal(shouldApplyPwaUpdate('', 'build-b'), false);
  assert.equal(normalizePwaVersion('  build-a  '), 'build-a');
  assert.match(manager, /PWA_VERSION_QUERY_PARAM/);
  assert.match(manager, /window\.location\.replace\(url\.toString\(\)\)/);
  assert.match(manager, /RELOAD_ATTEMPT_COOLDOWN_MS/);
  assert.match(manager, /sessionStorage/);
});

test('PWA defers a forced update while text or WhatsApp audio could be lost', () => {
  assert.match(manager, /hasActiveTextDraft/);
  assert.match(manager, /data-pwa-update-lock="true"/);
  assert.match(manager, /schedulePendingUpdate/);
  assert.match(audioRecorder, /data-pwa-update-lock="true"/);
  assert.match(audioRecorder, /data-pwa-update-reason="whatsapp-audio"/);
});

test('service worker changes with every Vercel deploy, activates immediately and removes old caches', async () => {
  assert.match(serviceWorkerRoute, /resolvePwaAppVersion/);
  assert.match(serviceWorkerRoute, /self\.skipWaiting\(\)/);
  assert.match(serviceWorkerRoute, /self\.clients\.claim\(\)/);
  assert.match(serviceWorkerRoute, /PWA_UPDATE_AVAILABLE/);
  assert.match(serviceWorkerRoute, /cacheKeys\.map\(\(key\) => caches\.delete\(key\)\)/);
  assert.match(serviceWorkerRoute, /Cache-Control': 'private, no-store/);
  assert.match(serviceWorkerRoute, /Service-Worker-Allowed': '\/'/);
  assert.doesNotMatch(serviceWorkerRoute, /caches\.put/);
  assert.doesNotMatch(serviceWorkerRoute, /caches\.open/);
  assert.equal(existsSync('public/sw.js'), false);

  const previousCommit = process.env.VERCEL_GIT_COMMIT_SHA;
  process.env.VERCEL_GIT_COMMIT_SHA = 'pwa-test-commit';

  try {
    const response = getServiceWorker();
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

test('version endpoint is deployment-specific and cannot be cached', async () => {
  const previousCommit = process.env.VERCEL_GIT_COMMIT_SHA;
  process.env.VERCEL_GIT_COMMIT_SHA = 'pwa-version-endpoint-test';

  try {
    assert.equal(resolvePwaAppVersion(), 'pwa-version-endpoint-test');
    const response = getPwaVersion();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { version: 'pwa-version-endpoint-test' });
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0, must-revalidate');
    assert.equal(response.headers.get('pragma'), 'no-cache');
    assert.equal(response.headers.get('expires'), '0');
    assert.equal(response.headers.get('x-auto-controle-version'), 'pwa-version-endpoint-test');
  } finally {
    if (previousCommit === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = previousCommit;
  }
});
