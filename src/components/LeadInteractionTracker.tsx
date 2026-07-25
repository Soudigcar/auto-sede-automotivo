'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalized(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function buttonWithText(text: string) {
  return Array.from(document.querySelectorAll('button')).find((button) =>
    normalized(button.textContent).includes(normalized(text))
  ) as HTMLButtonElement | undefined;
}

export function LeadInteractionTracker() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const leadsRef = useRef<any[]>([]);
  const viewedSentRef = useRef(new Set<string>());

  useEffect(() => {
    const route = pathname.match(/^\/loja\/([^/]+)\/pipeline\/?$/i);

    if (!route) return;

    const slug = decodeURIComponent(route[1]);
    let disposed = false;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadLeadIndex(storeId: string) {
      const { data } = await supabase
        .from('leads')
        .select('id, customer_name, customer_phone, interested_vehicle, assigned_store_id')
        .eq('assigned_store_id', storeId);

      if (!disposed) leadsRef.current = data || [];
    }

    function resolveLead(card: Element) {
      const name = normalized(card.querySelector('h3')?.textContent);
      const paragraphs = Array.from(card.querySelectorAll('p')).map((item) => normalized(item.textContent));
      const vehicle = paragraphs.find(Boolean) || '';
      const phoneText = Array.from(card.querySelectorAll('span'))
        .map((item) => String(item.textContent || '').trim())
        .find((item) => item.includes('☎'));
      const phone = digits(phoneText);

      const named = leadsRef.current.filter((lead) => normalized(lead.customer_name) === name);

      if (phone) {
        const byPhone = named.find((lead) => digits(lead.customer_phone) === phone);
        if (byPhone) return byPhone;
      }

      if (vehicle) {
        const byVehicle = named.find((lead) => normalized(lead.interested_vehicle) === vehicle);
        if (byVehicle) return byVehicle;
      }

      return named[0] || null;
    }

    async function registerActivity(lead: any, activityType: 'lead_viewed' | 'whatsapp_clicked') {
      if (!lead?.id) return;

      const dedupeKey = `${lead.id}:${activityType}`;

      if (activityType === 'lead_viewed' && viewedSentRef.current.has(dedupeKey)) return;
      if (activityType === 'lead_viewed') viewedSentRef.current.add(dedupeKey);

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token || '';

        if (!token) throw new Error('Sessão não encontrada.');

        const response = await fetch('/api/store/lead-activity', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            lead_id: lead.id,
            activity_type: activityType,
            metadata: {
              pathname,
              interaction_source: 'pipeline_card'
            }
          })
        });

        if (!response.ok) throw new Error('Não foi possível registrar atividade.');
      } catch {
        if (activityType === 'lead_viewed') viewedSentRef.current.delete(dedupeKey);
      }
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const card = target.closest('[role="button"][draggable="true"]');
      if (!card) return;

      const lead = resolveLead(card);
      if (!lead) return;

      void registerActivity(lead, 'lead_viewed');

      const clickedButton = target.closest('button');
      const label = normalized(clickedButton?.textContent);

      if (label.includes('whatsapp') || label === 'atender') {
        void registerActivity(lead, 'whatsapp_clicked');
      }
    }

    async function bootstrap() {
      const context = await getStorePortalContext(slug);

      if (disposed || context.status !== 'ok') return;

      const storeId = context.store.id;
      await loadLeadIndex(storeId);

      realtimeChannel = supabase
        .channel(`store-lead-tracker-${storeId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'leads',
            filter: `assigned_store_id=eq.${storeId}`
          },
          () => {
            if (refreshTimer) clearTimeout(refreshTimer);

            refreshTimer = setTimeout(() => {
              void loadLeadIndex(storeId);
              buttonWithText('Atualizar pipeline')?.click();
            }, 250);
          }
        )
        .subscribe();
    }

    document.addEventListener('click', handleClick, true);
    void bootstrap();

    return () => {
      disposed = true;
      document.removeEventListener('click', handleClick, true);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
    };
  }, [pathname, supabase]);

  return null;
}
