import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const FUEL_VALUES = ['flex', 'gasolina', 'diesel', 'etanol', 'alcool', 'álcool', 'hibrido', 'híbrido', 'eletrico', 'elétrico', 'gnv'];
const COLOR_VALUES = [
  'branco', 'preto', 'prata', 'cinza', 'vermelho', 'azul', 'verde', 'amarelo', 'bege', 'marrom',
  'dourado', 'laranja', 'roxo', 'vinho', 'grafite', 'chumbo', 'champagne'
];
const TRANSMISSION_VALUES = [
  'automatico', 'automático', 'manual', 'cvt', 'automatizado', 'semi-automatico', 'semi-automático',
  'dupla embreagem', 'dct', 'tiptronic'
];

function decodeHtml(value: string) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code) || 32));
}

function cleanText(value: unknown, maxLength = 20000) {
  return decodeHtml(String(value || ''))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalize(value: unknown) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function titleCase(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/(^|\s|[-/])([a-zà-ú])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function absoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return '';
  }
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function extractMeta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return '';
}

function extractTitle(html: string) {
  return extractMeta(html, 'og:title') || cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
}

function getVisibleLines(html: string) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|td|th|tr|span|section|article|h1|h2|h3|h4|h5|h6|label|strong|small|button|a|option)>/gi, '\n')
    .replace(/<[^>]+>/g, '\n');

  return decodeHtml(text)
    .split('\n')
    .map((line) => cleanText(line, 2000))
    .filter(Boolean);
}

function getMainVehicleHtml(html: string) {
  const cutPatterns = [
    /ve[ií]culos\s+relacionados/i,
    /siga-nos\s+nas\s+redes/i,
    /receba\s+as\s+melhores\s+ofertas/i,
    /desenvolvido\s+por/i
  ];
  let cutAt = html.length;
  for (const pattern of cutPatterns) {
    const match = html.match(pattern);
    if (typeof match?.index === 'number' && match.index > 0) cutAt = Math.min(cutAt, match.index);
  }
  return html.slice(0, cutAt);
}

function flattenJsonLd(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value !== 'object') return [];
  return [value, ...(Array.isArray(value['@graph']) ? value['@graph'].flatMap(flattenJsonLd) : [])];
}

function extractJsonLd(html: string) {
  const output: any[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      output.push(...flattenJsonLd(JSON.parse(decodeHtml(match[1] || '').trim())));
    } catch {
      // Alguns sites publicam JSON-LD inválido; a extração visual continua.
    }
  }
  return output;
}

function parseCurrency(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
  const raw = String(value || '').replace(/[^\d,.]/g, '');
  if (!raw) return 0;
  if (raw.includes(',')) return Math.round(Number(raw.replace(/\./g, '').replace(',', '.')) || 0);
  return Math.round(Number(raw.replace(/\D/g, '')) || 0);
}

function extractPrice(html: string, lines: string[]) {
  const structured = [
    extractMeta(html, 'product:price:amount'),
    extractMeta(html, 'og:price:amount'),
    ...extractJsonLd(html).flatMap((item) => {
      const offers = Array.isArray(item?.offers) ? item.offers : item?.offers ? [item.offers] : [];
      return [item?.price, ...offers.flatMap((offer: any) => [offer?.price, offer?.lowPrice, offer?.highPrice, offer?.priceSpecification?.price])];
    })
  ];
  for (const value of structured) {
    const price = parseCurrency(value);
    if (price >= 5000 && price <= 3000000) return price;
  }

  const candidates: Array<{ price: number; score: number; index: number }> = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/R\$\s*[\d.]+(?:,\d{2})?/gi)) {
      const price = parseCurrency(match[0]);
      if (price < 5000 || price > 3000000) continue;
      const context = normalize([lines[index - 1], line, lines[index + 1]].filter(Boolean).join(' '));
      let score = 10;
      if (/\bpor\b|oferta|promocao|promoção/.test(context)) score += 35;
      if (/\bde\b/.test(context) && /\bpor\b/.test(context)) score -= 5;
      if (/parcela|entrada|financiamento/.test(context)) score -= 30;
      candidates.push({ price, score, index });
    }
  });
  candidates.sort((a, b) => b.score - a.score || b.index - a.index);
  return candidates[0]?.price || 0;
}

