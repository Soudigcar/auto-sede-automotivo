export const AUTOCAR_OPERATIONAL_PROFILE_TEXT_FIELDS = [
  'timezone',
  'address_text',
  'city',
  'state',
  'postal_code',
  'location_label',
  'maps_url',
  'waze_url'
] as const;

type OperationalProfileTextField = (typeof AUTOCAR_OPERATIONAL_PROFILE_TEXT_FIELDS)[number];

export function normalizeAutocarOperationalProfileClient<T extends Record<string, unknown>>(
  source: T | null | undefined
): T & Record<OperationalProfileTextField, string> {
  const normalized = { ...(source || {}) } as T & Record<OperationalProfileTextField, string>;

  for (const field of AUTOCAR_OPERATIONAL_PROFILE_TEXT_FIELDS) {
    normalized[field] = typeof source?.[field] === 'string' ? source[field] as string : '';
  }

  return normalized;
}

export function safeClientTrim(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
