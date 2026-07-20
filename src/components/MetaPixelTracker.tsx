'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
    autoControleMetaPixel?: {
      track: (eventName: string, params?: Record<string, any>) => void;
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

export function MetaPixelTracker() {
  useEffect(() => {
    let mounted = true;

    async function loadPixel() {
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

        const enabledEvents = config.events || {};

        window.autoControleMetaPixel = {
          active: true,
          pixelId: pixelIds[0],
          pixelIds,
          track(eventName: string, params: Record<string, any> = {}) {
            const eventKey = eventKeyByName[eventName] || eventName;

            if (enabledEvents[eventKey] === false) return;
            if (!window.fbq) return;

            if (standardEvents.has(eventName)) {
              window.fbq('track', eventName, params);
              return;
            }

            window.fbq('trackCustom', eventName, params);
          }
        };

        window.autoControleMetaPixel.track('PageView', {
          source: 'auto_controle_landing',
          pixel_count: pixelIds.length
        });
      } catch {
        window.autoControleMetaPixel = {
          active: false,
          pixelIds: [],
          track() {}
        };
      }
    }

    loadPixel();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
