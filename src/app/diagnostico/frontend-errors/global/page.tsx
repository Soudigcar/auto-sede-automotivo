import { assertPreviewErrorDiagnostics } from '@/lib/server/previewErrorDiagnostics';

export default function GlobalErrorDiagnosticPage() {
  assertPreviewErrorDiagnostics();
  return <p>Preparando falha sintética global...</p>;
}
