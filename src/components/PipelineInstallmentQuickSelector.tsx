'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const installmentOptions = [
  { value: '12', label: '12x' },
  { value: '24', label: '24x' },
  { value: '36', label: '36x' },
  { value: '48', label: '48x' },
  { value: '60', label: '60x' },
  { value: 'custom', label: 'Outra' }
];

const calculationTimers = new WeakMap<HTMLElement, number>();

function normalized(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function findCommercialScope(element: Element | null) {
  let current = element?.closest<HTMLElement>('section, form, div') || null;

  while (current && current !== document.body) {
    const text = normalized(current.textContent);
    if (text.includes('dados comerciais da venda') || text.includes('confirmar venda')) return current;
    current = current.parentElement;
  }

  return null;
}

function scheduleCalculation(scope: HTMLElement | null) {
  if (!scope) return;

  const previous = calculationTimers.get(scope);
  if (previous) window.clearTimeout(previous);

  const timer = window.setTimeout(() => {
    const button = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(
      (item) => normalized(item.textContent) === 'calcular valores'
    );
    button?.click();
    calculationTimers.delete(scope);
  }, 280);

  calculationTimers.set(scope, timer);
}

function enhanceInstallmentSelect(select: HTMLSelectElement) {
  if (select.dataset.installmentQuickEnhanced === 'true') return;

  const label = select.closest<HTMLLabelElement>('label');
  if (!label || !normalized(label.textContent).startsWith('quantidade de parcelas')) return;

  select.dataset.installmentQuickEnhanced = 'true';
  select.classList.add('installment-native-select');

  const buttonGrid = document.createElement('div');
  buttonGrid.dataset.installmentQuickButtons = 'true';
  buttonGrid.setAttribute('role', 'group');
  buttonGrid.setAttribute('aria-label', 'Quantidade de parcelas');

  const syncButtons = () => {
    Array.from(buttonGrid.querySelectorAll<HTMLButtonElement>('button')).forEach((button) => {
      const selected = select.value === button.dataset.value;
      button.dataset.active = selected ? 'true' : 'false';
      button.setAttribute('aria-pressed', String(selected));
    });
  };

  installmentOptions.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.value = option.value;
    button.textContent = option.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      setNativeSelectValue(select, option.value);
      syncButtons();
      scheduleCalculation(findCommercialScope(label));
    });
    buttonGrid.appendChild(button);
  });

  select.insertAdjacentElement('afterend', buttonGrid);
  select.addEventListener('change', () => {
    syncButtons();
    scheduleCalculation(findCommercialScope(label));
  });
  syncButtons();
}

export function PipelineInstallmentQuickSelector() {
  const pathname = usePathname() || '';
  const active = /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);

  useEffect(() => {
    if (!active) return;

    function enhanceAll() {
      Array.from(document.querySelectorAll<HTMLSelectElement>('label select')).forEach(enhanceInstallmentSelect);
    }

    function handleFieldChange(event: Event) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;

      const labelText = normalized(target.closest('label')?.textContent);
      const relevant = [
        'valor da venda',
        'valor da entrada',
        'numero personalizado',
        'quantidade de parcelas'
      ].some((name) => labelText.startsWith(name));

      if (relevant) scheduleCalculation(findCommercialScope(target));
    }

    function handleCommercialClick(event: MouseEvent) {
      const button = event.target instanceof HTMLElement
        ? event.target.closest<HTMLButtonElement>('button')
        : null;
      if (!button) return;

      const scope = findCommercialScope(button);
      if (!scope) return;

      const text = normalized(button.textContent);
      if (text === 'sim' || text === 'nao') scheduleCalculation(scope);
    }

    const observer = new MutationObserver(enhanceAll);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('input', handleFieldChange, true);
    document.addEventListener('change', handleFieldChange, true);
    document.addEventListener('click', handleCommercialClick, true);
    enhanceAll();

    return () => {
      observer.disconnect();
      document.removeEventListener('input', handleFieldChange, true);
      document.removeEventListener('change', handleFieldChange, true);
      document.removeEventListener('click', handleCommercialClick, true);
    };
  }, [active]);

  if (!active) return null;

  return (
    <style jsx global>{`
      .installment-native-select {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      [data-installment-quick-buttons='true'] {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 8px;
      }

      [data-installment-quick-buttons='true'] button {
        min-height: 44px;
        border: 1px solid #cbd5e1;
        border-radius: 14px;
        background: #ffffff;
        color: #475569;
        font-size: 13px;
        font-weight: 900;
        transition: border-color 160ms ease, background 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
      }

      [data-installment-quick-buttons='true'] button:hover {
        border-color: #3b82f6;
        color: #1d4ed8;
        transform: translateY(-1px);
      }

      [data-installment-quick-buttons='true'] button[data-active='true'] {
        border-color: #2563eb;
        background: #eff6ff;
        color: #1d4ed8;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.16);
      }

      @media (min-width: 640px) {
        [data-installment-quick-buttons='true'] {
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }
      }
    `}</style>
  );
}
