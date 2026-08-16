'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

function isStoreRoute(pathname: string) {
  return /^\/loja\/[^/]+(?:\/|$)/.test(pathname);
}

export function StoreAiIdentityBoundary() {
  const pathname = usePathname() || '';

  useEffect(() => {
    if (!isStoreRoute(pathname)) return;

    const applyIdentityBoundary = () => {
      document.querySelectorAll<HTMLElement>('.aura-profile').forEach((profile) => {
        const strong = profile.querySelector('strong');
        const small = profile.querySelector('small');
        if (strong) strong.textContent = 'AUTOCAR';
        if (small) small.textContent = 'Assistente comercial';
        profile.removeAttribute('aria-haspopup');
      });

      document.querySelectorAll<HTMLElement>('.aura-assistant').forEach((button) => {
        button.textContent = 'AUTOCAR';
        button.setAttribute('aria-label', 'AUTOCAR');
      });

      document.querySelectorAll<HTMLElement>('.aura-panel').forEach((panel) => {
        const eyebrow = panel.querySelector('p');
        const title = panel.querySelector('h3');
        const description = panel.querySelector('small');
        if (eyebrow) eyebrow.textContent = 'AUTOCAR';
        if (title) title.textContent = 'Assistente comercial';
        if (description) description.textContent = 'A AUTOCAR apoia o atendimento comercial da loja conforme as permissões e o modo definidos pelo Master.';
      });
    };

    applyIdentityBoundary();
    const observer = new MutationObserver(applyIdentityBoundary);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
