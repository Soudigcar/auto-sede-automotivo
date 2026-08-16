'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const WHATSAPP_STORE_PATH = /^\/loja\/[^/]+\/whatsapp\/?$/;
const TRANSFER_PROXY_ATTR = 'data-whatsapp-transfer-header-proxy';
const HIDDEN_TRANSFER_ATTR = 'data-whatsapp-transfer-composer-hidden';
const HIDDEN_READ_ATTR = 'data-whatsapp-mark-read-hidden';
const HIDDEN_WINDOW_NOTICE_ATTR = 'data-whatsapp-window-notice-hidden';
const WINDOW_NOTICE_TEXT = 'janela de 24h: fora dela, a meta pode exigir template aprovado.';

const STAGE_TONES: Record<string, { background: string; border: string; color: string; ring: string }> = {
  new_lead: { background: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', ring: '#dbeafe' },
  in_service: { background: '#f5f3ff', border: '#ddd6fe', color: '#7c3aed', ring: '#ede9fe' },
  scheduled: { background: '#fffbeb', border: '#fde68a', color: '#b45309', ring: '#fef3c7' },
  appointment_cancelled: { background: '#fff7ed', border: '#fed7aa', color: '#c2410c', ring: '#ffedd5' },
  no_show: { background: '#f4f4f5', border: '#d4d4d8', color: '#52525b', ring: '#e4e4e7' },
  showed_up: { background: '#ecfdf5', border: '#a7f3d0', color: '#047857', ring: '#d1fae5' },
  sale_confirmed: { background: '#f0fdf4', border: '#bbf7d0', color: '#15803d', ring: '#dcfce7' },
  lost: { background: '#fef2f2', border: '#fecaca', color: '#b91c1c', ring: '#fee2e2' }
};

function normalizedText(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function findMarkReadButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
    const label = normalizedText(button.textContent);
    return label === 'marcar como lida' || normalizedText(button.title) === 'marcar como lida';
  }) || null;
}

function findComposerForm() {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Digite sua mensagem..."]');
  return textarea?.closest('form') || null;
}

function findComposerTransferButton() {
  const form = findComposerForm();
  if (!form) return null;

  return Array.from(form.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    normalizedText(button.textContent) === 'transferir lead'
  ) || null;
}

function hideWindowNotice() {
  const form = findComposerForm();
  if (!form) return;

  const notice = Array.from(form.querySelectorAll<HTMLElement>('p, span, small')).find((element) =>
    normalizedText(element.textContent) === WINDOW_NOTICE_TEXT
  );
  if (!notice) return;

  notice.setAttribute(HIDDEN_WINDOW_NOTICE_ATTR, 'true');
  notice.style.setProperty('display', 'none', 'important');
}

function transferIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>';
}

function ensureTransferProxy(markReadButton: HTMLButtonElement, transferButton: HTMLButtonElement) {
  const actionRow = markReadButton.parentElement;
  if (!actionRow) return;

  let proxy = actionRow.querySelector<HTMLButtonElement>(`[${TRANSFER_PROXY_ATTR}="true"]`);
  if (!proxy) {
    proxy = document.createElement('button');
    proxy.type = 'button';
    proxy.setAttribute(TRANSFER_PROXY_ATTR, 'true');
    proxy.setAttribute('aria-label', 'Transferir lead');
    proxy.setAttribute('title', 'Transferir lead');
    proxy.className = 'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-black uppercase text-emerald-700 transition hover:bg-emerald-100';
    proxy.innerHTML = `${transferIcon()}<span>Transferir lead</span>`;
    proxy.addEventListener('click', () => {
      const currentTransferButton = findComposerTransferButton();
      if (currentTransferButton && !currentTransferButton.disabled) currentTransferButton.click();
    });
    actionRow.insertBefore(proxy, markReadButton);
  }

  markReadButton.setAttribute(HIDDEN_READ_ATTR, 'true');
  markReadButton.style.setProperty('display', 'none', 'important');
  transferButton.setAttribute(HIDDEN_TRANSFER_ATTR, 'true');
  transferButton.style.setProperty('display', 'none', 'important');
}

function applyStageTone() {
  const select = document.querySelector<HTMLSelectElement>('select[aria-label="Alterar etapa da Pipeline"]');
  const label = select?.closest('label') as HTMLLabelElement | null;
  if (!select || !label) return;

  const tone = STAGE_TONES[select.value] || { background: '#ffffff', border: '#e4e4e7', color: '#3f3f46', ring: '#f4f4f5' };
  label.dataset.whatsappStageTone = select.value || 'none';
  label.style.setProperty('background-color', tone.background, 'important');
  label.style.setProperty('border-color', tone.border, 'important');
  label.style.setProperty('color', tone.color, 'important');
  label.style.setProperty('--whatsapp-stage-ring', tone.ring);

  const caption = label.querySelector<HTMLElement>('span');
  caption?.style.setProperty('color', tone.color, 'important');
  select.style.setProperty('color', tone.color, 'important');

  const icon = label.querySelector<SVGElement>('svg');
  icon?.style.setProperty('color', tone.color, 'important');
}

function applyWhatsappHeaderActions() {
  const markReadButton = findMarkReadButton();
  const transferButton = findComposerTransferButton();
  if (markReadButton && transferButton) ensureTransferProxy(markReadButton, transferButton);
  hideWindowNotice();
  applyStageTone();
}

function cleanupWhatsappHeaderActions() {
  document.querySelectorAll<HTMLElement>(`[${TRANSFER_PROXY_ATTR}="true"]`).forEach((element) => element.remove());
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_READ_ATTR}="true"]`).forEach((element) => {
    element.style.removeProperty('display');
    element.removeAttribute(HIDDEN_READ_ATTR);
  });
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_TRANSFER_ATTR}="true"]`).forEach((element) => {
    element.style.removeProperty('display');
    element.removeAttribute(HIDDEN_TRANSFER_ATTR);
  });
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_WINDOW_NOTICE_ATTR}="true"]`).forEach((element) => {
    element.style.removeProperty('display');
    element.removeAttribute(HIDDEN_WINDOW_NOTICE_ATTR);
  });
  document.querySelectorAll<HTMLLabelElement>('label[data-whatsapp-stage-tone]').forEach((label) => {
    label.style.removeProperty('background-color');
    label.style.removeProperty('border-color');
    label.style.removeProperty('color');
    label.style.removeProperty('--whatsapp-stage-ring');
    label.removeAttribute('data-whatsapp-stage-tone');
    label.querySelector<HTMLElement>('span')?.style.removeProperty('color');
    label.querySelector<HTMLSelectElement>('select')?.style.removeProperty('color');
    label.querySelector<SVGElement>('svg')?.style.removeProperty('color');
  });
}

export function StoreWhatsappHeaderActionsUx() {
  const pathname = usePathname() || '';

  useEffect(() => {
    if (!WHATSAPP_STORE_PATH.test(pathname)) return;

    let frame: number | null = null;
    const sync = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        applyWhatsappHeaderActions();
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'disabled'] });
    document.addEventListener('change', sync, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('change', sync, true);
      if (frame !== null) window.cancelAnimationFrame(frame);
      cleanupWhatsappHeaderActions();
    };
  }, [pathname]);

  return (
    <style jsx global>{`
      label[data-whatsapp-stage-tone] select:focus {
        box-shadow: 0 0 0 3px var(--whatsapp-stage-ring, #f4f4f5);
      }
      label[data-whatsapp-stage-tone] select option {
        background: #ffffff;
        color: #18181b;
      }
    `}</style>
  );
}
