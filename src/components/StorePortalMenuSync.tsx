'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const menuItems = [
  { label: 'Dashboard', segment: '', icon: '▣' },
  { label: 'Minha Loja', segment: 'minha-loja', icon: '▤' },
  { label: 'Pipeline', segment: 'pipeline', icon: '▥' },
  { label: 'WhatsApp CRM', segment: 'whatsapp', icon: '●' },
  { label: 'Calendário', segment: 'calendario', icon: '◷' },
  { label: 'Estoque', segment: 'estoque', icon: '▦' },
  { label: 'Operação', segment: 'operacao', icon: '▧' }
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

function buildMenuHtml(slug: string, currentSegment: string) {
  const menuHtml = menuItems
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

    let attempts = 0;
    let isSyncing = false;
    let intervalId: number | undefined;
    let observer: MutationObserver | undefined;

    const currentSegment = getCurrentSegment(pathname, slug);
    const expectedMenuHtml = buildMenuHtml(slug, currentSegment);

    function syncMenu() {
      if (isSyncing) return false;

      const aside = document.querySelector('aside');
      const nav = aside?.querySelector('nav');

      if (!nav) return false;

      const alreadySynced = nav.getAttribute('data-store-menu-current') === `${slug}:${currentSegment}`;

      if (!alreadySynced) {
        isSyncing = true;
        nav.innerHTML = expectedMenuHtml;
        nav.setAttribute('data-store-menu-current', `${slug}:${currentSegment}`);
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

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      if (observer) observer.disconnect();
    };
  }, [pathname]);

  return null;
}
