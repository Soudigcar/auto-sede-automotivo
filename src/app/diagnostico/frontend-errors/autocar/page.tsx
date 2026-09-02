import { PreviewRenderErrorDiagnostic } from '@/components/PreviewErrorDiagnostics';
import { assertPreviewErrorDiagnostics } from '@/lib/server/previewErrorDiagnostics';

export default function AutocarErrorDiagnosticPage() {
  assertPreviewErrorDiagnostics();
  return <PreviewRenderErrorDiagnostic />;
}
