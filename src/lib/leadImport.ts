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

export type LeadImportMappingSuggestion = {
  field: LeadImportField;
  column: number;
  header: string;
  confidence: 'high' | 'medium';
  method: 'header' | 'content';
  score: number;
};

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
  name: [
    'nome', 'nome completo', 'nome cliente', 'nome do cliente', 'cliente', 'lead', 'contato nome',
    'name', 'full name', 'customer name', 'contact name', 'lead name'
  ],
  phone: [
    'telefone', 'telefone principal', 'telefone celular', 'numero telefone', 'numero de telefone',
    'celular', 'celular principal', 'whatsapp', 'numero whatsapp', 'fone', 'tel',
    'telefone contato', 'contato telefone',
    'phone', 'phone number', 'customer phone', 'contact phone', 'mobile', 'mobile phone'
  ],
  cpf: [
    'cpf', 'cpf cliente', 'cpf do cliente', 'documento', 'documento cliente', 'numero documento',
    'numero do documento', 'doc', 'document', 'tax id', 'taxpayer id'
  ],
  email: [
    'email', 'e-mail', 'email principal', 'e-mail principal', 'endereco email', 'endereco de email',
    'correio eletronico', 'mail', 'customer email', 'contact email'
  ],
  birth_date: [
    'data nascimento', 'data de nascimento', 'dt nascimento', 'nascimento', 'aniversario',
    'birth date', 'birthdate', 'date of birth', 'dob'
  ],
  city: ['cidade', 'municipio', 'localidade', 'cidade cliente', 'city', 'town'],
  source: [
    'origem', 'fonte', 'canal', 'canal de origem', 'plataforma de origem', 'midia',
    'source', 'lead source', 'traffic source'
  ],
  campaign_name: [
    'campanha', 'nome campanha', 'nome da campanha', 'utm campaign',
    'campaign', 'campaign name', 'ad campaign'
  ],
  vehicle_name: [
    'veiculo', 'carro', 'veiculo interesse', 'veiculo de interesse', 'modelo interesse',
    'modelo de interesse', 'interesse', 'vehicle', 'interested vehicle', 'vehicle interest'
  ],
  notes: [
    'observacoes', 'observacao', 'notas', 'comentarios', 'descricao', 'detalhes',
    'notes', 'comments', 'remarks'
  ]
};

const genericPartialAliases = new Set([
  'lead', 'cliente', 'contato', 'name', 'phone', 'mail', 'city', 'source', 'vehicle', 'notes', 'carro'
]);

const blankImportMarkers = new Set([
  '-', '--', 'n/a', 'na', 'null', 'undefined', 'nao informado', 'não informado',
  'sem informacao', 'sem informação', 'sem dados', 'vazio'
]);

