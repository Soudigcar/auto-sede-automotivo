'use client';

import { useEffect } from 'react';

function normalized(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
}

function findEditorModal() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div.fixed.inset-0.z-50'));
  return candidates.find((candidate) =>
    normalized(candidate.querySelector('h2')?.textContent).includes('adicionar, alterar ou excluir informações do lead')
  ) || null;
}

function clearWrongStickyStyles(buttonGroup: HTMLElement) {
  buttonGroup.style.position = '';
  buttonGroup.style.bottom = '';
  buttonGroup.style.zIndex = '';
  buttonGroup.style.background = '';
  buttonGroup.style.paddingTop = '';
  buttonGroup.style.paddingBottom = '';
  buttonGroup.style.borderTop = '';
}

function applyCompactLayout(modal: HTMLElement) {
  const panel = modal.firstElementChild as HTMLElement | null;
  if (!panel) return;

  panel.dataset.compactLeadEditorPanel = 'true';
  panel.style.maxWidth = '980px';
  panel.style.padding = '18px';
  panel.style.borderRadius = '24px';
  panel.style.maxHeight = '94dvh';

  const headingRow = panel.firstElementChild as HTMLElement | null;
  if (headingRow) {
    headingRow.style.marginBottom = '14px';
    const heading = headingRow.querySelector<HTMLElement>('h2');
    if (heading) {
      heading.style.fontSize = 'clamp(1.35rem, 2vw, 1.75rem)';
      heading.style.lineHeight = '1.15';
    }
  }

  const editorContent = panel.querySelector<HTMLElement>('.lead-editor-dark-fields');
  if (editorContent) {
    editorContent.dataset.compactLeadEditorContent = 'true';
    editorContent.style.gap = '16px';

    const hero = Array.from(editorContent.children).find((child) => {
      const element = child as HTMLElement;
      return normalized(element.querySelector('p')?.textContent) === 'detalhes do lead';
    }) as HTMLElement | undefined;

    if (hero) {
      hero.dataset.compactLeadHero = 'true';
      hero.style.padding = '16px';
      hero.style.borderRadius = '22px';
    }
  }

  Array.from(modal.querySelectorAll<HTMLTextAreaElement>('textarea')).forEach((textarea) => {
    const label = normalized(textarea.closest('label')?.textContent);
    if (label.startsWith('observação do lead') || label.startsWith('observação do agendamento')) {
      textarea.style.minHeight = '78px';
    }
  });

  const notesHost = modal.querySelector<HTMLElement>('[data-pipeline-notes-history="true"]');
  const customSaveHost = modal.querySelector<HTMLElement>('[data-pipeline-custom-save="true"]');

  if (notesHost && customSaveHost) {
    const buttonGroup = customSaveHost.parentElement as HTMLElement | null;
    const actionRow = buttonGroup?.parentElement as HTMLElement | null;
    const contentParent = actionRow?.parentElement as HTMLElement | null;

    if (buttonGroup && actionRow && contentParent) {
      if (notesHost.parentElement === actionRow) contentParent.insertBefore(notesHost, actionRow);

      clearWrongStickyStyles(buttonGroup);
      buttonGroup.dataset.compactLeadButtonGroup = 'true';
      actionRow.dataset.compactLeadFooter = 'true';
      actionRow.style.position = 'sticky';
      actionRow.style.bottom = '0';
      actionRow.style.zIndex = '20';
      actionRow.style.background = 'rgba(255,255,255,0.97)';
      actionRow.style.paddingTop = '12px';
      actionRow.style.paddingBottom = 'max(10px, env(safe-area-inset-bottom))';
      actionRow.style.borderTop = '1px solid #e5e7eb';
      actionRow.style.marginTop = '0';

      const deleteButton = Array.from(actionRow.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
        normalized(button.textContent).includes('excluir lead')
      );
      if (deleteButton) {
        deleteButton.style.minHeight = '46px';
        deleteButton.style.padding = '10px 16px';
        deleteButton.style.borderRadius = '14px';
      }

      const cancelButton = Array.from(actionRow.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
        normalized(button.textContent) === 'cancelar'
      );
      if (cancelButton) {
        cancelButton.style.minHeight = '46px';
        cancelButton.style.padding = '10px 16px';
        cancelButton.style.borderRadius = '14px';
      }
    }
  }
}

