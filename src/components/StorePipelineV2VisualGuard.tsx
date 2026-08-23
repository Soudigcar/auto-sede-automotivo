'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const PIPELINE_PATH = /^\/loja\/[^/]+\/pipeline\/?$/;

function restoreOfficialV2Visual() {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-pipeline-card-v2="true"]'));

  if (!cards.length) {
    delete document.body.dataset.pipelineV2VisualGuard;
    return;
  }

  document.body.dataset.pipelineV2VisualGuard = 'true';

  document.querySelectorAll<HTMLElement>('.pipeline-cockpit-host').forEach((element) => {
    element.classList.remove('pipeline-cockpit-host');
  });

  document.querySelectorAll<HTMLElement>('.pipeline-aura-kpis').forEach((element) => {
    element.classList.remove('pipeline-aura-kpis');
  });

  document.querySelectorAll<HTMLElement>('.pipeline-aura-board').forEach((element) => {
    element.classList.remove('pipeline-aura-board');
  });

  document.querySelectorAll<HTMLElement>('.pipeline-aura-board-scroll').forEach((element) => {
    element.classList.remove('pipeline-aura-board-scroll');
  });

  cards.forEach((card) => {
    card.classList.remove('pipeline-aura-lead-card', 'pipeline-card-actions-uniform');
    card.querySelectorAll<HTMLElement>('.pipeline-card-action-uniform').forEach((button) => {
      button.classList.remove('pipeline-card-action-uniform');
    });
  });
}

export function StorePipelineV2VisualGuard() {
  const pathname = usePathname() || '';
  const active = PIPELINE_PATH.test(pathname);

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(restoreOfficialV2Visual);
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    sync();
    window.addEventListener('pipeline-dom-sync', sync);

    return () => {
      observer.disconnect();
      window.removeEventListener('pipeline-dom-sync', sync);
      window.cancelAnimationFrame(frame);
      delete document.body.dataset.pipelineV2VisualGuard;
    };
  }, [active, pathname]);

  if (!active) return null;

  return (
    <style jsx global>{`
      body[data-pipeline-v2-visual-guard='true'] .pipeline-kpi-strip-shell {
        display: none !important;
      }

      body[data-pipeline-v2-visual-guard='true'] [data-pipeline-card-v2='true'] {
        padding: 6px !important;
      }
    `}</style>
  );
}
