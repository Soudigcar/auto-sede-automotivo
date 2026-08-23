'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserRound } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type TeamMember = {
  id: string;
  full_name: string;
  role: string;
  role_label: string;
};

type PipelineProfile = {
  id: string;
  full_name: string;
  role: string;
};

function isStorePipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

function slugFrom(pathname: string) {
  return pathname.match(/^\/loja\/([^/]+)\/pipeline\/?$/)?.[1] || '';
}

function roleLabel(role?: string | null) {
  if (role === 'store') return 'Gestor da loja';
  if (role === 'master') return 'Master';
  if (role === 'seller') return 'Vendedor';
  if (role === 'pre_sales') return 'Pré-vendas';
  if (role === 'prospector') return 'Prospectador';
  return 'Responsável';
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'R';
  return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''}`.toUpperCase();
}

export function StorePipelineResponsibleTopbar() {
  const pathname = usePathname() || '';
  const active = isStorePipeline(pathname);
  const slug = slugFrom(pathname);
  const supabase = useMemo(() => createClient(), []);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [profileHost, setProfileHost] = useState<HTMLElement | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState('all');
  const [profile, setProfile] = useState<PipelineProfile | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function loadProfile() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || !slug) return;
      const response = await fetch(`/api/store/portal/pipeline?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => null);
      if (!cancelled && response.ok && payload?.profile) setProfile(payload.profile);
    }

    void loadProfile();
    return () => { cancelled = true; };
  }, [active, slug, supabase]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;

    const attach = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const actions = document.querySelector<HTMLElement>('.aura-top-actions');
        const bell = actions?.querySelector<HTMLElement>('button[aria-label="Notificações"]');
        if (actions && bell) {
          let target = actions.querySelector<HTMLElement>('[data-pipeline-responsible-host]');
          if (!target) {
            target = document.createElement('span');
            target.dataset.pipelineResponsibleHost = 'true';
            bell.insertAdjacentElement('afterend', target);
          }
          setHost((current) => current === target ? current : target);
        }

        const cockpit = document.querySelector<HTMLElement>('.pipeline-cockpit-host');
        if (cockpit) cockpit.classList.add('pipeline-tight-host');

        const canvas = document.querySelector<HTMLElement>('.pipeline-aura-canvas');
        canvas?.classList.add('pipeline-tight-canvas');

        const board = document.querySelector<HTMLElement>('.pipeline-cockpit-board');
        board?.parentElement?.classList.add('pipeline-tight-board-scroll');

        const strip = document.querySelector<HTMLElement>('.pipeline-kpi-strip');
        if (strip) {
          let target = strip.querySelector<HTMLElement>('[data-pipeline-owner-host]');
          if (!target) {
            target = document.createElement('span');
            target.dataset.pipelineOwnerHost = 'true';
            const viewToggle = strip.querySelector<HTMLElement>('.pipeline-view-toggle');
            const customize = strip.querySelector<HTMLElement>('.pipeline-customize-trigger');
            if (viewToggle) strip.insertBefore(target, viewToggle);
            else if (customize) strip.insertBefore(target, customize);
            else strip.appendChild(target);
          }
          setProfileHost((current) => current === target ? current : target);
        }
      });
    };

    attach();
    window.addEventListener('pipeline-dom-sync', attach);
    return () => {
      window.removeEventListener('pipeline-dom-sync', attach);
      cancelAnimationFrame(raf);
      document.querySelector('[data-pipeline-responsible-host]')?.remove();
      document.querySelector('[data-pipeline-owner-host]')?.remove();
      document.querySelector('.pipeline-tight-host')?.classList.remove('pipeline-tight-host');
      document.querySelector('.pipeline-tight-canvas')?.classList.remove('pipeline-tight-canvas');
      document.querySelector('.pipeline-tight-board-scroll')?.classList.remove('pipeline-tight-board-scroll');
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onOptions = (event: Event) => {
      const detail = (event as CustomEvent<{ team?: TeamMember[]; selected?: string }>).detail;
      setTeam(Array.isArray(detail?.team) ? detail.team : []);
      setSelected(detail?.selected || 'all');
    };
    window.addEventListener('pipeline-responsible-options', onOptions as EventListener);
    return () => window.removeEventListener('pipeline-responsible-options', onOptions as EventListener);
  }, [active]);

  if (!active) return null;

  const selectedMember = selected === 'all' ? null : team.find((member) => member.id === selected) || null;
  const ownerName = selectedMember?.full_name || profile?.full_name || 'Responsável da loja';
  const ownerRole = selectedMember?.role_label || roleLabel(profile?.role);

  const filter = host ? createPortal(
    <label className="aura-responsible-filter" title="Filtrar pipeline por responsável">
      <UserRound size={15} />
      <select
        value={selected}
        onChange={(event) => {
          const value = event.target.value;
          setSelected(value);
          window.dispatchEvent(new CustomEvent('pipeline-responsible-change', { detail: { value } }));
        }}
        aria-label="Visualizar pipeline por responsável"
      >
        <option value="all">Toda a loja</option>
        {team.map((member) => (
          <option key={member.id} value={member.id}>{member.full_name} · {member.role_label}</option>
        ))}
      </select>
    </label>,
    host
  ) : null;

  const owner = profileHost ? createPortal(
    <div className="pipeline-owner-card" title={`${ownerName} · ${ownerRole}`}>
      <span className="pipeline-owner-avatar">{initials(ownerName)}</span>
      <span className="pipeline-owner-copy">
        <small>Responsável</small>
        <strong>{ownerName}</strong>
        <em>{ownerRole}</em>
      </span>
    </div>,
    profileHost
  ) : null;

  return (
    <>
      <style>{styles}</style>
      {filter}
      {owner}
    </>
  );
}

