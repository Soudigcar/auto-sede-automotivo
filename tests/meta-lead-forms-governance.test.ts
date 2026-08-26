import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { effectiveMetaGraphVersion } from '../src/lib/server/metaGraphVersion.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('webhook resolves form from the fetched Meta lead before routing', () => {
  const source = read('src/app/api/webhooks/meta-leads/route.ts');
  const fetchPosition = source.indexOf('const metaLead = await fetchLead');
  const mappingPosition = source.indexOf('const mapping = mappingFor(settings, event, metaLead)');
  assert.ok(fetchPosition >= 0 && mappingPosition > fetchPosition);
});

test('legacy single Form ID cannot override event mappings', () => {
  const integration = read('src/app/api/master/integrations/meta-leads/route.ts');
  const forms = read('src/app/api/master/integrations/meta-leads/forms/route.ts');
  assert.match(integration, /form_id: ''/);
  assert.match(forms, /form_id: '',\s*form_mappings: mappings/);
});

test('Preview cannot change real Meta form mappings', () => {
  const source = read('src/app/api/master/integrations/meta-leads/forms/route.ts');
  assert.match(source, /VERCEL_ENV === 'preview'/);
  assert.match(source, /preview_read_only: true/);
});

test('Meta form discovery stays server-side and never returns the token', () => {
  const source = read('src/app/api/master/integrations/meta-leads/forms/discover/route.ts');
  assert.match(source, /getMetaServerConfig\(\)\.pageAccessToken/);
  assert.match(source, /authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(source, /NextResponse\.json\([^\n]*token/);
});

test('deprecated Meta Graph versions are upgraded to the supported baseline', () => {
  assert.equal(effectiveMetaGraphVersion('v20.0'), 'v25.0');
  assert.equal(effectiveMetaGraphVersion('v25.0'), 'v25.0');
  assert.equal(effectiveMetaGraphVersion('v26.0'), 'v26.0');
});
