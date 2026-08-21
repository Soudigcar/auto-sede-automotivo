export type WeeklyHours = Record<string, Array<{ open: string; close: string }>>;
export type SpecialHour = {
  date: string;
  closed?: boolean;
  open?: string;
  close?: string;
  label?: string;
};

const weekdayKeys = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
] as const;

const weekdaySet = new Set<string>(weekdayKeys);
const controlCharacters = /[\u0000-\u001f\u007f]/g;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type WeekdayKey = (typeof weekdayKeys)[number];

type OperationalProfilePayload = {
  timezone: string;
  address_text: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  maps_url: string | null;
  waze_url: string | null;
  weekly_hours: WeeklyHours;
  special_hours: SpecialHour[];
  default_visit_duration_minutes: number;
  operational_profile_updated_by: string;
  operational_profile_updated_at: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizedText(value: unknown, max: number, label: string) {
  const normalized = String(value ?? '')
    .replace(controlCharacters, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length > max) {
    throw new Error(`${label} excede o limite de ${max} caracteres.`);
  }

  return normalized;
}

function optionalText(value: unknown, max: number, label: string) {
  return sanitizedText(value, max, label) || null;
}

function normalizeTime(value: unknown, label: string) {
  const normalized = sanitizedText(value, 5, label);
  if (!timePattern.test(normalized)) {
    throw new Error(`${label} deve usar o formato HH:MM em 24 horas.`);
  }
  return normalized;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function normalizeInterval(value: unknown, label: string) {
  if (!isPlainObject(value)) throw new Error(`${label} deve ser um intervalo de horário válido.`);

  const open = normalizeTime(value.open, `${label}: abertura`);
  const close = normalizeTime(value.close, `${label}: fechamento`);

  if (timeToMinutes(open) >= timeToMinutes(close)) {
    throw new Error(`${label} deve terminar depois do horário de abertura.`);
  }

  return { open, close };
}

function emptyWeeklyHours(): WeeklyHours {
  return Object.fromEntries(weekdayKeys.map((day) => [day, []])) as WeeklyHours;
}

export function normalizeWeeklyHours(value: unknown): WeeklyHours {
  if (value == null || value === '') return emptyWeeklyHours();
  if (!isPlainObject(value)) throw new Error('Horários semanais devem ser enviados como objeto.');

  const unexpectedKeys = Object.keys(value).filter((key) => !weekdaySet.has(key));
  if (unexpectedKeys.length) {
    throw new Error(`Horários semanais contêm dias não reconhecidos: ${unexpectedKeys.join(', ')}.`);
  }

  const normalized = emptyWeeklyHours();

  for (const day of weekdayKeys) {
    const raw = value[day] ?? [];
    if (!Array.isArray(raw)) throw new Error(`Horários de ${day} devem ser enviados como lista.`);
    if (raw.length > 3) throw new Error(`Horários de ${day} aceitam no máximo 3 intervalos.`);

    const intervals = raw
      .map((item, index) => normalizeInterval(item, `${day} intervalo ${index + 1}`))
      .sort((left, right) => timeToMinutes(left.open) - timeToMinutes(right.open));

    for (let index = 1; index < intervals.length; index += 1) {
      const previous = intervals[index - 1];
      const current = intervals[index];
      if (timeToMinutes(current.open) < timeToMinutes(previous.close)) {
        throw new Error(`Horários de ${day} possuem intervalos sobrepostos.`);
      }
    }

    normalized[day as WeekdayKey] = intervals;
  }

  return normalized;
}

function validCalendarDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function normalizeSpecialHours(value: unknown): SpecialHour[] {
  if (value == null || value === '') return [];
  if (!Array.isArray(value)) throw new Error('Horários especiais devem ser enviados como lista.');
  if (value.length > 100) throw new Error('Horários especiais aceitam no máximo 100 datas.');

  const dates = new Set<string>();
  const normalized = value.map((item, index) => {
    if (!isPlainObject(item)) throw new Error(`Horário especial ${index + 1} é inválido.`);

    const date = sanitizedText(item.date, 10, `Horário especial ${index + 1}: data`);
    if (!validCalendarDate(date)) {
      throw new Error(`Horário especial ${index + 1} possui data inválida.`);
    }
    if (dates.has(date)) throw new Error(`Existe mais de um horário especial para ${date}.`);
    dates.add(date);

    if (item.closed != null && typeof item.closed !== 'boolean') {
      throw new Error(`Horário especial ${date}: fechado deve ser verdadeiro ou falso.`);
    }

    const closed = item.closed === true;
    const label = optionalText(item.label, 120, `Horário especial ${date}: descrição`) || undefined;
    const hasOpen = String(item.open ?? '').trim().length > 0;
    const hasClose = String(item.close ?? '').trim().length > 0;

    if (closed) {
      if (hasOpen || hasClose) {
        throw new Error(`Horário especial ${date} não pode ter abertura/fechamento quando estiver fechado.`);
      }
      return { date, closed: true, ...(label ? { label } : {}) };
    }

    if (!hasOpen || !hasClose) {
      throw new Error(`Horário especial ${date} exige abertura e fechamento.`);
    }

    const interval = normalizeInterval(
      { open: item.open, close: item.close },
      `Horário especial ${date}`
    );

    return {
      date,
      closed: false,
      open: interval.open,
      close: interval.close,
      ...(label ? { label } : {})
    };
  });

  return normalized.sort((left, right) => left.date.localeCompare(right.date));
}

function normalizeTimezone(value: unknown) {
  const timezone = sanitizedText(value, 80, 'Fuso horário') || 'America/Sao_Paulo';
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error('Fuso horário inválido. Use um identificador IANA, como America/Sao_Paulo.');
  }
  return timezone;
}

function optionalCoordinate(value: unknown, label: string, min: number, max: number) {
  if (value == null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} inválida.`);
  }
  return Number(number.toFixed(6));
}

function optionalHttpsUrl(value: unknown, label: string) {
  const text = optionalText(value, 1000, label);
  if (!text) return null;

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} inválida.`);
  }

  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`${label} deve ser uma URL HTTPS sem credenciais.`);
  }

  return parsed.toString();
}