const styles = `
  [data-pipeline-responsible-host] { display:flex; align-items:center; }
  .aura-responsible-filter {
    display:flex;
    height:40px;
    min-width:160px;
    max-width:220px;
    align-items:center;
    gap:7px;
    border:1px solid var(--aura-border);
    border-radius:12px;
    background:var(--aura-surface);
    padding:0 10px;
    color:var(--aura-muted);
  }
  .aura-responsible-filter select {
    min-width:0;
    width:100%;
    border:0;
    outline:0;
    background:transparent;
    color:var(--aura-soft);
    font-size:10px;
    font-weight:850;
    cursor:pointer;
    text-overflow:ellipsis;
  }
  .aura-responsible-filter option { background:#11151c; color:#f8fafc; }

  body.pipeline-aura-active .pipeline-aura-canvas.pipeline-tight-canvas {
    padding:88px 10px 0!important;
  }
  body.pipeline-aura-active .pipeline-aura-canvas.pipeline-tight-canvas > * {
    width:100%!important;
    max-width:none!important;
    margin-left:0!important;
    margin-right:0!important;
  }
  body.pipeline-aura-active .pipeline-aura-hero.pipeline-cockpit-host.pipeline-tight-host {
    display:block!important;
    width:100%!important;
    max-width:none!important;
    min-height:0!important;
    height:auto!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    border-radius:0!important;
    background:transparent!important;
    box-shadow:none!important;
    overflow:visible!important;
  }
  body.pipeline-aura-active .pipeline-aura-hero.pipeline-cockpit-host.pipeline-tight-host > :not(.pipeline-kpi-strip-shell) {
    display:none!important;
  }
  body.pipeline-aura-active .pipeline-tight-board-scroll {
    margin-top:6px!important;
    padding-top:0!important;
  }
  body.pipeline-aura-active .pipeline-kpi-strip-shell {
    width:100%!important;
    max-width:none!important;
    margin:0!important;
    padding:0!important;
    overflow-x:auto!important;
    overflow-y:visible!important;
  }
  body.pipeline-aura-active .pipeline-kpi-strip {
    display:grid!important;
    grid-template-columns:repeat(6,minmax(84px,1fr)) minmax(118px,.95fr) minmax(112px,.88fr) minmax(136px,1.05fr)!important;
    width:100%!important;
    min-width:840px!important;
    min-height:72px!important;
    height:auto!important;
    align-items:stretch!important;
    overflow:visible!important;
    border-radius:12px!important;
  }
  body.pipeline-aura-active .pipeline-kpi-item {
    min-width:0!important;
    width:auto!important;
    padding:8px 8px!important;
    gap:7px!important;
    overflow:visible!important;
  }
  body.pipeline-aura-active .pipeline-kpi-icon {
    width:34px!important;
    height:34px!important;
    flex:0 0 34px!important;
    border-radius:10px!important;
  }
  body.pipeline-aura-active .pipeline-kpi-icon svg {
    width:19px!important;
    height:19px!important;
  }
  body.pipeline-aura-active .pipeline-kpi-copy {
    display:grid!important;
    min-width:0!important;
    align-content:center!important;
    overflow:visible!important;
    line-height:1!important;
  }
  body.pipeline-aura-active .pipeline-kpi-label {
    display:block!important;
    position:static!important;
    height:auto!important;
    min-height:10px!important;
    margin:0 0 3px!important;
    overflow:visible!important;
    visibility:visible!important;
    opacity:1!important;
    color:var(--aura-soft)!important;
    font-size:8px!important;
    font-weight:950!important;
    line-height:1.05!important;
    white-space:normal!important;
  }
  body.pipeline-aura-active .pipeline-kpi-value {
    margin:0!important;
    font-size:19px!important;
    line-height:1!important;
  }
  body.pipeline-aura-active .pipeline-kpi-detail {
    display:block!important;
    margin-top:3px!important;
    overflow:hidden!important;
    font-size:7px!important;
    line-height:1.05!important;
    text-overflow:ellipsis!important;
    white-space:nowrap!important;
  }

  [data-pipeline-owner-host] {
    display:flex!important;
    min-width:0;
    border-left:1px solid var(--aura-border);
  }
  .pipeline-owner-card {
    display:flex;
    width:100%;
    min-width:0;
    align-items:center;
    gap:7px;
    padding:8px;
    background:color-mix(in srgb,var(--aura-surface-2) 72%,transparent);
  }
  .pipeline-owner-avatar {
    display:flex;
    width:32px;
    height:32px;
    flex:0 0 32px;
    align-items:center;
    justify-content:center;
    border:1px solid color-mix(in srgb,#ef2d34 38%,var(--aura-border));
    border-radius:10px;
    background:color-mix(in srgb,#ef2d34 13%,var(--aura-surface));
    color:#ff6b70;
    font-size:10px;
    font-weight:950;
    letter-spacing:.02em;
  }
  .pipeline-owner-copy { display:grid; min-width:0; line-height:1; }
  .pipeline-owner-copy small { color:var(--aura-muted); font-size:6px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; }
  .pipeline-owner-copy strong { margin-top:3px; overflow:hidden; color:var(--aura-text); font-size:9px; font-weight:950; text-overflow:ellipsis; white-space:nowrap; }
  .pipeline-owner-copy em { margin-top:3px; overflow:hidden; color:var(--aura-muted); font-size:7px; font-style:normal; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }

  body.pipeline-aura-active .pipeline-customize-trigger {
    display:flex!important;
    width:auto!important;
    min-width:0!important;
    min-height:72px!important;
    height:auto!important;
    flex:initial!important;
    padding:8px 10px!important;
    border-left:1px solid var(--aura-border)!important;
    border-radius:0!important;
    visibility:visible!important;
    opacity:1!important;
    overflow:visible!important;
  }
  body.pipeline-aura-active .pipeline-customize-trigger svg {
    width:18px!important;
    height:18px!important;
    flex:0 0 18px!important;
  }
  body.pipeline-aura-active .pipeline-customize-trigger > span { display:grid!important; min-width:0!important; }
  body.pipeline-aura-active .pipeline-customize-trigger strong { display:block!important; font-size:9px!important; line-height:1.05!important; white-space:normal!important; }
  body.pipeline-aura-active .pipeline-customize-trigger small { display:block!important; margin-top:3px!important; font-size:7px!important; line-height:1.05!important; white-space:normal!important; }
  body.pipeline-aura-active .pipeline-view-toggle {
    width:auto!important;
    min-width:0!important;
    min-height:72px!important;
    padding:7px!important;
  }

  @media (max-width:1180px) {
    .aura-responsible-filter { min-width:135px; max-width:165px; }
    body.pipeline-aura-active .pipeline-kpi-strip {
      grid-template-columns:repeat(6,minmax(82px,1fr)) minmax(112px,.95fr) minmax(108px,.88fr) minmax(128px,1fr)!important;
      min-width:920px!important;
    }
  }
  @media (max-width:1023px) {
    body.pipeline-aura-active .pipeline-aura-canvas.pipeline-tight-canvas { padding:86px 8px 0!important; }
  }
  @media (max-width:760px) {
    .aura-responsible-filter { min-width:118px; max-width:145px; height:38px; padding:0 8px; }
    .aura-responsible-filter select { font-size:9px; }
    body.pipeline-aura-active .pipeline-aura-canvas.pipeline-tight-canvas { padding:78px 6px 0!important; }
    body.pipeline-aura-active .pipeline-kpi-strip { min-width:900px!important; }
  }
`;
