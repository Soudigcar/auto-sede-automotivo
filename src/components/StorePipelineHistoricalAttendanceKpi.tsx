'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type PipelineLead = {
  id: string;
  assigned_user_id?: string | null;
  seller_user_id?: string | null;
  pre_sales_user_id?: string | null;
  captured_by_user_id?: string | null;
  has_showed_up?: boolean;
};

type PipelineSummary = {
  leads?: PipelineLead[];
};

function isPipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

function responsibleId(lead: PipelineLead) {
  return lead.assigned_user_id || lead.seller_user_id || lead.pre_sales_user_id || lead.captured_by_user_id || '';
}

function percentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function updateHistoricalAttendanceKpi(summary: PipelineSummary | null, selectedResponsible: string) {
  const leads = summary?.leads || [];
  const visibleLeads = selectedResponsible === 'all'
    ? leads
    : leads.filter((lead) => responsibleId(lead) === selectedResponsible);
  const historicalAttendance = visibleLeads.filter((lead) => lead.has_showed_up === true).length;

  const item = Array.from(document.querySelectorAll<HTMLElement>('.pipeline-kpi-item')).find((candidate) =>
    candidate.querySelector<HTMLElement>('.pipeline-kpi-label')?.textContent?.trim() === 'Compareceram'
  );
  if (!item) return;

  const value = item.querySelector<HTMLElement>('.pipeline-kpi-value');
  const detail = item.querySelector<HTMLElement>('.pipeline-kpi-detail');
  if (value) value.textContent = String(historicalAttendance);
  if (detail) detail.textContent = `${percentage(historicalAttendance, visibleLeads.length)}% do total`;
}

export function StorePipelineHistoricalAttendanceKpi() {
  const pathname = usePathname() || '';
  const active = isPipeline(pathname);
  const summaryRef = useRef<PipelineSummary | null>(null);
  const selectedResponsibleRef = useRef('all');
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!active) return;

    let frame = 0;
    const apply = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        updateHistoricalAttendanceKpi(summaryRef.current, selectedResponsibleRef.current);
      });
    };

    const onPipelineData = (event: Event) => {
      const payload = (event as CustomEvent<PipelineSummary>).detail;
      if (payload?.leads) summaryRef.current = payload;
      apply();
    };

    const onResponsibleChange = (event: Event) => {
      selectedResponsibleRef.current = (event as CustomEvent<{ value?: string }>).detail?.value || 'all';
      apply();
    };

    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('pipeline-data-updated', onPipelineData as EventListener);
    window.addEventListener('pipeline-responsible-change', onResponsibleChange as EventListener);
    apply();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pipeline-data-updated', onPipelineData as EventListener);
      window.removeEventListener('pipeline-responsible-change', onResponsibleChange as EventListener);
    };
  }, [active]);

  useEffect(() => {
    forceRender((current) => current + 1);
  }, [pathname]);

  return null;
}
