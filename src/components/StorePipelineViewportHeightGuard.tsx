'use client';

import { usePathname } from 'next/navigation';

const PIPELINE_PATH = /^\/loja\/[^/]+\/pipeline\/?$/;

export function StorePipelineViewportHeightGuard() {
  const pathname = usePathname() || '';

  if (!PIPELINE_PATH.test(pathname)) return null;

  return (
    <style jsx global>{`
      @media (min-width: 1024px) {
        body.pipeline-aura-active main.pipeline-aura-page {
          min-height: 0 !important;
          padding-bottom: 0 !important;
        }

        body.pipeline-aura-active main.pipeline-aura-page > section.pipeline-aura-portal-shell {
          min-height: 0 !important;
          align-items: flex-start !important;
        }

        body.pipeline-aura-active .pipeline-aura-portal-canvas,
        body.pipeline-aura-active .store-pipeline-page {
          min-height: 0 !important;
        }

        body.pipeline-aura-active .store-pipeline-page {
          padding-bottom: 0 !important;
        }
      }
    `}</style>
  );
}