function cleanSegment(value: string) {
  try {
    return cleanText(decodeURIComponent(value))
      .replace(/\.html?$/i, '')
      .replace(/[_-]+/g, ' ');
  } catch {
    return cleanText(value).replace(/\.html?$/i, '').replace(/[_-]+/g, ' ');
  }
}

function extractFromUrl(url: string) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean).map(cleanSegment);
    const index = segments.findIndex((segment) => normalize(segment) === 'carros');
    if (index < 0) return { brand: '', model: '', version: '', year: '' };
    const brand = segments[index + 1] || '';
    let model = segments[index + 2] || '';
    let version = segments[index + 3] || '';
    const slug = segments[index + 4] || '';
    const year = slug.match(/\b(?:19|20)\d{2}\b/)?.[0] || version.match(/\b(?:19|20)\d{2}\b/)?.[0] || '';
    version = version.replace(/\b(?:19|20)\d{2}\b/g, '').trim();
    if (normalize(model) === 'onix' && normalize(version).startsWith('plus ')) {
      model = `${model} Plus`;
      version = version.replace(/^plus\s+/i, '');
    }
    return { brand, model, version, year };
  } catch {
    return { brand: '', model: '', version: '', year: '' };
  }
}

function findSection(lines: string[], headings: string[], stopHeadings: string[], maxLines = 80) {
  const normalizedHeadings = headings.map(normalize);
  const normalizedStops = stopHeadings.map(normalize);
  const start = lines.findIndex((line) => normalizedHeadings.some((heading) => normalize(line) === heading || normalize(line).startsWith(`${heading} `)));
  if (start < 0) return [];
  const section: string[] = [];
  for (let index = start + 1; index < lines.length && section.length < maxLines; index++) {
    const line = lines[index];
    const normalized = normalize(line);
    if (normalizedStops.some((heading) => normalized === heading || normalized.startsWith(`${heading} `))) break;
    if (line) section.push(line);
  }
  return section;
}

