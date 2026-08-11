'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, CircleCheckBig, Headphones, Timer, UserRound, UserRoundCheck } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type PipelineLead = {
  id: string;
  assigned_user_id?: string | null;
  seller_user_id?: string | null;
  pre_sales_user_id?: string | null;
  captured_by_user_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  first_viewed_at?: string | null;
  first_phone_viewed_at?: string | null;
  first_whatsapp_clicked_at?: string | null;
};

type TeamMember = {
  id: string;
  full_name: string;
  role: string;
  role_label: string;
};

type PipelineSummary = {
  team?: TeamMember[];
  leads?: PipelineLead[];
};

function isPipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

function slugFrom(pathname: string) {
  return pathname.match(/^\/loja\/([^/]+)\/pipeline\/?$/)?.[1] || '';
}

function responsibleId(lead: PipelineLead) {
  return lead.assigned_user_id || lead.seller_user_id || lead.pre_sales_user_id || lead.captured_by_user_id || '';
}

function percentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function firstResponseAt(lead: PipelineLead) {
  const candidates = [lead.first_whatsapp_clicked_at, lead.first_phone_viewed_at, lead.first_viewed_at]
    .filter(Boolean)
    .map((value) => new Date(String(value)).getTime())
    .filter((value) => Number.isFinite(value));
  return candidates.length ? Math.min(...candidates) : null;
}

function averageResponseMinutes(leads: PipelineLead[]) {
  const samples = leads.flatMap((lead) => {
    const createdAt = lead.created_at ? new Date(lead.created_at).getTime() : NaN;
    const responseAt = firstResponseAt(lead);
    if (!Number.isFinite(createdAt) || responseAt === null || responseAt < createdAt) return [];
    return [(responseAt - createdAt) / 60_000];
  });

  if (!samples.length) return { minutes: null as number | null, measured: 0 };
  return {
    minutes: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    measured: samples.length
  };
}

