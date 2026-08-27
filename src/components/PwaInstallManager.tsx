'use client';

import { useEffect, useRef } from 'react';
import {
  normalizePwaVersion,
  PWA_VERSION_ENDPOINT,
  PWA_VERSION_QUERY_PARAM,
  shouldApplyPwaUpdate
} from '@/lib/pwaVersion';

const UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const PENDING_RETRY_MS = 1000;
const RELOAD_ATTEMPT_COOLDOWN_MS = 60 * 1000;
const RELOAD_ATTEMPT_KEY = 'auto-controle:pwa-reload-attempt:v1';

type ReloadAttempt = {
  version: string;
  attemptedAt: number;
};

function hasActiveTextDraft() {
  const element = document.activeElement;

  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly && element.value.trim().length > 0;
  }

  if (element instanceof HTMLInputElement) {
    const nonTextTypes = new Set([
      'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'
    ]);
    return !element.disabled && !element.readOnly && !nonTextTypes.has(element.type) && element.value.trim().length > 0;
  }

  return element instanceof HTMLElement && element.isContentEditable && Boolean(element.textContent?.trim());
}

function hasProtectedUserOperation() {
  return Boolean(document.querySelector('[data-pwa-update-lock="true"]')) || hasActiveTextDraft();
}

function readReloadAttempt(): ReloadAttempt | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(RELOAD_ATTEMPT_KEY) || 'null');
    if (!value || typeof value.version !== 'string' || typeof value.attemptedAt !== 'number') return null;
    return value;
  } catch {
    return null;
  }
}

function saveReloadAttempt(attempt: ReloadAttempt) {
  try {
    window.sessionStorage.setItem(RELOAD_ATTEMPT_KEY, JSON.stringify(attempt));
  } catch {
    // O modo privado pode indisponibilizar sessionStorage; a atualização continua funcionando.
  }
}

function removeReloadMarker() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PWA_VERSION_QUERY_PARAM)) return;
  url.searchParams.delete(PWA_VERSION_QUERY_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function PwaInstallManager({ currentVersion }: { currentVersion: string }) {
  const reloadRequestedRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const loadedVersion = normalizePwaVersion(currentVersion);
    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;
    let pendingVersion = '';
    let applyingVersion = '';
    let versionRequestInFlight = false;
    let pendingTimer: number | null = null;
    let activationTimer: number | null = null;

    removeReloadMarker();

    const clearPendingTimer = () => {
      if (pendingTimer !== null) window.clearTimeout(pendingTimer);
      pendingTimer = null;
    };

    const clearActivationTimer = () => {
      if (activationTimer !== null) window.clearTimeout(activationTimer);
      activationTimer = null;
    };

    const schedulePendingUpdate = (delay = PENDING_RETRY_MS) => {
      if (disposed || reloadRequestedRef.current) return;
      clearPendingTimer();
      pendingTimer = window.setTimeout(() => void applyPendingUpdate(), delay);
    };

    const reloadWithLatestVersion = (version: string) => {
      const latestVersion = normalizePwaVersion(version);
      if (disposed || reloadRequestedRef.current || !shouldApplyPwaUpdate(loadedVersion, latestVersion)) return;

      pendingVersion = latestVersion;
      if (hasProtectedUserOperation()) {
        schedulePendingUpdate();
        return;
      }

      const previousAttempt = readReloadAttempt();
      const elapsed = previousAttempt?.version === latestVersion
        ? Date.now() - previousAttempt.attemptedAt
        : RELOAD_ATTEMPT_COOLDOWN_MS;

      if (elapsed < RELOAD_ATTEMPT_COOLDOWN_MS) {
        schedulePendingUpdate(RELOAD_ATTEMPT_COOLDOWN_MS - elapsed);
        return;
      }

      reloadRequestedRef.current = true;
      saveReloadAttempt({ version: latestVersion, attemptedAt: Date.now() });

      const url = new URL(window.location.href);
      url.searchParams.set(PWA_VERSION_QUERY_PARAM, latestVersion.slice(0, 64));
      window.location.replace(url.toString());
    };

    async function applyPendingUpdate() {
      const latestVersion = normalizePwaVersion(pendingVersion);
      if (
        disposed ||
        reloadRequestedRef.current ||
        !shouldApplyPwaUpdate(loadedVersion, latestVersion) ||
        applyingVersion === latestVersion
      ) return;

      if (hasProtectedUserOperation()) {
        schedulePendingUpdate();
        return;
      }

      applyingVersion = latestVersion;
      try {
        await registration?.update();
        registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        // A navegação com identificador de versão ainda força a busca do app atual.
      } finally {
        applyingVersion = '';
      }

      clearActivationTimer();
      activationTimer = window.setTimeout(() => reloadWithLatestVersion(latestVersion), 1200);
    }

    const requestVersionUpdate = (version: unknown) => {
      const latestVersion = normalizePwaVersion(version);
      if (!shouldApplyPwaUpdate(loadedVersion, latestVersion)) return;
      pendingVersion = latestVersion;
      void applyPendingUpdate();
    };

    const fetchLatestVersion = async () => {
      if (disposed || versionRequestInFlight || !navigator.onLine) return;
      versionRequestInFlight = true;

      try {
        const url = new URL(PWA_VERSION_ENDPOINT, window.location.origin);
        url.searchParams.set('current', loadedVersion);
        url.searchParams.set('checked_at', String(Date.now()));
        const response = await fetch(url.toString(), {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'X-Auto-Controle-Version': loadedVersion }
        });
        if (!response.ok) return;
        const body = await response.json().catch(() => null);
        requestVersionUpdate(body?.version);
      } catch {
        // Sem conexão, o usuário segue trabalhando e a próxima retomada tenta novamente.
      } finally {
        versionRequestInFlight = false;
      }
    };

    const checkForUpdate = () => {
      if (disposed || !navigator.onLine) return;
      void registration?.update().catch(() => {
        // A verificação explícita de versão continua independente do service worker.
      });
      void fetchLatestVersion();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    const handleWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PWA_UPDATE_AVAILABLE') requestVersionUpdate(event.data.version);
    };

    const handleControllerChange = () => {
      if (pendingVersion) reloadWithLatestVersion(pendingVersion);
      else void fetchLatestVersion();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
    window.addEventListener('pageshow', checkForUpdate);

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((currentRegistration) => {
        if (disposed) return;
        registration = currentRegistration;
        checkForUpdate();
      })
      .catch(() => {
        // O sistema web continua e a comparação explícita de versão permanece disponível.
        void fetchLatestVersion();
      });

    const updateInterval = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);

    return () => {
      disposed = true;
      clearPendingTimer();
      clearActivationTimer();
      window.clearInterval(updateInterval);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker.removeEventListener('message', handleWorkerMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', checkForUpdate);
      window.removeEventListener('online', checkForUpdate);
      window.removeEventListener('pageshow', checkForUpdate);
    };
  }, [currentVersion]);

  return null;
}
