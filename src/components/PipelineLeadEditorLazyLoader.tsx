'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const LazyEditorEnhancer = dynamic(
  () => import('@/components/PipelineLeadEditorEnhancer').then((module) => module.PipelineLeadEditorEnhancer),
  { ssr: false }
);

const LazyLeadResponsibility = dynamic(
  () => import('@/components/PipelineLeadResponsibility').then((module) => module.PipelineLeadResponsibility),
  { ssr: false }
);

export function PipelineLeadEditorLazyLoader() {
  const pathname = usePathname();
  const active = /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname || '');
  const [enabled, setEnabled] = useState(false);
  const [leadId, setLeadId] = useState('');

  useEffect(() => {
    if (!active) {
      setEnabled(false);
      setLeadId('');
      return;
    }

    function enableOnLeadOpen(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-phone-reveal], [data-schedule-task]')) return;

      const card = target.closest<HTMLElement>('[data-pipeline-card="true"], [role="button"][draggable="true"]');
      if (!card) return;

      const button = target.closest('button');
      if (button) return;

      setLeadId(card.dataset.leadId || '');
      setEnabled(true);
    }

    document.addEventListener('click', enableOnLeadOpen, true);
    return () => document.removeEventListener('click', enableOnLeadOpen, true);
  }, [active]);

  if (!active || !enabled) return null;

  return (
    <>
      <LazyEditorEnhancer />
      <LazyLeadResponsibility leadId={leadId} />
    </>
  );
}
