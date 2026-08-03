import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { normalizeVehicleOption, uniqueVehicleImages } from '@/lib/vehicleCatalogOptions';

export type ImportedVehiclePage = {
  title: string;
  description: string;
  price: number;
  images: string[];
  evidence: {
    description_source: string;
    fields: Record<string, string>;
  };
  vehicle: {
    brand: string;
    model: string;
    version: string;
    year: string;
    mileage: string;
    color: string;
    transmission: string;
    fuel: string;
    description: string;
    source_url: string;
  };
};

type DownloadedImage = {
  sourceUrl: string;
  buffer: Buffer;
  contentType: string;
  exactHash: string;
  visualHash: string;
  width: number;
  height: number;
  order: number;
};

type DescriptionResult = {
  text: string;
  source: string;
};

function decodeHtml(value: string) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanText(value: unknown) {
  return decodeHtml(String(value || '')).replace(/\s+/g, ' ').trim();
}

function fold(value: unknown) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function absoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return '';
  }
}

function extractMeta(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  return extractMeta(html, 'og:title') || cleanText(html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || '');
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
    if (match && typeof match.index === 'number' && match.index > 0) cutIndex = Math.min(cutIndex, match.index);
  }
  return html.slice(0, cutIndex);
}

function visibleLines(html: string) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|td|tr|span|section|article|h1|h2|h3|h4|h5|h6|label|strong|small|button|a)>/gi, '\n')
    .replace(/<[^>]+>/g, '\n');
  return decodeHtml(text).split('\n').map(cleanText).filter(Boolean);
}

function flattenJsonLd(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value !== 'object') return [];
  const graph = Array.isArray(value['@graph']) ? value['@graph'].flatMap(flattenJsonLd) : [];
  return [value, ...graph];
}

function extractJsonLd(html: string) {
  const result: any[] = [];
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      result.push(...flattenJsonLd(JSON.parse(decodeHtml(block[1] || '').trim())));
    } catch {
      // Ignora blocos inválidos.
    }
  }
  return result;
}

function isUsefulDescription(value: unknown) {
  const text = cleanText(value);
  if (text.length < 30) return false;
  const normalized = fold(text);
  if (/^(home|estoque|contato|financiamento|empresa)$/.test(normalized)) return false;
  if (/whatsapp|telefone|politica de privacidade|todos os direitos reservados/.test(normalized) && text.length < 120) return false;
  return true;
}

function extractSectionDescription(lines: string[]) {
  const headings = [
    'detalhes do veiculo',
    'descricao do veiculo',
    'descricao',
    'observacoes',
    'informacoes do veiculo',
    'sobre o veiculo'
  ];
  const stops = [
    'veiculos relacionados',
    'opcionais do veiculo',
    'fale conosco',
    'entrar em contato',
    'simular financiamento',
    'avalie seu veiculo',
    'dados da loja',
    'formas de pagamento'
  ];
  const candidates: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = fold(lines[index]);
    if (!headings.some((heading) => normalized === heading || normalized.startsWith(`${heading}:`))) continue;

    const collected: string[] = [];
    for (let next = index + 1; next < Math.min(lines.length, index + 18); next += 1) {
      const line = cleanText(lines[next]);
      const foldedLine = fold(line);
      if (!line) continue;
      if (stops.some((stop) => foldedLine === stop || foldedLine.startsWith(stop))) break;
      if (headings.some((heading) => foldedLine === heading)) continue;
      if (/^(home|estoque|empresa|contato|financiamento|avaliacao)$/.test(foldedLine)) continue;
      collected.push(line);
      if (collected.join(' ').length >= 4000) break;
    }

    const candidate = cleanText(collected.join(' '));
    if (isUsefulDescription(candidate)) candidates.push(candidate);
  }

  return candidates.sort((left, right) => right.length - left.length)[0] || '';
}

function extractVehicleDescription(html: string, lines: string[]): DescriptionResult {
  const section = extractSectionDescription(lines);
  if (section) return { text: section.slice(0, 12000), source: 'detalhes_do_veiculo' };

  const jsonDescriptions = extractJsonLd(html)
    .flatMap((item: any) => [item?.description, item?.itemOffered?.description, item?.vehicleConfiguration?.description])
    .map(cleanText)
    .filter(isUsefulDescription)
    .sort((left: string, right: string) => right.length - left.length);
  if (jsonDescriptions[0]) return { text: jsonDescriptions[0].slice(0, 12000), source: 'json_ld' };

  const metaDescriptions = [extractMeta(html, 'description'), extractMeta(html, 'og:description')]
    .map(cleanText)
    .filter(isUsefulDescription)
    .sort((left, right) => right.length - left.length);
  if (metaDescriptions[0]) return { text: metaDescriptions[0].slice(0, 12000), source: 'meta_description' };

  return { text: '', source: '' };
}

