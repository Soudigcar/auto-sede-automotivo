const DEFAULT_TARGET = 'https://sistemaautomotivo.autosede.com.br/importar-olx';
const LEGACY_PREVIEW_HOSTS = new Set([
  'auto-sede-automotivo-git-agent-native-backgrou-98032b-soudigcar.vercel.app'
]);
const PENDING_KEY = 'autoControleOlxPendingImport';
const TARGET_KEY = 'autoControleTargetUrl';

function normalizeStoredTarget(value) {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_TARGET;

  try {
    const parsed = new URL(raw);
    if (LEGACY_PREVIEW_HOSTS.has(parsed.hostname)) return DEFAULT_TARGET;
    return raw;
  } catch {
    return DEFAULT_TARGET;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
}

async function blobToCompressedDataUrl(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: false });
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const compressed = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    const bytes = new Uint8Array(await compressed.arrayBuffer());
    return `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
  } catch {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const type = /^image\/(jpeg|png|webp)$/i.test(blob.type) ? blob.type : 'image/jpeg';
    return `data:${type};base64,${bytesToBase64(bytes)}`;
  }
}

async function downloadImage(url) {
  try {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
    });
    if (!response.ok) return { url, data_url: '', error: `HTTP ${response.status}` };
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return { url, data_url: '', error: 'Conteúdo não é imagem' };
    return { url, data_url: await blobToCompressedDataUrl(blob), error: '' };
  } catch (error) {
    return { url, data_url: '', error: error instanceof Error ? error.message : 'Falha ao baixar imagem' };
  }
}

async function prepareImport(payload) {
  const imageUrls = Array.from(new Set(Array.isArray(payload.image_urls) ? payload.image_urls : [])).slice(0, 12);
  const images = [];
  for (const imageUrl of imageUrls) images.push(await downloadImage(imageUrl));

  const pending = {
    version: 1,
    created_at: new Date().toISOString(),
    payload: {
      ...payload,
      image_urls: imageUrls,
      images
    }
  };
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
  return pending;
}

async function targetUrl() {
  const stored = await chrome.storage.local.get(TARGET_KEY);
  const rawValue = String(stored[TARGET_KEY] || DEFAULT_TARGET).trim();
  const value = normalizeStoredTarget(rawValue);

  if (value !== rawValue) {
    await chrome.storage.local.set({ [TARGET_KEY]: value });
  }

  try {
    const parsed = new URL(value);
    parsed.pathname = '/importar-olx';
    parsed.search = '?source=extension';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return DEFAULT_TARGET;
  }
}

async function openAutoControle() {
  const url = await targetUrl();
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => {
    try {
      const host = new URL(tab.url || '').hostname;
      return host === 'autosede.com.br' || host === 'www.autosede.com.br' || host === 'sistemaautomotivo.autosede.com.br' || host.endsWith('.vercel.app');
    } catch {
      return false;
    }
  });

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
    return existing.id;
  }
  const created = await chrome.tabs.create({ url, active: true });
  return created.id;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'AUTO_CONTROLE_SAVE_TARGET') {
    const value = normalizeStoredTarget(message.url);
    chrome.storage.local.set({ [TARGET_KEY]: value })
      .then(() => sendResponse({ ok: true, target_url: value }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'AUTO_CONTROLE_GET_SETTINGS') {
    chrome.storage.local.get([TARGET_KEY, PENDING_KEY])
      .then(async (result) => {
        const rawValue = String(result[TARGET_KEY] || DEFAULT_TARGET).trim();
        const target = normalizeStoredTarget(rawValue);
        if (target !== rawValue) await chrome.storage.local.set({ [TARGET_KEY]: target });
        sendResponse({ ok: true, target_url: target, pending: result[PENDING_KEY] || null });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'AUTO_CONTROLE_IMPORT_OLX') {
    (async () => {
      const pending = await prepareImport(message.payload || {});
      const tabId = await openAutoControle();
      sendResponse({ ok: true, tab_id: tabId, image_count: pending.payload.images.filter((item) => item.data_url).length });
    })().catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Falha ao preparar importação' }));
    return true;
  }

  if (message?.type === 'AUTO_CONTROLE_CLEAR_PENDING') {
    chrome.storage.local.remove(PENDING_KEY)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
