import { track } from '@vercel/analytics';
import { normalizePwaVersion } from '@/lib/pwaVersion';

export type PwaUpdateTelemetryStage =
  | 'loaded'
  | 'detected'
  | 'deferred'
  | 'started'
  | 'reload_requested'
  | 'completed'
  | 'failed';

export type PwaUpdateTelemetrySource =
  | 'app_load'
  | 'service_worker'
  | 'version_endpoint';

export type PwaUpdateTelemetryReason =
  | 'none'
  | 'protected_operation'
  | 'reload_cooldown'
  | 'reload_version_mismatch'
  | 'service_worker_registration'
  | 'service_worker_update'
  | 'version_endpoint_http'
  | 'version_endpoint_network';

type PwaUpdateTelemetryInput = {
  currentVersion?: unknown;
  targetVersion?: unknown;
  source?: PwaUpdateTelemetrySource;
  reason?: PwaUpdateTelemetryReason;
  statusCode?: number;
};

const EVENT_NAMES: Record<PwaUpdateTelemetryStage, string> = {
  loaded: 'PWA Version Loaded',
  detected: 'PWA Update Detected',
  deferred: 'PWA Update Deferred',
  started: 'PWA Update Started',
  reload_requested: 'PWA Update Reload Requested',
  completed: 'PWA Update Completed',
  failed: 'PWA Update Failed'
};

function telemetryVersion(value: unknown) {
  return normalizePwaVersion(value).slice(0, 64) || 'unknown';
}

function displayMode() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'unknown';
  return window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
}

export function buildPwaUpdateTelemetryProperties(
  stage: PwaUpdateTelemetryStage,
  input: PwaUpdateTelemetryInput = {}
) {
  return {
    stage,
    current_version: telemetryVersion(input.currentVersion),
    target_version: telemetryVersion(input.targetVersion),
    source: input.source || 'app_load',
    reason: input.reason || 'none',
    display_mode: displayMode(),
    status_code: Number.isInteger(input.statusCode) ? Number(input.statusCode) : 0
  };
}

export function trackPwaUpdate(
  stage: PwaUpdateTelemetryStage,
  input: PwaUpdateTelemetryInput = {}
) {
  try {
    track(EVENT_NAMES[stage], buildPwaUpdateTelemetryProperties(stage, input));
  } catch {
    // Telemetria nunca pode interromper a atualização nem o uso do CRM.
  }
}
