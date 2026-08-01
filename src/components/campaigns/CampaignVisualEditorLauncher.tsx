'use client';

import { useEffect, useRef } from 'react';
import { CampaignVisualEditorLauncher as NativeCampaignVisualEditorLauncher } from './CampaignVisualEditorNativeV6';
import {
  CAMPAIGN_VISUAL_EDITOR_OPEN_EVENT,
  CAMPAIGN_VISUAL_EDITOR_REFRESH_EVENT,
  type CampaignVisualEditorOpenDetail
} from './CampaignVisualEditorBridge';

function buttonByText(root: HTMLElement, text: string) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.toLowerCase().includes(text.toLowerCase())
  );
}

function selectCampaignWhenReady(root: HTMLElement, campaignId: string) {
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const select = Array.from(root.querySelectorAll<HTMLSelectElement>('select')).find((candidate) =>
      Array.from(candidate.options).some((option) => option.value === campaignId)
    );

    if (select) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, campaignId);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      window.clearInterval(timer);
      return;
    }

    if (attempts >= 50) window.clearInterval(timer);
  }, 100);
}

export function CampaignVisualEditorLauncher() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorWasOpenRef = useRef(false);
  const lastSuccessMessageRef = useRef('');

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const notifyRefresh = (campaignId?: string) => {
      window.dispatchEvent(new CustomEvent(CAMPAIGN_VISUAL_EDITOR_REFRESH_EVENT, {
        detail: { campaignId }
      }));
    };

    const inspectEditorState = () => {
      const text = root.textContent || '';
      const editorIsOpen = text.includes('Editor visual completo');
      const successMessage = text.includes('Rascunho salvo no servidor.')
        ? 'draft'
        : text.includes('Landing publicada com sucesso.')
          ? 'publish'
          : '';

      if (successMessage && successMessage !== lastSuccessMessageRef.current) {
        lastSuccessMessageRef.current = successMessage;
        notifyRefresh();
      }

      if (!successMessage) lastSuccessMessageRef.current = '';
      if (editorWasOpenRef.current && !editorIsOpen) notifyRefresh();
      editorWasOpenRef.current = editorIsOpen;
    };

    const observer = new MutationObserver(inspectEditorState);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    inspectEditorState();

    const openEditor = (event: Event) => {
      const campaignId = (event as CustomEvent<CampaignVisualEditorOpenDetail>).detail?.campaignId || '';
      buttonByText(root, 'Abrir editor')?.click();
      if (campaignId) selectCampaignWhenReady(root, campaignId);
    };

    window.addEventListener(CAMPAIGN_VISUAL_EDITOR_OPEN_EVENT, openEditor);
    return () => {
      observer.disconnect();
      window.removeEventListener(CAMPAIGN_VISUAL_EDITOR_OPEN_EVENT, openEditor);
    };
  }, []);

  return <div ref={rootRef} className="[&>section]:hidden"><NativeCampaignVisualEditorLauncher /></div>;
}
