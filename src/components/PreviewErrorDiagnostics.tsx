'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  CLIENT_ERROR_RECOVERY_KEY,
  observeBrowserException
} from '@/lib/client/browserErrorObservability';

const GLOBAL_DIAGNOSTIC_PATH = '/diagnostico/frontend-errors/global';
const SYNTHETIC_PRIVATE_TEXT = 'token=preview-only-secret diagnostic@example.com https://diagnostic.invalid/path?access_token=hidden 5511999999999';

export function PreviewRootErrorDiagnostic({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (enabled && pathname === GLOBAL_DIAGNOSTIC_PATH) setArmed(true);
  }, [enabled, pathname]);

  if (enabled && pathname === GLOBAL_DIAGNOSTIC_PATH && armed) {
    throw new Error(`SyntheticGlobalDiagnostic ${SYNTHETIC_PRIVATE_TEXT}`);
  }

  return null;
}

export function PreviewRenderErrorDiagnostic() {
  const [armed, setArmed] = useState(false);

  useEffect(() => { setArmed(true); }, []);

  if (armed) {
    throw new Error(`SyntheticAutocarDiagnostic ${SYNTHETIC_PRIVATE_TEXT}`);
  }

  return <p data-testid="diagnostic-arming">Preparando falha sintética AUTOCAR...</p>;
}

type RecoveryAttempt = {
  buildVersion?: string;
  fingerprint?: string;
  attemptedAt?: number;
};

function readAttempt(): RecoveryAttempt | null {
  try {
    return JSON.parse(window.sessionStorage.getItem(CLIENT_ERROR_RECOVERY_KEY) || 'null');
  } catch {
    return null;
  }
}

export function PreviewChunkErrorDiagnostic() {
  const [attempt, setAttempt] = useState<RecoveryAttempt | null>(null);
  const [result, setResult] = useState('pronto');

  useEffect(() => { setAttempt(readAttempt()); }, []);

  async function triggerChunkFailure() {
    setResult('executando');
    const observation = await observeBrowserException(
      new Error(`ChunkLoadError: Loading chunk diagnostic-preview failed ${SYNTHETIC_PRIVATE_TEXT}`),
      'window-error'
    );
    setAttempt(readAttempt());
    setResult(`${observation.reportId}:${observation.recoveryScheduled ? 'scheduled' : 'blocked'}`);
  }

  return (
    <main style={{ minHeight: '100vh', padding: 32, background: '#070a12', color: '#fafafa' }}>
      <h1>Diagnóstico temporário de recuperação</h1>
      <p data-testid="chunk-result">Resultado: {result}</p>
      <p data-testid="chunk-attempt">Tentativa reservada: {attempt?.buildVersion ? 'sim' : 'não'}</p>
      <p data-testid="chunk-build">Build da tentativa: {attempt?.buildVersion || 'nenhum'}</p>
      <button type="button" onClick={triggerChunkFailure}>Disparar falha sintética de chunk</button>
    </main>
  );
}
