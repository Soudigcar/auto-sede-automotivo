import { ensureAutocarDevStore, getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { resolveAutocarRuntimeTarget } from '@/lib/server/autocar/runtimeEnvironment';

export type WeeklyHours = Record<string, Array<{ open: string; close: string }>>;
export type SpecialHour = { date: string; closed?: boolean; open?: string; close?: string; label?: string };

const weekdayKeys = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;

function cleanText(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function normalizeTime(value: unknown) {
  const text = cleanText(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : '';
}

function normalizeWeeklyHours(value: unknown): WeeklyHours {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result: WeeklyHours = {};
  for (const day of weekdayKeys) {
    const raw = Array.isArray(source[day]) ? source[day] as any[] : [];
    result[day] = raw.slice(0, 3).map((item) => ({
      open: normalizeTime(item?.open),
      close: normalizeTime(item?.close)
    })).filter((item) => item.open && item.close && item.open < item.close);
  }
  return result;
}

function normalizeSpecialHours(value: unknown): SpecialHour[] {
  return (Array.isArray(value) ? value : []).slice(0, 100).map((item: any) => ({
    date: cleanText(item?.date, 10),
    closed: Boolean(item?.closed),
    open: normalizeTime(item?.open) || undefined,
    close: normalizeTime(item?.close) || undefined,
    label: cleanText(item?.label, 120) || undefined
  })).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && (item.closed || (item.open && item.close && item.open < item.close)));
}

export async function getAutocarOperationalProfile(storeId: string) {
  const target = resolveAutocarRuntimeTarget();
  if (target.schema === 'production_v2') {
    // The V2 brain intentionally does not own store business hours/location.
    // Until CRM receives a canonical operational-hours source, fail safe instead
    // of silently reintroducing the legacy table into AUTOCAR Production.
    return null;
  }

  const autocar = getAutocarDevClient();
  const { data, error } = await autocar.from('ai_store_operational_profiles').select('*').eq('store_id', storeId).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function saveAutocarOperationalProfile(input: {
  store: { id: string; store_name: string; slug?: string | null; status?: string | null; portal_enabled?: boolean | null };
  profileId: string;
  payload: Record<string, unknown>;
}) {
  const target = resolveAutocarRuntimeTarget();
  if (target.schema === 'production_v2') {
    throw new Error('Perfil Operacional da loja precisa ser promovido para a fonte canônica do CRM antes de ser editado em AUTOCAR Production.');
  }

  const autocar = getAutocarDevClient();
  await ensureAutocarDevStore(autocar, input.store);
  const latitudeRaw = input.payload.latitude;
  const longitudeRaw = input.payload.longitude;
  const latitude = latitudeRaw === '' || latitudeRaw == null ? null : Number(latitudeRaw);
  const longitude = longitudeRaw === '' || longitudeRaw == null ? null : Number(longitudeRaw);
  if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new Error('Latitude inválida.');
  if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new Error('Longitude inválida.');

  const row = {
    store_id: input.store.id,
    timezone: cleanText(input.payload.timezone, 80) || 'America/Sao_Paulo',
    address_text: cleanText(input.payload.address_text, 500) || null,
    city: cleanText(input.payload.city, 120) || null,
    state: cleanText(input.payload.state, 40) || null,
    postal_code: cleanText(input.payload.postal_code, 20) || null,
    location_label: cleanText(input.payload.location_label, 160) || null,
    latitude,
    longitude,
    maps_url: cleanText(input.payload.maps_url, 1000) || null,
    waze_url: cleanText(input.payload.waze_url, 1000) || null,
    weekly_hours: normalizeWeeklyHours(input.payload.weekly_hours),
    special_hours: normalizeSpecialHours(input.payload.special_hours),
    default_visit_duration_minutes: Math.max(15, Math.min(480, Number(input.payload.default_visit_duration_minutes || 60))),
    updated_by_profile_id: input.profileId,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await autocar.from('ai_store_operational_profiles')
    .upsert(row, { onConflict: 'store_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export function resolveOperationalHours(profile: any, date: string) {
  if (!profile) return { configured: false, closed: false, intervals: [], source: 'missing' as const };
  const special = (Array.isArray(profile.special_hours) ? profile.special_hours : []).find((item: any) => item?.date === date);
  if (special) {
    if (special.closed) return { configured: true, closed: true, intervals: [], source: 'special' as const, label: special.label || null };
    return { configured: true, closed: false, intervals: special.open && special.close ? [{ open: special.open, close: special.close }] : [], source: 'special' as const, label: special.label || null };
  }
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { configured: false, closed: false, intervals: [], source: 'missing' as const };
  const keys = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dayKey = keys[parsed.getUTCDay()];
  const intervals = Array.isArray(profile.weekly_hours?.[dayKey]) ? profile.weekly_hours[dayKey] : [];
  return { configured: true, closed: intervals.length === 0, intervals, source: 'weekly' as const };
}
