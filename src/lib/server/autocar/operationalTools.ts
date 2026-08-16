import { getAutocarOperationalProfile, resolveOperationalHours } from '@/lib/server/autocar/operationalProfile';
import { checkStoreAvailability } from '@/lib/server/storeAvailability';

function photoUrls(vehicle: any) {
  return Array.from(new Set([vehicle?.image_url, ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : [])]
    .filter((value) => typeof value === 'string' && /^https:\/\//i.test(value)))).slice(0, 10);
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function timeToMinutes(value: unknown) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function periodForMinutes(minutes: number) {
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 18 * 60) return 'afternoon';
  return 'evening';
}

export async function consultAutocarStoreHours(storeId: string, date: string) {
  const profile = await getAutocarOperationalProfile(storeId);
  return {
    date,
    timezone: profile?.timezone || 'America/Sao_Paulo',
    ...resolveOperationalHours(profile, date)
  };
}

export async function consultAutocarStoreLocation(storeId: string) {
  const profile = await getAutocarOperationalProfile(storeId);
  if (!profile) return { configured: false };
  const configured = Boolean(profile.address_text || profile.maps_url || (profile.latitude != null && profile.longitude != null));
  return {
    configured,
    label: profile.location_label || null,
    address: profile.address_text || null,
    city: profile.city || null,
    state: profile.state || null,
    postal_code: profile.postal_code || null,
    latitude: profile.latitude == null ? null : Number(profile.latitude),
    longitude: profile.longitude == null ? null : Number(profile.longitude),
    maps_url: profile.maps_url || null,
    waze_url: profile.waze_url || null
  };
}

export async function consultAutocarAvailability(input: {
  productionSupabase: any;
  storeId: string;
  date: string;
  time: string;
  excludeLeadId?: string | null;
}) {
  const profile = await getAutocarOperationalProfile(input.storeId);
  const hours = resolveOperationalHours(profile, input.date);
  if (!profile) return { configured: false, available: false, reason: 'operational_profile_missing', hours };
  if (hours.closed) return { configured: true, available: false, reason: 'store_closed', hours };
  const requestedMinutes = Number(input.time.slice(0, 2)) * 60 + Number(input.time.slice(3, 5));
  const insideHours = hours.intervals.some((interval: any) => {
    const [oh, om] = String(interval.open).split(':').map(Number);
    const [ch, cm] = String(interval.close).split(':').map(Number);
    return requestedMinutes >= oh * 60 + om && requestedMinutes < ch * 60 + cm;
  });
  if (!insideHours) return { configured: true, available: false, reason: 'outside_business_hours', hours };

  const startsAt = new Date(`${input.date}T${input.time}:00-03:00`);
  if (Number.isNaN(startsAt.getTime())) return { configured: true, available: false, reason: 'invalid_datetime', hours };
  const calendar = await checkStoreAvailability({
    supabase: input.productionSupabase,
    storeId: input.storeId,
    startsAt,
    durationMinutes: Number(profile.default_visit_duration_minutes || 60),
    excludeLeadId: input.excludeLeadId || null
  });
  return { configured: true, reason: calendar.available ? 'available' : 'calendar_conflict', hours, ...calendar };
}

export async function consultAutocarDayAvailability(input: {
  productionSupabase: any;
  storeId: string;
  date: string;
  excludeLeadId?: string | null;
}) {
  const profile = await getAutocarOperationalProfile(input.storeId);
  const hours = resolveOperationalHours(profile, input.date);
  const durationMinutes = Math.max(15, Math.min(480, Number(profile?.default_visit_duration_minutes || 60)));

  if (!profile) {
    return {
      configured: false,
      date: input.date,
      duration_minutes: durationMinutes,
      hours,
      available_slots: [],
      morning_slots: [],
      afternoon_slots: [],
      evening_slots: []
    };
  }

  if (hours.closed || !Array.isArray(hours.intervals) || hours.intervals.length === 0) {
    return {
      configured: true,
      date: input.date,
      duration_minutes: durationMinutes,
      hours,
      available_slots: [],
      morning_slots: [],
      afternoon_slots: [],
      evening_slots: []
    };
  }

  const candidateTimes: string[] = [];
  for (const interval of hours.intervals) {
    const openMinutes = timeToMinutes(interval?.open);
    const closeMinutes = timeToMinutes(interval?.close);
    if (openMinutes == null || closeMinutes == null || openMinutes >= closeMinutes) continue;

    for (let start = openMinutes; start + durationMinutes <= closeMinutes; start += durationMinutes) {
      const time = minutesToTime(start);
      const startsAt = new Date(`${input.date}T${time}:00-03:00`);
      if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) continue;
      candidateTimes.push(time);
    }
  }

  const checked = await Promise.all(candidateTimes.map(async (time) => {
    const availability = await consultAutocarAvailability({
      productionSupabase: input.productionSupabase,
      storeId: input.storeId,
      date: input.date,
      time,
      excludeLeadId: input.excludeLeadId || null
    });
    return { time, available: availability.available === true };
  }));

  const availableSlots = checked.filter((slot) => slot.available).map((slot) => slot.time);
  const morningSlots = availableSlots.filter((time) => periodForMinutes(timeToMinutes(time) || 0) === 'morning');
  const afternoonSlots = availableSlots.filter((time) => periodForMinutes(timeToMinutes(time) || 0) === 'afternoon');
  const eveningSlots = availableSlots.filter((time) => periodForMinutes(timeToMinutes(time) || 0) === 'evening');

  return {
    configured: true,
    date: input.date,
    timezone: profile.timezone || 'America/Sao_Paulo',
    duration_minutes: durationMinutes,
    hours,
    available_slots: availableSlots,
    morning_slots: morningSlots,
    afternoon_slots: afternoonSlots,
    evening_slots: eveningSlots
  };
}

export async function consultAutocarVehiclePhotos(input: {
  productionSupabase: any;
  storeId: string;
  vehicleId: string;
}) {
  if (!input.vehicleId) return { configured: false, vehicle_id: null, photos: [] };
  const { data, error } = await input.productionSupabase.from('site_vehicles')
    .select('id,brand,model,version,year,model_year,status,image_url,image_urls')
    .eq('id', input.vehicleId).eq('store_id', input.storeId).eq('status', 'disponivel').maybeSingle();
  if (error) throw error;
  if (!data) return { configured: false, vehicle_id: input.vehicleId, photos: [] };
  return {
    configured: true,
    vehicle_id: data.id,
    vehicle: [data.brand, data.model, data.version, data.model_year || data.year].filter(Boolean).join(' '),
    photos: photoUrls(data)
  };
}
