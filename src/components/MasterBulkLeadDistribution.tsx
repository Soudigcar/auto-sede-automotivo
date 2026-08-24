'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CheckSquare2, Loader2, Route, Store, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type StoreRow = { id: string; store_name: string; status?: string };
type LeadRow = {
  id: string;
  name?: string;
  phone?: string;
  source?: string;
  status?: string;
  assigned_store_name?: string;
  assigned_consultant_id?: string | null;
  metadata?: any;
};

type MemberRow = {
  id: string;
  full_name: string;
  role: 'pre_sales' | 'seller' | 'prospector';
  receives_leads: boolean;
  max_open_leads?: number | null;
};

type Context = {
  store?: StoreRow;
  members: MemberRow[];
  rules: any[];
  migration_required?: boolean;
  routing_configured?: boolean;
  preview_read_only?: boolean;
};

type DryRun = {
  selected: number;
  found: number;
  eligible: number;
  blocked: number;
  missing: number;
  store_name: string;
  mode: 'configured_rotation' | 'selected_members';
  routing_configured: boolean;
  migration_required: boolean;
};

const roleLabels: Record<string, string> = {
  pre_sales: 'Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospector'
};

function leadStoreName(lead: LeadRow) {
  return String(lead.assigned_store_name || lead.metadata?.routing?.assigned_store_name || '').trim();
}

