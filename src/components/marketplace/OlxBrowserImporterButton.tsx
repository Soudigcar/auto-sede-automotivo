'use client';

import { ExternalLink } from 'lucide-react';
import { extractCanonicalOlxUrl } from '@/lib/olxSharedUrl';

const HANDOFF_KEY = 'autoControleOlxImportContext';

type Props = {
  storeId: string;
  submissionId?: string;
  sourceUrl: string;
  disabled?: boolean;
  onError?: (message: string) => void;
};

export function OlxBrowserImporterButton({ storeId, submissionId, sourceUrl, disabled, onError }: Props) {
  function openImporter() {
    const canonicalUrl = extractCanonicalOlxUrl(sourceUrl);
    if (!storeId) {
      onError?.('Selecione a loja proprietária antes de abrir o Importador OLX.');
      return;
    }
    if (!canonicalUrl) {
      onError?.('Informe um link válido da OLX antes de abrir o importador pelo navegador.');
      return;
    }

    const handoff = {
      storeId,
      submissionId: submissionId || '',
      sourceUrl: canonicalUrl,
      createdAt: new Date().toISOString()
    };
    window.localStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));

    const params = new URLSearchParams({ source: 'modal', url: canonicalUrl, store_id: storeId });
    if (submissionId) params.set('submission_id', submissionId);
    window.open(`/importar-olx?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      className="premium-button-secondary justify-center whitespace-nowrap"
      onClick={openImporter}
      disabled={disabled}
      title="Usar o Chrome para ler o anúncio e contornar o bloqueio 403 da OLX"
    >
      <ExternalLink size={17} /> Importador OLX
    </button>
  );
}
