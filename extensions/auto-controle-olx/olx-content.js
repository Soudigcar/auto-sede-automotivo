const IMPORT_MESSAGE = 'AUTO_CONTROLE_IMPORT_OLX';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function canonicalUrl() {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function meta(name) {
  return clean(document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.getAttribute('content'));
}

function parseMoney(value) {
  const raw = String(value || '').replace(/[^\d,.]/g, '');
  if (!raw) return 0;
  if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(/\D/g, '')) || 0;
}

function flatten(value, output = []) {
  if (!value) return output;
  if (Array.isArray(value)) {
    value.forEach((item) => flatten(item, output));
    return output;
  }
  if (typeof value === 'object') {
    output.push(value);
    Object.values(value).forEach((item) => {
      if (item && typeof item === 'object') flatten(item, output);
    });
  }
  return output;
}

function jsonSources() {
  const objects = [];
  for (const script of document.querySelectorAll('script')) {
    const text = script.textContent || '';
    if (!text.trim()) continue;
    const type = script.getAttribute('type') || '';
    if (type === 'application/ld+json' || script.id === '__NEXT_DATA__') {
      try { flatten(JSON.parse(text), objects); } catch { /* ignore */ }
    }
  }
  return objects;
}

function firstValue(objects, keys) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (typeof value === 'string' || typeof value === 'number') {
        const text = clean(value);
        if (text) return text;
      }
      if (value && typeof value === 'object') {
        const label = clean(value.label || value.value || value.name);
        if (label) return label;
      }
    }
  }
  return '';
}

function fieldFromText(labels) {
  const candidates = Array.from(document.querySelectorAll('dt,dd,li,div,span,p'));
  for (const element of candidates) {
    const text = clean(element.textContent);
    if (!text || text.length > 180) continue;
    for (const label of labels) {
      const pattern = new RegExp(`^${label}\\s*[:\\-]?\\s*(.+)$`, 'i');
      const match = text.match(pattern);
      if (match?.[1]) return clean(match[1]);
      if (text.toLowerCase() === label.toLowerCase()) {
        const sibling = clean(element.nextElementSibling?.textContent || element.parentElement?.querySelector(':scope > :last-child')?.textContent);
        if (sibling && sibling.toLowerCase() !== text.toLowerCase()) return sibling;
      }
    }
  }
  return '';
}

function urlFallback() {
  const last = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '')
    .replace(/-\d{7,}$/, '')
    .replace(/-/g, ' ');
  const year = last.match(/\b(19|20)\d{2}\b/)?.[0] || '';
  const parts = clean(last.replace(year, '')).split(' ').filter(Boolean);
  return { brand: parts[0] || '', model: parts[1] || '', version: parts.slice(2).join(' '), year };
}

