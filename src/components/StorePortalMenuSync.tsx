'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getStorePortalContext } from '@/lib/storePortalClient';

const menuItems = [
  { label: 'Dashboard', segment: '', icon: '▣' },
  { label: 'Minha Loja', segment: 'minha-loja', icon: '▤' },
  { label: 'Pipeline', segment: 'pipeline', icon: '▥' },
  { label: 'WhatsApp CRM', segment: 'whatsapp', icon: '●' },
  { label: 'Calendário', segment: 'calendario', icon: '◷' },
  { label: 'Estoque', segment: 'estoque', icon: '▦' },
  { label: 'Operação', segment: 'operacao', icon: '▧' },
  { label: 'Equipe', segment: 'equipe', icon: '◎' }
];

const roleLabels: Record<string, string> = {
  master: 'Master',
  store: 'Gestor da loja',
  pre_sales: 'SDR / Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospectador'
};

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

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function buildIdentityHtml(profile: any, store: any) {
  const userName = String(profile?.full_name || profile?.email || 'Usuário').trim();
  const roleLabel = roleLabels[String(profile?.role || '')] || String(profile?.role || 'Usuário');
  const storeName = String(store?.store_name || 'Loja vinculada').trim();

  return `
    <div class="mb-5 rounded-2xl border border-white/10 bg-white/[0.05] p-4" data-store-user-identity="true">
      <div class="flex items-center gap-3">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600/20 text-sm font-black text-red-400">
          ${escapeHtml(initials(userName))}
        </div>
        <div class="min-w-0">
          <p class="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Logado como</p>
          <p class="mt-1 truncate text-sm font-black text-white">${escapeHtml(userName)}</p>
          <p class="mt-0.5 truncate text-[11px] font-bold text-red-400">${escapeHtml(roleLabel)}</p>
        </div>
      </div>
      <div class="mt-3 border-t border-white/10 pt-3">
        <p class="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">Loja</p>
        <p class="mt-1 truncate text-xs font-bold text-zinc-300">${escapeHtml(storeName)}</p>
      </div>
    </div>
  `;
}

function buildMenuHtml(slug: string, currentSegment: string, profile: any, store: any) {
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
    ${buildIdentityHtml(profile, store)}
    ${menuHtml}
    <a href="/logout" class="${buildClass(false)}" data-store-menu-sync="true">
      <span class="flex h-[18px] w-[18px] items-center justify-center text-[13px] font-black">↩</span>
      <span>Sair</span>
    </a>
  `;
}

function ensureMobileIdentity(profile: any, store: any) {
  const userName = String(profile?.full_name || profile?.email || 'Usuário').trim();
  const roleLabel = roleLabels[String(profile?.role || '')] || String(profile?.role || 'Usuário');
  const storeName = String(store?.store_name || 'Loja vinculada').trim();

  let element = document.querySelector<HTMLElement>('[data-store-mobile-identity="true"]');
  if (!element) {
    element = document.createElement('div');
    element.dataset.storeMobileIdentity = 'true';
    element.className = 'fixed bottom-3 left-3 right-3 z-[44] rounded-2xl border border-white/15 bg-[#071020]/95 p-3 text-white shadow-2xl backdrop-blur-lg lg:hidden';
    document.body.appendChild(element);
  }

  element.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600/20 text-xs font-black text-red-400">${escapeHtml(initials(userName))}</div>
      <div class="min-w-0 flex-1">
        <p class="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Logado como</p>
        <p class="truncate text-sm font-black text-white">${escapeHtml(userName)}</p>
        <p class="truncate text-[10px] font-bold text-red-400">${escapeHtml(roleLabel)} · ${escapeHtml(storeName)}</p>
      </div>
    </div>
  `;

  return element;
}

export function StorePortalMenuSync() {
  const pathname = usePathname() || '';

  useEffect(() => {
    const match = pathname.match(/^\/loja\/([^/]+)/);
    const slug = match?.[1];
    if (!slug) return;

    let cancelled = false;
    let attempts = 0;
    let intervalId: number | undefined;
    let mobileIdentity: HTMLElement | null = null;

    async function startSync() {
      const context = await getStorePortalContext(slug);
      if (cancelled || context.status !== 'ok' || !context.profile || !context.store) return;

      const currentSegment = getCurrentSegment(pathname, slug);
      const expectedMenuHtml = buildMenuHtml(slug, currentSegment, context.profile, context.store);
      mobileIdentity = ensureMobileIdentity(context.profile, context.store);

      function syncMenu() {
        attempts += 1;
        const nav = document.querySelector('aside nav');
        if (!nav) return false;

        const syncKey = `${slug}:${currentSegment}:${context.profile.id || context.profile.email || 'user'}`;
        if (nav.getAttribute('data-store-menu-current') !== syncKey) {
          nav.innerHTML = expectedMenuHtml;
          nav.setAttribute('data-store-menu-current', syncKey);
        }
        return true;
      }

      if (syncMenu()) return;

      intervalId = window.setInterval(() => {
        const synced = syncMenu();
        if ((synced || attempts >= 20) && intervalId) {
          window.clearInterval(intervalId);
          intervalId = undefined;
        }
      }, 150);
    }

    void startSync();

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      mobileIdentity?.remove();
    };
  }, [pathname]);

  return null;
}
