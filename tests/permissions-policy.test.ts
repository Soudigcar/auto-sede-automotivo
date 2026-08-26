import assert from 'node:assert/strict';
import test from 'node:test';

import nextConfig from '../next.config.ts';

test('the first-party WhatsApp recorder is allowed by the global permissions policy', async () => {
  const routes = (await nextConfig.headers?.()) ?? [];
  const globalRoute = routes.find((route) => route.source === '/:path*');
  const policy = globalRoute?.headers.find((header) => header.key === 'Permissions-Policy')?.value;

  assert.ok(policy, 'global Permissions-Policy header is missing');
  assert.match(policy, /(?:^|,\s*)microphone=\(self\)(?:,|$)/);
  assert.doesNotMatch(policy, /(?:^|,\s*)microphone=\(\)(?:,|$)/);
});
