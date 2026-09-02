import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POST as recordClientError } from '../src/app/api/observability/client-error/route';
import {
  buildClientErrorPayload,
  clientErrorReportId,
  isRecoverableBundleError,
  sanitizeClientErrorPayload,
  sanitizeClientErrorRoute,
  sanitizeClientErrorText,
  shouldReserveBundleRecovery
} from '../src/lib/client/browserErrorObservability';

const globalError = readFileSync('src/app/global-error.tsx', 'utf8');
const autocarError = readFileSync('src/app/loja/[slug]/autocar/error.tsx', 'utf8');
const observer = readFileSync('src/components/BrowserErrorObserver.tsx', 'utf8');
const observability = readFileSync('src/lib/client/browserErrorObservability.ts', 'utf8');
const rootLayout = readFileSync('src/app/layout.tsx', 'utf8');

test('frontend has global and AUTOCAR-specific client error boundaries', () => {
  assert.match(globalError, /^'use client'/);
  assert.match(globalError, /<html lang="pt-BR">/);
  assert.match(globalError, /<body/);
  assert.match(globalError, /observeBrowserException\(error, 'global-boundary'\)/);
  assert.match(autocarError, /^'use client'/);
  assert.match(autocarError, /observeBrowserException\(error, 'autocar-boundary'\)/);
  assert.match(autocarError, /O restante do portal continua isolado/);
});

test('browser observer captures global errors and rejected promises without serializing arbitrary objects', () => {
  assert.match(rootLayout, /<BrowserErrorObserver \/>/);
  assert.match(rootLayout, /data-app-version=\{appVersion\}/);
  assert.match(observer, /window\.addEventListener\('error'/);
  assert.match(observer, /window\.addEventListener\('unhandledrejection'/);
  assert.match(observer, /event\.reason instanceof Error/);
  assert.doesNotMatch(observer, /JSON\.stringify\(event\.reason\)|String\(event\.reason\)/);
});

test('sanitizer removes credentials, personal identifiers and URL parameters', () => {
  const raw = 'Bearer top.secret token=abcd "client_secret":"json-secret" cookie=session-value user@example.com 550000001234 https://app.test/loja/demo?access_token=secret#private';
  const sanitized = sanitizeClientErrorText(raw);

  assert.doesNotMatch(sanitized, /top\.secret|abcd|json-secret|session-value|user@example\.com|550000001234|access_token=secret|private/);
  assert.match(sanitized, /Bearer \[REDACTED\]/);
  assert.match(sanitized, /\[EMAIL\]/);
  assert.match(sanitized, /\[NUMBER\]/);
  assert.match(sanitized, /https:\/\/app\.test\/loja\/demo/);
  assert.equal(sanitizeClientErrorRoute('/loja/demo/autocar?token=secret#private'), '/loja/demo/autocar');
});

test('only known bundle and chunk failures are eligible for automatic recovery', () => {
  assert.equal(isRecoverableBundleError(new Error('ChunkLoadError: Loading chunk 781 failed')), true);
  assert.equal(isRecoverableBundleError(new Error('Failed to load chunk /_next/static/chunks/app.js')), true);
  assert.equal(isRecoverableBundleError(new TypeError('Failed to fetch dynamically imported module')), true);
  assert.equal(isRecoverableBundleError(new Error('Falha ao validar a fundação AUTOCAR.')), false);
  assert.equal(shouldReserveBundleRecovery(null, 'build-a', false), true);
  assert.equal(shouldReserveBundleRecovery({ buildVersion: 'build-a', fingerprint: 'a', attemptedAt: 1 }, 'build-a', false), false);
  assert.equal(shouldReserveBundleRecovery({ buildVersion: 'build-a', fingerprint: 'a', attemptedAt: 1 }, 'build-b', false), true);
  assert.equal(shouldReserveBundleRecovery(null, 'build-a', true), false);
});

test('reload protection is persisted before a versioned replace and never clears browser data', () => {
  assert.match(observability, /CLIENT_ERROR_RECOVERY_KEY/);
  assert.match(observability, /sessionStorage\.setItem/);
  assert.match(observability, /CLIENT_ERROR_RECOVERY_PARAM/);
  assert.match(observability, /window\.history\.state\.__autoControleClientRecovery === payload\.build_version/);
  assert.match(observability, /__autoControleClientRecovery: browserBuildVersion\(\)/);
  assert.match(observability, /Promise\.race/);
  assert.match(observability, /registration\?\.waiting\?\.postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
  assert.match(observability, /window\.location\.replace\(url\.toString\(\)\)/);
  assert.doesNotMatch(observability, /localStorage\.clear|sessionStorage\.clear|caches\.delete/);
});

test('payload fingerprint is stable after sanitization and excludes query parameters', () => {
  const first = buildClientErrorPayload(new Error('ChunkLoadError'), 'global-boundary', 'scheduled', {
    route: '/loja/demo/autocar?token=a',
    buildVersion: 'build-a'
  });
  const second = sanitizeClientErrorPayload({
    ...first,
    source: 'autocar-boundary',
    route: '/loja/demo/autocar?token=b'
  });

  assert.equal(first.route, '/loja/demo/autocar');
  assert.equal(clientErrorReportId(first), clientErrorReportId(second));
  assert.match(clientErrorReportId(first), /^WEB-[A-F0-9]{8}$/);
});

test('observability endpoint accepts only same-origin JSON and logs sanitized allowlisted fields', async () => {
  const logs: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };

  try {
    const response = await recordClientError(new Request('https://preview.example/api/observability/client-error', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://preview.example',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-for': '203.0.113.7',
        'x-vercel-id': 'test-request'
      },
      body: JSON.stringify({
        source: 'autocar-boundary',
        name: 'ChunkLoadError',
        message: 'token=very-secret user@example.com https://preview.example/path?secret=yes',
        stack: 'Bearer private-token',
        route: '/loja/demo/autocar?token=private',
        build_version: 'test-build',
        recovery: 'scheduled',
        forbidden_field: 'must-not-be-logged'
      })
    }));
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.match(body.report_id, /^WEB-[A-F0-9]{8}$/);
    assert.equal(logs.length, 1);
    assert.doesNotMatch(logs[0], /very-secret|user@example\.com|secret=yes|private-token|token=private|must-not-be-logged/);
    const entry = JSON.parse(logs[0]);
    assert.equal(entry.event, 'browser_exception');
    assert.equal(entry.route, '/loja/demo/autocar');
    assert.equal(entry.recovery, 'scheduled');
    assert.equal(entry.request_id, 'test-request');
  } finally {
    console.error = originalConsoleError;
  }

  const crossSite = await recordClientError(new Request('https://preview.example/api/observability/client-error', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site'
    },
    body: '{}'
  }));
  assert.equal(crossSite.status, 403);
});
