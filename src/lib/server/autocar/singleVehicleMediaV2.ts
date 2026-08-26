export const AUTOCAR_SINGLE_VEHICLE_MEDIA_V2_VERSION = 'autocar-single-vehicle-media-v2-preview';
export const AUTOCAR_SINGLE_VEHICLE_MEDIA_MAX_PHOTOS = 3;

type GroundedVehicle = {
  id?: unknown;
  brand?: unknown;
  model?: unknown;
  version?: unknown;
  year?: unknown;
  mileage?: unknown;
  fuel?: unknown;
  transmission?: unknown;
  price?: unknown;
  primary_photo?: unknown;
  photos?: unknown;
};

function clean(value: unknown, max = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function priceBRL(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(amount);
}

function uniqueGroundedPhotos(vehicle: GroundedVehicle) {
  const values = [
    vehicle?.primary_photo,
    ...(Array.isArray(vehicle?.photos) ? vehicle.photos : [])
  ];
  return Array.from(new Set(values
    .map((value) => clean(value, 2000))
    .filter((value) => /^https:\/\//i.test(value))))
    .slice(0, AUTOCAR_SINGLE_VEHICLE_MEDIA_MAX_PHOTOS);
}

function hasSendPhotosAction(actions: unknown) {
  return (Array.isArray(actions) ? actions : []).some((action: any) => String(action?.capability || '') === 'send_photos');
}

function vehicleTitle(vehicle: GroundedVehicle) {
  return [clean(vehicle.brand, 60), clean(vehicle.model, 80), clean(vehicle.version, 100)].filter(Boolean).join(' ');
}

export function buildAutocarSingleVehicleMediaV2(input: {
  referencedVehicles: GroundedVehicle[];
  proposedActions: unknown;
  aiResponse?: unknown;
}) {
  const requested = hasSendPhotosAction(input.proposedActions);
  const unique = new Map<string, GroundedVehicle>();
  for (const vehicle of Array.isArray(input.referencedVehicles) ? input.referencedVehicles : []) {
    const id = clean(vehicle?.id, 100);
    if (id && !unique.has(id)) unique.set(id, vehicle);
  }

  const vehicles = Array.from(unique.values());
  const invalidVehicleCount = requested && vehicles.length !== 1;
  const vehicle = vehicles.length === 1 ? vehicles[0] : null;
  const photos = requested && vehicle ? uniqueGroundedPhotos(vehicle) : [];
  const missingGroundedPhotos = requested && !invalidVehicleCount && photos.length === 0;
  const ready = requested && !invalidVehicleCount && !missingGroundedPhotos && Boolean(vehicle);

  return {
    version: AUTOCAR_SINGLE_VEHICLE_MEDIA_V2_VERSION,
    mode: requested ? 'single_vehicle_media' : 'not_applicable',
    max_photos: AUTOCAR_SINGLE_VEHICLE_MEDIA_MAX_PHOTOS,
    photo_count: photos.length,
    ready,
    vehicle: vehicle ? {
      id: clean(vehicle.id, 100),
      title: vehicleTitle(vehicle),
      year: clean(vehicle.year, 40) || null,
      mileage: clean(vehicle.mileage, 60) || null,
      fuel: clean(vehicle.fuel, 40) || null,
      transmission: clean(vehicle.transmission, 60) || null,
      price_brl: priceBRL(vehicle.price) || null
    } : null,
    photos,
    closing_message: ready ? clean(input.aiResponse, 1600) : '',
    presentation_sequence: ready ? ['grounded_photos', 'ai_response'] : [],
    regression_flags: {
      invalid_vehicle_reference_count: invalidVehicleCount,
      missing_grounded_photos: missingGroundedPhotos
    },
    source: 'grounded_inventory_only',
    external_execution: false
  };
}