function extractExplicitValue(lines: string[], labels: string[]) {
  const normalizedLabels = labels.map(normalize);
  for (let index = 0; index < lines.length; index++) {
    const line = cleanText(lines[index]);
    const normalized = normalize(line);
    const labelIndex = normalizedLabels.findIndex((label) => normalized === label || normalized.startsWith(`${label}:`) || normalized.startsWith(`${label} `));
    if (labelIndex < 0) continue;
    const label = labels[labelIndex];
    const sameLine = cleanText(line.replace(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').replace(/^[:.\-\s]+/, ''));
    if (sameLine) return sameLine;
    for (let next = index + 1; next <= index + 3 && next < lines.length; next++) {
      const candidate = cleanText(lines[next]);
      if (!candidate) continue;
      if (normalizedLabels.includes(normalize(candidate))) continue;
      return candidate;
    }
  }
  return '';
}

function formatMileage(digits: number) {
  if (!Number.isFinite(digits) || digits < 100) return '';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(digits))} Km`;
}

function parseMileageCandidate(value: string, context = '') {
  const text = cleanText(value);
  const normalized = normalize(`${value} ${context}`);
  if (!/(?:\bkm\b|quilometragem|rodados|rodado)/.test(normalized)) return '';

  const decimalEngine = text.match(/\b([0-6][.,]\d)\s*km\b/i);
  if (decimalEngine && Number(decimalEngine[1].replace(',', '.')) < 10) return '';

  const match = text.match(/\b(\d{1,3}(?:\.\d{3})+|\d{4,7})\s*km\b/i)
    || text.match(/(?:quilometragem|rodados?|km)\s*[:.-]?\s*(\d{1,3}(?:\.\d{3})+|\d{4,7})\b/i);
  if (!match?.[1]) return '';
  const numeric = Number(match[1].replace(/\./g, ''));
  return formatMileage(numeric);
}

function extractMileage(lines: string[], focusedText: string) {
  const explicit = extractExplicitValue(lines, ['Quilometragem', 'KM', 'Km']);
  const explicitParsed = parseMileageCandidate(`${explicit} km`, `quilometragem ${explicit}`);
  if (explicitParsed) return explicitParsed;

  const candidates: Array<{ value: string; score: number }> = [];
  const combined = [focusedText, ...lines].join(' | ');
  for (const match of combined.matchAll(/\b(\d{1,3}(?:\.\d{3})+|\d{4,7})\s*km\b/gi)) {
    const value = parseMileageCandidate(match[0], combined.slice(Math.max(0, (match.index || 0) - 60), (match.index || 0) + 90));
    if (!value) continue;
    const numeric = Number(value.replace(/\D/g, ''));
    candidates.push({ value, score: numeric >= 1000 ? 20 : 0 });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.value || '';
}

function findControlledValue(text: string, values: string[]) {
  const normalized = normalize(text);
  const sorted = [...values].sort((a, b) => b.length - a.length);
  const found = sorted.find((value) => new RegExp(`(?:^|[^a-z])${normalize(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z])`, 'i').test(normalized));
  return found ? titleCase(found) : '';
}

function extractYear(text: string, fallback = '') {
  const pair = text.match(/\b((?:19|20)\d{2})\s*[\/-]\s*((?:19|20)\d{2})\b/);
  if (pair) return `${pair[1]}/${pair[2]}`;
  return text.match(/\b(?:19|20)\d{2}\b/)?.[0] || fallback;
}

function buildContext(lines: string[]) {
  const summary = findSection(lines, ['Resumo'], ['Entrar em contato', 'Opcionais do Veículo', 'Opcionais do Veiculo', 'Detalhes do Veículo', 'Detalhes do Veiculo', 'Veículos Relacionados'], 30);
  const optionals = findSection(lines, ['Opcionais do Veículo', 'Opcionais do Veiculo', 'Opcionais'], ['Detalhes do Veículo', 'Detalhes do Veiculo', 'Veículos Relacionados'], 100);
  const details = findSection(lines, ['Detalhes do Veículo', 'Detalhes do Veiculo', 'Descrição', 'Descricao'], ['Veículos Relacionados', 'Localização', 'Localizacao'], 100);

  const usefulSummary = summary.filter((line) => !/entrar em contato|fale conosco|financiamento|avalie seu veículo|simular/i.test(line));
  const usefulOptionals = optionals.filter((line) => !/outros opcionais|veículos relacionados/i.test(line));
  const usefulDetails = details.filter((line) => line.length > 2);

  const parts = [
    usefulSummary.length ? `Resumo: ${usefulSummary.join(' | ')}` : '',
    usefulDetails.length ? `Detalhes do veículo: ${usefulDetails.join(' ')}` : '',
    usefulOptionals.length ? `Opcionais: ${usefulOptionals.join(' | ')}` : ''
  ].filter(Boolean);

  return {
    summary: usefulSummary,
    details: usefulDetails,
    optionals: usefulOptionals,
    text: cleanText(parts.join('\n'), 12000)
  };
}

function parseVehicle(title: string, url: string, lines: string[]) {
  const fromUrl = extractFromUrl(url);
  const context = buildContext(lines);
  const relevantText = [title, context.text, lines.slice(0, 180).join(' | ')].join(' | ');

  let brand = fromUrl.brand;
  let model = fromUrl.model;
  let version = fromUrl.version;
  if (!brand || !model) {
    const cleanTitle = cleanText(title).replace(/\s+-\s+.*$/, '').replace(/\|.*$/, '');
    const parts = cleanTitle.replace(/\b(?:19|20)\d{2}(?:\s*[\/-]\s*(?:19|20)\d{2})?\b/g, '').split(' ').filter(Boolean);
    brand ||= parts[0] || '';
    model ||= parts[1] || '';
    version ||= parts.slice(2).join(' ');
  }

  const fuel = findControlledValue(relevantText, FUEL_VALUES);
  const color = findControlledValue(context.summary.join(' | '), COLOR_VALUES)
    || findControlledValue(context.details.join(' '), COLOR_VALUES)
    || findControlledValue(relevantText, COLOR_VALUES);
  const transmission = findControlledValue(context.details.join(' '), TRANSMISSION_VALUES)
    || findControlledValue(context.summary.join(' | '), TRANSMISSION_VALUES)
    || findControlledValue(relevantText, TRANSMISSION_VALUES);
  const mileage = extractMileage(lines, context.text);
  const year = extractYear([context.summary.join(' | '), context.details.join(' '), title].join(' | '), fromUrl.year);

  return {
    brand: titleCase(brand),
    model: titleCase(model),
    version: titleCase(cleanText(version).replace(/\b(?:19|20)\d{2}\b/g, '').replace(/\bflex\b/gi, '')),
    year,
    mileage,
    color,
    transmission,
    fuel,
    source_url: url,
    description: context.text,
    extraction_context: context
  };
}

function extractImages(html: string, baseUrl: string) {
  const output: string[] = [];
  const ogImage = extractMeta(html, 'og:image');
  if (ogImage) output.push(absoluteUrl(ogImage, baseUrl));

  const patterns = [
    /<img[^>]+(?:src|data-src|data-original|data-lazy)=["']([^"']+)["'][^>]*>/gi,
    /<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi,
    /["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      for (const candidate of String(match[1] || '').split(',')) {
        const url = absoluteUrl(candidate.trim().split(/\s+/)[0], baseUrl);
        const lower = url.toLowerCase();
        if (!url || !/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(lower)) continue;
        if (/logo|icon|favicon|whatsapp|facebook|instagram|placeholder|banner|financeira|mapa/.test(lower)) continue;
        output.push(url);
      }
    }
  }
  return unique(output).slice(0, 20);
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 AutoControleAutomotivo/1.2',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.6'
    },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Não foi possível acessar o link. Status ${response.status}`);
  return response.text();
}

