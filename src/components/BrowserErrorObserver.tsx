'use client';

import { useEffect } from 'react';
import { consumeClientRecoveryMarker, observeBrowserException } from '@/lib/client/browserErrorObservability';

export function BrowserErrorObserver() {
  useEffect(() => {
    consumeClientRecoveryMarker();

    const handleWindowError = (event: ErrorEvent) => {
      const error = event.error instanceof Error
        ? event.error
        : new Error(typeof event.message === 'string' ? event.message : 'Erro global no navegador.');
      void observeBrowserException(error, 'window-error');
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(typeof event.reason === 'string' ? event.reason : 'Promise rejeitada sem mensagem segura.');
      void observeBrowserException(error, 'unhandled-rejection');
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
