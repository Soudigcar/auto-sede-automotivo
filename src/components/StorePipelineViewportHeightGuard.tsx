'use client';

import { usePathname } from 'next/navigation';

const PIPELINE_PATH = /^\/loja\/[^/]+\/pipeline\/?$/;

export function StorePipelineViewportHeightGuard() {
  const pathname = usePathname() || '';

  if (!PIPELINE_PATH.test(pathname)) return null;

  return (
    <style jsx global>{`
      @media (min-width: 1024px) {
        body.pipeline-aura-active .store-pipeline-page .pipeline-aura-page {
          min-height: 0 !important;
        }
      }
    `}</style>
  );
}
