'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const saleStages = new Set([
  'Novo Lead Recebido',
  'Em Atendimento',
  'Agendado',
  'Cancelou Agendamento',
  'Não Compareceu',
  'Compareceu'
]);

function isPipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

function normalized(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
}

function cardStage(card: HTMLElement) {
  const column = card.closest<HTMLElement>('.min-h-\\[520px\\]');
  const heading = column?.querySelector('h2');
  return String(heading?.textContent || '').trim();
}

function openExistingSaleFlow() {
  const legacy = document.createElement('div');
  legacy.className = 'fixed inset-0 z-50';
  legacy.setAttribute('data-sale-action-bridge-modal', 'true');
  legacy.style.display = 'none';

  const title = document.createElement('h2');
  title.textContent = 'Confirmar venda';
  legacy.appendChild(title);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Voltar';
  close.addEventListener('click', () => legacy.remove(), { once: true });
  legacy.appendChild(close);

  document.body.appendChild(legacy);
}

export function StorePipelineSaleActionBridge() {
  const pathname = usePathname() || '';
  const active = isPipeline(pathname);

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    let frame = 0;

    const normalizeCards = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        document.querySelectorAll<HTMLButtonElement>('[data-pipeline-sale-action-bridge]').forEach((button) => {
          const card = button.closest<HTMLElement>('[data-lead-id]');
          if (!card || !saleStages.has(cardStage(card))) button.remove();
        });

        document.querySelectorAll<HTMLElement>('[data-lead-id]').forEach((card) => {
          const stage = cardStage(card);
          if (!saleStages.has(stage)) return;

          const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('button'));
          const existingSale = buttons.some((button) => normalized(button.textContent) === 'venda');
          if (existingSale || card.querySelector('[data-pipeline-sale-action-bridge]')) return;

          const actionButtons = buttons.filter((button) => {
            const label = normalized(button.textContent);
            return ['editar', 'tarefa', 'transferir', 'whatsapp', 'atender', 'perda', 'agendar', 'reagendar', 'chegou', 'cancelou', 'faltou'].includes(label);
          });
          const host = actionButtons[0]?.parentElement;
          if (!host) return;

          host.classList.add('pipeline-card-actions-uniform');

          const saleButton = document.createElement('button');
          saleButton.type = 'button';
          saleButton.dataset.pipelineSaleActionBridge = 'true';
          saleButton.className = 'pipeline-card-action-uniform inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-600 bg-emerald-600 px-2.5 py-1.5 text-[10px] font-black uppercase text-white';
          saleButton.textContent = 'Venda';
          saleButton.setAttribute('aria-label', 'Confirmar venda');
          saleButton.setAttribute('title', 'Confirmar venda');
          saleButton.addEventListener('click', () => {
            window.setTimeout(openExistingSaleFlow, 0);
          });
          host.appendChild(saleButton);
        });
      });
    };

    normalizeCards();
    window.addEventListener('pipeline-dom-sync', normalizeCards);

    return () => {
      window.removeEventListener('pipeline-dom-sync', normalizeCards);
      window.cancelAnimationFrame(frame);
      document.querySelectorAll('[data-pipeline-sale-action-bridge]').forEach((button) => button.remove());
      document.querySelectorAll('[data-sale-action-bridge-modal]').forEach((modal) => modal.remove());
    };
  }, [active]);

  return null;
}
