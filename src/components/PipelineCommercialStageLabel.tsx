'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

function normalized(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function findEditorModal() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div.fixed.inset-0.z-50'));
  return candidates.find((candidate) =>
    normalized(candidate.querySelector('h2')?.textContent).includes('adicionar, alterar ou excluir informacoes do lead')
  ) || null;
}

function findStatus(modal: HTMLElement) {
  const label = Array.from(modal.querySelectorAll<HTMLLabelElement>('label')).find((item) =>
    normalized(item.textContent).startsWith('status do lead')
  );
  const select = label?.querySelector<HTMLSelectElement>('select');
  const selectedText = select?.selectedOptions?.[0]?.textContent || '';
  return {
    value: normalized(select?.value),
    text: normalized(selectedText)
  };
}

function replaceLeadingText(label: HTMLLabelElement, nextText: string) {
  const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    if (String(textNode.textContent || '').trim() !== nextText) textNode.textContent = `${nextText} `;
    return;
  }
  label.insertBefore(document.createTextNode(`${nextText} `), label.firstChild);
}

function applyCommercialStage() {
  const modal = findEditorModal();
  if (!modal) return;

  const host = modal.querySelector<HTMLElement>('[data-pipeline-sale-commercial="true"]');
  const section = host?.querySelector<HTMLElement>('section');
  if (!host || !section) return;

  const status = findStatus(modal);
  const confirmed = status.value === 'sale_confirmed' || status.text.includes('venda confirmada');
  const stage = confirmed ? 'confirmed' : 'negotiation';
  if (host.dataset.commercialStage !== stage) host.dataset.commercialStage = stage;

  const paragraphs = Array.from(section.querySelectorAll<HTMLParagraphElement>('p'));
  const eyebrow = paragraphs.find((item) => {
    const text = normalized(item.textContent);
    return text === 'venda confirmada' || text === 'negociacao em andamento';
  });
  const heading = section.querySelector<HTMLHeadingElement>('h3');
  const description = heading?.parentElement?.querySelectorAll<HTMLParagraphElement>('p')?.[1] || null;

  const eyebrowText = confirmed ? 'Venda confirmada' : 'Negociação em andamento';
  const headingText = confirmed ? 'Dados comerciais da venda' : 'Condições da negociação';
  const descriptionText = confirmed
    ? 'Pagamento, entrada, parcelas e troca registrados na venda e nos relatórios.'
    : 'Registre a proposta de pagamento, entrada, parcelas e troca antes do fechamento.';

  if (eyebrow && eyebrow.textContent !== eyebrowText) eyebrow.textContent = eyebrowText;
  if (heading && heading.textContent !== headingText) heading.textContent = headingText;
  if (description && description.textContent !== descriptionText) description.textContent = descriptionText;

  const valueLabel = Array.from(section.querySelectorAll<HTMLLabelElement>('label')).find((item) => {
    const text = normalized(item.textContent);
    return text.startsWith('valor da venda') || text.startsWith('valor negociado');
  });
  if (valueLabel) replaceLeadingText(valueLabel, confirmed ? 'Valor da venda' : 'Valor negociado');
}

export function PipelineCommercialStageLabel() {
  const pathname = usePathname() || '';
  const active = /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);

  useEffect(() => {
    if (!active) return;

    const observer = new MutationObserver(applyCommercialStage);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', applyCommercialStage, true);
    applyCommercialStage();

    return () => {
      observer.disconnect();
      document.removeEventListener('change', applyCommercialStage, true);
    };
  }, [active]);

  if (!active) return null;

  return (
    <style jsx global>{`
      [data-pipeline-sale-commercial='true'][data-commercial-stage='negotiation'] > section {
        border-color: #bfdbfe !important;
        background: rgba(239, 246, 255, 0.72) !important;
      }

      [data-pipeline-sale-commercial='true'][data-commercial-stage='negotiation'] > section > div:first-child > div:first-child > div:first-child {
        background: #2563eb !important;
      }

      [data-pipeline-sale-commercial='true'][data-commercial-stage='negotiation'] > section > div:first-child p:first-of-type,
      [data-pipeline-sale-commercial='true'][data-commercial-stage='negotiation'] > section > div:first-child > span {
        color: #1d4ed8 !important;
      }
    `}</style>
  );
}
