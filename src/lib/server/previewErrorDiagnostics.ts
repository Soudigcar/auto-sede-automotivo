import { notFound } from 'next/navigation';

export const PREVIEW_ERROR_DIAGNOSTIC_BRANCH = 'fix/frontend-error-observability-recovery';

export function assertPreviewErrorDiagnostics(environment: NodeJS.ProcessEnv = process.env) {
  if (
    environment.VERCEL_ENV !== 'preview'
    || environment.VERCEL_GIT_COMMIT_REF !== PREVIEW_ERROR_DIAGNOSTIC_BRANCH
  ) notFound();
}
