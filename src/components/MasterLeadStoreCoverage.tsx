'use client';

import { Building2, Loader2, Search, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

type Coverage = {
  canonical_leads: number;
  store_instances: number;
  multistore_leads: number;
  stores_involved: number;
};

type BaseLeadInstanceRow = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  store_count: number;
  instances: Array<{
    instance_id: string;
    store_name: string;
    status: string | null;
    assigned_user_name: string | null;
    assigned_user_role: string | null;
  }>;
};

export function MasterLeadStoreCoverage() {
  const pathname = usePathname();
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<BaseLeadInstanceRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [browseMessage, setBrowseMessage] = useState('');

  async function authToken() {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadBrowse(nextQuery = query) {
    setLoadingRows(true);
    setBrowseMessage('');
    try {
      const token = await authToken();
      if (!token) throw new Error('Sessão expirada.');
      const params = new URLSearchParams({ browse: '1', limit: '50' });
      if (nextQuery.trim()) params.set('q', nextQuery.trim());
      const response = await fetch(`/api/master/base-lead-store-instances?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as lojas dos leads.');
      setMigrationRequired(result.migration_required === true);
      setRows(result.leads || []);
    } catch (error: any) {
      setRows([]);
      setBrowseMessage(error?.message || 'Não foi possível carregar as lojas dos leads.');
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await authToken();
        if (!token) return;
        const response = await fetch('/api/master/base-lead-store-instances?summary=1', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const result = await response.json();
        if (!active || !response.ok) return;
        setMigrationRequired(result.migration_required === true);
        setCoverage(result.summary || null);
      } catch {
        // Informative only: this indicator must never block the Master shell.
      }
    })();
    return () => { active = false; };
  }, []);

  const onBase = pathname === '/master/base';

  if (!coverage) {
    return <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold text-zinc-500"><Loader2 size={12} className="animate-spin" /> Instâncias por loja</div>;
  }

  if (migrationRequired) {
    return <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[10px] font-bold leading-relaxed text-amber-300">Multiloja V1 aguardando migration neste ambiente.</div>;
  }

  return <>
    <div className="mt-3 rounded-xl border border-blue-400/20 bg-blue-400/5 p-3 text-[10px] text-blue-100">
      <div className="flex items-center gap-2 font-black uppercase tracking-wide"><Building2 size={13} /> Instâncias por loja</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div><strong className="block text-base text-white">{coverage.store_instances}</strong><span className="text-zinc-400">operações</span></div>
        <div><strong className="block text-base text-white">{coverage.multistore_leads}</strong><span className="text-zinc-400">em 2+ lojas</span></div>
        <div><strong className="block text-base text-white">{coverage.canonical_leads}</strong><span className="text-zinc-400">leads canônicos</span></div>
        <div><strong className="block text-base text-white">{coverage.stores_involved}</strong><span className="text-zinc-400">lojas</span></div>
      </div>
      {onBase ? <button type="button" onClick={() => { setOpen(true); void loadBrowse(''); }} className="mt-3 w-full rounded-lg border border-blue-300/20 bg-white/5 px-2 py-2 font-black uppercase tracking-wide text-white hover:bg-white/10">Ver lojas por lead</button> : null}
    </div>

    {open ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Lojas por lead">
      <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-red-600">Base Master</p><h2 className="mt-1 text-xl font-black text-zinc-950">Lojas por lead</h2><p className="mt-1 text-xs text-zinc-500">Cada loja representa uma instância operacional independente do mesmo lead canônico.</p></div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50" aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="border-b border-zinc-100 p-4">
          <form onSubmit={(event) => { event.preventDefault(); void loadBrowse(query); }} className="flex gap-2">
            <label className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, telefone ou ID..." className="h-10 w-full rounded-xl border border-zinc-200 pl-9 pr-3 text-sm outline-none focus:border-red-300" /></label>
            <button type="submit" disabled={loadingRows} className="rounded-xl bg-slate-950 px-4 text-xs font-black uppercase text-white disabled:opacity-40">Buscar</button>
          </form>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-4">
          {loadingRows ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm font-bold text-zinc-500"><Loader2 size={18} className="animate-spin" /> Carregando instâncias...</div> : null}
          {!loadingRows && browseMessage ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{browseMessage}</div> : null}
          {!loadingRows && !browseMessage && !rows.length ? <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center text-sm font-bold text-zinc-500">Nenhum lead encontrado.</div> : null}
          {!loadingRows && rows.length ? <div className="space-y-3">{rows.map((lead) => <div key={lead.id} className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><strong className="block truncate text-sm text-zinc-950">{lead.name || 'Lead sem nome'}</strong><span className="mt-1 block text-[10px] text-zinc-500">{lead.phone || 'Sem telefone'} · {lead.status || 'Sem status'} · {lead.id}</span></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${lead.store_count > 1 ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-600'}`}>{lead.store_count} loja(s)</span></div>
            <div className="mt-3 flex flex-wrap gap-2">{lead.instances.length ? lead.instances.map((instance) => <span key={instance.instance_id} className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] font-bold text-emerald-800"><span className="block font-black">{instance.store_name}</span><span className="mt-0.5 block opacity-75">{instance.assigned_user_name || 'Sem responsável'} · {instance.status || 'sem status'}</span></span>) : <span className="rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[10px] font-bold text-zinc-500">Ainda sem instância de loja</span>}</div>
          </div>)}</div> : null}
        </div>
      </div>
    </div> : null}
  </>;
}