function extractDescriptionAttributes(description: string) {
  const text = fold(description);

  const colorMatch = text.match(/(?:\bcor\b|\bpintura\b)(?:\s+do\s+veiculo)?\s*[:=.-]?\s*(amarel[oa]|azul|bege|branc[oa]|bronze|cinza|dourad[oa]|laranja|marrom|prata|pret[oa]|rox[oa]|verde|vermelh[oa]|vinho)\b/i);
  const rawColor = colorMatch?.[1] || '';

  const transmissionMatch = text.match(/(?:\bcambio\b|\btransmissao\b)\s*[:=.-]?\s*(manual|mecanic[oa]|automatic[oa]|automatizad[oa]|dualogic|cvt|semi[- ]automatic[oa]|semi[- ]automatizad[oa])\b/i);
  const rawTransmission = transmissionMatch?.[1] || '';
  const transmission = /dualogic/i.test(rawTransmission)
    ? 'Automatizado'
    : normalizeVehicleOption('transmission', rawTransmission);

  const fuelMatch = text.match(/(?:\bcombustivel\b|\bmotor(?:\s+\d+(?:[.,]\d+)?)?\b)\s*[:=.-]?\s*(flex|gasolina|diesel|etanol|alcool|gnv|hibrid[oa]|eletric[oa])\b/i)
    || text.match(/\b\d+(?:[.,]\d+)?\s+(flex|gasolina|diesel|etanol|alcool|gnv|hibrid[oa]|eletric[oa])\b/i);
  const rawFuel = fuelMatch?.[1] || '';

  const year = description.match(/\b(?:19|20)\d{2}\b/)?.[0] || '';

  return {
    color: normalizeVehicleOption('color', rawColor),
    transmission,
    fuel: normalizeVehicleOption('fuel', rawFuel),
    year
  };
}

function parsePrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value || '').replace(/[^\d,.]/g, '');
  if (!raw) return 0;
  if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(/\D/g, '')) || 0;
}

function extractPrice(html: string, lines: string[]) {
  const metaValues = [
    extractMeta(html, 'product:price:amount'),
    extractMeta(html, 'og:price:amount'),
    extractMeta(html, 'price')
  ];
  for (const value of metaValues) {
    const price = parsePrice(value);
    if (price >= 5000 && price <= 2_000_000) return Math.round(price);
  }

  for (const item of extractJsonLd(html)) {
    const values = [item?.price, item?.lowPrice, item?.highPrice, item?.offers?.price, item?.offers?.lowPrice, item?.offers?.highPrice];
    for (const value of values) {
      const price = parsePrice(value);
      if (price >= 5000 && price <= 2_000_000) return Math.round(price);
    }
  }

  const candidates: Array<{ value: number; score: number; index: number }> = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/R\$\s*[\d.]+(?:,\d{2})?/gi)) {
      const value = parsePrice(match[0]);
      if (value < 5000 || value > 2_000_000) continue;
      const context = fold(lines.slice(Math.max(0, index - 3), index + 4).join(' '));
      let score = 80;
      if (/preco|valor|oferta/.test(context)) score += 30;
      if (/ano|combustivel|cor|placa/.test(context)) score += 15;
      if (/parcela|entrada|simulacao|financiamento/.test(context)) score -= 30;
      if (/relacionad|whatsapp|telefone/.test(context)) score -= 20;
      candidates.push({ value, score, index });
    }
  });

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return Math.round(candidates[0]?.value || 0);
}

function extractField(lines: string[], labels: string[]) {
  const normalizedLabels = labels.map(fold);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalizedLine = fold(line);
    const labelIndex = normalizedLabels.findIndex((label) => normalizedLine === label || normalizedLine.startsWith(`${label}:`) || normalizedLine.startsWith(`${label} `));
    if (labelIndex < 0) continue;

    const sameLine = cleanText(line.replace(new RegExp(labels[labelIndex], 'i'), '').replace(/^[:.\-\s]+/, ''));
    if (sameLine && fold(sameLine) !== normalizedLabels[labelIndex]) return sameLine;

    for (let next = index + 1; next <= index + 4 && next < lines.length; next += 1) {
      const candidate = cleanText(lines[next]);
      if (!candidate) continue;
      if (normalizedLabels.some((label) => fold(candidate) === label)) continue;
      return candidate;
    }
  }
  return '';
}

