const STORE_WIDE_REALTIME_ROLES = new Set(['master', 'store']);

export function canSubscribeStoreWideWhatsappRealtime(role: unknown) {
  return STORE_WIDE_REALTIME_ROLES.has(String(role || ''));
}
