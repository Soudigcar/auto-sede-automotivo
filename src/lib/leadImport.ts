export const LEAD_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const LEAD_IMPORT_MAX_ROWS = 5000;

export const leadImportFields = [
  'name',
  'phone',
  'cpf',
  'email',
  'birth_date',
  'city',
  'source',
  'campaign_name',
  'vehicle_name',
  'notes'
] as const;

export type LeadImportField = (typeof leadImportFields)[number];

export type LeadImportColumnMapping = Partial<Record<LeadImportField, number>>;

export type LeadImportRow = {
  row_number: number;
  name: string;
  phone: string;
  cpf: string;
  email: string;
  birth_date: string;
  city: string;
  source: string;
  campaign_name: string;
  vehicle_name: string;
  notes: string;
};

export type LeadImportRowError = {
  row_number: number;
  message: string;
};

export const leadImportFieldLabels: Record<LeadImportField, string> = {
  name: 'Nome',
  phone: 'Telefone',
  cpf: 'CPF',
  email: 'E-mail',
  birth_date: 'Data de nascimento',
  city: 'Cidade',
  source: 'Origem',
  campaign_name: 'Campanha',
  vehicle_name: 'Veículo de interesse',
  notes: 'Observações'
};

const aliases: Record<LeadImportField, string[]> = {
  name: ['nome', 'nome completo', 'cliente', 'nome cliente', 'lead', 'name', 'customer name'],
  phone: ['telefone', 'celular', 'whatsapp', 'fone', 'phone', 'customer phone'],
  cpf: ['cpf', 'documento', 'document', 'tax id'],
  email: ['email', 'e-mail', 'correio eletronico', 'mail'],
  birth_date: ['data nascimento', 'data de nascimento', 'nascimento', 'birth date', 'birthdate'],
  city: ['cidade', 'municipio', 'city'],
  source: ['origem', 'fonte', 'canal', 'source'],
  campaign_name: ['campanha', 'nome campanha', 'campaign', 'campaign name'],
  vehicle_name: ['veiculo', 'carro', 'veiculo interesse', 'modelo interesse', 'vehicle'],
  notes: ['observacoes', 'observacao', 'notas', 'comentarios', 'notes']
};

export function normalizeLeadImportHeader(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function suggestLeadImportMapping(headers: unknown[]): LeadImportColumnMapping {
  const normalizedHeaders = headers.map(normalizeLeadImportHeader);
  const mapping: LeadImportColumnMapping = {};

  for (const field of leadImportFields) {
    const normalizedAliases = aliases[field].map(normalizeLeadImportHeader);
    const index = normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
    if (index >= 0) mapping[field] = index;
  }

  return mapping;
}

export function normalizeLeadPhone(value: unknown) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 15);
}

export function normalizeLeadCpf(value: unknown) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 11);
}

export function normalizeLeadEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase().slice(0, 320);
}

function cleanCell(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function normalizeLeadBirthDate(value: unknown) {
  const text = cleanCell(value, 40);
  if (!text) return '';

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  const brazilian = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : brazilian
      ? { year: Number(brazilian[3]), month: Number(brazilian[2]), day: Number(brazilian[1]) }
      : null;

  if (!parts) return '';
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year
    || date.getUTCMonth() !== parts.month - 1
    || date.getUTCDate() !== parts.day
  ) return '';

  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function mapLeadImportRows(
  matrix: unknown[][],
  mapping: LeadImportColumnMapping
): { rows: LeadImportRow[]; errors: LeadImportRowError[] } {
  const rows: LeadImportRow[] = [];
  const errors: LeadImportRowError[] = [];

  for (let index = 1; index < matrix.length; index += 1) {
    const sourceRow = Array.isArray(matrix[index]) ? matrix[index] : [];
    const rowNumber = index + 1;
    const value = (field: LeadImportField) => {
      const column = mapping[field];
      return column === undefined ? '' : sourceRow[column];
    };

    const row: LeadImportRow = {
      row_number: rowNumber,
      name: cleanCell(value('name'), 240),
      phone: normalizeLeadPhone(value('phone')),
      cpf: normalizeLeadCpf(value('cpf')),
      email: normalizeLeadEmail(value('email')),
      birth_date: normalizeLeadBirthDate(value('birth_date')),
      city: cleanCell(value('city'), 160),
      source: cleanCell(value('source'), 120),
      campaign_name: cleanCell(value('campaign_name'), 240),
      vehicle_name: cleanCell(value('vehicle_name'), 240),
      notes: cleanCell(value('notes'), 2000)
    };

    const hasAnyValue = Object.entries(row).some(([key, cell]) => key !== 'row_number' && Boolean(cell));
    if (!hasAnyValue) continue;

    if (!row.name) {
      errors.push({ row_number: rowNumber, message: 'Nome não informado.' });
      continue;
    }
    if (!row.phone && !row.cpf && !row.email) {
      errors.push({ row_number: rowNumber, message: 'Informe telefone, CPF ou e-mail.' });
      continue;
    }
    if (value('phone') && (row.phone.length < 10 || row.phone.length > 15)) {
      errors.push({ row_number: rowNumber, message: 'Telefone inválido.' });
      continue;
    }
    if (value('cpf') && row.cpf.length !== 11) {
      errors.push({ row_number: rowNumber, message: 'CPF deve conter 11 dígitos.' });
      continue;
    }
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      errors.push({ row_number: rowNumber, message: 'E-mail inválido.' });
      continue;
    }
    if (value('birth_date') && !row.birth_date) {
      errors.push({ row_number: rowNumber, message: 'Data de nascimento inválida.' });
      continue;
    }

    rows.push(row);
  }

  return { rows, errors };
}

export function distributeLeadImportRows<T>(items: T[], assigneeIds: string[]) {
  if (!assigneeIds.length) return items.map((item) => ({ item, assignee_id: null }));
  return items.map((item, index) => ({ item, assignee_id: assigneeIds[index % assigneeIds.length] }));
}

export function validateLeadImportPayloadRows(value: unknown, maxRows = LEAD_IMPORT_MAX_ROWS) {
  if (!Array.isArray(value) || !value.length) throw new Error('Nenhuma linha válida foi enviada.');
  if (value.length > maxRows) throw new Error(`O lote ultrapassa o limite de ${maxRows} linhas.`);

  const mapping = Object.fromEntries(leadImportFields.map((field, index) => [field, index])) as LeadImportColumnMapping;
  const matrix: unknown[][] = [
    [...leadImportFields],
    ...value.map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return leadImportFields.map((field) => row[field]);
    })
  ];
  const parsed = mapLeadImportRows(matrix, mapping);

  if (parsed.errors.length || parsed.rows.length !== value.length) {
    const first = parsed.errors[0];
    throw new Error(first ? `Linha ${first.row_number}: ${first.message}` : 'O lote contém linhas inválidas.');
  }

  return parsed.rows.map((row, index) => {
    const source = value[index] as Record<string, unknown>;
    const requestedRowNumber = Number(source?.row_number);
    return {
      ...row,
      row_number: Number.isInteger(requestedRowNumber) && requestedRowNumber > 1
        ? requestedRowNumber
        : row.row_number
    };
  });
}
