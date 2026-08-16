'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const PIPELINE_PATH = /^\/loja\/[^/]+\/pipeline\/?$/;

const ACTION_SYMBOLS: Record<string, string> = {
  editar: '✎',
  tarefa: '☷',
  transferir: '⇄',
  whatsapp: '◉',
  atender: '◉',
  perda: '×',
  agendar: '□',
  chegou: '✓',
  reagendar: '↻',
  cancelou: '×',
  faltou: '!',
  venda: '✓',
  'cancelar venda': '↻',
  reabrir: '↻'
};

function normalizedText(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function tagCard(card: HTMLElement) {
  card.dataset.pipelineCompactCard = 'true';

  const directChildren = Array.from(card.children) as HTMLElement[];
  const head = directChildren[0] || null;
  if (head) {
    head.dataset.pipelineCardHead = 'true';
    const statusBadge = Array.from(head.children).find((child) => child.tagName === 'SPAN') as HTMLElement | undefined;
    if (statusBadge) statusBadge.dataset.pipelineCardStatusBadge = 'true';
  }

  const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('button'));
  const actionButtons: HTMLButtonElement[] = [];

  for (const button of buttons) {
    const key = normalizedText(button.textContent);
    if (!(key in ACTION_SYMBOLS)) continue;

    actionButtons.push(button);
    button.dataset.pipelineCardAction = key.replace(/\s+/g, '-');
    button.dataset.pipelineActionHasIcon = button.querySelector('svg') ? 'true' : 'false';
    button.dataset.pipelineActionSymbol = ACTION_SYMBOLS[key];

    const label = String(button.textContent || '').replace(/\s+/g, ' ').trim();
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  const actionRow = actionButtons[0]?.parentElement as HTMLElement | null;
  if (actionRow) actionRow.dataset.pipelineCardActions = 'true';

  const phoneButton = buttons.find((button) => !button.dataset.pipelineCardAction);
  const metaRow = phoneButton?.parentElement as HTMLElement | null;
  if (metaRow && metaRow.parentElement === card) metaRow.dataset.pipelineCardMeta = 'true';

  for (const child of directChildren) {
    if (child === head || child === actionRow || child === metaRow) continue;
    child.dataset.pipelineCardDetail = 'true';
  }
}

function applyCompactCards() {
  document.querySelectorAll<HTMLElement>('[data-lead-id]').forEach(tagCard);
}

function cleanupCompactCards() {
  document.querySelectorAll<HTMLElement>('[data-pipeline-compact-card="true"]').forEach((card) => {
    card.removeAttribute('data-pipeline-compact-card');
    card.querySelectorAll<HTMLElement>('[data-pipeline-card-head]').forEach((element) => element.removeAttribute('data-pipeline-card-head'));
    card.querySelectorAll<HTMLElement>('[data-pipeline-card-status-badge]').forEach((element) => element.removeAttribute('data-pipeline-card-status-badge'));
    card.querySelectorAll<HTMLElement>('[data-pipeline-card-meta]').forEach((element) => element.removeAttribute('data-pipeline-card-meta'));
    card.querySelectorAll<HTMLElement>('[data-pipeline-card-detail]').forEach((element) => element.removeAttribute('data-pipeline-card-detail'));
    card.querySelectorAll<HTMLElement>('[data-pipeline-card-actions]').forEach((element) => element.removeAttribute('data-pipeline-card-actions'));
    card.querySelectorAll<HTMLButtonElement>('[data-pipeline-card-action]').forEach((button) => {
      button.removeAttribute('data-pipeline-card-action');
      button.removeAttribute('data-pipeline-action-has-icon');
      button.removeAttribute('data-pipeline-action-symbol');
      button.removeAttribute('title');
      button.removeAttribute('aria-label');
    });
  });
}

export function StorePipelineCompactCardsUx() {
  const pathname = usePathname() || '';

  useEffect(() => {
    if (!PIPELINE_PATH.test(pathname)) return;

    let frame: number | null = null;
    const sync = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        applyCompactCards();
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      cleanupCompactCards();
    };
  }, [pathname]);

  if (!PIPELINE_PATH.test(pathname)) return null;

  return (
    <style jsx global>{`
      [data-pipeline-compact-card='true'] {
        width: 100% !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        padding: 9px !important;
        border-radius: 14px !important;
      }

      [data-pipeline-card-head='true'] {
        align-items: flex-start !important;
        gap: 3px !important;
      }

      [data-pipeline-card-head='true'] h3 {
        font-size: 12px !important;
        line-height: 1.18 !important;
      }

      [data-pipeline-card-head='true'] p {
        margin-top: 2px !important;
        font-size: 9px !important;
        line-height: 1.2 !important;
      }

      [data-pipeline-card-status-badge='true'] {
        display: none !important;
      }

      [data-pipeline-card-meta='true'] {
        width: 100% !important;
        min-width: 0 !important;
        margin-top: 6px !important;
        display: flex !important;
        flex-flow: row nowrap !important;
        align-items: center !important;
        gap: 3px !important;
        overflow: hidden !important;
      }

      [data-pipeline-card-meta='true'] > * {
        min-width: 0 !important;
        box-sizing: border-box !important;
        padding: 3px 6px !important;
        border-radius: 9999px !important;
        font-size: 8px !important;
        line-height: 1 !important;
        white-space: nowrap !important;
      }

      [data-pipeline-card-meta='true'] > button {
        flex: 0 1 38% !important;
        max-width: 38% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      [data-pipeline-card-meta='true'] > span:nth-child(2) {
        flex: 1 1 auto !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      [data-pipeline-card-meta='true'] > span:last-child {
        flex: 0 0 auto !important;
      }

      [data-pipeline-card-detail='true'] {
        margin-top: 6px !important;
        padding: 6px 7px !important;
        border-radius: 9px !important;
        font-size: 9px !important;
        line-height: 1.3 !important;
      }

      [data-pipeline-card-detail='true'] p {
        margin-top: 2px !important;
      }

      [data-pipeline-card-detail='true'] p:not(:first-child) {
        display: -webkit-box !important;
        overflow: hidden !important;
        -webkit-box-orient: vertical !important;
        -webkit-line-clamp: 2 !important;
      }

      [data-pipeline-card-actions='true'] {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        margin-top: 8px !important;
        display: flex !important;
        flex-flow: row nowrap !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 3px !important;
        overflow: hidden !important;
      }

      button[data-pipeline-card-action] {
        flex: 0 0 23px !important;
        width: 23px !important;
        min-width: 23px !important;
        max-width: 23px !important;
        height: 23px !important;
        min-height: 23px !important;
        max-height: 23px !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
        border-radius: 6px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 0 !important;
        font-size: 0 !important;
        line-height: 1 !important;
      }

      button[data-pipeline-card-action] svg {
        flex: 0 0 auto !important;
        width: 11px !important;
        height: 11px !important;
        margin: 0 !important;
      }

      button[data-pipeline-card-action][data-pipeline-action-has-icon='false']::before {
        content: attr(data-pipeline-action-symbol);
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
      }

      button[data-pipeline-card-action]:hover {
        transform: translateY(-1px);
      }

      button[data-pipeline-card-action]:focus-visible {
        outline: 2px solid rgba(239, 68, 68, 0.45);
        outline-offset: 1px;
      }
    `}</style>
  );
}
