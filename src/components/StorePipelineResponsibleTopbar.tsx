'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserRound } from 'lucide-react';
import { usePathname } from 'next/navigation';

type TeamMember = {
  id: string;
  full_name: string;
  role: string;
  role_label: string;
};

function isStorePipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

export function StorePipelineResponsibleTopbar() {
  const pathname = usePathname() || '';
  const active = isStorePipeline(pathname);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState('all');

  useEffect(() => {
    if (!active) return;
    let raf = 0;

    const attach = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const actions = document.querySelector<HTMLElement>('.aura-top-actions');
        const bell = actions?.querySelector<HTMLElement>('button[aria-label="Notificações"]');
        if (!actions || !bell) return;

        let target = actions.querySelector<HTMLElement>('[data-pipeline-responsible-host]');
        if (!target) {
          target = document.createElement('span');
          target.dataset.pipelineResponsibleHost = 'true';
          bell.insertAdjacentElement('afterend', target);
        }
        setHost(target);
      });
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      document.querySelector('[data-pipeline-responsible-host]')?.remove();
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

  if (!active || !host) return null;

  return createPortal(
    <>
      <style>{styles}</style>
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
      </label>
    </>,
    host
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
  @media (max-width:1180px) {
    .aura-responsible-filter { min-width:135px; max-width:165px; }
  }
  @media (max-width:760px) {
    .aura-responsible-filter { min-width:118px; max-width:145px; height:38px; padding:0 8px; }
    .aura-responsible-filter select { font-size:9px; }
  }
`;
