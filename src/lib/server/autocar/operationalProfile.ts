import { ensureAutocarDevStore, getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { resolveAutocarRuntimeTarget } from '@/lib/server/autocar/runtimeEnvironment';
import {
  normalizeAutocarOperationalProfilePayload,
  type SpecialHour,
  type WeeklyHours
} from '@/lib/server/autocar/operationalProfileValidation';
import { createAdminClient } from '@/lib/server/storeTeam';

export type { SpecialHour, WeeklyHours };

function crmOperationalSelect() {
  return 'id,address_text,city,state,timezone,postal_code,location_label,latitude,longitude,maps_url,waze_url,weekly_hours,special_hours,default_visit_duration_minutes,operational_profile_updated_at,operational_profile_updated_by';
}

export async function getAutocarOperationalProfile(storeId: string) {
  const target = resolveAutocarRuntimeTarget();
  if (target.schema === 'production_v2') {
    const crm: any = createAdminClient();
    const { data, error } = await crm
      .from('stores')
      .select(crmOperationalSelect())
      .eq('id', storeId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  const autocar = getAutocarDevClient();
  const { data, error } = await autocar
    .from('ai_store_operational_profiles')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function saveAutocarOperationalProfile(input: {
  store: {
    id: string;
    store_name: string;
    slug?: string | null;
    status?: string | null;
    portal_enabled?: boolean | null;
  };
  profileId: string;
  payload: Record<string, unknown>;
}) {
  const target = resolveAutocarRuntimeTarget();
  const normalized = normalizeAutocarOperationalProfilePayload(input.payload, input.profileId);

  if (target.schema === 'production_v2') {
    const crm: any = createAdminClient();
    const { data, error } = await crm
      .from('stores')
      .update(normalized)
      .eq('id', input.store.id)
      .select(crmOperationalSelect())
      .single();
    if (error) throw error;
    return data;
  }

  const autocar = getAutocarDevClient();
  await ensureAutocarDevStore(autocar, input.store);
  const legacyRow = {
    store_id: input.store.id,
    timezone: normalized.timezone,
    address_text: normalized.address_text,
    city: normalized.city,
    state: normalized.state,
    postal_code: normalized.postal_code,
    location_label: normalized.location_label,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    maps_url: normalized.maps_url,
    waze_url: normalized.waze_url,
    weekly_hours: normalized.weekly_hours,
    special_hours: normalized.special_hours,
    default_visit_duration_minutes: normalized.default_visit_duration_minutes,
    updated_by_profile_id: normalized.operational_profile_updated_by,
    updated_at: normalized.operational_profile_updated_at
  };

  const { data, error } = await autocar
    .from('ai_store_operational_profiles')
    .upsert(legacyRow, { onConflict: 'store_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export function resolveOperationalHours(profile: any, date: string) {
  if (!profile) {
    return { configured: false, closed: false, intervals: [], source: 'missing' as const };
  }

  const special = (Array.isArray(profile.special_hours) ? profile.special_hours : [])
    .find((item: any) => item?.date === date);

  if (special) {
    if (special.closed) {
      return {
        configured: true,
        closed: true,
        intervals: [],
        source: 'special' as const,
        label: special.label || null
      };
    }
    return {
      configured: true,
      closed: false,
      intervals: special.open && special.close
        ? [{ open: special.open, close: special.close }]
        : [],
      source: 'special' as const,
      label: special.label || null
    };
  }

  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { configured: false, closed: false, intervals: [], source: 'missing' as const };
  }

  const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = keys[parsed.getUTCDay()];
  const intervals = Array.isArray(profile.weekly_hours?.[dayKey])
    ? profile.weekly_hours[dayKey]
    : [];

  return {
    configured: true,
    closed: intervals.length === 0,
    intervals,
    source: 'weekly' as const
  };
}
