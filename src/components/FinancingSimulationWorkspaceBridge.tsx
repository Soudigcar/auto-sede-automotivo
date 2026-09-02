'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, usePathname } from 'next/navigation';
import { FinancingSimulationPanel } from '@/components/FinancingSimulationPanel';

function financingHostFromOpenWorkspace() {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
  const workspace = dialogs.find((dialog) => dialog.textContent?.includes('Detalhes do lead')) || null;
  if (!workspace) return null;

  const existing = workspace.querySelector<HTMLElement>('[data-financing-simulation-host="true"]');
  if (existing) return existing;

  const qualificationHeading = Array.from(workspace.querySelectorAll<HTMLElement>('h3')).find(
    (heading) => heading.textContent?.trim() === 'Qualificação pessoal e comercial'
  );
  const qualificationSection = qualificationHeading?.closest<HTMLElement>('section');
  if (!qualificationSection?.parentElement) return null;

  const host = document.createElement('div');
  host.dataset.financingSimulationHost = 'true';
  qualificationSection.insertAdjacentElement('afterend', host);
  return host;
}

export function FinancingSimulationWorkspaceBridge() {
  const pathname = usePathname() || '';
  const params = useParams();
  const slug = String(params?.slug || '');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const active = /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);

  useEffect(() => {
    if (!active) {
      setLeadId(null);
      setHost(null);
      return;
    }

    function rememberLead(event: MouseEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const card = target?.closest<HTMLElement>('[data-lead-id]');
      if (!target || !card?.dataset.leadId) return;

      const button = target.closest<HTMLButtonElement>('button');
      const isEditButton = button?.textContent?.trim() === 'Editar';
      if (target.closest('a,input,textarea,select,label') || (button && !isEditButton)) return;
      setLeadId(card.dataset.leadId);
    }

    function synchronizeHost() {
      const nextHost = financingHostFromOpenWorkspace();
      setHost((current) => current === nextHost ? current : nextHost);
      if (!nextHost && !document.querySelector('[role="dialog"]')) setLeadId(null);
    }

    const observer = new MutationObserver(synchronizeHost);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', rememberLead, true);
    synchronizeHost();

    return () => {
      observer.disconnect();
      document.removeEventListener('click', rememberLead, true);
      const currentHost = document.querySelector<HTMLElement>('[data-financing-simulation-host="true"]');
      currentHost?.remove();
      setHost(null);
    };
  }, [active]);

  if (!active || !host || !leadId || !slug) return null;
  return createPortal(<FinancingSimulationPanel slug={slug} leadId={leadId} />, host);
}
