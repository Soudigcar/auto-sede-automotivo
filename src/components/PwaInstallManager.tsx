'use client';

import { useEffect } from 'react';

export function PwaInstallManager() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Falha silenciosa: o sistema web continua funcionando normalmente.
      });
    }
  }, []);

  return null;
}
