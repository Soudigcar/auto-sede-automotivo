// Offline validation guard: no external sockets, no provider credentials.
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = args[0];
  const host = typeof options === 'object' ? options.host : args[1];
  if (typeof options === 'object' && options.path) return originalConnect.apply(this, args);
  if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('External network disabled for offline validation');
  return originalConnect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'synthetic.invalid' && (!init?.method || ['GET', 'HEAD'].includes(init.method))) {
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json', 'content-range': '*/0' } });
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('External fetch disabled for offline validation');
  return originalFetch(input, init);
};