export function MasterBulkLeadDistribution({
  leads,
  stores,
  onDistributed
}: {
  leads: LeadRow[];
  stores: StoreRow[];
  onDistributed: () => Promise<void> | void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [storeId, setStoreId] = useState('');
  const [context, setContext] = useState<Context>({ members: [], rules: [] });
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [blocked, setBlocked] = useState<Array<{ lead_id: string; name: string; reason: string }>>([]);
  const [query, setQuery] = useState('');

  const visibleLeads = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return leads;
    return leads.filter((lead) => [lead.name, lead.phone, lead.source, lead.status, leadStoreName(lead)]
      .some((value) => String(value || '').toLowerCase().includes(term)));
  }, [leads, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const mode: 'configured_rotation' | 'selected_members' = context.routing_configured ? 'configured_rotation' : 'selected_members';
  const eligibleTeam = useMemo(() => context.members.filter((member) => member.receives_leads), [context.members]);

  useEffect(() => {
    if (!open) return;
    const currentIds = new Set(leads.map((lead) => lead.id));
    setSelectedIds((current) => current.filter((id) => currentIds.has(id)));
  }, [leads, open]);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  function resetDestination() {
    setContext({ members: [], rules: [] });
    setSelectedMemberIds([]);
    setDryRun(null);
    setBlocked([]);
    setMessage('');
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setSelectedIds([]);
    setStoreId('');
    setQuery('');
    resetDestination();
  }

  function toggleLead(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setDryRun(null);
  }

  function toggleMember(id: string) {
    setSelectedMemberIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setDryRun(null);
  }

  async function selectStore(nextStoreId: string) {
    setStoreId(nextStoreId);
    resetDestination();
    if (!nextStoreId) return;

    setLoadingContext(true);
    setMessage('Carregando equipe e regra de distribuição...');
    try {
      const authToken = await token();
      if (!authToken) throw new Error('Sessão expirada. Faça login novamente.');
      const response = await fetch(`/api/master/base-lead-bulk-distribution?store_id=${encodeURIComponent(nextStoreId)}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar a loja.');
      setContext(result);
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao carregar a equipe da loja.');
    } finally {
      setLoadingContext(false);
    }
  }

  async function validateDistribution() {
    if (!selectedIds.length || !storeId) return;
    if (mode === 'selected_members' && !selectedMemberIds.length) {
      setMessage('Selecione pelo menos uma pessoa da equipe.');
      return;
    }

    setBusy(true);
    setDryRun(null);
    setBlocked([]);
    setMessage('Pré-validando a distribuição sem alterar dados...');
    try {
      const authToken = await token();
      if (!authToken) throw new Error('Sessão expirada. Faça login novamente.');
      const response = await fetch('/api/master/base-lead-bulk-distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          lead_ids: selectedIds,
          store_id: storeId,
          mode,
          member_ids: mode === 'selected_members' ? selectedMemberIds : [],
          dry_run: true
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível pré-validar a distribuição.');
      setDryRun(result.summary);
      setBlocked(result.blocked || []);
      setMessage('Pré-validação concluída. Nenhum dado foi alterado.');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao pré-validar a distribuição.');
    } finally {
      setBusy(false);
    }
  }

  async function distribute() {
    if (!dryRun?.eligible) return;
    if (context.preview_read_only) {
      setMessage('Preview em modo somente leitura: fluxo validado até a confirmação, sem gravar leads.');
      return;
    }
    if (!window.confirm(`Distribuir ${dryRun.eligible} lead(s) elegível(is) para ${dryRun.store_name}? Leads já atendidos não serão removidos da carteira.`)) return;

    setBusy(true);
    setMessage('Distribuindo leads...');
    try {
      const authToken = await token();
      if (!authToken) throw new Error('Sessão expirada. Faça login novamente.');
      const response = await fetch('/api/master/base-lead-bulk-distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          lead_ids: selectedIds,
          store_id: storeId,
          mode,
          member_ids: mode === 'selected_members' ? selectedMemberIds : [],
          dry_run: false,
          confirmation: 'DISTRIBUIR'
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a distribuição.');
      setMessage(`${result.summary?.distributed || 0} lead(s) distribuído(s).`);
      await onDistributed();
      setDryRun(null);
      setSelectedIds([]);
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao distribuir leads.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!leads.length}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-[9px] font-black uppercase text-red-700 hover:bg-red-100 disabled:opacity-40"
      >
        <CheckSquare2 size={13} /> Selecionar
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Selecionar e distribuir leads">
          <div className="max-h-[95vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-white/20 bg-white shadow-2xl">
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-100 bg-white/95 px-5 py-4 backdrop-blur">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-600">Base Master</p>
                <h2 className="text-xl font-black text-slate-950">Selecionar e distribuir leads</h2>
                <p className="mt-1 text-xs font-medium text-zinc-500">A lista abaixo já respeita os filtros aplicados na Base: evento, origem, loja, status, cidade, data e busca.</p>
              </div>
              <button type="button" onClick={close} disabled={busy} className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 disabled:opacity-50" aria-label="Fechar"><X size={18} /></button>
            </div>

            <div className="space-y-5 p-5">
              {message ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{message}</div> : null}

              <section className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="text-sm font-black text-slate-950">1. Seleção</h3><p className="mt-1 text-xs text-zinc-500">{selectedIds.length} de {leads.length} lead(s) do filtro atual selecionado(s).</p></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setSelectedIds(leads.map((lead) => lead.id)); setDryRun(null); }} className="rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-black uppercase text-white">Selecionar todos os filtrados</button>
                    <button type="button" onClick={() => { setSelectedIds([]); setDryRun(null); }} className="rounded-xl border border-zinc-200 px-3 py-2 text-[10px] font-black uppercase text-zinc-600">Limpar</button>
                  </div>
                </div>
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-3 h-10 w-full rounded-xl border border-zinc-200 px-3 text-xs outline-none focus:border-red-300" placeholder="Buscar dentro do resultado filtrado..." />
                <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-zinc-100">
                  {visibleLeads.map((lead) => (
                    <label key={lead.id} className="grid cursor-pointer grid-cols-[22px_minmax(0,1fr)] gap-2 border-b border-zinc-100 px-3 py-2.5 last:border-0 hover:bg-zinc-50">
                      <input type="checkbox" className="mt-0.5" checked={selectedSet.has(lead.id)} onChange={() => toggleLead(lead.id)} />
                      <span className="min-w-0"><strong className="block truncate text-xs text-slate-900">{lead.name || 'Lead sem nome'}</strong><small className="mt-0.5 block truncate text-[10px] text-zinc-500">{lead.phone || 'Sem telefone'} · {lead.source || 'Sem origem'} · {lead.status || 'Sem status'}{leadStoreName(lead) ? ` · ${leadStoreName(lead)}` : ''}</small></span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 p-4">
                <h3 className="text-sm font-black text-slate-950">2. Loja de destino</h3>
                <select value={storeId} onChange={(event) => void selectStore(event.target.value)} className="mt-3 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-slate-800" disabled={!selectedIds.length || busy}>
                  <option value="">Selecione a loja</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
                </select>
                {loadingContext ? <p className="mt-3 flex items-center gap-2 text-xs font-bold text-zinc-500"><Loader2 className="animate-spin" size={15} /> Carregando equipe...</p> : null}
              </section>

              {storeId && !loadingContext && context.store ? (
                <section className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-black text-slate-950">3. Equipe e distribuição</h3><p className="mt-1 text-xs text-zinc-500">{eligibleTeam.length} pessoa(s) habilitada(s) para receber leads.</p></div>{context.routing_configured ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">Rodízio ativo</span> : <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-black uppercase text-zinc-600">Sem rodízio ativo</span>}</div>

                  {context.routing_configured ? (
                    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-start gap-3"><Route className="mt-0.5 shrink-0 text-emerald-700" size={18} /><div><strong className="text-sm text-emerald-950">Seguir rodízio da loja</strong><p className="mt-1 text-xs font-medium text-emerald-800">A distribuição continuará exatamente da posição atual do motor. Não será criado um segundo rodízio e a equipe não será sobrescrita por esta operação.</p></div></div>
                    </div>
                  ) : context.migration_required ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900"><div className="flex gap-2"><AlertTriangle size={17} className="shrink-0" /><span>O Motor de Roteamento ainda não está instalado neste ambiente. Para esta validação, você pode selecionar manualmente a equipe; nenhuma gravação será feita no Preview.</span></div></div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs font-bold text-blue-900"><div className="flex gap-2"><Users size={17} className="shrink-0" /><span>A loja não possui regra de rodízio ativa. Selecione abaixo quem poderá receber esta distribuição.</span></div></div>
                  )}

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {context.members.map((member) => {
                      const disabled = Boolean(context.routing_configured) || !member.receives_leads;
                      const checked = context.routing_configured ? member.receives_leads : selectedMemberIds.includes(member.id);
                      return <label key={member.id} className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${disabled ? 'border-zinc-100 bg-zinc-50 text-zinc-500' : 'border-zinc-200 bg-white'}`}><input className="mt-0.5" type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleMember(member.id)} /><span><strong className="block">{member.full_name}</strong><small>{roleLabels[member.role] || member.role}{member.receives_leads ? '' : ' · pausado para leads'}</small></span></label>;
                    })}
                  </div>
                  {!context.members.length ? <p className="mt-3 text-xs font-bold text-red-700">Nenhum membro comercial ativo foi encontrado nesta loja.</p> : null}
                </section>
              ) : null}

              {dryRun ? (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 text-emerald-900"><CheckCircle2 size={18} /><h3 className="text-sm font-black">Pré-validação segura</h3></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                    {[['Selecionados', dryRun.selected], ['Encontrados', dryRun.found], ['Elegíveis', dryRun.eligible], ['Protegidos', dryRun.blocked], ['Ausentes', dryRun.missing]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white p-3"><span className="block text-[9px] font-black uppercase text-zinc-400">{label}</span><strong className="text-xl text-slate-950">{value}</strong></div>)}
                  </div>
                  {blocked.length ? <div className="mt-3 max-h-36 overflow-y-auto rounded-xl bg-white p-3 text-xs text-zinc-700"><p className="mb-1 font-black">Leads protegidos não serão redistribuídos:</p>{blocked.slice(0, 100).map((item) => <p key={item.lead_id}><strong>{item.name || item.lead_id}:</strong> {item.reason}</p>)}</div> : null}
                </section>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
                <div className="flex max-w-2xl items-start gap-2 text-[10px] font-bold text-zinc-500"><AlertTriangle className="mt-0.5 shrink-0" size={14} /><span>Venda concluída, perdido e lead que já possui responsável ficam protegidos. Esta ação não é “Redistribuir” e não toma lead da carteira de ninguém.</span></div>
                <div className="flex gap-2">
                  <button type="button" disabled={busy || !selectedIds.length || !storeId || (mode === 'selected_members' && !selectedMemberIds.length)} onClick={() => void validateDistribution()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-[10px] font-black uppercase text-slate-700 disabled:opacity-40">{busy ? <Loader2 className="animate-spin" size={16} /> : <Store size={16} />} Pré-validar</button>
                  <button type="button" disabled={busy || !dryRun?.eligible} onClick={() => void distribute()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-[10px] font-black uppercase text-white hover:bg-red-700 disabled:opacity-40"><Route size={16} /> {context.preview_read_only ? 'Validar confirmação' : 'Distribuir'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
