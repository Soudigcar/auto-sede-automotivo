'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const WHATSAPP_STORE_PATH = /^\/loja\/([^/]+)\/whatsapp\/?$/;
const FALLBACK_INTERVAL_MS = 5_000;
const REALTIME_DEBOUNCE_MS = 250;

function clickInboxRefreshButton() {
  const summary = document.querySelector<HTMLElement>('[aria-label="Resumo do Inbox WhatsApp"]');
  if (!summary) return false;

  const refreshButton = Array.from(summary.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes('Atualizar')
  );

  if (!refreshButton || refreshButton.disabled) return false;
  refreshButton.click();
  return true;
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(fallbackInterval);
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
    };
  }, [pathname, supabase]);

  return null;
}
