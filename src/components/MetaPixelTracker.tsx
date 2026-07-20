'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
    autoControleMetaPixel?: {
      track: (eventName: string, params?: Record<string, any>) => void;
      pixelId?: string;
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

function installFacebookPixel(pixelId: string) {
  if (typeof window === 'undefined') return;

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

  window.fbq('init', pixelId);
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

        if (!mounted || !config?.active || !config?.pixel_id) return;

        installFacebookPixel(config.pixel_id);

        const enabledEvents = config.events || {};

        window.autoControleMetaPixel = {
          active: true,
          pixelId: config.pixel_id,
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
          source: 'auto_controle_landing'
        });
      } catch {
        window.autoControleMetaPixel = {
          active: false,
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
