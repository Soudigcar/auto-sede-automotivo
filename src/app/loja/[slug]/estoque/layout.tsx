'use client';

import { useEffect, type ReactNode } from 'react';

const STORAGE_KEY = 'auto-controle:reopen-stock-review';

function normalizeUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    url.hash = '';
    return decodeURIComponent(url.toString()).replace(/\/$/, '');
  } catch {
    return decodeURIComponent(String(value || '')).replace(/\/$/, '');
  }
}

function findReviewButton(vehicleUrl: string) {
  const target = normalizeUrl(vehicleUrl);
  const articles = Array.from(document.querySelectorAll('article'));

  for (const article of articles) {
    const links = Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href]'));
    const belongsToVehicle = links.some((link) => normalizeUrl(link.href) === target);
    if (!belongsToVehicle) continue;

    return Array.from(article.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      /conferir\s+e\s+editar/i.test(button.textContent || '')
    ) || null;
  }

  return null;
}

export default function StockReviewLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window) as typeof window.fetch;

    const patchedFetch = async (input: any, init?: any): Promise<Response> => {
      let parsedBody: any = null;
      try {
        if (typeof init?.body === 'string') parsedBody = JSON.parse(init.body);
      } catch {
        parsedBody = null;
      }

      const response = await originalFetch(input, init);
      const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url || '';
      const isManualReimport = requestUrl.includes('/api/store-stock')
        && ['import-data', 'retry-import'].includes(String(parsedBody?.action || ''))
        && parsedBody?.automatic !== true;

      if (response.ok && isManualReimport && parsedBody?.vehicle_url) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          vehicleUrl: String(parsedBody.vehicle_url),
          createdAt: Date.now()
        }));
        window.setTimeout(() => window.location.reload(), 120);
      }

      return response;
    };

    window.fetch = patchedFetch as typeof window.fetch;

    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return () => { window.fetch = originalFetch; };

    let payload: { vehicleUrl?: string; createdAt?: number } = {};
    try {
      payload = JSON.parse(stored);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }

    if (!payload.vehicleUrl || !payload.createdAt || Date.now() - payload.createdAt > 60_000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return () => { window.fetch = originalFetch; };
    }

    let opened = false;
    const tryOpen = () => {
      if (opened) return;
      const button = findReviewButton(String(payload.vehicleUrl));
      if (!button || button.disabled) return;
      opened = true;
      sessionStorage.removeItem(STORAGE_KEY);
      button.click();
    };

    const observer = new MutationObserver(tryOpen);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const timer = window.setInterval(tryOpen, 250);
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      window.clearInterval(timer);
      sessionStorage.removeItem(STORAGE_KEY);
    }, 15_000);
    tryOpen();

    return () => {
      window.fetch = originalFetch;
      observer.disconnect();
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, []);

  return children;
}
