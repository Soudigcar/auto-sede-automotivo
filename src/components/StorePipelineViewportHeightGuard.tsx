'use client';

import { usePathname } from 'next/navigation';

const PIPELINE_PATH = /^\/loja\/[^/]+\/pipeline\/?$/;

export function StorePipelineViewportHeightGuard() {
  const pathname = usePathname() || '';

  if (!PIPELINE_PATH.test(pathname)) return null;

  return (
    <style jsx global>{`
      @media (min-width: 1024px) {
        html:has(body.pipeline-aura-active) {
          height: 100%;
          overflow: hidden !important;
        }

        body.pipeline-aura-active {
          height: 100dvh !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }

        body.pipeline-aura-active main.pipeline-aura-page {
          height: 100dvh !important;
          min-height: 0 !important;
          overflow: hidden !important;
          padding-bottom: 0 !important;
        }

        body.pipeline-aura-active main.pipeline-aura-page > section.pipeline-aura-portal-shell {
          height: 100dvh !important;
          min-height: 0 !important;
          align-items: stretch !important;
          overflow: hidden !important;
        }

        body.pipeline-aura-active .pipeline-aura-portal-canvas.pipeline-aura-canvas {
          height: 100dvh !important;
          min-height: 0 !important;
          overflow-x: clip !important;
          overflow-y: auto !important;
          overscroll-behavior-y: contain;
          scrollbar-gutter: stable;
        }

        body.pipeline-aura-active .store-pipeline-page {
          min-height: 0 !important;
          padding-bottom: 0 !important;
        }
      }
    `}</style>
  );
}
