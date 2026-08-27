import { normalizePwaVersion } from '@/lib/pwaVersion';

const LOCAL_PWA_VERSION = 'auto-controle-pwa-local';

export function resolvePwaAppVersion(environment: NodeJS.ProcessEnv = process.env) {
  return normalizePwaVersion(
    environment.VERCEL_GIT_COMMIT_SHA ||
    environment.VERCEL_DEPLOYMENT_ID ||
    environment.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    LOCAL_PWA_VERSION
  );
}
