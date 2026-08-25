'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type StoreRow = { id: string; store_name: string; status?: string };
type LeadRow = {
  id: string;
  name?: string;
  phone?: string;
  source?: string;
  status?: string;
  event_id?: string | null;
  assigned_store_id?: string | null;
  assigned_store_name?: string | null;
};

type DryRun = {
  selection_before_removal: number;
  selected: number;
  found: number;
  eligible: number;
  blocked: number;
  missing: number;
  auto_removed_same_store: number;
  removed_by_store_filter: number;
  store_id: string;
  store_name: string;
  privacy_mode: string;
};

const EXECUTION_BATCH_SIZE = 100;
const LOAD_PAGE_SIZE = 200;
const LEAD_SELECT = 'id,name,phone,source,status,event_id,assigned_store_id,assigned_store_name';

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

export default function MasterPrivateLeadTransferPage() {
  const supabase = useMemo(() => createClient(), []);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [destinationStoreId, setDestinationStoreId] = useState('');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAllVisible, setSelectAllVisible] = useState(false);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [eligibleLeadIds, setEligibleLeadIds] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<Array<{ lead_id: string; name: string; reason: string }>>([]);
  const [message, setMessage] = useState('Carregando Base Master...');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadLeadsPaged() {
    const rows: LeadRow[] = [];
    for (let offset = 0; ; offset += LOAD_PAGE_SIZE) {
      const pageResult = await supabase
        .from('leads_base')
        .select(LEAD_SELECT)
        .order('created_at', { ascending: false })
        .range(offset, offset + LOAD_PAGE_SIZE - 1);
      if (pageResult.error) throw pageResult.error;
      const page = (pageResult.data || []) as LeadRow[];
      rows.push(...page);
      setLeads([...rows]);
      if (page.length < LOAD_PAGE_SIZE) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return rows;
  }

  async function load() {
    setLoading(true);
    setMessage('Carregando Base Master...');
    try {
      const storePromise = supabase
        .from('stores')
        .select('id,store_name,status')
        .eq('status', 'active')
        .order('store_name');
      const [leadRows, storeResult] = await Promise.all([loadLeadsPaged(), storePromise]);
      if (storeResult.error) throw storeResult.error;
      setLeads(leadRows);
      setStores(storeResult.data || []);
      setMessage('');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {
      setLoading(false);
      setMessage('Não foi possível carregar a Base Master.');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    return leads.filter((lead) => {
      if (destinationStoreId && lead.assigned_store_id === destinationStoreId) return false;
      if (!term) return true;
      return [lead.name, lead.phone, lead.source, lead.status, lead.assigned_store_name]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [destinationStoreId, leads, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const effectiveIds = useMemo(
    () => selectAllVisible ? filtered.map((lead) => lead.id) : selectedIds,
    [filtered, selectAllVisible, selectedIds]
  );

  function resetValidation() {
    setDryRun(null);
    setEligibleLeadIds([]);
    setBlocked([]);
  }

  function toggleLead(id: string) {
    setSelectAllVisible(false);
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    resetValidation();
  }

  function chooseAll() {
    setSelectAllVisible(true);
    setSelectedIds([]);
    resetValidation();
    setMessage(`${filtered.length} lead(s) visíveis selecionados para pré-validação. Nenhum dado foi alterado.`);
  }

  async function validate() {
    if (!destinationStoreId || !effectiveIds.length) return;
    setBusy(true);
    resetValidation();
    setMessage('Pré-validando transferência privada sem gravar dados...');
    try {
      const authToken = await token();
      if (!authToken) throw new Error('Sessão expirada. Faça login novamente.');
      const response = await fetch('/api/master/base-lead-private-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ selection: { lead_ids: effectiveIds }, store_id: destinationStoreId, dry_run: true })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível pré-validar.');
      setDryRun(result.summary);
      setEligibleLeadIds(result.eligible_lead_ids || []);
      setBlocked(result.blocked || []);
      setMessage('Pré-validação concluída. Preview permanece sem gravar dados.');
    } catch (error: any) {
      setMessage(error?.message || 'Falha na pré-validação.');
    } finally {
      setBusy(false);
    }
  }

  async function transfer() {
    if (!dryRun?.eligible || !eligibleLeadIds.length) return;
    if (!window.confirm(`Transferir ${eligibleLeadIds.length} lead(s) para ${dryRun.store_name}? A loja verá a origem como “Transferência Master”; a origem histórica continuará visível apenas no Master.`)) return;
    setBusy(true);
    setMessage('Tentando executar transferência...');
    let transferred = 0;
    try {
      const authToken = await token();
      if (!authToken) throw new Error('Sessão expirada. Faça login novamente.');
      for (const leadBatch of chunks(eligibleLeadIds, EXECUTION_BATCH_SIZE)) {
        const response = await fetch('/api/master/base-lead-private-transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ selection: { lead_ids: leadBatch }, store_id: destinationStoreId, dry_run: false, confirmation: 'TRANSFERIR' })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Transferência recusada.');
        transferred += Number(result.summary?.transferred || 0);
      }
      setMessage(`${transferred} lead(s) transferido(s).`);
      await load();
      setSelectedIds([]);
      setSelectAllVisible(false);
      resetValidation();
    } catch (error: any) {
      setMessage(`${transferred ? `${transferred} lead(s) concluído(s). ` : ''}${error?.message || 'Erro ao transferir.'}`);
    } finally {
      setBusy(false);
    }
  }

  const destination = stores.find((store) => store.id === destinationStoreId);

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="/master/transferencia-leads" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <div className="mx-auto max-w-7xl space-y-5">
            <Link href="/master/base" prefetch={false} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-zinc-500 hover:text-red-600"><ArrowLeft size={15} /> Voltar para Base de Leads</Link>
            <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
              <div className="flex items-center gap-2 text-red-400"><ArrowRightLeft size={18} /><span className="text-[10px] font-black uppercase tracking-[.18em]">Ação da Base Master</span></div>
              <h1 className="mt-2 text-2xl font-black">Transferência privada de leads</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">Esta é uma ação da Base de Leads. O Master troca a loja responsável sem apagar a proveniência histórica; a loja receptora recebe apenas o contexto operacional “Transferência Master”.</p>
            </header>

            <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <div className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="font-black">1. Selecione os leads</h2><p className="mt-1 text-xs text-zinc-500">Venda concluída permanece protegida. Perdidos podem ser reabertos pelo Master.</p></div>
                  <button type="button" onClick={chooseAll} disabled={loading} className="rounded-xl bg-slate-950 px-4 py-2 text-[10px] font-black uppercase text-white disabled:opacity-40">Selecionar todos visíveis</button>
                </div>
                <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectAllVisible(false); resetValidation(); }} placeholder="Buscar nome, telefone, origem, status ou loja atual..." className="mt-4 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm" />
                <div className="mt-3 max-h-[420px] overflow-y-auto rounded-2xl border border-zinc-100">
                  {loading && !leads.length ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm font-bold text-zinc-500"><Loader2 size={18} className="animate-spin" /> Carregando leads...</div> : null}
                  {filtered.map((lead) => {
                    const checked = selectAllVisible || selectedSet.has(lead.id);
                    return <label key={lead.id} className="grid cursor-pointer grid-cols-[22px_1fr] gap-2 border-b border-zinc-100 px-3 py-2.5 last:border-0 hover:bg-zinc-50"><input type="checkbox" className="mt-0.5" checked={checked} onChange={() => toggleLead(lead.id)} /><span className="min-w-0"><strong className="block truncate text-xs">{lead.name || 'Lead sem nome'}</strong><small className="block truncate text-[10px] text-zinc-500">{lead.phone || 'Sem telefone'} · {lead.source || 'Sem origem'} · {lead.status || 'Sem status'} · Atual: {lead.assigned_store_name || 'Sem loja'}</small></span></label>;
                  })}
                </div>
              </div>

              <aside className="space-y-4">
                <section className="rounded-3xl border border-zinc-200 bg-white p-5"><h2 className="font-black">2. Loja responsável</h2><select value={destinationStoreId} onChange={(event) => { setDestinationStoreId(event.target.value); setSelectAllVisible(false); setSelectedIds([]); resetValidation(); }} className="mt-3 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"><option value="">Selecione a loja</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select>{destination ? <p className="mt-2 text-xs text-zinc-500">Leads que já pertencem a {destination.store_name} ficam automaticamente fora.</p> : null}</section>
                <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 text-blue-950"><div className="flex gap-3"><ShieldCheck size={20} className="shrink-0" /><div><strong className="text-sm">Privacidade entre lojas</strong><p className="mt-1 text-xs leading-relaxed">Origem, evento, campanha, loja anterior e histórico ficam preservados na Base Master. A loja receptora recebe origem operacional “Transferência Master” e evento operacional vazio.</p></div></div></section>
                <button type="button" onClick={() => void validate()} disabled={loading || !destinationStoreId || !effectiveIds.length || busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black uppercase text-white disabled:opacity-40">{busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Pré-validar {effectiveIds.length || ''}</button>
              </aside>
            </section>

            {message ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">{message}</div> : null}
            {dryRun ? <section className="rounded-3xl border border-zinc-200 bg-white p-5"><div className="grid gap-2 sm:grid-cols-6">{[['Selecionados', dryRun.selected], ['Encontrados', dryRun.found], ['Elegíveis', dryRun.eligible], ['Protegidos', dryRun.blocked], ['Mesma loja', dryRun.auto_removed_same_store], ['Ausentes', dryRun.missing]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-zinc-50 p-3"><p className="text-[9px] font-black uppercase text-zinc-400">{label}</p><strong className="mt-1 block text-xl">{value}</strong></div>)}</div>{blocked.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">Protegidos: {blocked.slice(0, 5).map((item) => `${item.name || item.lead_id}: ${item.reason}`).join(' | ')}</div> : null}{dryRun.eligible ? <div className="mt-4 flex justify-end"><button type="button" onClick={() => void transfer()} disabled={busy} className="rounded-xl bg-red-600 px-5 py-3 text-xs font-black uppercase text-white disabled:opacity-40">Transferir {dryRun.eligible} lead(s)</button></div> : null}</section> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