export function normalizeLeadImportHeader(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isBlankLeadImportValue(value: unknown) {
  if (value === null || value === undefined) return true;
  const normalized = String(value).replace(/\0/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return !normalized || blankImportMarkers.has(normalized);
}

function headerMatchScore(header: string, field: LeadImportField) {
  if (!header) return 0;
  let best = 0;

  for (const rawAlias of aliases[field]) {
    const alias = normalizeLeadImportHeader(rawAlias);
    if (header === alias) best = Math.max(best, 100);
    if (genericPartialAliases.has(alias)) continue;

    const headerTokens = new Set(header.split(' '));
    const aliasTokens = alias.split(' ');
    if (aliasTokens.every((token) => headerTokens.has(token))) best = Math.max(best, 92);
    else if (header.includes(alias) || alias.includes(header)) best = Math.max(best, 84);
  }

  return best;
}

function cpfHasValidChecksum(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const calculate = (length: number) => {
    const total = digits.slice(0, length).split('').reduce((sum, digit, index) => (
      sum + Number(digit) * (length + 1 - index)
    ), 0);
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10]);
}

function contentMatchScore(field: LeadImportField, sampleRows: unknown[][], column: number) {
  const values = sampleRows
    .map((row) => Array.isArray(row) ? row[column] : '')
    .filter((value) => !isBlankLeadImportValue(value))
    .slice(0, 100);
  if (values.length < 2) return 0;

  const ratio = (predicate: (value: unknown) => boolean) => values.filter(predicate).length / values.length;
  if (field === 'email' && ratio((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())) >= 0.75) return 96;
  if (field === 'birth_date' && ratio((value) => Boolean(normalizeLeadBirthDate(value))) >= 0.75) return 90;
  if (field === 'cpf' && ratio(cpfHasValidChecksum) >= 0.7) return 88;
  if (field === 'phone' && ratio((value) => {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15 && !cpfHasValidChecksum(value);
  }) >= 0.75) return 82;
  return 0;
}

export function suggestLeadImportMappingDetailed(headers: unknown[], sampleRows: unknown[][] = []) {
  const normalizedHeaders = headers.map(normalizeLeadImportHeader);
  const mapping: LeadImportColumnMapping = {};
  const suggestions: LeadImportMappingSuggestion[] = [];
  const candidates: Array<{ field: LeadImportField; column: number; score: number; method: 'header' | 'content' }> = [];

  for (let column = 0; column < normalizedHeaders.length; column += 1) {
    for (const field of leadImportFields) {
      const headerScore = headerMatchScore(normalizedHeaders[column], field);
      const contentScore = contentMatchScore(field, sampleRows, column);
      const score = Math.max(headerScore, contentScore);
      if (score >= 75) candidates.push({ field, column, score, method: headerScore >= contentScore ? 'header' : 'content' });
    }
  }

  const usedFields = new Set<LeadImportField>();
  const usedColumns = new Set<number>();
  candidates.sort((left, right) => right.score - left.score || left.column - right.column);
  for (const candidate of candidates) {
    if (usedFields.has(candidate.field) || usedColumns.has(candidate.column)) continue;
    mapping[candidate.field] = candidate.column;
    usedFields.add(candidate.field);
    usedColumns.add(candidate.column);
    suggestions.push({
      ...candidate,
      header: String(headers[candidate.column] ?? ''),
      confidence: candidate.score >= 90 ? 'high' : 'medium'
    });
  }

  return {
    mapping,
    suggestions: suggestions.sort((left, right) => leadImportFields.indexOf(left.field) - leadImportFields.indexOf(right.field)),
    unmapped_columns: headers.map((_, column) => column).filter((column) => !usedColumns.has(column))
  };
}

export function suggestLeadImportMapping(headers: unknown[], sampleRows: unknown[][] = []): LeadImportColumnMapping {
  return suggestLeadImportMappingDetailed(headers, sampleRows).mapping;
}

export function normalizeLeadPhone(value: unknown) {
  if (isBlankLeadImportValue(value)) return '';
  let digits = String(value ?? '').replace(/\D/g, '');
  if (/^0055\d{10,11}$/.test(digits)) digits = digits.slice(4);
  else if (/^55\d{10,11}$/.test(digits)) digits = digits.slice(2);
  else if (/^0\d{10,11}$/.test(digits)) digits = digits.slice(1);
  return digits.slice(0, 16);
}

export function normalizeLeadCpf(value: unknown) {
  if (isBlankLeadImportValue(value)) return '';
  return String(value ?? '').replace(/\D/g, '').slice(0, 11);
}

export function normalizeLeadEmail(value: unknown) {
  if (isBlankLeadImportValue(value)) return '';
  return String(value ?? '').trim().toLowerCase().slice(0, 320);
}

function cleanCell(value: unknown, maxLength: number) {
  if (isBlankLeadImportValue(value)) return '';
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
    if (!isBlankLeadImportValue(value('phone')) && (row.phone.length < 10 || row.phone.length > 15)) {
      errors.push({ row_number: rowNumber, message: 'Telefone inválido.' });
      continue;
    }
    if (!isBlankLeadImportValue(value('cpf')) && row.cpf.length !== 11) {
      errors.push({ row_number: rowNumber, message: 'CPF deve conter 11 dígitos.' });
      continue;
    }
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      errors.push({ row_number: rowNumber, message: 'E-mail inválido.' });
      continue;
    }
    if (!isBlankLeadImportValue(value('birth_date')) && !row.birth_date) {
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
