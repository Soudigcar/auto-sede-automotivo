import { PreviewChunkErrorDiagnostic } from '@/components/PreviewErrorDiagnostics';
import { assertPreviewErrorDiagnostics } from '@/lib/server/previewErrorDiagnostics';

export default function ChunkErrorDiagnosticPage() {
  assertPreviewErrorDiagnostics();
  return <PreviewChunkErrorDiagnostic />;
}
