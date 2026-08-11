'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, Plus, Settings2, UserRound, UsersRound, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type PipelineLead = {
  id: string;
  assigned_user_id?: string | null;
  seller_user_id?: string | null;
  pre_sales_user_id?: string | null;
  captured_by_user_id?: string | null;
  status?: string | null;
};

type TeamMember = {
  id: string;
  full_name: string;
  role: string;
  role_label: string;
};

type PipelineSummary = {
  store?: { store_name?: string | null };
  profile?: { id?: string | null; full_name?: string | null; role?: string | null };
  team?: TeamMember[];
  leads?: PipelineLead[];
};

const stages = [
  ['new_lead', 'Novo Lead'],
  ['in_service', 'Em Atendimento'],
  ['scheduled', 'Agendado'],
  ['appointment_cancelled', 'Cancelou Agendamento'],
  ['no_show', 'Não Compareceu'],
  ['showed_up', 'Compareceu'],
  ['sale_confirmed', 'Venda Confirmada'],
  ['lost', 'Perdido']
] as const;

const STORAGE_KEY = 'auto-controle-pipeline-visible-stages';

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

function responsibleId(lead: PipelineLead) {
  return lead.assigned_user_id || lead.seller_user_id || lead.pre_sales_user_id || lead.captured_by_user_id || '';
}

