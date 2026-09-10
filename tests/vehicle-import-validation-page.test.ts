import assert from 'node:assert/strict';
import test from 'node:test';
import { GET } from '../src/app/validacao-importador/route';

 test('validation page runs the real fixture parser offline and is unavailable outside Preview', async () => {
  const previous = process.env.VERCEL_ENV;
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Network forbidden in validation'); };
  try {
    for (const environment of ['production', 'development', '']) {
      process.env.VERCEL_ENV = environment;
      assert.equal((await GET()).status, 404);
    }
    process.env.VERCEL_ENV = 'preview';
    const response = await GET();
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Resultado esperado confirmado/);
    assert.match(html, /106\.900,00/);
    assert.match(html, /33\.444 Km/);
    assert.match(html, /<strong>CVT<\/strong>/);
    assert.match(html, /Câmbio automático CVT/);
    assert.match(html, /Não gerada nesta demonstração/);
    assert.doesNotMatch(html, /<script|<iframe|<img|<form|<button|<link/i);
    assert.match(response.headers.get('Content-Security-Policy') || '', /connect-src 'none'/);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(await (await GET()).text(), html);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    globalThis.fetch = fetch;
  }
});