function imageUrls(objects) {
  const found = new Set();
  const add = (value) => {
    if (Array.isArray(value)) return value.forEach(add);
    if (value && typeof value === 'object') return Object.values(value).forEach(add);
    const text = String(value || '').replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
    for (const match of text.matchAll(/https?:\/\/img\.olx\.com\.br\/[^"'\s<>]+/gi)) {
      try {
        const url = new URL(match[0]);
        url.searchParams.delete('impolicy');
        found.add(url.toString());
      } catch { /* ignore */ }
    }
  };
  objects.forEach(add);
  for (const image of document.images) {
    const candidates = [image.currentSrc, image.src, image.getAttribute('data-src'), image.getAttribute('srcset')?.split(',').pop()?.trim().split(' ')[0]];
    for (const candidate of candidates) {
      if (!candidate || !candidate.includes('img.olx.com.br')) continue;
      try { found.add(new URL(candidate, location.href).toString()); } catch { /* ignore */ }
    }
  }
  const og = meta('og:image');
  if (og) found.add(og);
  return Array.from(found).filter((url) => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)).slice(0, 20);
}

function extractPayload() {
  const objects = jsonSources();
  const fallback = urlFallback();
  const title = clean(firstValue(objects, ['subject', 'name', 'title', 'headline']) || document.querySelector('h1')?.textContent || meta('og:title') || document.title);
  const description = clean(firstValue(objects, ['body', 'description']) || meta('og:description') || meta('description'));
  const price = parseMoney(firstValue(objects, ['price_value', 'price', 'amount']) || fieldFromText(['Preço', 'Valor']) || document.body.innerText.match(/R\$\s*[\d.]+(?:,\d{2})?/)?.[0]);
  const brand = clean(firstValue(objects, ['vehicle_brand', 'brand']) || fieldFromText(['Marca']) || fallback.brand);
  const model = clean(firstValue(objects, ['vehicle_model', 'model']) || fieldFromText(['Modelo']) || fallback.model);
  const version = clean(firstValue(objects, ['vehicle_version', 'version']) || fieldFromText(['Versão']) || fallback.version);
  const year = clean(firstValue(objects, ['regdate', 'year', 'modelDate', 'vehicle_year']) || fieldFromText(['Ano', 'Ano do modelo']) || fallback.year);
  const mileage = clean(firstValue(objects, ['mileage', 'vehicle_mileage']) || fieldFromText(['Quilometragem', 'Km', 'KM']));
  const color = clean(firstValue(objects, ['carcolor', 'color']) || fieldFromText(['Cor']));
  const transmission = clean(firstValue(objects, ['gearbox', 'transmission']) || fieldFromText(['Câmbio', 'Cambio', 'Transmissão']));
  const fuel = clean(firstValue(objects, ['fuel', 'fuelType']) || fieldFromText(['Combustível', 'Combustivel']));
  const images = imageUrls(objects);

  return {
    source_url: canonicalUrl(),
    title,
    description,
    brand,
    model,
    version,
    year,
    mileage,
    color,
    transmission,
    fuel,
    price,
    image_url: images[0] || '',
    image_urls: images,
    extracted_at: new Date().toISOString()
  };
}

function isLikelyVehicleAd() {
  return /\/autos-e-pecas\/carros-vans-e-utilitarios\//i.test(location.pathname) || Boolean(document.querySelector('h1') && document.body.innerText.match(/Quilometragem|Combustível|Câmbio/i));
}

async function runImport(button) {
  button.disabled = true;
  button.textContent = 'Lendo anúncio...';
  try {
    const payload = extractPayload();
    if (!payload.source_url || (!payload.title && !payload.model && !payload.image_urls.length)) throw new Error('Não foi possível identificar os dados deste anúncio.');
    const response = await chrome.runtime.sendMessage({ type: IMPORT_MESSAGE, payload });
    if (!response?.ok) throw new Error(response?.error || 'Falha ao enviar para o Auto Controle.');
    button.textContent = `Enviado (${response.image_count || 0} fotos)`;
  } catch (error) {
    button.textContent = error instanceof Error ? error.message : 'Falha ao importar';
    button.style.background = '#7f1d1d';
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = 'Importar para Auto Controle';
      button.style.background = '#dc2626';
    }, 3500);
  }
}

function injectButton() {
  if (!isLikelyVehicleAd() || document.getElementById('auto-controle-olx-import')) return;
  const button = document.createElement('button');
  button.id = 'auto-controle-olx-import';
  button.type = 'button';
  button.textContent = 'Importar para Auto Controle';
  Object.assign(button.style, {
    position: 'fixed', right: '22px', bottom: '22px', zIndex: '2147483647', border: '0', borderRadius: '16px',
    padding: '15px 20px', background: '#dc2626', color: '#fff', font: '700 14px Arial, sans-serif',
    boxShadow: '0 14px 35px rgba(0,0,0,.28)', cursor: 'pointer', maxWidth: '280px'
  });
  button.addEventListener('click', () => void runImport(button));
  document.documentElement.appendChild(button);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'AUTO_CONTROLE_EXTRACT_ACTIVE_OLX') return false;
  try { sendResponse({ ok: true, payload: extractPayload() }); } catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Falha ao ler anúncio' }); }
  return true;
});

injectButton();
new MutationObserver(injectButton).observe(document.documentElement, { childList: true, subtree: true });
