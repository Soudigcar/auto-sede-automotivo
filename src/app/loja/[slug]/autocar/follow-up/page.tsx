'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useStorePortal } from '@/components/StorePortalShell';
import { StoreAutocarFollowUpV2 } from '@/components/StoreAutocarFollowUpV2';

export default function StoreAutocarFollowUpPage() {
  const portal = useStorePortal();
  const canManage = portal.permissions.includes('autocar.manage') || portal.profile.role === 'store';
  return <main className="premium-page"><div className="premium-canvas min-w-0 p-4 md:p-7"><header><Link href={`/loja/${portal.store.slug}/autocar`} prefetch={false} className="premium-button-secondary mb-4 inline-flex"><ArrowLeft size={15}/>Voltar para AUTOCAR</Link><div className="premium-eyebrow text-red-600">I.A AUTOCAR · SMART FOLLOW-UP</div><h1 className="premium-title mt-2 text-4xl md:text-5xl">Follow-up da Loja</h1><p className="premium-muted mt-3 max-w-4xl text-sm">Configure jornadas e limites da sua loja dentro do teto definido pelo Master.</p></header><div className="mt-6"><StoreAutocarFollowUpV2 storeName={portal.store.store_name} canManage={canManage}/></div></div></main>;
}