async function uploadImageToSupabase(imageUrl: string, folder: string, index: number) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) throw new Error('Configuração de Storage indisponível.');

  const response = await fetch(imageUrl, { headers: { 'user-agent': 'Mozilla/5.0 AutoControleAutomotivo/1.2' } });
  if (!response.ok) throw new Error('Falha ao baixar imagem.');
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const bytes = await response.arrayBuffer();
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const path = `${folder}/${Date.now()}-${index}.${extension}`;
  const { error } = await supabase.storage.from('vehicle-images').upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from('vehicle-images').getPublicUrl(path).data.publicUrl;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = cleanText(body?.action || 'preview', 30);
    const url = cleanText(body?.url, 2200);
    if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'Informe um link válido.' }, { status: 400 });

    const html = await fetchHtml(url);
    const mainHtml = getMainVehicleHtml(html) || html;
    const lines = getVisibleLines(mainHtml);
    const title = extractTitle(mainHtml || html);
    const price = extractPrice(mainHtml, lines);
    const images = extractImages(mainHtml, url);
    const vehicle = parseVehicle(title, url, lines);
    const description = vehicle.description || extractMeta(html, 'description') || extractMeta(html, 'og:description');

    if (action === 'preview') {
      return NextResponse.json({ title, description, price, images, vehicle, extraction_context: vehicle.extraction_context });
    }

    if (action === 'import') {
      const selected = Array.isArray(body?.images) && body.images.length ? body.images : images.slice(0, 8);
      const folder = `imported-${Date.now()}`;
      const uploadedImages: string[] = [];
      for (let index = 0; index < selected.slice(0, 8).length; index++) {
        try {
          uploadedImages.push(await uploadImageToSupabase(String(selected[index]), folder, index + 1));
        } catch {
          // Uma imagem inválida não interrompe o restante da importação.
        }
      }
      return NextResponse.json({
        title,
        description,
        price,
        images,
        uploadedImages,
        extraction_context: vehicle.extraction_context,
        vehicle: { ...vehicle, image_url: uploadedImages[0] || images[0] || '' }
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: cleanText(error?.message, 500) || 'Erro ao importar link.' }, { status: 500 });
  }
}
