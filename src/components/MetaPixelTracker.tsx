'use client';

import { useEffect } from 'react';
import { PRIVACY_CONSENT_EVENT, hasAdvertisingConsent } from '@/lib/privacyConsent';

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
    autoControleMetaPixel?: {
      track: (eventName: string, params?: Record<string, any>, options?: { eventId?: string }) => void;
      pixelId?: string;
      pixelIds?: string[];
      active?: boolean;
    };
  }
}

const eventKeyByName: Record<string, string> = {
  PageView: 'page_view',
  ViewContent: 'view_content',
  SimulatorOpened: 'simulator_opened',
  SimulationStarted: 'simulation_started',
  Lead: 'lead',
  Contact: 'contact'
};

const standardEvents = new Set(['PageView', 'ViewContent', 'Lead', 'Contact']);

export type MetaPixelContext = {
  campaignId?: string;
  campaignName?: string;
  campaignSlug?: string;
  eventId?: string;
  eventName?: string;
};

function trackingContext(context: MetaPixelContext) {
  return {
    campaign_id: context.campaignId || undefined,
    campaign_name: context.campaignName || undefined,
    campaign_slug: context.campaignSlug || undefined,
    event_id: context.eventId || undefined,
    event_name: context.eventName || undefined
  };
}

function installFacebookPixel(pixelIds: string[]) {
  if (typeof window === 'undefined') return;

  const uniquePixelIds = Array.from(new Set(pixelIds.filter(Boolean)));

  if (!uniquePixelIds.length) return;

  if (!window.fbq) {
    const win = window as any;

    const fbq = function (...args: any[]) {
      if (fbq.callMethod) {
        fbq.callMethod.apply(fbq, args);
      } else {
        fbq.queue.push(args);
      }
    } as any;

    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];

    win.fbq = fbq;
    win._fbq = fbq;
  }

  if (!document.getElementById('facebook-pixel-script')) {
    const script = document.createElement('script');
    script.id = 'facebook-pixel-script';
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }

  uniquePixelIds.forEach((pixelId) => {
    window.fbq('init', pixelId);
  });
}

export function MetaPixelTracker({ context = {} }: { context?: MetaPixelContext }) {
  useEffect(() => {
    const stableContext = trackingContext(context);
    let mounted = true;
    let loading = false;

    async function loadPixel() {
      if (!hasAdvertisingConsent() || loading) return;
      loading = true;
      try {
        const response = await fetch('/api/public/integrations/meta-pixel', {
          cache: 'no-store'
        });

        const config = await response.json();

        const pixelIds = Array.isArray(config?.pixel_ids)
          ? config.pixel_ids.filter(Boolean)
          : config?.pixel_id
            ? [config.pixel_id]
            : [];

        if (!mounted || !config?.active || !pixelIds.length) return;

        installFacebookPixel(pixelIds);
        window.fbq?.('consent', 'grant');

        const enabledEvents = config.events || {};

        window.autoControleMetaPixel = {
          active: true,
          pixelId: pixelIds[0],
          pixelIds,
          track(eventName: string, params: Record<string, any> = {}, options: { eventId?: string } = {}) {
            const eventKey = eventKeyByName[eventName] || eventName;

            if (enabledEvents[eventKey] === false) return;
            if (!window.fbq) return;

            const eventParams = { ...stableContext, ...params };
            const eventOptions = options.eventId ? { eventID: options.eventId } : undefined;

            if (standardEvents.has(eventName)) {
              window.fbq('track', eventName, eventParams, eventOptions);
              return;
            }

            window.fbq('trackCustom', eventName, eventParams, eventOptions);
          }
        };

        window.autoControleMetaPixel.track('PageView', {
          source: 'auto_controle_landing',
          pixel_count: pixelIds.length
        });
        window.autoControleMetaPixel.track('ViewContent', {
          content_type: 'event_landing',
          content_name: context.campaignName || context.eventName || 'Landing de evento'
        });
      } catch {
        window.autoControleMetaPixel = {
          active: false,
          pixelIds: [],
          track() {}
        };
      } finally {
        loading = false;
      }
    }

    const onConsentChange = () => {
      if (hasAdvertisingConsent()) {
        void loadPixel();
        return;
      }
      window.fbq?.('consent', 'revoke');
      window.autoControleMetaPixel = { active: false, pixelIds: [], track() {} };
    };

    void loadPixel();
    window.addEventListener(PRIVACY_CONSENT_EVENT, onConsentChange);

    return () => {
      mounted = false;
      window.removeEventListener(PRIVACY_CONSENT_EVENT, onConsentChange);
    };
  }, [context.campaignId, context.campaignName, context.campaignSlug, context.eventId, context.eventName]);

  return null;
}
