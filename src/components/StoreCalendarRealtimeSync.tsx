'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

export function StoreCalendarRealtimeSync() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const route = pathname.match(/^\/loja\/([^/]+)\/calendario\/?$/i);
    if (!route) return;

    const slug = decodeURIComponent(route[1]);
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function initialize() {
      const context = await getStorePortalContext(slug);
      if (disposed || context.status !== 'ok') return;

      const storeId = context.store.id;
      const scheduleReload = () => {
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);

        reloadTimerRef.current = setTimeout(() => {
          const lastReloadAt = Number(sessionStorage.getItem('calendar-realtime-reload-at') || 0);
          const now = Date.now();
          if (now - lastReloadAt < 1500) return;

          sessionStorage.setItem('calendar-realtime-reload-at', String(now));
          window.location.reload();
        }, 450);
      };

      channel = supabase
        .channel(`store-calendar-realtime-${storeId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'store_calendar_tasks',
            filter: `store_id=eq.${storeId}`
          },
          scheduleReload
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'leads',
            filter: `assigned_store_id=eq.${storeId}`
          },
          scheduleReload
        )
        .subscribe();
    }

    void initialize();

    return () => {
      disposed = true;
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [pathname, supabase]);

  return null;
}
