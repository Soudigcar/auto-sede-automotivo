'use client';

import { Building2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

type Coverage = {
  canonical_leads: number;
  store_instances: number;
  multistore_leads: number;
  stores_involved: number;
};

export function MasterLeadStoreCoverage() {
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token || '';
        if (!token) return;
        const response = await fetch('/api/master/base-lead-store-instances?summary=1', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const result = await response.json();
        if (!active || !response.ok) return;
        setMigrationRequired(result.migration_required === true);
        setCoverage(result.summary || null);
      } catch {
        // This indicator is informative only and must never block the Master shell.
      }
    })();
    return () => { active = false; };
  }, []);

  if (!coverage) {
    return <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold text-zinc-500"><Loader2 size={12} className="animate-spin" /> Instâncias por loja</div>;
  }

  if (migrationRequired) {
    return <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[10px] font-bold leading-relaxed text-amber-300">Multiloja V1 aguardando migration neste ambiente.</div>;
  }

  return <div className="mt-3 rounded-xl border border-blue-400/20 bg-blue-400/5 p-3 text-[10px] text-blue-100">
    <div className="flex items-center gap-2 font-black uppercase tracking-wide"><Building2 size={13} /> Instâncias por loja</div>
    <div className="mt-2 grid grid-cols-2 gap-2">
      <div><strong className="block text-base text-white">{coverage.store_instances}</strong><span className="text-zinc-400">operações</span></div>
      <div><strong className="block text-base text-white">{coverage.multistore_leads}</strong><span className="text-zinc-400">em 2+ lojas</span></div>
      <div><strong className="block text-base text-white">{coverage.canonical_leads}</strong><span className="text-zinc-400">leads canônicos</span></div>
      <div><strong className="block text-base text-white">{coverage.stores_involved}</strong><span className="text-zinc-400">lojas</span></div>
    </div>
  </div>;
}