function formatResponseTime(minutes: number | null) {
  if (minutes === null) return '—';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(minutes / 1440);
  const hours = Math.round((minutes % 1440) / 60);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

export function StorePipelineCockpitUx() {
  const pathname = usePathname() || '';
  const active = isPipeline(pathname);
  const slug = slugFrom(pathname);
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [heroHost, setHeroHost] = useState<HTMLElement | null>(null);
  const [selectedResponsible, setSelectedResponsible] = useState('all');

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/store/portal/pipeline?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => null);
      if (!cancelled && response.ok) setSummary(payload);
    }

    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [active, slug, supabase]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const decorate = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const pageMain = Array.from(document.querySelectorAll<HTMLElement>('main')).find((item) => item.querySelector('h1')?.textContent?.includes('Pipeline da Loja'));
        const hero = pageMain ? Array.from(pageMain.querySelectorAll<HTMLElement>('header')).find((item) => item.querySelector('h1')?.textContent?.includes('Pipeline da Loja')) || null : null;
        const board = Array.from(document.querySelectorAll<HTMLElement>('div.grid')).find((element) => element.className.includes('grid-cols-8') && element.children.length >= 6) || null;
        setHeroHost((current) => current === hero ? current : hero);
        hero?.classList.add('pipeline-cockpit-host');
        board?.classList.add('pipeline-cockpit-board');
      });
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const onResponsibleChange = (event: Event) => {
      const value = (event as CustomEvent<{ value?: string }>).detail?.value || 'all';
      setSelectedResponsible(value);
    };

    window.addEventListener('pipeline-responsible-change', onResponsibleChange as EventListener);
    return () => window.removeEventListener('pipeline-responsible-change', onResponsibleChange as EventListener);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    window.dispatchEvent(new CustomEvent('pipeline-responsible-options', {
      detail: {
        team: (summary?.team || []).filter((member) => member.role !== 'store'),
        selected: selectedResponsible
      }
    }));
  }, [active, selectedResponsible, summary]);

  useEffect(() => {
    if (!active) return;
    const leadMap = new Map((summary?.leads || []).map((lead) => [lead.id, lead]));
    document.querySelectorAll<HTMLElement>('[data-lead-id]').forEach((card) => {
      const lead = leadMap.get(card.dataset.leadId || '');
      const matchesResponsible = selectedResponsible === 'all' || responsibleId(lead || { id: '' }) === selectedResponsible;
      card.style.display = matchesResponsible ? '' : 'none';
    });
  }, [active, selectedResponsible, summary]);

  if (!active) return null;

  const visibleLeads = (summary?.leads || []).filter((lead) => selectedResponsible === 'all' || responsibleId(lead) === selectedResponsible);
  const total = visibleLeads.length;
  const newLeads = visibleLeads.filter((lead) => lead.status === 'new_lead').length;
  const inService = visibleLeads.filter((lead) => lead.status === 'in_service').length;
  const scheduled = visibleLeads.filter((lead) => lead.status === 'scheduled').length;
  const showedUp = visibleLeads.filter((lead) => lead.status === 'showed_up').length;
  const closed = visibleLeads.filter((lead) => lead.status === 'sale_confirmed' || lead.status === 'lost').length;
  const response = averageResponseMinutes(visibleLeads);

  const indicators = [
    { label: 'Novos', value: String(newLeads), detail: `${percentage(newLeads, total)}% do total`, icon: UserRound, tone: 'coral' },
    { label: 'Em atendimento', value: String(inService), detail: `${percentage(inService, total)}% do total`, icon: Headphones, tone: 'orange' },
    { label: 'Agendados', value: String(scheduled), detail: `${percentage(scheduled, total)}% do total`, icon: CalendarClock, tone: 'amber' },
    { label: 'Compareceram', value: String(showedUp), detail: `${percentage(showedUp, total)}% do total`, icon: UserRoundCheck, tone: 'cyan' },
    { label: 'Fechados', value: String(closed), detail: `${percentage(closed, total)}% do total`, icon: CircleCheckBig, tone: 'green' },
    { label: 'Tempo de resposta', value: formatResponseTime(response.minutes), detail: response.measured ? `média de ${response.measured} lead${response.measured === 1 ? '' : 's'}` : 'sem resposta medida', icon: Timer, tone: 'blue' }
  ];

  const dashboard = (
    <div className="pipeline-kpi-strip" aria-label="Indicadores da pipeline">
      {indicators.map((indicator) => {
        const Icon = indicator.icon;
        return (
          <div key={indicator.label} className="pipeline-kpi-item">
            <span className={`pipeline-kpi-icon tone-${indicator.tone}`}><Icon size={22} /></span>
            <div className="pipeline-kpi-copy">
              <span className="pipeline-kpi-label">{indicator.label}</span>
              <strong className="pipeline-kpi-value">{indicator.value}</strong>
              <small className="pipeline-kpi-detail">{indicator.detail}</small>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <style>{styles}</style>
      {heroHost ? createPortal(dashboard, heroHost) : null}
    </>
  );
}

const styles = `
  body.pipeline-aura-active .pipeline-cockpit-host {
    position:static!important;
    min-height:0!important;
    height:auto!important;
    width:100%!important;
    max-width:none!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    background:transparent!important;
    box-shadow:none!important;
  }
  body.pipeline-aura-active .pipeline-cockpit-host > :not(.pipeline-kpi-strip) { display:none!important; }
  body.pipeline-aura-active .pipeline-aura-kpis,
  body.pipeline-aura-active .aura-hero-actions { display:none!important; }

  .pipeline-kpi-strip {
    display:grid;
    grid-template-columns:repeat(6,minmax(0,1fr));
    width:100%;
    min-height:82px;
    align-items:center;
    overflow:hidden;
    border:1px solid var(--aura-border);
    border-radius:16px;
    background:color-mix(in srgb,var(--aura-surface) 72%,transparent);
    color:var(--aura-text);
  }
  .pipeline-kpi-item {
    position:relative;
    display:flex;
    min-width:0;
    align-items:center;
    gap:11px;
    padding:11px 16px;
  }
  .pipeline-kpi-item:not(:last-child)::after {
    content:'';
    position:absolute;
    top:14px;
    right:0;
    bottom:14px;
    width:1px;
    background:var(--aura-border);
  }
  .pipeline-kpi-icon {
    display:flex;
    width:46px;
    height:46px;
    flex:0 0 46px;
    align-items:center;
    justify-content:center;
    border-radius:13px;
    background:var(--aura-surface-2);
  }
  .tone-coral { color:#fb7185; }
  .tone-orange { color:#fb923c; }
  .tone-amber { color:#fbbf24; }
  .tone-cyan { color:#22d3ee; }
  .tone-green { color:#34d399; }
  .tone-blue { color:#60a5fa; }
  .pipeline-kpi-copy { display:grid; min-width:0; line-height:1; }
  .pipeline-kpi-label { overflow:hidden; color:var(--aura-soft); font-size:11px; font-weight:900; text-overflow:ellipsis; white-space:nowrap; }
  .pipeline-kpi-value { margin-top:5px; overflow:hidden; color:var(--aura-text); font-size:24px; font-weight:950; letter-spacing:-.035em; text-overflow:ellipsis; white-space:nowrap; }
  .pipeline-kpi-detail { margin-top:5px; overflow:hidden; color:var(--aura-muted); font-size:9px; font-weight:750; text-overflow:ellipsis; white-space:nowrap; }

  body.pipeline-aura-active .pipeline-aura-board-scroll { margin-top:7px!important; padding-top:0!important; }
  body.pipeline-aura-active .pipeline-aura-board > div > div:first-child { top:0!important; }
  body.pipeline-aura-active .pipeline-aura-board > div { min-height:500px!important; }

  @media (min-width:1024px) {
    body.pipeline-aura-active .pipeline-cockpit-host { margin-top:-58px!important; }
  }
  @media (max-width:1320px) {
    .pipeline-kpi-strip { grid-template-columns:repeat(3,minmax(0,1fr)); }
    .pipeline-kpi-item:nth-child(3)::after { display:none; }
    .pipeline-kpi-item:nth-child(-n+3) { border-bottom:1px solid var(--aura-border); }
  }
  @media (max-width:1023px) {
    body.pipeline-aura-active .pipeline-aura-canvas { padding-top:88px!important; }
    .pipeline-kpi-strip { display:flex; overflow-x:auto; scrollbar-width:none; }
    .pipeline-kpi-strip::-webkit-scrollbar { display:none; }
    .pipeline-kpi-item { min-width:190px; }
    .pipeline-kpi-item:nth-child(-n+3) { border-bottom:0; }
    .pipeline-kpi-item:nth-child(3)::after { display:block; }
  }
  @media (max-width:760px) {
    body.pipeline-aura-active .pipeline-aura-canvas { padding-top:82px!important; }
    .pipeline-kpi-strip { min-height:74px; }
    .pipeline-kpi-item { min-width:174px; padding:9px 12px; }
    .pipeline-kpi-icon { width:40px; height:40px; flex-basis:40px; }
    .pipeline-kpi-value { font-size:21px; }
  }
`;
