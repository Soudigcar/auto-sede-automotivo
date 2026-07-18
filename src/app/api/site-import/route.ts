import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function decodeHtml(value: string) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(value: unknown) {
  return decodeHtml(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toUpper(value: unknown) {
  return cleanText(value).toUpperCase();
}

function absoluteUrl(url: string, baseUrl: string) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return '';
  }
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function extractMeta(html: string, property: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["'][^>]*>`, 'i')
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }

  return '';
}

function extractTitle(html: string) {
  const ogTitle = extractMeta(html, 'og:title');
  if (ogTitle) return ogTitle;

  const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1];
  return cleanText(title || '');
}

function getVisibleLines(html: string) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|td|tr|span|section|article|h1|h2|h3|h4|h5|h6|label|strong|small|button|a)>/gi, '\n')
    .replace(/<[^>]+>/g, '\n');

  return decodeHtml(withoutScripts)
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean);
}

function getMainVehicleHtml(html: string) {
  const cutPatterns = [
    /ve[ií]culos\s+relacionados/i,
    /siga-nos\s+nas\s+redes\s+sociais/i,
    /receba\s+as\s+melhores\s+ofertas/i,
    /desenvolvido\s+por/i,
    />\s*marcas\s*</i,
    />\s*modelos\s*</i
  ];

  let cutIndex = html.length;

  for (const pattern of cutPatterns) {
    const match = html.match(pattern);

    if (match && typeof match.index === 'number' && match.index > 0) {
      cutIndex = Math.min(cutIndex, match.index);
    }
  }

  return html.slice(0, cutIndex);
}

function parseCurrency(value: string) {
  const raw = String(value || '').replace(/[^\d,.]/g, '');

  if (!raw) return 0;

  if (raw.includes(',')) {
    return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }

  const digits = raw.replace(/\D/g, '');
  return Number(digits) || 0;
}

function parseNumberishPrice(value: unknown) {
  if (typeof value === 'number') return value;
  return parseCurrency(String(value || ''));
}

function flattenJsonLd(value: any): any[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonLd(item));
  }

  if (typeof value === 'object') {
    const graph = Array.isArray(value['@graph']) ? value['@graph'] : [];
    return [value, ...graph.flatMap((item: any) => flattenJsonLd(item))];
  }

  return [];
}

function extractJsonLdObjects(html: string) {
  const blocks = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  );

  const objects: any[] = [];

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(decodeHtml(block[1] || '').trim());
      objects.push(...flattenJsonLd(parsed));
    } catch {
      // Ignora JSON-LD inválido.
    }
  }

  return objects;
}

function extractStructuredPrice(html: string) {
  const metaCandidates = [
    extractMeta(html, 'product:price:amount'),
    extractMeta(html, 'og:price:amount'),
    extractMeta(html, 'price')
  ];

  for (const item of metaCandidates) {
    const price = parseNumberishPrice(item);
    if (price >= 5000 && price <= 2000000) return price;
  }

  const jsonLdObjects = extractJsonLdObjects(html);

  for (const item of jsonLdObjects) {
    const directPrice = parseNumberishPrice(item?.price);
    if (directPrice >= 5000 && directPrice <= 2000000) return directPrice;

    const offers = Array.isArray(item?.offers) ? item.offers : item?.offers ? [item.offers] : [];

    for (const offer of offers) {
      const price = parseNumberishPrice(offer?.price || offer?.lowPrice || offer?.highPrice);
      if (price >= 5000 && price <= 2000000) return price;

      const priceSpec = offer?.priceSpecification;
      const specPrice = parseNumberishPrice(priceSpec?.price);
      if (specPrice >= 5000 && specPrice <= 2000000) return specPrice;
    }
  }

  return 0;
}

