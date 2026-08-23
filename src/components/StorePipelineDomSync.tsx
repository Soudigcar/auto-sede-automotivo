'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

function isPipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

export function StorePipelineDomSync() {
  const pathname = usePathname() || '';

  useEffect(() => {
    if (!isPipeline(pathname) || typeof document === 'undefined') return;

    let frame = 0;
    const notify = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('pipeline-dom-sync'));
      });
    };

    const observer = new MutationObserver(notify);
    observer.observe(document.body, { childList: true, subtree: true });
    notify();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
