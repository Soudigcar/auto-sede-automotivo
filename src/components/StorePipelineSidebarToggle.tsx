'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';

function isStorePipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

export function StorePipelineSidebarToggle() {
  const pathname = usePathname() || '';
  const active = isStorePipeline(pathname);
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCollapsed(window.localStorage.getItem('store-pipeline-sidebar-collapsed') === 'true');
  }, []);

  useEffect(() => {
    if (!active || !mounted) return;

    document.documentElement.dataset.pipelineSidebar = collapsed ? 'collapsed' : 'expanded';
    window.localStorage.setItem('store-pipeline-sidebar-collapsed', String(collapsed));

    return () => {
      delete document.documentElement.dataset.pipelineSidebar;
    };
  }, [active, collapsed, mounted]);

  if (!active || !mounted) return null;

  return createPortal(
    <>
      <style>{styles}</style>
      <button
        type="button"
        className="pipeline-sidebar-ear"
        onClick={() => setCollapsed((current) => !current)}
        aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        title={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </>,
    document.body
  );
}

const styles = `
  .pipeline-sidebar-ear {
    display: none;
  }

  @media (min-width: 1024px) {
    body.pipeline-aura-active .pipeline-aura-sidebar,
    body.pipeline-aura-active .pipeline-aura-portal-canvas,
    body.pipeline-aura-active .aura-topbar,
    body.pipeline-aura-active .aura-bottom-dock {
      transition: width .28s ease, flex-basis .28s ease, transform .28s ease, opacity .2s ease, left .28s ease;
    }

    .pipeline-sidebar-ear {
      position: fixed;
      top: 50%;
      z-index: 126;
      display: flex;
      width: 32px;
      height: 66px;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(148, 163, 184, .28);
      border-left: 0;
      border-radius: 0 16px 16px 0;
      background: #111827;
      color: #f8fafc;
      box-shadow: 10px 0 28px rgba(0, 0, 0, .28);
      transform: translateY(-50%);
      transition: left .28s ease, background .18s ease, box-shadow .18s ease;
    }

    .pipeline-sidebar-ear:hover {
      background: #dc2626;
      box-shadow: 10px 0 30px rgba(220, 38, 38, .28);
    }

    :root[data-pipeline-theme='light'] .pipeline-sidebar-ear {
      border-color: rgba(15, 23, 42, .18);
      background: #ffffff;
      color: #111827;
      box-shadow: 10px 0 28px rgba(15, 23, 42, .14);
    }

    :root[data-pipeline-theme='light'] .pipeline-sidebar-ear:hover {
      background: #dc2626;
      color: #ffffff;
    }

    :root[data-pipeline-sidebar='expanded'] .pipeline-sidebar-ear {
      left: calc(18rem - 1px);
    }

    :root[data-pipeline-sidebar='collapsed'] .pipeline-sidebar-ear {
      left: 0;
    }

    :root[data-pipeline-sidebar='expanded'] body.pipeline-aura-active .pipeline-aura-sidebar {
      width: 18rem !important;
      min-width: 18rem !important;
      flex-basis: 18rem !important;
      opacity: 1 !important;
      transform: translateX(0) !important;
      pointer-events: auto !important;
    }

    :root[data-pipeline-sidebar='collapsed'] body.pipeline-aura-active .pipeline-aura-sidebar {
      width: 0 !important;
      min-width: 0 !important;
      flex-basis: 0 !important;
      overflow: hidden !important;
      border-right-width: 0 !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      opacity: 0 !important;
      transform: translateX(-100%) !important;
      pointer-events: none !important;
    }

    :root[data-pipeline-sidebar='expanded'] body.pipeline-aura-active .aura-topbar {
      left: 18rem !important;
    }

    :root[data-pipeline-sidebar='collapsed'] body.pipeline-aura-active .aura-topbar {
      left: 0 !important;
    }

    :root[data-pipeline-sidebar='expanded'] body.pipeline-aura-active .aura-bottom-dock {
      left: calc(18rem + 16px) !important;
    }

    :root[data-pipeline-sidebar='collapsed'] body.pipeline-aura-active .aura-bottom-dock {
      left: 16px !important;
    }

    :root[data-pipeline-sidebar='collapsed'] body.pipeline-aura-active .pipeline-aura-portal-canvas {
      width: 100% !important;
      max-width: 100% !important;
      flex-basis: 100% !important;
    }
  }
`;