export function StorePipelineCockpitUx() {
  const pathname = usePathname() || '';
  const active = isPipeline(pathname);
  const slug = slugFrom(pathname);
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [heroHost, setHeroHost] = useState<HTMLElement | null>(null);
  const [selectedResponsible, setSelectedResponsible] = useState('all');
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [visibleStages, setVisibleStages] = useState<string[]>(stages.map(([key]) => key));

  useEffect(() => {
    if (!active) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) setVisibleStages(parsed.filter((item) => stages.some(([key]) => key === item)));
    } catch {}
  }, [active]);

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
        hero?.classList.add('pipeline-cockpit-host');
        board?.classList.add('pipeline-cockpit-board');
      });
    };
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); cancelAnimationFrame(raf); };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const leadMap = new Map((summary?.leads || []).map((lead) => [lead.id, lead]));
    document.querySelectorAll<HTMLElement>('[data-lead-id]').forEach((card) => {
      const lead = leadMap.get(card.dataset.leadId || '');
      const matchesResponsible = selectedResponsible === 'all' || responsibleId(lead || { id: '' }) === selectedResponsible;
      card.style.display = matchesResponsible ? '' : 'none';
    });

    const board = document.querySelector<HTMLElement>('.pipeline-cockpit-board');
    if (board) {
      Array.from(board.children).forEach((column, index) => {
        const key = stages[index]?.[0];
        (column as HTMLElement).style.display = key && visibleStages.includes(key) ? '' : 'none';
      });
    }
  }, [active, selectedResponsible, summary, visibleStages]);

  if (!active) return null;

  const team = (summary?.team || []).filter((member) => member.role !== 'store');
  const ownerName = summary?.profile?.full_name || summary?.store?.store_name || 'Carteira geral da loja';
  const ownerRole = summary?.profile?.role === 'store' ? 'Gestor da loja' : roleLabel(summary?.profile?.role);

  function toggleStage(key: string) {
    setVisibleStages((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function saveCustomization() {
    const safe = visibleStages.length ? visibleStages : stages.map(([key]) => key);
    setVisibleStages(safe);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    setCustomizeOpen(false);
  }

  function resetCustomization() {
    const all = stages.map(([key]) => key);
    setVisibleStages(all);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  const header = (
    <div className="pipeline-cockpit-shell">
      <div className="pipeline-cockpit-title-row">
        <div className="pipeline-cockpit-heading">
          <h1>Pipeline da Loja</h1>
          <div className="pipeline-cockpit-owner"><span className="pipeline-cockpit-live" /> Sincronizado <span className="pipeline-cockpit-sep">·</span><UsersRound size={13} /> <strong>{ownerName}</strong> <span className="pipeline-cockpit-role">· {ownerRole}</span></div>
        </div>
        <div className="pipeline-cockpit-actions">
          <button type="button" className="pipeline-cockpit-secondary pipeline-cockpit-calendar" onClick={() => clickNativeLink('calendário')}><CalendarDays size={15} /> Calendário</button>
          <label className="pipeline-cockpit-responsible-select">
            <UserRound size={14} />
            <select value={selectedResponsible} onChange={(event) => setSelectedResponsible(event.target.value)} aria-label="Visualizar pipeline por responsável">
              <option value="all">Toda a loja</option>
              {team.map((member) => <option key={member.id} value={member.id}>{member.full_name} · {member.role_label}</option>)}
            </select>
          </label>
          <button type="button" className="pipeline-cockpit-secondary pipeline-cockpit-customize" onClick={() => setCustomizeOpen(true)}><Settings2 size={15} /> Personalizar pipeline</button>
          <button type="button" className="pipeline-cockpit-primary" onClick={() => clickNativeButton('adicionar lead')}><Plus size={16} /> Novo Lead</button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{styles}</style>
      {heroHost ? createPortal(header, heroHost) : null}
      {customizeOpen && typeof document !== 'undefined' ? createPortal(
        <div className="pipeline-customize-overlay" role="dialog" aria-modal="true" aria-label="Personalizar pipeline" onMouseDown={() => setCustomizeOpen(false)}>
          <section className="pipeline-customize-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><p>Configuração visual</p><h2>Personalizar pipeline</h2><span>Escolha quais etapas aparecem no quadro desta tela.</span></div><button type="button" onClick={() => setCustomizeOpen(false)} aria-label="Fechar"><X size={20} /></button></header>
            <div className="pipeline-customize-list">
              {stages.map(([key, label]) => {
                const checked = visibleStages.includes(key);
                return <button key={key} type="button" className={checked ? 'is-checked' : ''} onClick={() => toggleStage(key)}><span>{checked ? <Check size={16} /> : null}</span><strong>{label}</strong></button>;
              })}
            </div>
            <footer><button type="button" className="pipeline-customize-reset" onClick={resetCustomization}>Restaurar padrão</button><button type="button" className="pipeline-customize-save" onClick={saveCustomization}>Salvar personalização</button></footer>
          </section>
        </div>, document.body
      ) : null}
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
  body.pipeline-aura-active .pipeline-cockpit-host > :not(.pipeline-cockpit-shell) { display:none!important; }
  .pipeline-cockpit-shell {
    position:static!important;
    width:100%;
    margin:0;
    padding:0;
    color:var(--aura-text);
    container-type:inline-size;
    container-name:pipelineHeader;
  }
  .pipeline-cockpit-title-row { position:static!important; display:flex; width:100%; min-width:0; align-items:center; gap:14px; }
  .pipeline-cockpit-heading { display:flex; min-width:280px; flex:0 1 380px; align-items:center; gap:12px; }
  body.pipeline-aura-active .pipeline-cockpit-host .pipeline-cockpit-heading h1 {
    flex:0 0 auto;
    margin:0!important;
    color:var(--aura-text)!important;
    font-size:22px!important;
    line-height:1!important;
    font-weight:950!important;
    letter-spacing:-.025em!important;
    white-space:nowrap!important;
  }
  .pipeline-cockpit-owner { display:flex; min-width:0; align-items:center; gap:5px; overflow:hidden; color:var(--aura-muted); font-size:10px; font-weight:700; white-space:nowrap; }
  .pipeline-cockpit-owner strong { max-width:145px; overflow:hidden; color:var(--aura-soft); text-overflow:ellipsis; }
  .pipeline-cockpit-role { overflow:hidden; text-overflow:ellipsis; }
  .pipeline-cockpit-live { flex:0 0 auto; width:6px; height:6px; border-radius:50%; background:#22c55e; box-shadow:0 0 9px rgba(34,197,94,.55); }
  .pipeline-cockpit-sep { color:var(--aura-muted); }
  .pipeline-cockpit-actions { position:static!important; display:flex; min-width:620px; max-width:820px; flex:1 1 720px; align-items:center; justify-content:stretch; gap:8px; margin-left:auto; }
  .pipeline-cockpit-actions button, .pipeline-cockpit-responsible-select { position:static!important; display:inline-flex; height:36px; min-height:36px; align-items:center; justify-content:center; gap:6px; border-radius:10px; padding:0 12px; font-size:10px; font-weight:900; line-height:1; white-space:nowrap; box-shadow:none; }
  .pipeline-cockpit-secondary, .pipeline-cockpit-responsible-select { border:1px solid var(--aura-border); background:var(--aura-surface-2); color:var(--aura-soft); }
  .pipeline-cockpit-calendar { flex:0.9 1 120px; }
  .pipeline-cockpit-responsible-select { flex:1.35 1 190px; max-width:none; }
  .pipeline-cockpit-responsible-select select { width:100%; min-width:0; max-width:none; border:0; outline:0; background:transparent; color:var(--aura-soft); font:inherit; cursor:pointer; text-overflow:ellipsis; }
  .pipeline-cockpit-responsible-select option { background:#11151c; color:#f8fafc; }
  .pipeline-cockpit-customize { flex:1.25 1 180px; }
  .pipeline-cockpit-primary { flex:0.85 1 125px; border:1px solid #ef2d34; background:#ef2d34; color:white; box-shadow:0 8px 20px rgba(239,45,52,.2)!important; }
  body.pipeline-aura-active .pipeline-aura-kpis { display:none!important; }
  body.pipeline-aura-active .aura-hero-actions { display:none!important; }
  body.pipeline-aura-active .pipeline-aura-board-scroll { margin-top:4px!important; padding-top:0!important; }
  body.pipeline-aura-active .pipeline-aura-board > div > div:first-child { top:0!important; }
  body.pipeline-aura-active .pipeline-aura-board > div { min-height:500px!important; }
  .pipeline-cockpit-stagebar { display:none!important; }

  @media (min-width:1024px) {
    body.pipeline-aura-active .pipeline-cockpit-host { margin-top:-58px!important; }
  }

  @container pipelineHeader (max-width:1040px) {
    .pipeline-cockpit-title-row { display:grid; grid-template-columns:minmax(0,1fr); gap:7px; }
    .pipeline-cockpit-heading { min-width:0; min-height:28px; }
    .pipeline-cockpit-actions { width:100%; min-width:0; max-width:none; margin-left:0; justify-content:flex-start; }
  }

  @container pipelineHeader (max-width:760px) {
    .pipeline-cockpit-owner { display:none; }
    .pipeline-cockpit-actions { overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
    .pipeline-cockpit-actions::-webkit-scrollbar { display:none; }
    .pipeline-cockpit-actions button, .pipeline-cockpit-responsible-select { height:34px; min-height:34px; padding:0 9px; }
    .pipeline-cockpit-calendar { flex:0 0 112px; }
    .pipeline-cockpit-responsible-select { flex:0 0 165px; }
    .pipeline-cockpit-customize { flex:0 0 165px; }
    .pipeline-cockpit-primary { flex:0 0 115px; }
  }

  .pipeline-customize-overlay { position:fixed; inset:0; z-index:180; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(3,7,18,.78); backdrop-filter:blur(8px); }
  .pipeline-customize-modal { width:min(560px,100%); border:1px solid var(--aura-border); border-radius:22px; background:var(--aura-surface); color:var(--aura-text); box-shadow:0 28px 90px rgba(0,0,0,.45); overflow:hidden; }
  .pipeline-customize-modal header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:22px; border-bottom:1px solid var(--aura-border); }
  .pipeline-customize-modal header p { margin:0; color:#ef2d34; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:.16em; }
  .pipeline-customize-modal header h2 { margin:4px 0 0; font-size:23px; font-weight:950; }
  .pipeline-customize-modal header span { display:block; margin-top:5px; color:var(--aura-muted); font-size:11px; }
  .pipeline-customize-modal header button { display:flex; width:38px; height:38px; align-items:center; justify-content:center; border:1px solid var(--aura-border); border-radius:12px; background:var(--aura-surface-2); color:var(--aura-soft); }
  .pipeline-customize-list { display:grid; gap:8px; padding:18px 22px; }
  .pipeline-customize-list button { display:flex; align-items:center; gap:11px; min-height:48px; border:1px solid var(--aura-border); border-radius:13px; background:var(--aura-surface-2); padding:0 14px; color:var(--aura-soft); text-align:left; }
  .pipeline-customize-list button > span { display:flex; width:22px; height:22px; align-items:center; justify-content:center; border:1px solid var(--aura-border); border-radius:7px; }
  .pipeline-customize-list button.is-checked > span { border-color:#ef2d34; background:#ef2d34; color:white; }
  .pipeline-customize-list strong { font-size:12px; }
  .pipeline-customize-modal footer { display:flex; justify-content:space-between; gap:12px; padding:18px 22px 22px; border-top:1px solid var(--aura-border); }
  .pipeline-customize-modal footer button { min-height:44px; border-radius:12px; padding:0 16px; font-size:12px; font-weight:900; }
  .pipeline-customize-reset { border:1px solid var(--aura-border); background:transparent; color:var(--aura-muted); }
  .pipeline-customize-save { border:1px solid #ef2d34; background:#ef2d34; color:white; }

  @media (max-width:1023px) {
    body.pipeline-aura-active .pipeline-aura-canvas { padding-top:88px!important; }
  }
  @media (max-width:760px) {
    body.pipeline-aura-active .pipeline-cockpit-host .pipeline-cockpit-heading h1 { font-size:20px!important; }
    .pipeline-cockpit-customize { display:none!important; }
    body.pipeline-aura-active .pipeline-aura-canvas { padding-top:82px!important; }
  }
`;
