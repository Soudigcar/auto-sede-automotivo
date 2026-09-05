'use client';

import { useEffect, useState } from 'react';
import {
  isRecoverableBundleError,
  observeBrowserException
} from '@/lib/client/browserErrorObservability';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const [reportId, setReportId] = useState('gerando...');
  const [recovering, setRecovering] = useState(() => isRecoverableBundleError(error));

  useEffect(() => {
    let active = true;
    void observeBrowserException(error, 'global-boundary').then((result) => {
      if (!active) return;
      setReportId(result.reportId);
      setRecovering(result.recoveryScheduled);
    });
    return () => { active = false; };
  }, [error]);

  const panelStyle = {
    width: 'min(92vw, 560px)',
    border: '1px solid #27272a',
    borderRadius: 24,
    background: '#111318',
    color: '#fafafa',
    padding: 32,
    boxShadow: '0 24px 80px rgba(0,0,0,.38)'
  } as const;

  const buttonStyle = {
    border: 0,
    borderRadius: 12,
    padding: '12px 16px',
    fontWeight: 800,
    cursor: 'pointer'
  } as const;

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#070a12', fontFamily: 'Arial, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <section style={panelStyle} role="alert" aria-live="assertive">
            <p style={{ margin: 0, color: '#ef4444', fontSize: 12, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>
              Auto Controle
            </p>
            <h1 style={{ margin: '12px 0 0', fontSize: 30, lineHeight: 1.15 }}>Não foi possível carregar esta tela</h1>
            <p style={{ margin: '14px 0 0', color: '#a1a1aa', lineHeight: 1.6 }}>
              {recovering
                ? 'Detectamos uma falha de atualização e faremos uma única tentativa segura de recuperação.'
                : 'A ocorrência foi registrada sem dados pessoais. Você pode tentar novamente sem perder sua sessão.'}
            </p>
            <p style={{ margin: '18px 0 0', color: '#71717a', fontSize: 12 }}>
              Código do relatório: <strong style={{ color: '#d4d4d8' }}>{reportId}</strong>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
              <button type="button" onClick={reset} style={{ ...buttonStyle, background: '#dc2626', color: '#fff' }}>
                Tentar novamente
              </button>
              <button type="button" onClick={() => window.location.reload()} style={{ ...buttonStyle, background: '#27272a', color: '#fff' }}>
                Recarregar sistema
              </button>
              <button type="button" onClick={() => window.history.back()} style={{ ...buttonStyle, background: '#e4e4e7', color: '#18181b' }}>
                Voltar
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
