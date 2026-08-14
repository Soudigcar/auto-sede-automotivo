'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { usePathname } from 'next/navigation';

function isStorePipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

function openManualLeadForm() {
  const directTrigger = document.querySelector<HTMLButtonElement>('.pipeline-stock-add-button');
  if (directTrigger) {
    directTrigger.click();
    return;
  }

  const fallback = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
    return String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase().includes('adicionar lead');
  });
  fallback?.click();
}

export function StorePipelineNewLeadButton() {
  const pathname = usePathname() || '';
  const active = isStorePipeline(pathname);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || typeof document === 'undefined') {
      setHost(null);
      return;
    }

    let animationFrame = 0;

    const attach = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const actions = document.querySelector<HTMLElement>('.aura-top-actions');
        if (!actions) return;

        let target = actions.querySelector<HTMLElement>('[data-pipeline-new-lead-host]');
        if (!target) {
          target = document.createElement('span');
          target.dataset.pipelineNewLeadHost = 'true';
          target.className = 'pipeline-new-lead-host';

          const auraProfile = actions.querySelector<HTMLElement>('.aura-profile');
          if (auraProfile) actions.insertBefore(target, auraProfile);
          else actions.appendChild(target);
        }

        setHost((current) => current === target ? current : target);
      });
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', attach);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', attach);
      window.cancelAnimationFrame(animationFrame);
      document.querySelector('[data-pipeline-new-lead-host]')?.remove();
      setHost(null);
    };
  }, [active]);

  if (!active || !host) return null;

  return createPortal(
    <>
      <style>{styles}</style>
      <button
        type="button"
        className="pipeline-new-lead-trigger"
        onClick={openManualLeadForm}
        aria-label="Adicionar novo lead"
        title="Adicionar novo lead"
      >
        <Plus size={17} />
        <span>Novo Lead</span>
      </button>
    </>,
    host
  );
}

const styles = `
  .pipeline-new-lead-host {
    display: flex;
    align-items: center;
  }

  .pipeline-new-lead-trigger {
    display: inline-flex;
    min-width: 118px;
    height: 42px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid #ef2d34;
    border-radius: 13px;
    background: #ef2d34;
    padding: 0 14px;
    color: #fff;
    font-size: 11px;
    font-weight: 950;
    box-shadow: 0 12px 28px rgba(239,45,52,.25);
    transition: background .18s ease, transform .18s ease, box-shadow .18s ease;
    white-space: nowrap;
  }

  .pipeline-new-lead-trigger:hover {
    background: #d9232a;
    transform: translateY(-1px);
    box-shadow: 0 14px 30px rgba(239,45,52,.32);
  }

  .pipeline-new-lead-trigger:focus-visible {
    outline: 3px solid rgba(239,45,52,.3);
    outline-offset: 2px;
  }

  @media (max-width: 1180px) {
    .pipeline-new-lead-trigger {
      min-width: 42px;
      width: 42px;
      padding: 0;
    }

    .pipeline-new-lead-trigger span {
      display: none;
    }
  }
`;
