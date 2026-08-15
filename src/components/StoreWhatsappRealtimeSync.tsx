'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const WHATSAPP_STORE_PATH = /^\/loja\/([^/]+)\/whatsapp\/?$/;
const FALLBACK_INTERVAL_MS = 5_000;
const REALTIME_DEBOUNCE_MS = 250;
const CONNECTION_LABELS = new Set([
  'Evolution conectada',
  'Aguardando QR Code',
  'Evolution conectando',
  'Evolution desconectada',
  'WhatsApp ativo',
  'WhatsApp desconectado'
]);

function findInboxSummary() {
  return document.querySelector<HTMLElement>('[aria-label="Resumo do Inbox WhatsApp"]');
}

function findInboxRefreshButton() {
  const summary = findInboxSummary();
  if (!summary) return null;

  return Array.from(summary.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes('Atualizar')
  ) || null;
}

function clickInboxRefreshButton() {
  const refreshButton = findInboxRefreshButton();
  if (!refreshButton || refreshButton.disabled) return false;
  refreshButton.click();
  return true;
}

function findConnectionBadge() {
  return Array.from(document.querySelectorAll<HTMLSpanElement>('span')).find((span) =>
    CONNECTION_LABELS.has((span.textContent || '').trim())
  ) || null;
}

function ensureCompactRefreshButton(connectionBadge: HTMLSpanElement) {
  let compactButton = connectionBadge.querySelector<HTMLButtonElement>('[data-whatsapp-inbox-refresh-compact="true"]');
  if (compactButton) return compactButton;

  compactButton = document.createElement('button');
  compactButton.type = 'button';
  compactButton.dataset.whatsappInboxRefreshCompact = 'true';
  compactButton.setAttribute('aria-label', 'Atualizar conversas');
  compactButton.setAttribute('title', 'Atualizar conversas');
  compactButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg>';
  compactButton.style.position = 'absolute';
  compactButton.style.left = '44px';
  compactButton.style.top = '0';
  compactButton.style.display = 'inline-flex';
  compactButton.style.width = '36px';
  compactButton.style.height = '36px';
  compactButton.style.alignItems = 'center';
  compactButton.style.justifyContent = 'center';
  compactButton.style.border = '0';
  compactButton.style.borderRadius = '9999px';
  compactButton.style.background = '#dc2626';
  compactButton.style.color = '#ffffff';
  compactButton.style.cursor = 'pointer';
  compactButton.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.18)';
  compactButton.style.zIndex = '2';
  compactButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    clickInboxRefreshButton();
  });
  connectionBadge.appendChild(compactButton);
  return compactButton;
}

function applyCompactInboxLayout() {
  const summary = findInboxSummary();
  if (summary) summary.style.setProperty('display', 'none', 'important');

  const premiumPage = document.querySelector<HTMLElement>('main.premium-page');
  const canvas = document.querySelector<HTMLElement>('.premium-canvas');
  const inboxSection = canvas?.querySelector<HTMLElement>(':scope > section.relative') || null;
  const inboxGrid = inboxSection?.firstElementChild instanceof HTMLElement ? inboxSection.firstElementChild : null;

  premiumPage?.style.setProperty('padding-top', '4px', 'important');
  canvas?.style.setProperty('padding-top', '4px', 'important');
  inboxSection?.style.setProperty('margin-top', '0px', 'important');

  if (inboxGrid) {
    if (window.innerWidth >= 1280 && inboxSection) {
      const availableHeight = Math.max(520, window.innerHeight - inboxSection.getBoundingClientRect().top - 12);
      inboxGrid.style.setProperty('height', `${availableHeight}px`, 'important');
    } else {
      inboxGrid.style.removeProperty('height');
    }
  }

  const connectionBadge = findConnectionBadge();
  if (!connectionBadge) return;

  const connectionLabel = (connectionBadge.textContent || '').trim();
  connectionBadge.dataset.whatsappConnectionCompact = 'true';
  connectionBadge.setAttribute('aria-label', connectionLabel);
  connectionBadge.setAttribute('title', connectionLabel);
  connectionBadge.style.setProperty('position', 'relative');
  connectionBadge.style.setProperty('width', '36px');
  connectionBadge.style.setProperty('height', '36px');
  connectionBadge.style.setProperty('padding', '0');
  connectionBadge.style.setProperty('margin-right', '44px');
  connectionBadge.style.setProperty('justify-content', 'center');
  connectionBadge.style.setProperty('border-radius', '9999px');
  connectionBadge.style.setProperty('font-size', '0');
  connectionBadge.style.setProperty('overflow', 'visible');

  const statusIcon = connectionBadge.querySelector<SVGElement>('svg');
  if (statusIcon) {
    statusIcon.style.width = '16px';
    statusIcon.style.height = '16px';
  }

  ensureCompactRefreshButton(connectionBadge);
}

