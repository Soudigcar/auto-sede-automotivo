export type InventoryImportRow = {
  event_id: string;
  store_id: string;
  brand: string;
  model: string;
  version?: string | null;
  manufacture_year?: number | null;
  model_year?: number | null;
  vehicle_category?: string | null;
  plate?: string | null;
  color?: string | null;
  price?: number | null;
  status: string;
};

export function normalizeInventoryValue(value: string) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function moneyToNumber(value: string) {
  const clean = String(value || '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  return Number(clean || 0) || null;
}

function getField(row: Record<string, string>, names: string[]) {
  for (const name of names) {
    const key = Object.keys(row).find((item) => normalizeInventoryValue(item) === normalizeInventoryValue(name));
    if (key && row[key]) return row[key];
  }
  return '';
}

export function parseInventoryText(text: string, eventId: string, storeId: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const first = lines[0].split(delimiter).map((item) => item.trim());
  const knownHeaders = ['marca', 'brand', 'modelo', 'model', 'versao', 'version', 'placa', 'plate', 'preco', 'price'];
  const hasHeader = first.some((item) => knownHeaders.includes(normalizeInventoryValue(item)));
  const headers = hasHeader ? first : ['marca', 'modelo', 'versao', 'ano_fabricacao', 'ano_modelo', 'categoria', 'placa', 'cor', 'preco'];
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows.map((line) => {
    const values = line.split(delimiter).map((item) => item.trim());
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => { raw[header] = values[index] || ''; });
    const brand = getField(raw, ['marca', 'brand']);
    const model = getField(raw, ['modelo', 'model']);
    if (!brand || !model) return null;
    return {
      event_id: eventId,
      store_id: storeId,
      brand,
      model,
      version: getField(raw, ['versao', 'version']) || null,
      manufacture_year: Number(getField(raw, ['ano_fabricacao', 'ano fabricacao', 'manufacture_year'])) || null,
      model_year: Number(getField(raw, ['ano_modelo', 'ano modelo', 'model_year'])) || null,
      vehicle_category: getField(raw, ['categoria', 'category', 'vehicle_category']) || null,
      plate: getField(raw, ['placa', 'plate']) || null,
      color: getField(raw, ['cor', 'color']) || null,
      price: moneyToNumber(getField(raw, ['preco', 'valor', 'price'])),
      status: 'available'
    } as InventoryImportRow;
  }).filter(Boolean) as InventoryImportRow[];
}

export function inventoryKey(item: any) {
  const plate = normalizeInventoryValue(item.plate || '');
  if (plate) return `plate:${plate}`;
  return `vehicle:${normalizeInventoryValue(item.brand)}|${normalizeInventoryValue(item.model)}|${normalizeInventoryValue(item.version || '')}|${item.manufacture_year || ''}|${item.model_year || ''}`;
}
