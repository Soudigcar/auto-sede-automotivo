'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getStorePortalContext } from '@/lib/storePortalClient';

const menuItems = [
  { label: 'Dashboard', segment: '', icon: '▣', roles: ['master', 'store', 'pre_sales', 'prospector'] },
  { label: 'Minha Loja', segment: 'minha-loja', icon: '▤', roles: ['master', 'store'] },
  { label: 'Pipeline', segment: 'pipeline', icon: '▥', roles: ['master', 'store', 'pre_sales', 'seller', 'prospector'] },
  { label: 'WhatsApp CRM', segment: 'whatsapp', icon: '●', roles: ['master', 'store', 'pre_sales', 'seller'] },
  { label: 'Calendário', segment: 'calendario', icon: '◷', roles: ['master', 'store', 'pre_sales', 'seller'] },
  { label: 'Estoque', segment: 'estoque', icon: '▦', roles: ['master', 'store'] },
  { label: 'Operação', segment: 'operacao', icon: '▧', roles: ['master', 'store'] },
  { label: 'Equipe', segment: 'equipe', icon: '◎', roles: ['master', 'store'] }
];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildHref(slug: string, segment: string) {
  return segment ? `/loja/${slug}/${segment}` : `/loja/${slug}`;
}

function getCurrentSegment(pathname: string, slug: string) {
  const base = `/loja/${slug}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : '';
  return rest.split('/')[0] || '';
}

function buildClass(isActive: boolean) {
  return isActive
    ? 'flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold text-white shadow-lg shadow-red-600/20'
    : 'flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white';
}

function buildMenuHtml(slug: string, currentSegment: string, role: string) {
  const visibleItems = menuItems.filter((item) => item.roles.includes(role));
  const menuHtml = visibleItems
    .map((item) => {
      const href = buildHref(slug, item.segment);
      const isActive = currentSegment === item.segment;

      return `
        <a href="${escapeHtml(href)}" class="${buildClass(isActive)}" data-store-menu-sync="true">
          <span class="flex h-[18px] w-[18px] items-center justify-center text-[13px] font-black">${escapeHtml(item.icon)}</span>
          <span>${escapeHtml(item.label)}</span>
        </a>
      `;
    })
    .join('');

  return `
    ${menuHtml}
    <a href="/logout" class="${buildClass(false)}" data-store-menu-sync="true">
      <span class="flex h-[18px] w-[18px] items-center justify-center text-[13px] font-black">↩</span>
      <span>Sair</span>
    </a>
  `;
}

export function StorePortalMenuSync() {
  const pathname = usePathname() || '';

  useEffect(() => {
    const match = pathname.match(/^\/loja\/([^/]+)/);
    const slug = match?.[1];

    if (!slug) return undefined;

    let cancelled = false;
    let attempts = 0;
    let isSyncing = false;
    let intervalId: number | undefined;
    let observer: MutationObserver | undefined;

    async function initialize() {
      const context = await getStorePortalContext(slug);
      const role = context.profile?.role || '';

      if (cancelled || context.status !== 'ok' || !role) return;

      const currentSegment = getCurrentSegment(pathname, slug);
      const expectedMenuHtml = buildMenuHtml(slug, currentSegment, role);
      const syncKey = `${slug}:${currentSegment}:${role}`;

      function syncMenu() {
        if (isSyncing) return false;

        const aside = document.querySelector('aside');
        const nav = aside?.querySelector('nav');

        if (!nav) return false;

        const alreadySynced = nav.getAttribute('data-store-menu-current') === syncKey;

        if (!alreadySynced) {
          isSyncing = true;
          nav.innerHTML = expectedMenuHtml;
          nav.setAttribute('data-store-menu-current', syncKey);
          isSyncing = false;
        }

        return true;
      }

      syncMenu();

      intervalId = window.setInterval(() => {
        attempts += 1;
        const synced = syncMenu();

        if (synced && attempts > 3 && intervalId) {
          window.clearInterval(intervalId);
          intervalId = undefined;
        }

        if (attempts >= 30 && intervalId) {
          window.clearInterval(intervalId);
          intervalId = undefined;
        }
      }, 250);

      observer = new MutationObserver(() => {
        window.requestAnimationFrame(syncMenu);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    initialize().catch(() => undefined);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      if (observer) observer.disconnect();
    };
  }, [pathname]);

  return null;
}
