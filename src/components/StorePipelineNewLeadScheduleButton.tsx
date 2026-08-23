'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

function isPipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

function isPipelineCardV2(card: HTMLElement) {
  return card.dataset.pipelineCardV2 === 'true';
}

function isNewLeadCard(card: HTMLElement) {
  const column = card.closest<HTMLElement>('.min-h-\\[520px\\]');
  if (!column) return false;
  if (column.dataset.pipelineStage) return column.dataset.pipelineStage === 'new_lead';
  const heading = column.querySelector('h2');
  return String(heading?.textContent || '').trim() === 'Novo Lead Recebido';
}

export function StorePipelineNewLeadScheduleButton() {
  const pathname = usePathname() || '';
  const active = isPipeline(pathname);

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    let frame = 0;

    const normalize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        document.querySelectorAll<HTMLButtonElement>('[data-new-lead-schedule-button]').forEach((button) => {
          const card = button.closest<HTMLElement>('[data-lead-id]');
          if (!card || isPipelineCardV2(card) || !isNewLeadCard(card)) button.remove();
        });

        document.querySelectorAll<HTMLElement>('[data-lead-id]').forEach((card) => {
          if (isPipelineCardV2(card)) return;
          if (!isNewLeadCard(card)) return;
          if (card.querySelector('[data-new-lead-schedule-button]')) return;

          const actionButtons = Array.from(card.querySelectorAll<HTMLButtonElement>('button')).filter((button) => {
            const text = String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            return ['editar', 'tarefa', 'transferir', 'whatsapp', 'atender', 'perda'].includes(text);
          });
          const host = actionButtons[0]?.parentElement;
          if (!host) return;

          host.classList.add('pipeline-card-actions-uniform');

          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.newLeadScheduleButton = 'true';
          button.className = 'pipeline-card-action-uniform inline-flex items-center justify-center gap-1 rounded-xl border border-red-600 bg-red-600 px-2.5 py-1.5 text-[10px] font-black uppercase text-white';
          button.textContent = 'Agendar';
          button.setAttribute('aria-label', 'Agendar lead');
          button.setAttribute('title', 'Agendar lead');
          host.appendChild(button);
        });
      });
    };

    normalize();
    window.addEventListener('pipeline-dom-sync', normalize);
    window.addEventListener('resize', normalize);

    return () => {
      window.removeEventListener('pipeline-dom-sync', normalize);
      window.removeEventListener('resize', normalize);
      window.cancelAnimationFrame(frame);
      document.querySelectorAll('[data-new-lead-schedule-button]').forEach((button) => button.remove());
    };
  }, [active]);

  return null;
}
