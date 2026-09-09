import { createHash } from 'node:crypto';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { normalizeVehicleOption, uniqueVehicleImages } from '../vehicleCatalogOptions';
import { normalizeVehicleYears } from '../vehicleYears';

const EXTRACTOR_VERSION = 'target-entity-v1';
type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
export type FieldEvidence = {
  field: string;
  value: string | number;
  raw_value: string;
  source_type: 'target_dom' | 'target_json' | 'target_description' | 'target_url';
  location: string;
  confidence: number;
  target_entity_match: true;
};
export type ImportEvidence = {
  extractor_version: string;
  target: { url: string; matched: boolean; identity: string };
  content_hash: string;
  description_source: string;
  fields: Record<string, string>;
  provenance: Record<string, FieldEvidence>;
  rejected: Array<{ location: string; reason: string }>;
};
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const fold = (v: unknown) => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const element = (n: Node): n is Element => 'tagName' in n;
const children = (n: Node): Node[] => 'childNodes' in n ? n.childNodes : [];
const attr = (n: Node, name: string) => element(n) ? n.attrs.find(a => a.name === name)?.value || '' : '';
function all(n: Node): Node[] { return [n, ...children(n).flatMap(all)]; }
function text(n: Node): string {
  if (n.nodeName === '#text') return (n as DefaultTreeAdapterMap['textNode']).value;
  if (['script', 'style', 'noscript'].includes(n.nodeName)) return '';
  if (n.nodeName === 'br') return '\n';
  const value = children(n).map(text).join('');
  return /^(div|p|li|tr|section|article|h[1-6])$/.test(n.nodeName) ? `${value}\n` : value;
}
function location(n: Node) {
  // Only structural indices, never arbitrary page attributes (which may contain PII).
  const path: string[] = [];
  let current: Node | undefined = n;
  while (current && path.length < 12) {
    if (element(current)) {
      const parent: Node | undefined = current.parentNode || undefined;
      const index = parent ? children(parent).filter(x => x.nodeName === current!.nodeName).indexOf(current) + 1 : 1;
      path.unshift(`${current.tagName}:nth-of-type(${index})`);
    }
    current = 'parentNode' in current ? current.parentNode || undefined : undefined;
  }
  return path.join(' > ');
}
function canonical(value: unknown, base: string) {
  try {
    const url = new URL(String(value || ''), base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    url.hash = '';
    // Keep identity-bearing query parameters; discard only known tracking parameters.
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return decodeURI(url.toString()).replace(/\/$/, '');
  } catch { return ''; }
}
function number(value: unknown) {
  if (typeof value === 'number') return value;
  const raw = clean(value).replace(/[^\d.,]/g, '');
  if (!raw) return NaN;
  return Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw);
}
function fromUrl(url: string) {
  const parts = new URL(url).pathname.split('/').filter(Boolean).map(x => decodeURIComponent(x).replace(/[-_]/g, ' '));
  const index = parts.findIndex(x => /^(carros|veiculos|cars)$/i.test(x));
  // Only interpret the known multi-segment layout, never an arbitrary slug as a model.
  return index >= 0 && parts.length >= index + 5
    ? { brand: parts[index + 1], model: parts[index + 2], version: parts[index + 3] }
    : { brand: '', model: '', version: '' };
}
const excludedHeading = /^(veiculos? relacionados?|relacionados?|similares|recomendados|outros veiculos|voce tambem|financiamento|simular financiamento|formas de pagamento)\b/;
const excludedClass = /(?:^|[\s_-])(related|recommended|similar|financing|finance|financiamento|relacionados|recomendados)(?:$|[\s_-])/;