function normalizeDuration(value: unknown) {
  if (value == null || value === '') return 60;
  const duration = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(duration) || !Number.isInteger(duration) || duration < 15 || duration > 480) {
    throw new Error('Duração padrão da visita deve ser um número inteiro entre 15 e 480 minutos.');
  }
  return duration;
}

export function normalizeAutocarOperationalProfilePayload(
  payload: Record<string, unknown>,
  profileId: string,
  now = new Date()
): OperationalProfilePayload {
  if (!isPlainObject(payload)) throw new Error('Perfil Operacional inválido.');

  const actorProfileId = sanitizedText(profileId, 100, 'Perfil responsável');
  if (!actorProfileId) throw new Error('Perfil responsável pela alteração não foi identificado.');

  if (Number.isNaN(now.getTime())) throw new Error('Data de atualização inválida.');

  return {
    timezone: normalizeTimezone(payload.timezone),
    address_text: optionalText(payload.address_text, 500, 'Endereço'),
    city: optionalText(payload.city, 120, 'Cidade'),
    state: optionalText(payload.state, 40, 'Estado'),
    postal_code: optionalText(payload.postal_code, 20, 'CEP'),
    location_label: optionalText(payload.location_label, 160, 'Identificação da localização'),
    latitude: optionalCoordinate(payload.latitude, 'Latitude', -90, 90),
    longitude: optionalCoordinate(payload.longitude, 'Longitude', -180, 180),
    maps_url: optionalHttpsUrl(payload.maps_url, 'Link do Google Maps'),
    waze_url: optionalHttpsUrl(payload.waze_url, 'Link do Waze'),
    weekly_hours: normalizeWeeklyHours(payload.weekly_hours),
    special_hours: normalizeSpecialHours(payload.special_hours),
    default_visit_duration_minutes: normalizeDuration(payload.default_visit_duration_minutes),
    operational_profile_updated_by: actorProfileId,
    operational_profile_updated_at: now.toISOString()
  };
}
