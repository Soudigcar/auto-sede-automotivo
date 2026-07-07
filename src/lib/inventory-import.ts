import * as XLSX from 'xlsx';

export type InventoryImportRow = {
  event_id: string;
  store_id: string;
  vehicle_code?: string | null;
  location?: string | null;
  brand: string;
  model: string;
  version?: string | null;
  manufacture_year?: number | null;
  model_year?: number | null;
  vehicle_category?: string | null;
  plate?: string | null;
  color?: string | null;
  mileage?: number | null;
  fuel?: string | null;
  fipe_price?: number | null;
  web_price?: number | null;
  price?: number | null;
  status: string;
};

export function normalizeInventoryValue(value: string) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

function numberOnly(value: string) {
  const clean = String(value || '').replace(/[^0-9]/g, '');
  return Number(clean || 0) || null;
}

function moneyToNumber(value: string | number) {
  if (typeof value === 'number') return value || null;
  const clean = String(value || '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  return Number(clean || 0) || null;
}

function getField(row: Record<string, any>, names: string[]) {
  for (const name of names) {
    const key = Object.keys(row).find((item) => normalizeInventoryValue(item) === normalizeInventoryValue(name));
    if (key && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return '';
}

function buildRow(raw: Record<string, any>, eventId: string, storeId: string) {
  const brand = String(getField(raw, ['marca', 'brand'])).trim();
  const model = String(getField(raw, ['modelo', 'model'])).trim();
  if (!brand || !model) return null;

  const webPrice = moneyToNumber(getField(raw, ['preco web', 'preço web', 'web_price', 'valor web', 'preco venda', 'preço venda']));
  const fipePrice = moneyToNumber(getField(raw, ['preco fipe', 'preço fipe', 'fipe_price', 'fipe']));
  const normalPrice = moneyToNumber(getField(raw, ['preco', 'preço', 'valor', 'price']));

  return {
    event_id: eventId,
    store_id: storeId,
    vehicle_code: String(getField(raw, ['vehicle', 'codigo', 'código', 'cod', 'id veiculo', 'id veículo'])).trim() || null,
    location: String(getField(raw, ['localizacao', 'localização', 'location', 'loja'])).trim() || null,
    brand,
    model,
    version: String(getField(raw, ['versao', 'versão', 'version'])).trim() || null,
    manufacture_year: Number(getField(raw, ['ano fabricacao', 'ano fabricação', 'ano_fabricacao', 'manufacture_year'])) || null,
    model_year: Number(getField(raw, ['ano modelo', 'ano_modelo', 'model_year'])) || null,
    vehicle_category: String(getField(raw, ['categoria', 'category', 'vehicle_category'])).trim() || null,
    plate: String(getField(raw, ['placa', 'plate'])).trim() || null,
    color: String(getField(raw, ['cor', 'color'])).trim() || null,
    mileage: numberOnly(String(getField(raw, ['km', 'quilometragem', 'mileage']))),
    fuel: String(getField(raw, ['combustivel', 'combustível', 'fuel'])).trim() || null,
    fipe_price: fipePrice,
    web_price: webPrice,
    price: webPrice || normalPrice || fipePrice,
    status: 'available'
  } as InventoryImportRow;
}

export function parseInventoryText(text: string, eventId: string, storeId: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const first = lines[0].split(delimiter).map((item) => item.trim());
  const knownHeaders = ['vehicle', 'localizacao', 'localização', 'marca', 'brand', 'modelo', 'model', 'placa', 'plate', 'preco web', 'preço web'];
  const hasHeader = first.some((item) => knownHeaders.includes(normalizeInventoryValue(item)));
  const headers = hasHeader ? first : ['vehicle', 'localizacao', 'marca', 'modelo', 'ano_fabricacao', 'ano_modelo', 'cor', 'km', 'placa', 'combustivel', 'preco_fipe', 'preco_web'];
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows.map((line) => {
    const values = line.split(delimiter).map((item) => item.trim());
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => { raw[header] = values[index] || ''; });
    return buildRow(raw, eventId, storeId);
  }).filter(Boolean) as InventoryImportRow[];
}

export function parseInventoryWorkbook(buffer: ArrayBuffer, eventId: string, storeId: string) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
  return rows.map((row) => buildRow(row, eventId, storeId)).filter(Boolean) as InventoryImportRow[];
}

export function inventoryKey(item: any) {
  const vehicleCode = normalizeInventoryValue(item.vehicle_code || '');
  if (vehicleCode) return `vehicle_code:${vehicleCode}`;
  const plate = normalizeInventoryValue(item.plate || '');
  if (plate) return `plate:${plate}`;
  return `vehicle:${normalizeInventoryValue(item.brand)}|${normalizeInventoryValue(item.model)}|${normalizeInventoryValue(item.version || '')}|${item.manufacture_year || ''}|${item.model_year || ''}`;
}
