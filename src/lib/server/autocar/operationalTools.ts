import { getAutocarOperationalProfile, resolveOperationalHours } from '@/lib/server/autocar/operationalProfile';
import { checkStoreAvailability } from '@/lib/server/storeAvailability';

function photoUrls(vehicle: any) {
  return Array.from(new Set([vehicle?.image_url, ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : [])]
    .filter((value) => typeof value === 'string' && /^https:\/\//i.test(value)))).slice(0, 10);
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
