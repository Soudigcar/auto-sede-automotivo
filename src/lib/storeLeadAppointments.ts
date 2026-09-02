export const storeLeadAppointmentTypes = ['test_drive', 'confirm_visit'] as const;

export type StoreLeadAppointmentType = (typeof storeLeadAppointmentTypes)[number];

const storeLeadAppointmentTypeSet = new Set<string>([...storeLeadAppointmentTypes]);

export function isStoreLeadAppointmentType(value: unknown): value is StoreLeadAppointmentType {
  return storeLeadAppointmentTypeSet.has(String(value || '').trim());
}