/** Pure parser. Never performs network, catalog, storage, or AI operations. */
export function extractTargetVehicle(html: string, sourceUrl: string) {
  const targetUrl = canonical(sourceUrl, sourceUrl);
  if (!targetUrl) throw new Error('Invalid vehicle URL.');
  const root = parse(html);
  const nodes = all(root);
  const provenance: Record<string, FieldEvidence> = {};
  const rejected: ImportEvidence['rejected'] = [];
  const reject = (where: string, reason: string) => { if (rejected.length < 100) rejected.push({ location: where, reason }); };
  const identity = fromUrl(targetUrl);
  const targetId = new URL(targetUrl).pathname.match(/(?:-|\/)(\d{5,})(?:\.html)?$/)?.[1] || '';
  const jsonEntities: Array<{ value: Record<string, any>; path: string }> = [];
  function visitJson(value: any, path: string, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 30) return;
    if (Array.isArray(value)) { value.forEach((x, i) => visitJson(x, `${path}[${i}]`, depth + 1)); return; }
    const type = [].concat(value['@type'] || []).map(String);
    const typed = type.some(t => /^(Vehicle|Car|Product|Motorcycle)$/.test(t));
    const hydrated = !type.length && value.name && value.brand && (value.model || value.mileage || value.price);
    if (typed || hydrated) {
      const ownUrl = value.url || value.mainEntityOfPage?.['@id'] || (String(value['@id'] || '').includes('#') ? '' : value['@id']);
      const identityMatches = !identity.brand || !identity.model || (fold(value.name).includes(fold(identity.brand)) && fold(value.name).includes(fold(identity.model))); 
      if (identityMatches && ownUrl && canonical(ownUrl, targetUrl) === targetUrl) jsonEntities.push({ value, path });
      else reject(path, 'entity_url_mismatch_or_missing');
      // A nested offer/item must not become evidence for its parent entity.
    }
    for (const [index, child] of Object.values(value).entries()) visitJson(child, `${path}.entry[${index}]`, depth + 1);
  }
  for (const [index, node] of nodes.filter(n => n.nodeName === 'script').entries()) {
    if (!/^(application\/ld\+json|application\/json)$/.test(attr(node, 'type'))) continue;
    try { visitJson(JSON.parse(children(node).map(n => n.nodeName === '#text' ? (n as DefaultTreeAdapterMap['textNode']).value : '').join('')), `script[${index}]`); }
    catch { reject(`script[${index}]`, 'invalid_json'); }
  }
  // Prune physically before any field extraction. Never score foreign content.
  function prune(parent: Node) {
    if (!('childNodes' in parent)) return;
    const kept: typeof parent.childNodes = [];
    let stopped = false;
    for (const child of parent.childNodes) {
      const heading = /^h[1-6]$/.test(child.nodeName);
      if (heading && excludedHeading.test(fold(text(child)))) stopped = true;
      const childText = clean(text(child));
      const financialSection = element(child) && ['div', 'section', 'p'].includes(child.tagName) && childText.length < 200
        && /^(entrada|parcelas?|financiamento|simular financiamento)\b/.test(fold(childText));
      const foreignCard = attr(child, 'id').match(/^destaque-(\d+)$/)?.[1];
      if (stopped || financialSection || ['footer', 'nav', 'aside', 'form', 'script', 'style', 'noscript'].includes(child.nodeName)
        || excludedClass.test(fold(attr(child, 'class')))
        || (foreignCard && foreignCard !== targetId)) {
        if (element(child)) reject(location(child), foreignCard ? 'foreign_vehicle_card' : 'excluded_section');
        continue;
      }
      prune(child);
      kept.push(child);
    }
    parent.childNodes = kept;
  }
  prune(root);
  const live = all(root);
  const canonicalMatches = nodes.some(n => n.nodeName === 'link' && attr(n, 'rel') === 'canonical' && canonical(attr(n, 'href'), targetUrl) === targetUrl);
  const singleHeading = live.filter(n => n.nodeName === 'h1').length === 1;
  const matchingHeadings = live.filter(n => /^h[12]$/.test(n.nodeName) && (
    identity.brand && identity.model
      ? fold(text(n)).includes(fold(identity.brand)) && fold(text(n)).includes(fold(identity.model))
      : jsonEntities.some(e => fold(text(n)) === fold(e.value.name)) || (n.nodeName === 'h1' && singleHeading && canonicalMatches)
  ));
  function foreignLink(n: Node) {
    const href = attr(n, 'href');
    return n.nodeName === 'a' && /\/(carros|veiculos|cars)\/.+/.test(href)
      && canonical(href, targetUrl) !== targetUrl;
  }
  function hasTechnical(n: Node) {
    return all(n).some(x => /^(km|quilometragem|ano fab|ano mod|preco|valor)\b/.test(fold(text(x))) || attr(x, 'itemprop') === 'price' || attr(x, 'id') === 'valor_veic');
  }
  let scope: Node | undefined;
  if (matchingHeadings.length === 1) {
    let candidate: Node | undefined = (matchingHeadings[0] as Element).parentNode || undefined;
    while (candidate && !['body', 'html', '#document'].includes(candidate.nodeName)) {
      if (hasTechnical(candidate) && !all(candidate).some(foreignLink) && !all(candidate).some(n =>
        /^h[12]$/.test(n.nodeName) && n !== matchingHeadings[0]
        && !/^(R\$\s*[\d.,]+|detalhes do veiculo|opcionais(?: do veiculo)?|descricao(?: do veiculo)?)$/i.test(fold(text(n)))
      )) { scope = candidate; break; }
      candidate = 'parentNode' in candidate ? candidate.parentNode || undefined : undefined;
    }
  }
  if (!scope && !jsonEntities.length) reject('document', 'target_entity_not_uniquely_identified');
  const matched = Boolean(scope || jsonEntities.length);
  const scoped = scope ? all(scope) : [];
  function record(field: string, raw: unknown, value: string | number, kind: FieldEvidence['source_type'], where: string) {
    if (value === '' || (typeof value === 'number' && !Number.isFinite(value))) return;
    const previous = provenance[field];
    if (field === 'transmission' && previous && ['CVT', 'Automático'].includes(String(previous.value)) && ['CVT', 'Automático'].includes(String(value))) {
      if (previous.value === 'CVT' || previous.value === value) return;
      delete provenance[field];
    }
    if (provenance[field] && previous.value !== value) { reject(where, `conflicting_target_${field}`); delete provenance[field]; conflicts.add(field); return; }
    if (conflicts.has(field)) return;
    provenance[field] = { field, value, raw_value: String(raw ?? ''), source_type: kind, location: where, confidence: 100, target_entity_match: true };
  }
  const conflicts = new Set<string>();
  // Descriptions are read only from an isolated target section or matching entity.
  let sourceDescription = '';
  let descriptionLocation = '';
  for (const node of scoped) {
    if (!/^h[1-6]$/.test(node.nodeName) || !/^(detalhes do veiculo|descricao(?: do veiculo)?|observacoes|sobre o veiculo)$/.test(fold(text(node)))) continue;
    const siblings = 'parentNode' in node && node.parentNode ? children(node.parentNode) : [];
    const after = siblings.slice(siblings.indexOf(node) + 1);
    const pieces: string[] = [];
    for (const next of after) {
      if (/^h[1-6]$/.test(next.nodeName)) break;
      pieces.push(text(next));
    }
    const value = pieces.join('').split('\n').map(x => x.trim()).filter(Boolean).join('\n');
    if (value) { sourceDescription = value; descriptionLocation = location(node); break; }
  }
  for (const entity of jsonEntities) {
    if (!sourceDescription && typeof entity.value.description === 'string') {
      sourceDescription = entity.value.description;
      descriptionLocation = `${entity.path}.description`;
    }
  }
  function technical(field: string, labels: RegExp, convert: (v: string) => string | number = clean) {
    for (const node of scoped) {
      if (!element(node) || !['li', 'p', 'div', 'tr', 'dd'].includes(node.tagName)) continue;
      const lines = text(node).split('\n').map(clean).filter(Boolean);
      if (!lines.length || lines.length > 3 || !labels.test(fold(lines[0]))) continue;
      const raw = lines[1] || '';
      record(field, raw, convert(raw), 'target_dom', location(node));
    }
  }
  technical('manufacture_year', /^(?:ano fab\.?|ano fabrica[cç][aã]o)\s*:?$/i, v => normalizeVehicleYears({ manufacture_year: v }).manufacture_year);
  technical('model_year', /^(?:ano mod\.?|ano modelo)\s*:?$/i, v => normalizeVehicleYears({ model_year: v }).model_year);
  technical('mileage', /^(?:km|quilometragem|odometro)\s*:?$/i, v => { const n = number(v); return n >= 0 && n <= 2_000_000 ? `${Math.round(n).toLocaleString('pt-BR')} Km` : ''; });
  technical('color', /^cor\s*:?$/i, v => normalizeVehicleOption('color', v));
  technical('fuel', /^combustivel\s*:?$/i, v => normalizeVehicleOption('fuel', v));
  technical('transmission', /^(?:cambio|transmissao)\s*:?$/i, v => normalizeVehicleOption('transmission', v));
  for (const node of scoped) {
    if (!element(node)) continue;
    // Smallest currency-bearing block only; span boundaries do not break currency values.
    const value = clean(text(node));
    if (value.length > 80 || /parcela|entrada|financia|mensal|\bvezes\b|\b\d+\s*x\b/i.test(value)) continue;
    let parent: Node | undefined = node.parentNode || undefined;
    let financial = false;
    while (parent && parent !== scope) {
      const context = clean(text(parent));
      if (context.length < 200 && /parcela|entrada|financia|mensal|\bvezes\b/i.test(context)) financial = true;
      parent = 'parentNode' in parent ? parent.parentNode || undefined : undefined;
    }
    if (financial) { reject(location(node), 'financing_value'); continue; }
    const isPrice = attr(node, 'itemprop') === 'price' || attr(node, 'id') === 'valor_veic';
    const currency = value.match(/^R\$\s*([\d.,]+)$/i);
    if (isPrice || currency) {
      const raw = attr(node, 'content') || currency?.[1] || value;
      const amount = number(raw);
      if (amount >= 5000 && amount <= 2_000_000) record('price', raw, amount, 'target_dom', location(node));
    }
  }
  const images: string[] = [];
  for (const entity of jsonEntities) {
    const value = entity.value;
    const entries: Array<[string, unknown]> = [
      ['brand', typeof value.brand === 'object' ? value.brand?.name : value.brand], ['model', value.model],
      ['version', value.vehicleConfiguration], ['color', value.color], ['fuel', value.fuelType],
      ['transmission', value.vehicleTransmission], ['mileage', value.mileageFromOdometer?.value ?? value.mileage],
      ['model_year', value.vehicleModelDate]
    ];
    for (const [field, raw] of entries) {
      if (raw == null || typeof raw === 'object') continue;
      let normalized: string | number = clean(raw);
      if (['color', 'fuel', 'transmission'].includes(field)) normalized = normalizeVehicleOption(field as 'color' | 'fuel' | 'transmission', raw);
      if (field === 'mileage') { const km = number(raw); normalized = km >= 0 && km <= 2_000_000 ? `${Math.round(km).toLocaleString('pt-BR')} Km` : ''; }
      record(field, raw, normalized, 'target_json', `${entity.path}.${field}`);
    }
    const offers = Array.isArray(value.offers) ? value.offers : value.offers ? [value.offers] : [];
    for (const [i, offer] of offers.entries()) {
      if (!offer || offer['@type'] === 'AggregateOffer') continue;
      const url = offer.url || offer.itemOffered?.url;
      if (offer.itemOffered && (!offer.itemOffered.url || canonical(offer.itemOffered.url, targetUrl) !== targetUrl)) { reject(`${entity.path}.offers[${i}]`, 'unverified_offered_entity'); continue; }
      if (url && canonical(url, targetUrl) !== targetUrl) { reject(`${entity.path}.offers[${i}]`, 'foreign_offer'); continue; }
      const amount = number(offer.price);
      if (amount >= 5000 && amount <= 2_000_000) record('price', offer.price, amount, 'target_json', `${entity.path}.offers[${i}].price`);
    }
    // Hydration prices are only allowed on objects with an exact own URL and vehicle identity.
    if (!value['@type'] && value.price != null) {
      const amount = number(value.price);
      if (amount >= 5000 && amount <= 2_000_000) record('price', value.price, amount, 'target_json', `${entity.path}.price`);
    }
    for (const img of Array.isArray(value.image) ? value.image : [value.image]) if (typeof img === 'string') images.push(canonical(img, targetUrl));
  }
  if (matched) {
    for (const key of ['brand', 'model', 'version'] as const) if (!provenance[key] && identity[key]) record(key, identity[key], identity[key].toUpperCase(), 'target_url', 'pathname');
    const transmission = sourceDescription.match(/(?:c[aâ]mbio|transmiss[aã]o)\s*(?:de\s+)?([^\n.!?]+)/i)?.[1];
    if (transmission && !provenance.transmission) record('transmission', transmission, normalizeVehicleOption('transmission', transmission), 'target_description', descriptionLocation);
    // A more precise explicit CVT source refines the compatible generic automatic value.
    if (transmission && /\bcvt\b/i.test(transmission) && provenance.transmission?.value === 'Automático') {
      delete provenance.transmission;
      record('transmission', transmission, 'CVT', 'target_description', descriptionLocation);
    }
    for (const node of live) {
      if (node.nodeName !== 'img' && node.nodeName !== 'source') continue;
      const raw = attr(node, 'src') || attr(node, 'data-src') || attr(node, 'data-original');
      const url = canonical(raw, targetUrl);
      // Gallery outside the detail container requires an exact vehicle-id filename token.
      const sameId = targetId && new RegExp(`(?:^|[/_])${targetId}(?:[_./-])`).test(new URL(url || targetUrl).pathname);
      if (url && (scoped.includes(node) || sameId) && !/logo|icon|banner|placeholder/i.test(raw)) images.push(url);
    }
  }
  const get = (field: string) => String(provenance[field]?.value ?? '');
  const years = normalizeVehicleYears({ manufacture_year: get('manufacture_year'), model_year: get('model_year') });
  const title = scope ? clean(text(matchingHeadings[0])) : clean(jsonEntities[0]?.value.name);
  const vehicle = { brand: get('brand').toUpperCase(), model: get('model').toUpperCase(), version: get('version').toUpperCase(), ...years,
    mileage: get('mileage'), color: get('color'), fuel: get('fuel'), transmission: get('transmission'), description: sourceDescription, source_url: sourceUrl };
  const price = Number(provenance.price?.value || 0);
  const targetImages = uniqueVehicleImages(images.filter(Boolean), 20);
  const evidence: ImportEvidence = {
    extractor_version: EXTRACTOR_VERSION, target: { url: targetUrl, matched, identity: targetId || title },
    content_hash: createHash('sha256').update(JSON.stringify({ vehicle, price, images: targetImages })).digest('hex'),
    description_source: descriptionLocation, fields: Object.fromEntries(Object.entries(provenance).map(([k,v]) => [k,v.source_type])), provenance, rejected
  };
  return { title, description: sourceDescription, source_description: sourceDescription, price, images: targetImages, evidence, vehicle };
}