function parseMileageNumber(rawValue: unknown) {
  const raw = cleanText(rawValue).replace(/\s/g, '').replace(/km|quil[oô]metros?/gi, '');
  if (!raw) return Number.NaN;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) return Number(raw.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) return Number(raw.replace(/,/g, ''));
  if (raw.includes(',') && raw.includes('.')) return Number(raw.replace(/\./g, '').replace(',', '.'));
  if (raw.includes(',')) return Number(raw.replace(',', '.'));
  return Number(raw);
}

function formatMileage(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString('pt-BR')} Km`;
}

function extractMileage(html: string, lines: string[]) {
  const candidates: Array<{ value: number; score: number; raw: string }> = [];
  const add = (raw: unknown, baseScore: number) => {
    const text = cleanText(raw);
    const value = parseMileageNumber(text);
    if (!Number.isFinite(value) || value < 0 || value > 2_000_000) return;
    let score = baseScore;
    if (/^\d+[.,]\d{1,2}$/.test(text.replace(/\s/g, '')) && value < 100) score -= 180;
    if (/\d{1,3}(?:[.]\d{3})+/.test(text)) score += 45;
    if (value >= 1000) score += 35;
    else if (value >= 100) score += 15;
    else if (value <= 20) score -= 35;
    candidates.push({ value, score, raw: text });
  };

  for (const item of extractJsonLd(html)) {
    const odometer = item?.mileageFromOdometer;
    if (odometer && typeof odometer === 'object') add(odometer.value ?? odometer.valueReference, 180);
    else add(odometer, 170);
    add(item?.mileage, 165);
    add(item?.odometer, 165);
  }

  for (const metaName of ['vehicle:mileage', 'product:mileage', 'mileage', 'odometer']) {
    const value = extractMeta(html, metaName);
    if (value) add(value, 165);
  }

  const joined = lines.join(' | ');
  const directPatterns = [
    /(?<![\d.,])(\d{1,3}(?:[.]\d{3})+|\d{4,7}|\d{1,3})\s*(?:km|quil[oô]metros?)/gi,
    /(?:quilometragem|od[oô]metro|\bkm\b)\s*[:=.-]?\s*(\d{1,3}(?:[.]\d{3})+|\d{1,7})/gi
  ];
  directPatterns.forEach((pattern, patternIndex) => {
    for (const match of joined.matchAll(pattern)) add(match[1], patternIndex === 0 ? 160 : 130);
  });

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const match of line.matchAll(/(?<![\d.,])(\d{1,3}(?:[.]\d{3})+|\d{4,7}|\d{1,3})\s*km/gi)) add(match[1], 175);
    if (/^(km|quilometragem|od[oô]metro)$/i.test(cleanText(line))) {
      for (let next = index + 1; next <= index + 3 && next < lines.length; next += 1) add(lines[next], 145 - (next - index) * 5);
    }
  }

  const fallback = extractField(lines, ['Quilometragem', 'Odômetro', 'Odometro', 'Km', 'KM']);
  if (fallback) add(fallback, 70);

  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  const best = candidates[0];
  if (!best || best.score < 60) return '';
  return formatMileage(best.value);
}

function cleanSegment(value: string) {
  return cleanText(decodeURIComponent(value || '')).replace(/\.html?$/i, '').replace(/[_-]+/g, ' ').trim();
}

function removeLocationNoise(value: string) {
  return cleanText(value)
    .replace(/\bbrasilia\b.*$/i, '')
    .replace(/\bdistrito federal\b.*$/i, '')
    .replace(/\bgoiania\b.*$/i, '')
    .replace(/\bgoias\b.*$/i, '')
    .replace(/\b\d{6,}\b/g, '')
    .trim();
}

function extractFromUrl(url: string) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean).map(cleanSegment);
    const index = segments.findIndex((segment) => fold(segment) === 'carros');
    if (index < 0) return { brand: '', model: '', version: '', year: '' };
    const brand = segments[index + 1] || '';
    let model = segments[index + 2] || '';
    let version = segments[index + 3] || '';
    const slug = removeLocationNoise(segments[index + 4] || '');
    const year = slug.match(/\b(?:19|20)\d{2}\b/)?.[0] || version.match(/\b(?:19|20)\d{2}\b/)?.[0] || '';
    version = version.replace(/\b(?:19|20)\d{2}\b/g, '').trim();
    const versionParts = version.split(' ').filter(Boolean);
    if (fold(model) === 'onix' && fold(versionParts[0]) === 'plus') {
      model = `${model} Plus`;
      version = versionParts.slice(1).join(' ');
    }
    return { brand, model, version, year };
  } catch {
    return { brand: '', model: '', version: '', year: '' };
  }
}

function parseVehicle(title: string, url: string, html: string, lines: string[], description: string) {
  const fromUrl = extractFromUrl(url);
  const descriptionAttributes = extractDescriptionAttributes(description);
  const anoFab = extractField(lines, ['Ano Fab.', 'Ano Fab', 'Ano Fabricação', 'Ano Fabricacao']);
  const anoMod = extractField(lines, ['Ano Mod.', 'Ano Mod', 'Ano Modelo']);
  const fabYear = anoFab.match(/\b(?:19|20)\d{2}\b/)?.[0] || '';
  const modYear = anoMod.match(/\b(?:19|20)\d{2}\b/)?.[0] || '';

  const rawFuel = extractField(lines, ['Combustível', 'Combustivel']);
  const rawColor = extractField(lines, ['Cor']);
  const rawTransmission = extractField(lines, ['Câmbio', 'Cambio', 'Transmissão', 'Transmissao']);
  const technicalFuel = normalizeVehicleOption('fuel', cleanText(rawFuel).replace(/\b(flex|gasolina|diesel|etanol|alcool|álcool|hibrido|híbrido|eletrico|elétrico)\b.*/i, '$1'));
  const technicalColor = normalizeVehicleOption('color', rawColor);
  const technicalTransmission = normalizeVehicleOption('transmission', rawTransmission);

  let brand = fromUrl.brand;
  let model = fromUrl.model;
  let version = fromUrl.version;
  if (!brand || !model) {
    const titleParts = removeLocationNoise(title.replace(/\s+-\s+.*$/g, '').replace(/\|.*$/g, ''))
      .replace(/\b(?:19|20)\d{2}\b/g, '')
      .split(' ')
      .filter(Boolean);
    brand ||= titleParts[0] || '';
    model ||= titleParts[1] || '';
    version ||= titleParts.slice(2).join(' ');
  }

  const year = fabYear && modYear && fabYear !== modYear
    ? `${fabYear}/${modYear}`
    : fabYear || modYear || fromUrl.year || descriptionAttributes.year;
  const color = technicalColor || descriptionAttributes.color;
  const transmission = technicalTransmission || descriptionAttributes.transmission;
  const fuel = technicalFuel || descriptionAttributes.fuel;

  return {
    vehicle: {
      brand: cleanText(brand).toUpperCase(),
      model: cleanText(model).toUpperCase(),
      version: cleanText(version).replace(/\b(?:19|20)\d{2}\b/g, '').replace(/\bflex\b/gi, '').toUpperCase(),
      year,
      mileage: extractMileage(html, lines),
      color,
      transmission,
      fuel,
      description,
      source_url: url
    },
    fields: {
      year: fabYear || modYear ? 'quadro_tecnico' : fromUrl.year ? 'titulo_ou_url' : descriptionAttributes.year ? 'descricao' : '',
      mileage: extractMileage(html, lines) ? 'pagina_do_anuncio' : '',
      color: technicalColor ? 'quadro_tecnico' : descriptionAttributes.color ? 'descricao' : '',
      transmission: technicalTransmission ? 'quadro_tecnico' : descriptionAttributes.transmission ? 'descricao' : '',
      fuel: technicalFuel ? 'quadro_tecnico' : descriptionAttributes.fuel ? 'descricao' : ''
    }
  };
}

function extractImages(html: string, baseUrl: string) {
  const values: string[] = [];
  const ogImage = extractMeta(html, 'og:image');
  if (ogImage) values.push(absoluteUrl(ogImage, baseUrl));

  const patterns = [
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+data-src=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+data-original=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+data-lazy=["']([^"']+)["'][^>]*>/gi,
    /<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi,
    /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      for (const item of String(match[1] || '').split(',')) {
        const url = absoluteUrl(item.trim().split(' ')[0], baseUrl);
        const lower = url.toLowerCase();
        if (!url || !/\.(jpg|jpeg|png|webp)(\?|$)/i.test(lower)) continue;
        if (/(logo|icon|favicon|whatsapp|facebook|instagram|placeholder|banner)/i.test(lower)) continue;
        values.push(url);
      }
    }
  }

  return uniqueVehicleImages(values, 20);
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
  if (!response.ok) throw new Error(`Não foi possível acessar o link. Status ${response.status}`);
  return response.text();
}

function hammingDistance(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let xor = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (xor) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

async function visualHash(buffer: Buffer) {
  const pixels = await sharp(buffer).rotate().resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
  let hash = 0n;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const offset = row * 9 + column;
      hash = (hash << 1n) | BigInt(pixels[offset] > pixels[offset + 1] ? 1 : 0);
    }
  }
  return hash.toString(16).padStart(16, '0');
}

async function downloadImage(sourceUrl: string, order: number): Promise<DownloadedImage> {
  const response = await fetch(sourceUrl, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; AutoControleAutomotivo/1.0)' }, cache: 'no-store' });
  if (!response.ok) throw new Error('Falha ao baixar imagem.');
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.toLowerCase().startsWith('image/')) throw new Error('Arquivo recebido não é uma imagem.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1_500 || buffer.length > 20_000_000) throw new Error('Imagem fora do tamanho permitido.');
  const metadata = await sharp(buffer).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (width && height && (width < 160 || height < 120)) throw new Error('Miniatura muito pequena.');
  return {
    sourceUrl,
    buffer,
    contentType,
    exactHash: createHash('sha256').update(buffer).digest('hex'),
    visualHash: await visualHash(buffer),
    width,
    height,
    order
  };
}

function isDuplicateImage(left: DownloadedImage, right: DownloadedImage) {
  if (left.exactHash === right.exactHash) return true;
  const leftRatio = left.height ? left.width / left.height : 0;
  const rightRatio = right.height ? right.width / right.height : 0;
  if (leftRatio && rightRatio && Math.abs(leftRatio - rightRatio) > 0.08) return false;
  return hammingDistance(left.visualHash, right.visualHash) <= 7;
}

async function downloadDistinctImages(urls: string[], limit = 8) {
  const candidates = uniqueVehicleImages(urls, 20);
  const unique: DownloadedImage[] = [];

  for (let start = 0; start < candidates.length; start += 4) {
    const batch = candidates.slice(start, start + 4);
    const results = await Promise.allSettled(batch.map((url, index) => downloadImage(url, start + index)));
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const image = result.value;
      const duplicateIndex = unique.findIndex((existing) => isDuplicateImage(existing, image));
      if (duplicateIndex < 0) unique.push(image);
      else {
        const existing = unique[duplicateIndex];
        const existingArea = existing.width * existing.height;
        const newArea = image.width * image.height;
        if (newArea > existingArea * 1.15) unique[duplicateIndex] = { ...image, order: existing.order };
      }
    }
    if (unique.length >= limit) break;
  }

  return unique.sort((a, b) => a.order - b.order).slice(0, limit);
}

async function uploadImages(images: DownloadedImage[]) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!serviceKey || !supabaseUrl) throw new Error('Supabase Storage não configurado.');
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const folder = `imported-${Date.now()}`;
  const uploaded: string[] = [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const extension = image.contentType.includes('png') ? 'png' : image.contentType.includes('webp') ? 'webp' : 'jpg';
    const filePath = `${folder}/${Date.now()}-${index + 1}.${extension}`;
    const { error } = await supabase.storage.from('vehicle-images').upload(filePath, image.buffer, {
      contentType: image.contentType,
      upsert: true
    });
    if (error) continue;
    uploaded.push(supabase.storage.from('vehicle-images').getPublicUrl(filePath).data.publicUrl);
  }
  return uploaded;
}

export async function inspectVehiclePage(url: string): Promise<ImportedVehiclePage> {
  const html = await fetchHtml(url);
  const mainHtml = getMainVehicleHtml(html) || html;
  const lines = visibleLines(mainHtml);
  const title = extractTitle(mainHtml || html);
  const descriptionResult = extractVehicleDescription(mainHtml, lines);
  const parsed = parseVehicle(title, url, mainHtml, lines, descriptionResult.text);

  return {
    title,
    description: descriptionResult.text,
    price: extractPrice(mainHtml, lines),
    images: extractImages(mainHtml, url),
    evidence: {
      description_source: descriptionResult.source,
      fields: parsed.fields
    },
    vehicle: parsed.vehicle
  };
}

export async function importDistinctVehicleImages(values: string[], limit = 8) {
  const downloaded = await downloadDistinctImages(values, limit);
  const uploadedImages = await uploadImages(downloaded);
  return {
    uploadedImages,
    sourceCount: uniqueVehicleImages(values, 20).length,
    uniqueCount: downloaded.length
  };
}
