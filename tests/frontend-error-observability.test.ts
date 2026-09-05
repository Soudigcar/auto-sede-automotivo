import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isRecoverableBundleError,
  sanitizeClientErrorRoute,
  shouldReserveBundleRecovery
} from '../src/lib/client/browserErrorObservability';

const globalError = readFileSync('src/app/global-error.tsx', 'utf8');
const autocarError = readFileSync('src/app/loja/[slug]/autocar/error.tsx', 'utf8');
const observer = readFileSync('src/components/BrowserErrorObserver.tsx', 'utf8');
const navigationGuard = readFileSync('src/components/AutocarNavigationGuard.tsx', 'utf8');
const observability = readFileSync('src/lib/client/browserErrorObservability.ts', 'utf8');
const endpoint = readFileSync('src/app/api/observability/client-error/route.ts', 'utf8');
const rootLayout = readFileSync('src/app/layout.tsx', 'utf8');

test('frontend has global and AUTOCAR-specific error boundaries', () => {
  assert.match(globalError, /^'use client'/);
  assert.match(globalError, /observeBrowserException\(error, 'global-boundary'\)/);
  assert.match(autocarError, /^'use client'/);
  assert.match(autocarError, /observeBrowserException\(error, 'autocar-boundary'\)/);
  assert.match(autocarError, /O restante do portal continua isolado/);
});

test('browser observer and build version are wired in the root layout', () => {
  assert.match(rootLayout, /data-app-version=\{appVersion\}/);
  assert.match(rootLayout, /<BrowserErrorObserver \/>/);
  assert.match(observer, /window\.addEventListener\('error'/);
  assert.match(observer, /window\.addEventListener\('unhandledrejection'/);
});

test('AUTOCAR menu navigation is isolated from client-side RSC transitions', () => {
  assert.match(rootLayout, /<AutocarNavigationGuard \/>/);
  assert.match(navigationGuard, /return url\.origin === window\.location\.origin && .*autocar.*\.test\(url\.pathname\)/);
  assert.match(navigationGuard, /document\.addEventListener\('click', handleClick, true\)/);
  assert.match(navigationGuard, /window\.location\.assign\(target\.href\)/);
});

test('only recognized bundle failures can schedule one recovery per build', () => {
  assert.equal(isRecoverableBundleError(new Error('ChunkLoadError: Loading chunk 781 failed')), true);
  assert.equal(isRecoverableBundleError(new TypeError('Failed to fetch dynamically imported module')), true);
  assert.equal(isRecoverableBundleError(new Error('Falha ao validar a fundação AUTOCAR.')), false);
  assert.equal(shouldReserveBundleRecovery(null, 'build-a', false), true);
  assert.equal(shouldReserveBundleRecovery({ buildVersion: 'build-a', fingerprint: 'x', attemptedAt: 1 }, 'build-a', false), false);
  assert.equal(shouldReserveBundleRecovery(null, 'build-a', true), false);
});

test('client error route drops query parameters and recovery never clears browser state', () => {
  assert.equal(sanitizeClientErrorRoute('/loja/demo/autocar?x=1#fragment'), '/loja/demo/autocar');
  assert.match(observability, /sessionStorage\.setItem/);
  assert.match(observability, /window\.location\.replace\(url\.toString\(\)\)/);
  assert.doesNotMatch(observability, /localStorage\.clear|sessionStorage\.clear|caches\.delete/);
});

test('observability endpoint is same-origin, size-limited and rate-limited', () => {
  assert.match(endpoint, /MAX_PAYLOAD_BYTES = 8 \* 1024/);
  assert.match(endpoint, /sec-fetch-site/);
  assert.match(endpoint, /isSameOriginBrowserRequest/);
  assert.match(endpoint, /RATE_LIMIT_MAX_HITS/);
  assert.match(endpoint, /sanitizeClientErrorPayload/);
});
