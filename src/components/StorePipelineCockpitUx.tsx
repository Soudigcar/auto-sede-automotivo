'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, CheckCircle2, Clock3, Plus, Settings2, UsersRound } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type PipelineSummary = {
  store?: { store_name?: string | null };
  profile?: { full_name?: string | null; role?: string | null };
  metrics?: { total?: number; scheduled?: number; cancelled?: number; sold?: number; lost?: number };
  calendar_summary?: {
    today_tasks?: number;
    next_task?: { title?: string | null; starts_at?: string | null } | null;
  };
  leads?: Array<{ status?: string | null }>;
};

const stageMeta = [
  ['new_lead', 'Novo Lead'],
  ['in_service', 'Em Atendimento'],
  ['scheduled', 'Agendado'],
  ['appointment_cancelled', 'Cancelou Agendamento'],
  ['no_show', 'Não Compareceu'],
  ['showed_up', 'Compareceu'],
  ['sale_confirmed', 'Venda'],
  ['lost', 'Perdido']
] as const;

function isPipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

function slugFrom(pathname: string) {
  return pathname.match(/^\/loja\/([^/]+)\/pipeline\/?$/)?.[1] || '';
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function clickNativeButton(label: string) {
  const needle = normalize(label);
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
    normalize(String(item.textContent || '').replace(/\s+/g, ' ').trim()).includes(needle)
  );
  button?.click();
}

function clickNativeLink(label: string) {
  const needle = normalize(label);
  const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find((item) =>
    normalize(String(item.textContent || '').replace(/\s+/g, ' ').trim()).includes(needle)
  );
  link?.click();
}

function roleLabel(role?: string | null) {
  if (role === 'store') return 'Gestor da loja';
  if (role === 'master') return 'Master';
  if (role === 'seller') return 'Vendedor';
  if (role === 'pre_sales') return 'Pré-vendas';
  if (role === 'prospector') return 'Prospectador';
  return 'Responsável';
}

function shortTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export function StorePipelineCockpitUx() {
  const pathname = usePathname() || '';
  const active = isPipeline(pathname);
  const slug = slugFrom(pathname);
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [heroHost, setHeroHost] = useState<HTMLElement | null>(null);
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);

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
    return () => { cancelled = true; window.clearInterval(interval); };
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
        setStageHost((current) => current === board?.parentElement ? current : board?.parentElement || null);
        hero?.classList.add('pipeline-cockpit-host');
        board?.classList.add('pipeline-cockpit-board');
      });
    };
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); cancelAnimationFrame(raf); };
  }, [active]);

  if (!active) return null;

  const metrics = summary?.metrics || {};
  const stageCounts = new Map<string, number>();
  for (const lead of summary?.leads || []) {
    const key = String(lead.status || '');
    stageCounts.set(key, (stageCounts.get(key) || 0) + 1);
  }
  const ownerName = summary?.profile?.full_name || summary?.store?.store_name || 'Carteira geral da loja';
  const ownerRole = summary?.profile?.role === 'store' ? 'Gestor da loja' : roleLabel(summary?.profile?.role);
  const nextTask = summary?.calendar_summary?.next_task;

  const header = (
    <div className="pipeline-cockpit-shell">
      <div className="pipeline-cockpit-title-row">
        <div className="pipeline-cockpit-heading">
          <h1>Pipeline da Loja</h1>
          <div className="pipeline-cockpit-owner"><span className="pipeline-cockpit-live" /> Sincronizado agora <span className="pipeline-cockpit-sep">|</span><UsersRound size={14} /> Responsável pela pipeline: <strong>{ownerName}</strong> · {ownerRole}</div>
        </div>
        <div className="pipeline-cockpit-actions">
          <button type="button" className="pipeline-cockpit-secondary" onClick={() => clickNativeLink('calendário')}><CalendarDays size={17} /> Calendário</button>
          <button type="button" className="pipeline-cockpit-secondary" onClick={() => clickNativeButton('personalizar pipeline')}><Settings2 size={17} /> Personalizar pipeline</button>
          <button type="button" className="pipeline-cockpit-primary" onClick={() => clickNativeButton('adicionar lead')}><Plus size={18} /> Novo Lead</button>
        </div>
      </div>
      <div className="pipeline-cockpit-metrics">
        <Metric label="Leads" value={metrics.total || 0} />
        <Metric label="Agendados" value={metrics.scheduled || 0} />
        <Metric label="Cancelados" value={metrics.cancelled || 0} />
        <Metric label="Vendas" value={metrics.sold || 0} />
        <Metric label="Perdas" value={metrics.lost || 0} />
        <button type="button" className="pipeline-cockpit-task" onClick={() => clickNativeLink('calendário')}>
          <span><Clock3 size={17} /> Tarefas de hoje</span><strong>{summary?.calendar_summary?.today_tasks || 0}</strong>
          <small>{nextTask ? `Próxima ${shortTime(nextTask.starts_at)} · ${nextTask.title || 'Tarefa'}` : 'Nenhuma tarefa pendente hoje'}</small>
        </button>
      </div>
    </div>
  );

  const stages = (
    <div className="pipeline-cockpit-stagebar">
      {stageMeta.map(([key, label], index) => (
        <button key={key} type="button" className={index === 0 ? 'is-active' : ''} onClick={() => {
          const board = document.querySelector<HTMLElement>('.pipeline-cockpit-board');
          const column = board?.children.item(index) as HTMLElement | null;
          column?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        }}>
          <span className={`stage-dot stage-${key}`} /> {label}<b>{stageCounts.get(key) || 0}</b>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <style>{styles}</style>
      {heroHost ? createPortal(header, heroHost) : null}
      {stageHost ? createPortal(stages, stageHost) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="pipeline-cockpit-metric"><span>{label}</span><strong>{value}</strong></div>;
}

const styles = `
  body.pipeline-aura-active .pipeline-cockpit-host {
    min-height: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }
  body.pipeline-aura-active .pipeline-cockpit-host > :not(.pipeline-cockpit-shell) { display: none !important; }
  .pipeline-cockpit-shell { width: 100%; color: var(--aura-text); }
  .pipeline-cockpit-title-row { display:flex; align-items:center; justify-content:space-between; gap:18px; }
  .pipeline-cockpit-heading h1 { margin:0; color:var(--aura-text); font-size:30px; font-weight:950; letter-spacing:-.035em; }
  .pipeline-cockpit-owner { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-top:7px; color:var(--aura-muted); font-size:11px; font-weight:650; }
  .pipeline-cockpit-owner strong { color:var(--aura-soft); }
  .pipeline-cockpit-live { width:7px; height:7px; border-radius:50%; background:#22c55e; box-shadow:0 0 12px rgba(34,197,94,.65); }
  .pipeline-cockpit-sep { color:var(--aura-border); margin:0 4px; }
  .pipeline-cockpit-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
  .pipeline-cockpit-actions button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:46px; border-radius:13px; padding:0 17px; font-size:12px; font-weight:900; white-space:nowrap; }
  .pipeline-cockpit-secondary { border:1px solid var(--aura-border); background:var(--aura-surface-2); color:var(--aura-soft); }
  .pipeline-cockpit-primary { border:1px solid #ef2d34; background:#ef2d34; color:white; box-shadow:0 12px 30px rgba(239,45,52,.24); }
  .pipeline-cockpit-metrics { display:grid; grid-template-columns:repeat(5,minmax(105px,1fr)) minmax(220px,1.35fr); gap:9px; margin-top:14px; }
  .pipeline-cockpit-metric, .pipeline-cockpit-task { min-height:70px; border:1px solid var(--aura-border); border-radius:13px; background:linear-gradient(145deg,var(--aura-surface),var(--aura-surface-2)); padding:12px 14px; color:var(--aura-text); box-shadow:0 10px 26px var(--aura-shadow); }
  .pipeline-cockpit-metric span { display:block; color:var(--aura-muted); font-size:11px; font-weight:750; }
  .pipeline-cockpit-metric strong { display:block; margin-top:3px; font-size:23px; line-height:1; }
  .pipeline-cockpit-task { text-align:left; }
  .pipeline-cockpit-task span { display:flex; align-items:center; gap:7px; color:var(--aura-muted); font-size:11px; font-weight:800; }
  .pipeline-cockpit-task strong { display:block; margin-top:2px; font-size:22px; }
  .pipeline-cockpit-task small { display:block; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--aura-muted); font-size:9px; }
  body.pipeline-aura-active .pipeline-aura-kpis { display:none !important; }
  body.pipeline-aura-active .aura-hero-actions { display:none !important; }
  body.pipeline-aura-active .pipeline-aura-canvas { padding-top:96px !important; }
  body.pipeline-aura-active .pipeline-aura-board-scroll { position:relative; margin-top:14px !important; padding-top:58px !important; }
  .pipeline-cockpit-stagebar { position:absolute; top:0; left:0; right:0; z-index:8; display:flex; gap:8px; overflow-x:auto; padding:2px 0 9px; background:linear-gradient(180deg,var(--aura-bg) 78%,transparent); scrollbar-width:none; }
  .pipeline-cockpit-stagebar::-webkit-scrollbar { display:none; }
  .pipeline-cockpit-stagebar button { display:inline-flex; align-items:center; gap:7px; flex:0 0 auto; min-height:42px; border:1px solid var(--aura-border); border-radius:12px; background:var(--aura-surface); padding:0 12px; color:var(--aura-soft); font-size:11px; font-weight:900; }
  .pipeline-cockpit-stagebar button.is-active { border-color:#2563eb; box-shadow:inset 0 -2px 0 #2563eb; }
  .pipeline-cockpit-stagebar b { display:inline-flex; min-width:22px; height:22px; align-items:center; justify-content:center; border-radius:999px; background:var(--aura-surface-2); color:var(--aura-soft); font-size:10px; }
  .stage-dot { width:8px; height:8px; border-radius:50%; background:#64748b; }
  .stage-new_lead { background:#3b82f6; }.stage-in_service { background:#8b5cf6; }.stage-scheduled { background:#f59e0b; }.stage-appointment_cancelled { background:#f97316; }.stage-no_show { background:#71717a; }.stage-showed_up { background:#10b981; }.stage-sale_confirmed { background:#22c55e; }.stage-lost { background:#ef4444; }
  body.pipeline-aura-active .pipeline-aura-board > div > div:first-child { top:54px !important; }
  body.pipeline-aura-active .pipeline-aura-board > div { min-height:500px !important; }

  @media (max-width:1200px) {
    .pipeline-cockpit-title-row { align-items:flex-start; }
    .pipeline-cockpit-metrics { grid-template-columns:repeat(3,minmax(120px,1fr)); }
  }
  @media (max-width:760px) {
    .pipeline-cockpit-title-row { display:grid; }
    .pipeline-cockpit-actions { justify-content:flex-start; overflow-x:auto; flex-wrap:nowrap; }
    .pipeline-cockpit-actions button { min-height:42px; padding:0 12px; }
    .pipeline-cockpit-heading h1 { font-size:25px; }
    .pipeline-cockpit-owner { font-size:10px; }
    .pipeline-cockpit-metrics { display:flex; overflow-x:auto; }
    .pipeline-cockpit-metric { min-width:115px; }
    .pipeline-cockpit-task { min-width:220px; }
    body.pipeline-aura-active .pipeline-aura-canvas { padding-top:84px !important; }
  }
`;
