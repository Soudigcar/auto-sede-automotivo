'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const PIPELINE_PATH = /^\/loja\/[^/]+\/pipeline\/?$/;

function applyOfficialV2Visual() {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-pipeline-card-v2="true"]'));
  if (!cards.length) return;

  document.body.dataset.pipelineV2VisualGuard = 'true';

  const pageMain = Array.from(document.querySelectorAll<HTMLElement>('main')).find((item) =>
    item.querySelector('h1')?.textContent?.includes('Pipeline da Loja')
  );
  const nativeHero = pageMain
    ? Array.from(pageMain.querySelectorAll<HTMLElement>('header')).find((item) => item.querySelector('h1')?.textContent?.includes('Pipeline da Loja'))
    : null;
  if (nativeHero) nativeHero.dataset.pipelineOfficialHiddenHero = 'true';

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
      frame = window.requestAnimationFrame(applyOfficialV2Visual);
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
      document.querySelectorAll<HTMLElement>('[data-pipeline-official-hidden-hero]').forEach((element) => {
        delete element.dataset.pipelineOfficialHiddenHero;
      });
    };
  }, [active, pathname]);

  if (!active) return null;

  return (
    <style jsx global>{`
      body[data-pipeline-v2-visual-guard='true'] [data-pipeline-official-hidden-hero='true'] {
        display: none !important;
      }

      body[data-pipeline-v2-visual-guard='true'] [data-pipeline-card-v2='true'] {
        padding: 6px !important;
      }
    `}</style>
  );
}
