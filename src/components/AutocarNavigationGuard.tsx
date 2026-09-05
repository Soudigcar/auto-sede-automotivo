'use client';

import { useEffect } from 'react';

function isAutocarPortalHref(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && /^\/loja\/[^/]+\/autocar\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function AutocarNavigationGuard() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;

      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.target && target.target !== '_self') return;
      if (target.hasAttribute('download')) return;
      if (!isAutocarPortalHref(target.href)) return;

      event.preventDefault();
      window.location.assign(target.href);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  return null;
}
