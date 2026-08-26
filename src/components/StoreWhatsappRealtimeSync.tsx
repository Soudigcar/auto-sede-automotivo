'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useStorePortal } from '@/components/StorePortalShell';
import { canSubscribeStoreWideWhatsappRealtime } from '@/lib/storeWhatsappRealtimeAccess';

const WHATSAPP_STORE_PATH = /^\/loja\/([^/]+)\/whatsapp\/?$/;
const FALLBACK_INTERVAL_MS = 30_000;
const REALTIME_DEBOUNCE_MS = 250;
const REFRESH_EVENT = 'auto-controle:whatsapp-refresh';

function refreshDesktopInbox() {
  if (window.innerWidth < 1280) return;
  const summary = document.querySelector<HTMLElement>('[aria-label="Resumo do Inbox WhatsApp"]');
  if (!summary) return;
  const refreshButton = summary.querySelector<HTMLButtonElement>('button[aria-label="Atualizar conversas"]');
  if (refreshButton && !refreshButton.disabled) refreshButton.click();
}

export function StoreWhatsappRealtimeSync() {
  const pathname = usePathname();
  const portal = useStorePortal();
  const supabase = useMemo(() => createClient(), []);
  const refreshTimerRef = useRef<number | null>(null);
  const profileRole = portal.profile.role;
  const storeId = portal.store.id;

  useEffect(() => {
    const match = pathname.match(WHATSAPP_STORE_PATH);
    if (!match) return;

    const slug = decodeURIComponent(match[1]);
    let active = true;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    const queueRefresh = (reason: 'realtime' | 'fallback' | 'visible') => {
      if (!active) return;
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: { slug, reason } }));
        refreshDesktopInbox();
      }, REALTIME_DEBOUNCE_MS);
    };

    const fallbackInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') queueRefresh('fallback');
    }, FALLBACK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') queueRefresh('visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    async function connectRealtime() {
      try {
        if (!canSubscribeStoreWideWhatsappRealtime(profileRole)) return;

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token || !active) return;

        await supabase.realtime.setAuth(token);
        if (!active) return;
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
            () => queueRefresh('realtime')
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'whatsapp_messages',
              filter: `store_id=eq.${storeId}`
            },
            () => queueRefresh('realtime')
          )
          .subscribe((status) => {
            if (!active) return;
            if (status === 'SUBSCRIBED') queueRefresh('realtime');
          });
      } catch (error) {
        console.warn('[WhatsApp realtime] Realtime indisponível; mantendo sincronização de contingência.', error);
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
  }, [pathname, profileRole, storeId, supabase]);

  return null;
}
