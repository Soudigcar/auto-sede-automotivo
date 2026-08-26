'use client';

import Link from 'next/link';
import { Workflow } from 'lucide-react';
import { useStorePortal } from '@/components/StorePortalShell';

export function StoreAutocarFollowUpEntry() {
  const portal = useStorePortal();
  return <div className="fixed bottom-20 right-4 z-[70] md:bottom-6 md:right-6"><Link href={`/loja/${portal.store.slug}/autocar/follow-up`} prefetch={false} className="inline-flex items-center gap-2 rounded-2xl border border-red-500/20 bg-[#071020] px-4 py-3 text-xs font-black text-white shadow-xl shadow-black/20 transition hover:bg-red-600"><Workflow size={16}/>Follow-up AUTOCAR</Link></div>;
}
