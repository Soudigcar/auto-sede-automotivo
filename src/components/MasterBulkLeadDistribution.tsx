'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CheckSquare2, Loader2, Route, Store, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type StoreRow = { id: string; store_name: string; status?: string };
type LeadRow = {
  id: string;
  name?: string;
  phone?: string;
  source?: string;
  status?: string;
  assigned_store_id?: string | null;
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
  selection_before_removal?: number;
  selected: number;
  found: number;
  eligible: number;
  blocked: number;
  missing: number;
  auto_removed_same_store?: number;
  removed_by_store_filter?: number;
  store_name: string;
  mode: 'configured_rotation' | 'selected_members';
  routing_configured: boolean;
  migration_required: boolean;
};

type FilterSnapshot = {
  event_filter: string;
  query: string;
  status: string;
  source: string;
  store_filter: string;
  birth_date_filter: string;
  city_filter: string;
};

const EXECUTION_BATCH_SIZE = 100;
const roleLabels: Record<string, string> = {
  pre_sales: 'Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospector'
};

function leadStoreName(lead: LeadRow) {
  return String(lead.assigned_store_name || lead.metadata?.routing?.assigned_store_name || '').trim();
}

function leadStoreId(lead: LeadRow) {
  return String(lead.assigned_store_id || lead.metadata?.routing?.assigned_store_id || '').trim();
}

function firstOptionValue(root: ParentNode | null, text: string) {
  const selects = Array.from(root?.querySelectorAll('select') || []);
  const select = selects.find((item) => String(item.options?.[0]?.textContent || '').trim() === text);
  return select?.value || 'all';
}