export function PipelineLeadEditorCompactLayout() {
  useEffect(() => {
    function detect() {
      const modal = findEditorModal();
      if (modal) applyCompactLayout(modal);
    }

    const observer = new MutationObserver(detect);
    observer.observe(document.body, { childList: true, subtree: true });
    detect();

    return () => observer.disconnect();
  }, []);

  return <style>{compactStyles}</style>;
}

const compactStyles = `
  [data-compact-lead-editor-panel="true"] {
    scrollbar-gutter: stable;
  }

  [data-compact-lead-editor-content="true"] > * {
    min-width: 0;
  }

  [data-compact-lead-hero="true"] h3 {
    font-size: clamp(1.65rem, 3vw, 2.2rem) !important;
    line-height: 1.05 !important;
  }

  [data-compact-lead-hero="true"] .mt-5 {
    margin-top: 0.9rem !important;
  }

  [data-pipeline-lead-responsibility-compact="true"] + div {
    min-width: 0 !important;
  }

  [data-pipeline-notes-history="true"] {
    width: 100% !important;
    min-width: 0 !important;
  }

  [data-pipeline-notes-history="true"] > section {
    margin-top: 0 !important;
    border-radius: 18px !important;
    padding: 16px !important;
    box-shadow: none !important;
  }

  [data-pipeline-notes-history="true"] > section > div:first-child {
    align-items: center !important;
  }

  [data-pipeline-notes-history="true"] > section > div:first-child > div:first-child {
    width: 36px !important;
    height: 36px !important;
    border-radius: 11px !important;
  }

  [data-pipeline-notes-history="true"] h3 {
    font-size: 1rem !important;
    line-height: 1.2 !important;
  }

  [data-pipeline-notes-history="true"] label {
    margin-top: 12px !important;
  }

  [data-pipeline-notes-history="true"] textarea {
    min-height: 74px !important;
    border-radius: 14px !important;
    padding: 11px 13px !important;
  }

  [data-pipeline-notes-history="true"] section > div.mt-4.grid {
    max-height: 270px !important;
    overflow-y: auto !important;
    padding-right: 4px !important;
    gap: 8px !important;
  }

  [data-pipeline-notes-history="true"] article {
    border-radius: 14px !important;
    padding: 12px !important;
  }

  [data-pipeline-notes-history="true"] article p.mt-3 {
    margin-top: 8px !important;
    line-height: 1.5 !important;
  }

  [data-compact-lead-footer="true"] {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
  }

  [data-compact-lead-button-group="true"] {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 10px !important;
  }

  [data-pipeline-custom-save="true"] {
    flex: 0 0 auto !important;
    min-width: 190px !important;
  }

  [data-pipeline-custom-save="true"] > div {
    min-width: 190px !important;
  }

  [data-pipeline-custom-save="true"] button {
    min-height: 46px !important;
    border-radius: 14px !important;
    padding: 10px 18px !important;
  }

  @media (max-width: 767px) {
    [data-compact-lead-editor-panel="true"] {
      padding: 13px !important;
      border-radius: 20px !important;
    }

    [data-compact-lead-hero="true"] {
      padding: 13px !important;
      border-radius: 18px !important;
    }

    [data-compact-lead-footer="true"] {
      align-items: stretch !important;
      flex-direction: column-reverse !important;
    }

    [data-compact-lead-button-group="true"] {
      width: 100% !important;
      flex-wrap: wrap !important;
    }

    [data-pipeline-custom-save="true"],
    [data-pipeline-custom-save="true"] > div {
      width: 100% !important;
      min-width: 100% !important;
    }

    [data-pipeline-notes-history="true"] section > div.mt-4.grid {
      max-height: 230px !important;
    }
  }
`;
