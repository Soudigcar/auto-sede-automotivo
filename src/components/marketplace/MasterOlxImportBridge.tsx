'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Link2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { OlxVehicleImportModal, type OlxImportInitial, type OlxImportStore } from './OlxVehicleImportModal';

function canonical(value: string) {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}

function vehicleLinkFromButton(button: HTMLElement) {
  const card = button.closest('div.rounded-3xl, article, tr');
  const anchors = Array.from(card?.querySelectorAll<HTMLAnchorElement>('a[href]') || []);
  return anchors.find((anchor) => anchor.href.includes('olx.com.br'))?.href || '';
}

export function MasterOlxImportBridge() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const active = pathname.startsWith('/master/marketplace') || pathname.startsWith('/master/stores');
  const [open, setOpen] = useState(false);
  const [stores, setStores] = useState<OlxImportStore[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [initial, setInitial] = useState<OlxImportInitial | null>(null);

  async function loadCatalog() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const response = await fetch('/api/master/marketplace/catalog', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return;
    setStores((result.stores || []).filter((store: any) => store.status === 'active' && store.portal_enabled));
    setSubmissions(result.submissions || []);
  }

  useEffect(() => {
    if (!active) return;
    void loadCatalog();
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const capture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('button');
      if (!button) return;
      const label = (button.textContent || '').trim().toLowerCase();
      if (label !== 'conferir' && label !== 'publicar') return;
      const url = vehicleLinkFromButton(button);
      if (!url) return;

      const submission = submissions.find((item) => canonical(item.vehicle_url || '') === canonical(url));
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setInitial({
        submissionId: submission?.id || '',
        storeId: submission?.store_id || '',
        url
      });
      setOpen(true);
    };

    document.addEventListener('click', capture, true);
    return () => document.removeEventListener('click', capture, true);
  }, [active, submissions]);

  if (!active) return null;

  return <>
    <button
      type="button"
      className="fixed bottom-6 right-6 z-[120] inline-flex min-h-12 items-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-black text-white shadow-2xl shadow-red-600/30 hover:bg-red-700"
      onClick={() => { setInitial(null); setOpen(true); void loadCatalog(); }}
    >
      <Link2 size={18} /> Importar anúncio OLX
    </button>

    <OlxVehicleImportModal
      open={open}
      stores={stores}
      initial={initial}
      onClose={() => setOpen(false)}
      onComplete={() => {
        void loadCatalog();
        window.setTimeout(() => window.location.reload(), 900);
      }}
    />
  </>;
}