function extractPrice(html: string, lines: string[], title: string) {
  const structuredPrice = extractStructuredPrice(html);
  if (structuredPrice) return structuredPrice;

  const titleWords = normalize(title).split(' ').filter((word) => word.length > 2).slice(0, 8);
  const candidates: { value: number; score: number; line: string }[] = [];

  lines.forEach((line, index) => {
    const matches = Array.from(line.matchAll(/R\$\s*[\d.]+(?:,\d{2})?/gi));

    for (const match of matches) {
      const value = parseCurrency(match[0]);

      if (value < 5000 || value > 2000000) continue;

      const context = normalize([
        lines[index - 2],
        lines[index - 1],
        line,
        lines[index + 1],
        lines[index + 2]
      ].filter(Boolean).join(' '));

      let score = 0;

      if (context.includes('preco') || context.includes('valor')) score += 20;
      if (context.includes('oferta')) score += 8;
      if (titleWords.some((word) => context.includes(word))) score += 8;
      if (context.includes('parcela') || context.includes('entrada') || context.includes('simulacao') || context.includes('financiamento')) score -= 20;
      if (context.includes('telefone') || context.includes('whatsapp') || context.includes('contato')) score -= 15;

      score += Math.min(value / 100000, 10);

      candidates.push({ value, score, line });
    }
  });

  if (!candidates.length) return 0;

  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  return candidates[0].value;
}

