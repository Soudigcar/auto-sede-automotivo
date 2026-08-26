'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useStorePortal } from '@/components/StorePortalShell';
import { StoreAutocarFollowUpV2 } from '@/components/StoreAutocarFollowUpV2';

type FoundationStatus = { permissions?: { view?: boolean; manage?: boolean; approve?: boolean } };

export default function StoreAutocarFollowUpPage() {
  const portal = useStorePortal();
  const supabase = useMemo(() => createClient(), []);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadPermissions() {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('Sessão não encontrada.');
        const response = await fetch(`/api/store/portal/autocar/foundation-status?slug=${encodeURIComponent(portal.store.slug)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        const body = await response.json() as FoundationStatus & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Não foi possível validar as permissões da AUTOCAR.');
        if (!cancelled) setCanManage(Boolean(body.permissions?.manage));
      } catch (error: any) {
        if (!cancelled) {
          setCanManage(false);
          setMessage(error?.message || 'Não foi possível validar as permissões da AUTOCAR.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPermissions();
    return () => { cancelled = true; };
  }, [portal.store.slug, supabase]);

  return <main className="premium-page"><div className="premium-canvas min-w-0 p-4 md:p-7"><header><Link href={`/loja/${portal.store.slug}/autocar`} prefetch={false} className="premium-button-secondary mb-4 inline-flex"><ArrowLeft size={15}/>Voltar para AUTOCAR</Link><div className="premium-eyebrow text-red-600">I.A AUTOCAR · SMART FOLLOW-UP</div><h1 className="premium-title mt-2 text-4xl md:text-5xl">Follow-up da Loja</h1><p className="premium-muted mt-3 max-w-4xl text-sm">Configure jornadas e limites da sua loja dentro do teto definido pelo Master. O planner integrado usa essa mesma estrutura em dry-run.</p></header>{loading ? <div className="mt-6 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-600"><Loader2 size={18} className="animate-spin text-red-600"/>Validando permissões da AUTOCAR...</div> : null}{message ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">{message}</div> : null}{!loading ? <div className="mt-6"><StoreAutocarFollowUpV2 storeName={portal.store.store_name} canManage={canManage}/></div> : null}</div></main>;
}
