export const AUTOCAR_VEHICLE_PRESENTATION_V2_VERSION = 'autocar-vehicle-presentation-v2-preview';
export const AUTOCAR_VEHICLE_PRESENTATION_MAX_OPTIONS = 3;

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

function titleFor(vehicle: GroundedVehicle) {
  return [clean(vehicle.brand, 60), clean(vehicle.model, 80), clean(vehicle.version, 100)].filter(Boolean).join(' ');
}

function descriptionFor(vehicle: GroundedVehicle) {
  const details = [
    clean(vehicle.year, 40),
    clean(vehicle.mileage, 60),
    clean(vehicle.fuel, 40),
    clean(vehicle.transmission, 60)
  ].filter(Boolean).join(' · ');
  const price = priceBRL(vehicle.price);
  return [details, price].filter(Boolean).join('\n');
}

export function buildAutocarVehiclePresentationV2(input: {
  referencedVehicles: GroundedVehicle[];
  aiResponse?: unknown;
}) {
  const unique = new Map<string, GroundedVehicle>();
  for (const vehicle of Array.isArray(input.referencedVehicles) ? input.referencedVehicles : []) {
    const id = clean(vehicle?.id, 100);
    if (id && !unique.has(id)) unique.set(id, vehicle);
  }

  const grounded = Array.from(unique.values());
  const optionCount = grounded.length;
  const multiVehicleReference = optionCount >= 2;
  const tooManyOptions = optionCount > AUTOCAR_VEHICLE_PRESENTATION_MAX_OPTIONS;
  const selected = grounded.slice(0, AUTOCAR_VEHICLE_PRESENTATION_MAX_OPTIONS);

  const cards = selected.map((vehicle) => {
    const photoUrl = clean(vehicle.primary_photo, 2000);
    return {
      vehicle_id: clean(vehicle.id, 100),
      photo_url: photoUrl || null,
      title: titleFor(vehicle),
      description: descriptionFor(vehicle),
      facts: {
        year: clean(vehicle.year, 40) || null,
        mileage: clean(vehicle.mileage, 60) || null,
        fuel: clean(vehicle.fuel, 40) || null,
        transmission: clean(vehicle.transmission, 60) || null,
        price_brl: priceBRL(vehicle.price) || null
      }
    };
  });

  const missingPrimaryPhoto = multiVehicleReference && cards.some((card) => !card.photo_url);
  const invalidGroundedCard = multiVehicleReference && cards.some((card) => !card.vehicle_id || !card.title || !card.description);
  const ready = multiVehicleReference && !tooManyOptions && !missingPrimaryPhoto && !invalidGroundedCard && cards.length >= 2;

  return {
    version: AUTOCAR_VEHICLE_PRESENTATION_V2_VERSION,
    mode: multiVehicleReference ? 'multi_vehicle_options' : 'not_applicable',
    max_options: AUTOCAR_VEHICLE_PRESENTATION_MAX_OPTIONS,
    option_count: optionCount,
    ready,
    opening_message: ready ? `Separei ${cards.length} opções para você comparar:` : '',
    cards,
    closing_message: ready ? clean(input.aiResponse, 1200) : '',
    regression_flags: {
      too_many_vehicle_options: tooManyOptions,
      missing_primary_photo: missingPrimaryPhoto,
      invalid_grounded_card: invalidGroundedCard
    },
    source: 'grounded_inventory_only',
    external_execution: false
  };
}
