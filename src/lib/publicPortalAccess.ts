export const INTERNAL_SYSTEM_HOST = 'sistemaautomotivo.autosede.com.br';
export const INTERNAL_LOGIN_URL = `https://${INTERNAL_SYSTEM_HOST}/login`;

export function resolveInternalAccessUrl(vercelEnv: string | undefined) {
  return vercelEnv === 'preview' ? '/login' : INTERNAL_LOGIN_URL;
}
