'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import {
  isRecoverableBundleError,
  observeBrowserException
} from '@/lib/client/browserErrorObservability';

type AutocarErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AutocarError({ error, reset }: AutocarErrorProps) {
  const [reportId, setReportId] = useState('gerando...');
  const [recovering, setRecovering] = useState(() => isRecoverableBundleError(error));

  useEffect(() => {
    let active = true;
    void observeBrowserException(error, 'autocar-boundary').then((result) => {
      if (!active) return;
      setReportId(result.reportId);
      setRecovering(result.recoveryScheduled);
    });
    return () => { active = false; };
  }, [error]);

  return (
    <main className="premium-page">
      <div className="premium-canvas grid min-h-[65vh] place-items-center p-4 md:p-7">
        <section className="premium-card w-full max-w-xl p-6 md:p-8" role="alert" aria-live="assertive">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <AlertTriangle size={24} />
          </div>
          <p className="premium-eyebrow mt-5">I.A AUTOCAR</p>
          <h1 className="mt-2 text-2xl font-black text-zinc-950 md:text-3xl">Esta área encontrou um erro</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            {recovering
              ? 'Uma falha de bundle foi reconhecida. O sistema fará somente uma tentativa automática de recuperação.'
              : 'O restante do portal continua isolado. A ocorrência foi registrada sem dados pessoais.'}
          </p>
          <p className="mt-4 text-xs font-bold text-zinc-400">Código do relatório: {reportId}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-700">
              <RefreshCw size={16} /> Tentar novamente
            </button>
            <button type="button" onClick={() => window.history.back()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-black text-zinc-700 hover:bg-zinc-50">
              <ArrowLeft size={16} /> Voltar
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
