'use client';

import { useEffect, useRef } from 'react';

const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export function PwaInstallManager() {
  const reloadRequestedRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;

    const reloadWithLatestVersion = () => {
      if (disposed || reloadRequestedRef.current) return;
      reloadRequestedRef.current = true;
      window.location.reload();
    };

    const checkForUpdate = () => {
      if (disposed || !navigator.onLine) return;
      void registration?.update().catch(() => {
        // Uma falha temporária de rede não impede o uso do sistema.
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    const handleWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PWA_UPDATE_AVAILABLE') reloadWithLatestVersion();
    };

    navigator.serviceWorker.addEventListener('controllerchange', reloadWithLatestVersion);
    navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', checkForUpdate);

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((currentRegistration) => {
        if (disposed) return;
        registration = currentRegistration;
        checkForUpdate();
      })
      .catch(() => {
        // Falha silenciosa: o sistema web continua funcionando normalmente.
      });

    const updateInterval = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(updateInterval);
      navigator.serviceWorker.removeEventListener('controllerchange', reloadWithLatestVersion);
      navigator.serviceWorker.removeEventListener('message', handleWorkerMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', checkForUpdate);
    };
  }, []);

  return null;
}
