const PENDING_KEY = 'autoControleOlxPendingImport';

async function deliverPending() {
  const result = await chrome.storage.local.get(PENDING_KEY);
  const pending = result[PENDING_KEY];
  if (!pending?.payload) return;
  window.postMessage({
    source: 'auto-controle-olx-extension',
    type: 'AUTO_CONTROLE_OLX_IMPORT_PAYLOAD',
    payload: pending.payload,
    created_at: pending.created_at
  }, '*');
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'auto-controle-app') return;
  if (event.data?.type === 'AUTO_CONTROLE_OLX_PAGE_READY') void deliverPending();
  if (event.data?.type === 'AUTO_CONTROLE_OLX_IMPORT_ACK') void chrome.runtime.sendMessage({ type: 'AUTO_CONTROLE_CLEAR_PENDING' });
});

document.addEventListener('DOMContentLoaded', () => void deliverPending(), { once: true });
window.setTimeout(() => void deliverPending(), 1200);
