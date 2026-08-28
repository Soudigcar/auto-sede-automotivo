export const PWA_VERSION_ENDPOINT = '/api/pwa/version';
export const PWA_VERSION_QUERY_PARAM = '__pwa_version';

export function normalizePwaVersion(value: unknown) {
  return String(value || '').trim().slice(0, 160);
}

export function shouldApplyPwaUpdate(currentVersion: unknown, latestVersion: unknown) {
  const current = normalizePwaVersion(currentVersion);
  const latest = normalizePwaVersion(latestVersion);
  return Boolean(current && latest && current !== latest);
}