function cleanSegment(value: string) {
  return cleanText(decodeURIComponent(value || ''))
    .replace(/\.html?$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeLocationNoise(value: string) {
  return cleanText(value)
    .replace(/\bbrasilia\b.*$/i, '')
    .replace(/\bdistrito federal\b.*$/i, '')
    .replace(/\bgoiania\b.*$/i, '')
    .replace(/\bgoias\b.*$/i, '')
    .replace(/\b\d{6,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean).map(cleanSegment);
    const carrosIndex = segments.findIndex((segment) => normalize(segment) === 'carros');

    if (carrosIndex === -1) return { brand: '', model: '', version: '', yearFromUrl: '' };

    const brand = segments[carrosIndex + 1] || '';
    let model = segments[carrosIndex + 2] || '';
    let version = segments[carrosIndex + 3] || '';
    const fullSlug = removeLocationNoise(segments[carrosIndex + 4] || '');

    const yearFromUrl = fullSlug.match(/\b(19|20)\d{2}\b/)?.[0] || version.match(/\b(19|20)\d{2}\b/)?.[0] || '';

    version = version
      .replace(/\b(19|20)\d{2}\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const versionParts = version.split(' ').filter(Boolean);
    const modelKey = normalize(model);

    if (modelKey === 'onix' && normalize(versionParts[0]) === 'plus') {
      model = `${model} Plus`;
      version = versionParts.slice(1).join(' ');
    }

    if (fullSlug) {
      const normalizedModel = normalize(model);
      const fullWithoutBrand = fullSlug.replace(new RegExp(`^${brand}\\s+`, 'i'), '').trim();

      if (normalizedModel && !normalize(fullWithoutBrand).startsWith(normalizedModel)) {
        const tokens = fullWithoutBrand.split(' ').filter(Boolean);
        if (tokens[0]) model = tokens[0];
      }
    }

    return {
      brand,
      model,
      version,
      yearFromUrl
    };
  } catch {
    return { brand: '', model: '', version: '', yearFromUrl: '' };
  }
}

function extractField(lines: string[], labels: string[]) {
  const normalizedLabels = labels.map(normalize);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const normalizedLine = normalize(line);

    const matchedLabel = normalizedLabels.find((label) => normalizedLine === label || normalizedLine.startsWith(`${label} `) || normalizedLine.includes(`${label}:`));

    if (!matchedLabel) continue;

    const rawLabel = labels[normalizedLabels.indexOf(matchedLabel)];
    const sameLineValue = cleanText(
      line
        .replace(new RegExp(rawLabel, 'i'), '')
        .replace(/^[:.\-\s]+/, '')
    );

    if (sameLineValue && normalize(sameLineValue) !== matchedLabel) {
      return sameLineValue;
    }

    for (let next = index + 1; next <= index + 3 && next < lines.length; next++) {
      const candidate = cleanText(lines[next]);
      const normalizedCandidate = normalize(candidate);

      if (!candidate) continue;
      if (normalizedLabels.some((label) => normalizedCandidate.includes(label))) continue;

      return candidate;
    }
  }

  return '';
}

function extractInlineField(text: string, labels: string[], stopLabels: string[]) {
  const stop = stopLabels.map((label) => normalize(label)).join('|');

  for (const label of labels) {
    const labelPattern = normalize(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normalizedText = normalize(text);
    const regex = new RegExp(`${labelPattern}\\s*[:.-]?\\s*([^|]+?)(?=\\s*(?:${stop})\\s*[:.-]?|$)`, 'i');
    const match = normalizedText.match(regex);

    if (match?.[1]) return cleanText(match[1]);
  }

  return '';
}

function extractVehicleDetails(lines: string[]) {
  const joined = lines.join(' | ');

  const anoFab = extractField(lines, ['Ano Fab.', 'Ano Fab', 'Ano Fabricação', 'Ano Fabricacao']);
  const anoMod = extractField(lines, ['Ano Mod.', 'Ano Mod', 'Ano Modelo']);

  const km =
    extractField(lines, ['Km', 'KM', 'Quilometragem']) ||
    extractInlineField(joined, ['Km', 'Quilometragem'], ['Combustível', 'Combustivel', 'Cor', 'Placa', 'Câmbio', 'Cambio']);

  const fuel =
    extractField(lines, ['Combustível', 'Combustivel']) ||
    extractInlineField(joined, ['Combustível', 'Combustivel'], ['Cor', 'Placa', 'Km', 'Câmbio', 'Cambio']);

  const color =
    extractField(lines, ['Cor']) ||
    extractInlineField(joined, ['Cor'], ['Placa', 'Km', 'Combustível', 'Combustivel', 'Câmbio', 'Cambio']);

  const transmission =
    extractField(lines, ['Câmbio', 'Cambio', 'Transmissão', 'Transmissao']) ||
    extractInlineField(joined, ['Câmbio', 'Cambio', 'Transmissão', 'Transmissao'], ['Combustível', 'Combustivel', 'Cor', 'Placa', 'Km']);

  const cleanKm = km
    ? `${String(km).replace(/[^\d.]/g, '')}${normalize(km).includes('km') ? ' Km' : ' Km'}`
    : '';

  const fabYear = anoFab.match(/\b(19|20)\d{2}\b/)?.[0] || '';
  const modYear = anoMod.match(/\b(19|20)\d{2}\b/)?.[0] || '';

  return {
    fabYear,
    modYear,
    year: fabYear && modYear && fabYear !== modYear ? `${fabYear}/${modYear}` : fabYear || modYear,
    mileage: cleanKm,
    fuel: fuel ? toUpper(fuel.replace(/\b(flex|gasolina|diesel|etanol|alcool|álcool|hibrido|híbrido|eletrico|elétrico)\b.*/i, '$1')) : '',
    color: color ? toUpper(color.replace(/\s+/g, ' ')) : '',
    transmission: transmission ? toUpper(transmission) : ''
  };
}

function parseVehicleFromSources(title: string, url: string, lines: string[]) {
  const fromUrl = extractFromUrl(url);
  const details = extractVehicleDetails(lines);

  let brand = fromUrl.brand;
  let model = fromUrl.model;
  let version = fromUrl.version;

  if (!brand || !model) {
    const clean = removeLocationNoise(
      cleanText(title)
        .replace(/\s+-\s+.*$/g, '')
        .replace(/\|.*$/g, '')
    );

    const year = clean.match(/\b(19|20)\d{2}\b/)?.[0] || '';
    const withoutYear = clean.replace(year, '').replace(/\s+/g, ' ').trim();
    const parts = withoutYear.split(' ').filter(Boolean);

    brand = brand || parts[0] || '';
    model = model || parts[1] || '';
    version = version || parts.slice(2).join(' ');
  }

  brand = toUpper(brand);
  model = toUpper(model);
  version = toUpper(
    cleanText(version)
      .replace(/\b(19|20)\d{2}\b/g, '')
      .replace(/\bflex\b/gi, '')
      .replace(/\bem\s+brasilia\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

  return {
    brand,
    model,
    version,
    year: details.year || fromUrl.yearFromUrl || '',
    mileage: details.mileage,
    color: details.color,
    transmission: details.transmission,
    fuel: details.fuel,
    source_url: url
  };
}

function extractImages(html: string, baseUrl: string) {
  const images: string[] = [];

  const ogImage = extractMeta(html, 'og:image');
  if (ogImage) images.push(absoluteUrl(ogImage, baseUrl));

  const imageRegexes = [
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+data-src=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+data-original=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+data-lazy=["']([^"']+)["'][^>]*>/gi,
    /<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi,
    /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi
  ];

  for (const regex of imageRegexes) {
    let match;

    while ((match = regex.exec(html))) {
      const rawItems = String(match[1] || '').split(',');

      for (const rawItem of rawItems) {
        const raw = rawItem.trim().split(' ')[0];
        const url = absoluteUrl(raw, baseUrl);

        if (!url) continue;

        const lower = url.toLowerCase();

        if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(lower)) continue;
        if (lower.includes('logo')) continue;
        if (lower.includes('icon')) continue;
        if (lower.includes('favicon')) continue;
        if (lower.includes('whatsapp')) continue;
        if (lower.includes('facebook')) continue;
        if (lower.includes('instagram')) continue;
        if (lower.includes('placeholder')) continue;
        if (lower.includes('banner')) continue;

        images.push(url);
      }
    }
  }

  return unique(images).slice(0, 20);
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 AutoControleAutomotivo/1.0',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Não foi possível acessar o link. Status ${response.status}`);
  }

  return response.text();
}

async function uploadImageToSupabase(imageUrl: string, folder: string, index: number) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    serviceKey,
    { auth: { persistSession: false } }
  );

  const response = await fetch(imageUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; AutoControleAutomotivo/1.0)'
    }
  });

  if (!response.ok) {
    throw new Error('Falha ao baixar imagem.');
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const arrayBuffer = await response.arrayBuffer();

  const filePath = `${folder}/${Date.now()}-${index}.${extension}`;

  const { error } = await supabase.storage
    .from('vehicle-images')
    .upload(filePath, arrayBuffer, {
      contentType,
      upsert: true
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from('vehicle-images').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = cleanText(body.action || 'preview');
    const url = cleanText(body.url);

    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Informe um link válido.' }, { status: 400 });
    }

    const html = await fetchHtml(url);
    const mainHtml = getMainVehicleHtml(html);
    const title = extractTitle(mainHtml || html);
    const lines = getVisibleLines(mainHtml || html);
    const price = extractPrice(mainHtml || html, lines, title);
    const images = extractImages(mainHtml || html, url);
    const parsed = parseVehicleFromSources(title, url, lines);

    if (action === 'preview') {
      return NextResponse.json({
        title,
        price,
        images,
        vehicle: parsed
      });
    }

    if (action === 'import') {
      const selectedImages = Array.isArray(body.images) && body.images.length ? body.images : images.slice(0, 8);
      const folder = `imported-${Date.now()}`;

      const uploadedImages: string[] = [];

      for (let index = 0; index < selectedImages.slice(0, 8).length; index++) {
        try {
          const uploaded = await uploadImageToSupabase(String(selectedImages[index]), folder, index + 1);
          uploadedImages.push(uploaded);
        } catch {
          // Continua importando as próximas imagens.
        }
      }

      return NextResponse.json({
        title,
        price,
        images,
        uploadedImages,
        vehicle: {
          ...parsed,
          image_url: uploadedImages[0] || images[0] || ''
        }
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao importar link.' }, { status: 500 });
  }
}
