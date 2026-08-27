'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';

function onlyAnonymousPwaEvents(event: BeforeSendEvent) {
  if (event.type === 'pageview') return null;

  try {
    const url = new URL(event.url, window.location.origin);
    return { ...event, url: `${url.origin}/pwa-update` };
  } catch {
    return { ...event, url: `${window.location.origin}/pwa-update` };
  }
}

export function PwaUpdateAnalytics() {
  return <Analytics beforeSend={onlyAnonymousPwaEvents} />;
}