function currentBaseFilterSnapshot(anchor: HTMLElement | null): FilterSnapshot {
  const root: ParentNode = anchor?.closest('section') || document;
  const search = root.querySelector('input[placeholder="Nome, telefone, CPF..."]') as HTMLInputElement | null;
  const birthDate = root.querySelector('input[title="Data de nascimento"]') as HTMLInputElement | null;
  return {
    event_filter: firstOptionValue(root, 'Todos os leads'),
    query: search?.value || '',
    status: firstOptionValue(root, 'Todos os status'),
    source: firstOptionValue(root, 'Todas as origens'),
    store_filter: firstOptionValue(root, 'Todas as lojas'),
    birth_date_filter: birthDate?.value || '',
    city_filter: firstOptionValue(root, 'Todas as cidades')
  };
}

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'manual' | 'all_filtered'>('manual');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [excludedStoreIds, setExcludedStoreIds] = useState<string[]>([]);
  const [removeStoreId, setRemoveStoreId] = useState('');
  const [filterSnapshot, setFilterSnapshot] = useState<FilterSnapshot | null>(null);
  const [storeId, setStoreId] = useState('');
  const [context, setContext] = useState<Context>({ members: [], rules: [] });
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [eligibleLeadIds, setEligibleLeadIds] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<Array<{ lead_id: string; name: string; reason: string }>>([]);
  const [query, setQuery] = useState('');

  const visibleLeads = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return leads;
    return leads.filter((lead) => [lead.name, lead.phone, lead.source, lead.status, leadStoreName(lead)]
      .some((value) => String(value || '').toLowerCase().includes(term)));
  }, [leads, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const excludedSet = useMemo(() => new Set(excludedIds), [excludedIds]);
  const excludedStoreSet = useMemo(() => new Set(excludedStoreIds), [excludedStoreIds]);
  const mode: 'configured_rotation' | 'selected_members' = context.routing_configured ? 'configured_rotation' : 'selected_members';
  const eligibleTeam = useMemo(() => context.members.filter((member) => member.receives_leads), [context.members]);
  const hasSelection = selectionMode === 'all_filtered' || selectedIds.length > 0;

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  function resetValidation() {
    setDryRun(null);
    setEligibleLeadIds([]);
    setBlocked([]);
  }

  function resetDestination() {
    setContext({ members: [], rules: [] });
    setSelectedMemberIds([]);
    resetValidation();
    setMessage('');
  }

  function clearSelection() {
    setSelectionMode('manual');
    setSelectedIds([]);
    setExcludedIds([]);
    setExcludedStoreIds([]);
    setRemoveStoreId('');
    setFilterSnapshot(null);
    resetValidation();
  }

  function close() {
    if (busy) return;
    setOpen(false);
    clearSelection();
    setStoreId('');
    setQuery('');
    resetDestination();
  }

  function isSelected(lead: LeadRow) {
    const currentStoreId = leadStoreId(lead);
    if (storeId && currentStoreId === storeId) return false;
    if (currentStoreId && excludedStoreSet.has(currentStoreId)) return false;
    return selectionMode === 'all_filtered' ? !excludedSet.has(lead.id) : selectedSet.has(lead.id);
  }

  function toggleLead(id: string) {
    if (selectionMode === 'all_filtered') {
      setExcludedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    } else {
      setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    }
    resetValidation();
  }

  function selectAllFiltered() {
    setSelectionMode('all_filtered');
    setSelectedIds([]);
    setExcludedIds([]);
    setExcludedStoreIds([]);
    setRemoveStoreId('');
    setFilterSnapshot(currentBaseFilterSnapshot(triggerRef.current));
    resetValidation();
    setMessage('Todos os leads que correspondem ao filtro atual serão resolvidos no servidor durante a pré-validação.');
  }

  function toggleMember(id: string) {
    setSelectedMemberIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    resetValidation();
  }

  function selectionPayload() {
    const storeExclusions = Array.from(new Set(excludedStoreIds));
    if (selectionMode === 'all_filtered') {
      return {
        all_filtered: true,
        filters: filterSnapshot || currentBaseFilterSnapshot(triggerRef.current),
        excluded_lead_ids: excludedIds,
        excluded_store_ids: storeExclusions
      };
    }
    return { lead_ids: selectedIds, excluded_store_ids: storeExclusions };
  }

  function removeStoreFromSelection(targetStoreId: string, automatic = false) {
    if (!targetStoreId) return 0;
    const localIds = leads.filter((lead) => leadStoreId(lead) === targetStoreId).map((lead) => lead.id);
    const localSet = new Set(localIds);
    let removed = 0;

    if (selectionMode === 'all_filtered') {
      removed = localIds.filter((id) => !excludedSet.has(id)).length;
      if (!automatic) setExcludedStoreIds((current) => current.includes(targetStoreId) ? current : [...current, targetStoreId]);
      setExcludedIds((current) => Array.from(new Set([...current, ...localIds])));
    } else {
      const selectedNow = selectedIds.filter((id) => localSet.has(id));
      removed = selectedNow.length;
      setSelectedIds((current) => current.filter((id) => !localSet.has(id)));
      if (!automatic) setExcludedStoreIds((current) => current.includes(targetStoreId) ? current : [...current, targetStoreId]);
    }

    resetValidation();
    return removed;
  }

  function removeSelectedStore() {
    if (!removeStoreId) {
      setMessage('Selecione a loja que deseja remover desta seleção.');
      return;
    }
    const store = stores.find((item) => item.id === removeStoreId);
    const removed = removeStoreFromSelection(removeStoreId, false);
    setMessage(selectionMode === 'all_filtered'
      ? `${store?.store_name || 'Loja'} foi removida da seleção. Na pré-validação o servidor retirará todos os leads dessa loja, inclusive os que não estão carregados nesta tela.`
      : `${removed} lead(s) de ${store?.store_name || 'Loja'} foram removidos da seleção atual. Nenhum dado foi alterado.`);
  }

  async function selectStore(nextStoreId: string) {
    setStoreId(nextStoreId);
    resetDestination();
    if (!nextStoreId) return;

    const store = stores.find((item) => item.id === nextStoreId);
    const removedVisible = removeStoreFromSelection(nextStoreId, true);
    setLoadingContext(true);
    setMessage(selectionMode === 'all_filtered'
      ? `A loja de destino será excluída automaticamente no servidor para evitar duplicidade${removedVisible ? `; ${removedVisible} lead(s) visível(is) já foram desmarcados` : ''}.`
      : `${removedVisible} lead(s) que já pertencem a ${store?.store_name || 'essa loja'} foram desmarcados automaticamente.`);

    try {
      const authToken = await token();
      if (!authToken) throw new Error('Sessão expirada. Faça login novamente.');
      const response = await fetch(`/api/master/base-lead-bulk-distribution?store_id=${encodeURIComponent(nextStoreId)}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar a loja.');
      setContext(result);
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao carregar a equipe da loja.');
    } finally {
      setLoadingContext(false);
    }
  }

  async function validateDistribution() {
    if (!hasSelection || !storeId) return;
    if (mode === 'selected_members' && !selectedMemberIds.length) {
      setMessage('Selecione pelo menos uma pessoa da equipe.');
      return;
    }

    setBusy(true);
    resetValidation();
    setMessage('Pré-validando no servidor sem alterar dados...');
    try {
      const authToken = await token();
      if (!authToken) throw new Error('Sessão expirada. Faça login novamente.');
      const response = await fetch('/api/master/base-lead-bulk-distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          selection: selectionPayload(),
          store_id: storeId,
          mode,
          member_ids: mode === 'selected_members' ? selectedMemberIds : [],
          dry_run: true
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível pré-validar a distribuição.');
      setDryRun(result.summary);
      setEligibleLeadIds(result.eligible_lead_ids || []);
      setBlocked(result.blocked || []);
      const sameStore = Number(result.summary?.auto_removed_same_store || 0);
      const removedStores = Number(result.summary?.removed_by_store_filter || 0);
      setMessage(`Pré-validação concluída. Nenhum dado foi alterado.${sameStore ? ` ${sameStore} lead(s) da própria loja de destino foram removidos automaticamente.` : ''}${removedStores ? ` ${removedStores} lead(s) foram removidos pelo filtro de loja.` : ''}`);
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao pré-validar a distribuição.');
    } finally {
      setBusy(false);
    }
  }

  async function distribute() {
    if (!dryRun?.eligible || !eligibleLeadIds.length) return;
    if (context.preview_read_only) {
      setMessage('Preview em modo somente leitura: seleção server-side e fluxo em lotes validados até a confirmação, sem gravar leads.');
      return;
    }
    if (!window.confirm(`Distribuir ${eligibleLeadIds.length} lead(s) elegível(is) para ${dryRun.store_name}? Leads já pertencentes à loja de destino ou protegidos permanecerão fora da operação.`)) return;

    setBusy(true);
    let totalDistributed = 0;
    let totalNotDistributed = 0;
    let memberOffset = 0;
    setMessage(`Distribuindo ${eligibleLeadIds.length} lead(s) em lotes de até ${EXECUTION_BATCH_SIZE}...`);

    try {
      const authToken = await token();
      if (!authToken) throw new Error('Sessão expirada. Faça login novamente.');

      for (const [batchIndex, leadBatch] of chunks(eligibleLeadIds, EXECUTION_BATCH_SIZE).entries()) {
        setMessage(`Processando lote ${batchIndex + 1} de ${Math.ceil(eligibleLeadIds.length / EXECUTION_BATCH_SIZE)}...`);
        const response = await fetch('/api/master/base-lead-bulk-distribution', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            selection: { lead_ids: leadBatch, excluded_store_ids: excludedStoreIds },
            store_id: storeId,
            mode,
            member_ids: mode === 'selected_members' ? selectedMemberIds : [],
            member_offset: memberOffset,
            dry_run: false,
            confirmation: 'DISTRIBUIR'
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Falha no lote ${batchIndex + 1}.`);
        totalDistributed += Number(result.summary?.distributed || 0);
        totalNotDistributed += Math.max(0, leadBatch.length - Number(result.summary?.distributed || 0));
        memberOffset = Number.isInteger(result.next_member_offset) ? result.next_member_offset : memberOffset;
      }

      setMessage(`${totalDistributed} lead(s) distribuído(s) em lotes.${totalNotDistributed ? ` ${totalNotDistributed} permaneceram protegidos/fail-closed.` : ''}`);
      await onDistributed();
      clearSelection();
    } catch (error: any) {
      const prefix = totalDistributed ? `${totalDistributed} lead(s) já foram distribuídos em lotes concluídos. ` : '';
      setMessage(prefix + (error?.message || 'Erro ao distribuir leads.'));
    } finally {
      setBusy(false);
    }
  }

  const localSelectionLabel = selectionMode === 'all_filtered'
    ? `Todos os leads do filtro atual${excludedIds.length ? `, exceto ${excludedIds.length} lead(s) desmarcado(s)` : ''}${excludedStoreIds.length ? ` e ${excludedStoreIds.length} loja(s) removida(s)` : ''}`
    : `${selectedIds.length} de ${leads.length} lead(s) visível(is) selecionado(s)`;

  return (
    <>
      <button
        ref={triggerRef}
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
                <p className="mt-1 text-xs font-medium text-zinc-500">A Base continua global. A loja de destino é retirada automaticamente da seleção para impedir redistribuição duplicada.</p>
              </div>
              <button type="button" onClick={close} disabled={busy} className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 disabled:opacity-50" aria-label="Fechar"><X size={18} /></button>
            </div>

            <div className="space-y-5 p-5">
              {message ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{message}</div> : null}

              <section className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="text-sm font-black text-slate-950">1. Seleção</h3><p className="mt-1 text-xs text-zinc-500">{localSelectionLabel}.</p></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={selectAllFiltered} className="rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-black uppercase text-white">Selecionar todos os filtrados</button>
                    <button type="button" onClick={clearSelection} className="rounded-xl border border-zinc-200 px-3 py-2 text-[10px] font-black uppercase text-zinc-600">Limpar</button>
                  </div>
                </div>

                {selectionMode === 'all_filtered' ? <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-900">Seleção server-side ativa. As remoções por loja também são reaplicadas no servidor, inclusive para leads que não estão carregados nesta tela.</div> : null}

                <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                  <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 rounded-xl border border-zinc-200 px-3 text-xs outline-none focus:border-red-300" placeholder="Buscar dentro da lista visível..." />
                  <select value={removeStoreId} onChange={(event) => setRemoveStoreId(event.target.value)} className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-slate-800">
                    <option value="">Loja para remover</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
                  </select>
                  <button type="button" onClick={removeSelectedStore} disabled={!removeStoreId || busy} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-[10px] font-black uppercase text-amber-800 disabled:opacity-40"><Store size={13} /> Remover da seleção por loja</button>
                </div>

                <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-zinc-100">
                  {visibleLeads.map((lead) => {
                    const sameDestination = Boolean(storeId && leadStoreId(lead) === storeId);
                    const removedByStore = Boolean(leadStoreId(lead) && excludedStoreSet.has(leadStoreId(lead)));
                    return (
                      <label key={lead.id} className={`grid grid-cols-[22px_minmax(0,1fr)] gap-2 border-b border-zinc-100 px-3 py-2.5 last:border-0 ${sameDestination || removedByStore ? 'cursor-not-allowed bg-zinc-50 opacity-55' : 'cursor-pointer hover:bg-zinc-50'}`}>
                        <input type="checkbox" className="mt-0.5" checked={isSelected(lead)} disabled={sameDestination || removedByStore} onChange={() => toggleLead(lead.id)} />
                        <span className="min-w-0"><strong className="block truncate text-xs text-slate-900">{lead.name || 'Lead sem nome'}</strong><small className="mt-0.5 block truncate text-[10px] text-zinc-500">{lead.phone || 'Sem telefone'} · {lead.source || 'Sem origem'} · {lead.status || 'Sem status'}{leadStoreName(lead) ? ` · ${leadStoreName(lead)}` : ''}{sameDestination ? ' · Já pertence à loja de destino' : removedByStore ? ' · Removido por loja' : ''}</small></span>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 p-4">
                <h3 className="text-sm font-black text-slate-950">2. Loja de destino</h3>
                <select value={storeId} onChange={(event) => void selectStore(event.target.value)} className="mt-3 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-slate-800" disabled={!hasSelection || busy}>
                  <option value="">Selecione a loja</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
                </select>
                <p className="mt-2 text-[11px] font-semibold text-zinc-500">Ao escolher a loja, qualquer lead que já pertença a ela fica automaticamente fora desta distribuição. Isso não exclui nem altera o lead.</p>
                {loadingContext ? <p className="mt-3 flex items-center gap-2 text-xs font-bold text-zinc-500"><Loader2 className="animate-spin" size={15} /> Carregando equipe...</p> : null}
              </section>

              {storeId && !loadingContext && context.store ? (
                <section className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-black text-slate-950">3. Equipe e distribuição</h3><p className="mt-1 text-xs text-zinc-500">{eligibleTeam.length} pessoa(s) habilitada(s) para receber leads.</p></div>{context.routing_configured ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">Rodízio ativo</span> : <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-black uppercase text-zinc-600">Sem rodízio ativo</span>}</div>

                  {context.routing_configured ? (
                    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-start gap-3"><Route className="mt-0.5 shrink-0 text-emerald-700" size={18} /><div><strong className="text-sm text-emerald-950">Seguir rodízio da loja</strong><p className="mt-1 text-xs font-medium text-emerald-800">A distribuição continuará da posição atual do motor. Não será criado um segundo rodízio e a equipe não será sobrescrita por esta operação.</p></div></div>
                    </div>
                  ) : context.migration_required ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900"><div className="flex gap-2"><AlertTriangle size={17} className="shrink-0" /><span>O Motor de Roteamento ainda não está instalado neste ambiente. O Preview continuará sem gravar dados.</span></div></div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs font-bold text-blue-900"><div className="flex gap-2"><Users size={17} className="shrink-0" /><span>Sem rodízio ativo: selecione quem participará desta distribuição. Se alguém atingir a capacidade, o sistema tentará o próximo membro selecionado antes de manter o lead fail-closed.</span></div></div>
                  )}

                  {!context.routing_configured && !context.migration_required ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {eligibleTeam.map((member) => (
                        <label key={member.id} className="flex cursor-pointer items-start gap-2 rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50">
                          <input type="checkbox" className="mt-0.5" checked={selectedMemberIds.includes(member.id)} onChange={() => toggleMember(member.id)} />
                          <span><strong className="block text-xs text-slate-900">{member.full_name}</strong><small className="text-[10px] font-bold text-zinc-500">{roleLabels[member.role] || member.role}{member.max_open_leads == null ? '' : ` · limite ${member.max_open_leads}`}</small></span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="text-sm font-black text-slate-950">4. Pré-validar e distribuir</h3><p className="mt-1 text-xs text-zinc-500">A pré-validação reaplica no servidor a loja de destino e as lojas removidas da seleção. A execução real continua em lotes de até {EXECUTION_BATCH_SIZE}.</p></div>
                  <button type="button" onClick={() => void validateDistribution()} disabled={!hasSelection || !storeId || busy || (mode === 'selected_members' && !selectedMemberIds.length)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black uppercase text-white disabled:opacity-40">{busy ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Pré-validar</button>
                </div>

                {dryRun ? (
                  <>
                    <div className="mt-4 grid gap-2 sm:grid-cols-5">
                      {[['Selecionados', dryRun.selected], ['Encontrados', dryRun.found], ['Elegíveis', dryRun.eligible], ['Protegidos', dryRun.blocked], ['Ausentes', dryRun.missing]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-zinc-50 p-3"><p className="text-[9px] font-black uppercase text-zinc-400">{label}</p><strong className="mt-1 block text-lg text-slate-950">{value}</strong></div>)}
                    </div>
                    {(dryRun.auto_removed_same_store || dryRun.removed_by_store_filter) ? <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] font-bold text-blue-900">Removidos sem alterar dados: {dryRun.auto_removed_same_store || 0} já pertenciam à loja de destino; {dryRun.removed_by_store_filter || 0} foram retirados pelo botão de loja.</div> : null}
                  </>
                ) : null}

                {blocked.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-900">Leads protegidos não serão redistribuídos. Exemplos: {blocked.slice(0, 3).map((item) => `${item.name || item.lead_id}: ${item.reason}`).join(' | ')}</div> : null}

                {dryRun?.eligible ? <div className="mt-4 flex justify-end"><button type="button" onClick={() => void distribute()} disabled={busy} className="rounded-xl bg-red-600 px-5 py-3 text-[10px] font-black uppercase text-white hover:bg-red-700 disabled:opacity-50">Distribuir {dryRun.eligible} lead(s)</button></div> : null}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
