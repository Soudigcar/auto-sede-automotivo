'use client';

import { usePathname } from 'next/navigation';

function isStorePipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

export function StorePipelineSidebarToggle() {
  const pathname = usePathname() || '';

  if (!isStorePipeline(pathname)) return null;

  return <style>{styles}</style>;
}

const styles = `
  @media (min-width: 1024px) {
    body.pipeline-aura-active .aura-topbar,
    body.pipeline-aura-active .aura-bottom-dock {
      transition: left .2s ease;
    }

    body.pipeline-aura-active:has(button[aria-label='Recolher menu']) .aura-topbar {
      left: 236px !important;
    }

    body.pipeline-aura-active:has(button[aria-label='Recolher menu']) .aura-bottom-dock {
      left: 252px !important;
    }

    body.pipeline-aura-active:has(button[aria-label='Expandir menu']) .aura-topbar {
      left: 76px !important;
    }

    body.pipeline-aura-active:has(button[aria-label='Expandir menu']) .aura-bottom-dock {
      left: 92px !important;
    }
  }
`;