function cleanupCompactInboxLayout() {
  const summary = findInboxSummary();
  summary?.style.removeProperty('display');

  const premiumPage = document.querySelector<HTMLElement>('main.premium-page');
  const canvas = document.querySelector<HTMLElement>('.premium-canvas');
  const inboxSection = canvas?.querySelector<HTMLElement>(':scope > section.relative') || null;
  const inboxGrid = inboxSection?.firstElementChild instanceof HTMLElement ? inboxSection.firstElementChild : null;

  premiumPage?.style.removeProperty('padding-top');
  canvas?.style.removeProperty('padding-top');
  inboxSection?.style.removeProperty('margin-top');
  inboxGrid?.style.removeProperty('height');

  document.querySelectorAll<HTMLElement>('[data-whatsapp-inbox-refresh-compact="true"]').forEach((element) => element.remove());
  document.querySelectorAll<HTMLSpanElement>('[data-whatsapp-connection-compact="true"]').forEach((badge) => {
    badge.removeAttribute('data-whatsapp-connection-compact');
    badge.removeAttribute('aria-label');
    badge.removeAttribute('title');
    ['position', 'width', 'height', 'padding', 'margin-right', 'justify-content', 'border-radius', 'font-size', 'overflow'].forEach((property) =>
      badge.style.removeProperty(property)
    );
    const statusIcon = badge.querySelector<SVGElement>('svg');
    statusIcon?.style.removeProperty('width');
    statusIcon?.style.removeProperty('height');
  });
}

export function StoreWhatsappRealtimeSync() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const match = pathname.match(WHATSAPP_STORE_PATH);
    if (!match) return;

    const slug = decodeURIComponent(match[1]);
    let active = true;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    let layoutFrame: number | null = null;

    const syncLayout = () => {
      if (!active || layoutFrame !== null) return;
      layoutFrame = window.requestAnimationFrame(() => {
        layoutFrame = null;
        applyCompactInboxLayout();
      });
    };

    syncLayout();
    const layoutObserver = new MutationObserver(syncLayout);
    layoutObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', syncLayout);

    const queueRefresh = () => {
      if (!active) return;
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        if (!clickInboxRefreshButton() && active) {
          refreshTimerRef.current = window.setTimeout(() => {
            refreshTimerRef.current = null;
            clickInboxRefreshButton();
          }, 750);
        }
      }, REALTIME_DEBOUNCE_MS);
    };

    const fallbackInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') queueRefresh();
    }, FALLBACK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') queueRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    async function connectRealtime() {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token || !active) return;

        await supabase.realtime.setAuth(token);
        if (!active) return;

        const response = await fetch(`/api/store-whatsapp?slug=${encodeURIComponent(slug)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        if (!response.ok || !active) return;

        const result = await response.json();
        const storeId = String(result?.store?.id || '').trim();
        if (!storeId || !active) return;

        realtimeChannel = supabase
          .channel(`store-whatsapp-inbox-${storeId}-${Date.now()}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'whatsapp_conversations',
              filter: `store_id=eq.${storeId}`
            },
            queueRefresh
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'whatsapp_messages',
              filter: `store_id=eq.${storeId}`
            },
            queueRefresh
          )
          .subscribe((status) => {
            if (!active) return;
            if (status === 'SUBSCRIBED') queueRefresh();
          });
      } catch (error) {
        console.warn('[WhatsApp realtime] Realtime indisponível; mantendo sincronização periódica.', error);
      }
    }

    void connectRealtime();

    return () => {
      active = false;
      layoutObserver.disconnect();
      window.removeEventListener('resize', syncLayout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(fallbackInterval);
      if (layoutFrame !== null) window.cancelAnimationFrame(layoutFrame);
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      cleanupCompactInboxLayout();
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
    };
  }, [pathname, supabase]);

  return null;
}
