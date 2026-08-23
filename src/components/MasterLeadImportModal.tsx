'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import {
  LEAD_IMPORT_MAX_FILE_BYTES,
  LEAD_IMPORT_MAX_ROWS,
  LeadImportColumnMapping,
  LeadImportField,
  LeadImportMappingSuggestion,
  LeadImportRow,
  leadImportFieldLabels,
  leadImportFields,
  mapLeadImportRows,
  suggestLeadImportMappingDetailed
} from '@/lib/leadImport';

type ImportContext = {
  events: Array<{ id: string; event_name: string; status: string }>;
  stores: Array<{ id: string; store_name: string }>;
  members: Array<{
    id: string;
    full_name: string;
    role: 'pre_sales' | 'seller' | 'prospector';
    store_id: string;
    store_name: string;
    receives_leads: boolean;
  }>;
  role_labels: Record<string, string>;
};

type ImportReport = {
  batch_id: string;
  total_rows: number;
  inserted: number;
  updated: number;
  distributed: number;
  duplicates: number;
  conflicts: number;
  errors: number;
  items: Array<{ row_number: number; status: string; message?: string }>;
};

const emptyContext: ImportContext = { events: [], stores: [], members: [], role_labels: {} };
const IMPORT_REQUEST_ROWS = 500;

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function MasterLeadImportModal({ onImported }: { onImported: () => Promise<void> | void }) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<ImportContext>(emptyContext);
  const [loadingContext, setLoadingContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [headers, setHeaders] = useState<unknown[]>([]);
  const [matrix, setMatrix] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<LeadImportColumnMapping>({});
  const [mappingSuggestions, setMappingSuggestions] = useState<LeadImportMappingSuggestion[]>([]);
  const [eventId, setEventId] = useState('');
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [distribute, setDistribute] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'members' | 'roles'>('members');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);

  const parsed = useMemo(() => mapLeadImportRows(matrix, mapping), [mapping, matrix]);
  const visibleMembers = useMemo(
    () => context.members.filter((member) => selectedStoreIds.includes(member.store_id)),
    [context.members, selectedStoreIds]
  );
  const selectedRoleMemberCount = useMemo(
    () => visibleMembers.filter((member) => selectedRoles.includes(member.role) && member.receives_leads).length,
    [selectedRoles, visibleMembers]
  );
  const suggestionByField = useMemo(
    () => new Map(mappingSuggestions.map((suggestion) => [suggestion.field, suggestion])),
    [mappingSuggestions]
  );

  async function authToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadContext() {
    setLoadingContext(true);
    setMessage('');
    try {
      const token = await authToken();
      const response = await fetch('/api/master/base-lead-import', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os dados da importação.');
      setContext(result);
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao carregar eventos, lojas e equipe.');
    } finally {
      setLoadingContext(false);
    }
  }

  useEffect(() => {
    if (open && !context.stores.length) void loadContext();
  }, [open]);

  function resetImport() {
    setFileName('');
    setFileHash('');
    setHeaders([]);
    setMatrix([]);
    setMapping({});
    setMappingSuggestions([]);
    setEventId('');
    setSelectedStoreIds([]);
    setDistribute(false);
    setSelectionMode('members');
    setSelectedMemberIds([]);
    setSelectedRoles([]);
    setReport(null);
    setMessage('');
    if (inputRef.current) inputRef.current.value = '';
  }

  function close() {
    if (busy) return;
    setOpen(false);
    resetImport();
  }

  async function readFile(file: File) {
    setMessage('');
    setReport(null);
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['xlsx', 'xls', 'csv'].includes(extension)) {
      return setMessage('Formato não aceito. Envie um arquivo XLSX, XLS ou CSV.');
    }
    if (file.size > LEAD_IMPORT_MAX_FILE_BYTES) {
      return setMessage('O arquivo ultrapassa o limite de 10 MB.');
    }

    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: 'array', cellDates: true, cellFormula: false, cellHTML: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('A planilha não contém nenhuma aba legível.');
      const worksheet = workbook.Sheets[sheetName];
      const values = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        raw: true,
        defval: '',
        blankrows: false
      }) as unknown[][];

      if (values.length < 2) throw new Error('A planilha deve conter cabeçalho e pelo menos uma linha de lead.');
      if (values.length - 1 > LEAD_IMPORT_MAX_ROWS) {
        throw new Error(`O limite é de ${LEAD_IMPORT_MAX_ROWS.toLocaleString('pt-BR')} linhas por importação.`);
      }

      const fileHeaders = Array.isArray(values[0]) ? values[0] : [];
      setFileName(file.name.slice(0, 240));
      setFileHash(await sha256(file));
      setHeaders(fileHeaders);
      setMatrix(values);
      const intelligentMapping = suggestLeadImportMappingDetailed(fileHeaders, values.slice(1, 101));
      setMapping(intelligentMapping.mapping);
      setMappingSuggestions(intelligentMapping.suggestions);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível interpretar o arquivo.');
      setMatrix([]);
    } finally {
      setBusy(false);
    }
  }

  function toggleStore(storeId: string) {
    const next = selectedStoreIds.includes(storeId)
      ? selectedStoreIds.filter((id) => id !== storeId)
      : [...selectedStoreIds, storeId];
    const nextStoreIds = new Set(next);
    const memberStoreById = new Map(context.members.map((member) => [member.id, member.store_id]));

    setSelectedStoreIds(next);
    setSelectedMemberIds((members) => members.filter((id) => nextStoreIds.has(memberStoreById.get(id) || '')));
  }

  function toggleValue(value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) {
    setter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function updateMapping(field: LeadImportField, value: string) {
    setMappingSuggestions((current) => current.filter((suggestion) => suggestion.field !== field));
    setMapping((current) => {
      const next = { ...current };
      if (!value) delete next[field];
      else next[field] = Number(value);
      return next;
    });
  }

  function canImport() {
    if (!fileName || !parsed.rows.length) return false;
    if (!selectedStoreIds.length) return false;
    if (!distribute) return true;
    if (selectionMode === 'members') return selectedMemberIds.length > 0;
    return selectedRoles.length > 0 && selectedRoleMemberCount > 0;
  }

  async function importLeads() {
    if (!canImport()) return;
    const rejectedNotice = parsed.errors.length
      ? ` ${parsed.errors.length} linha(s) inválida(s) não serão importadas e constarão no relatório.`
      : '';
    const confirmation = window.confirm(
      `Confirmar a importação de ${parsed.rows.length} lead(s)?${rejectedNotice} A operação será registrada na auditoria.`
    );
    if (!confirmation) return;

    setBusy(true);
    setMessage('Importando e conferindo duplicidades...');
    try {
      const token = await authToken();
      const chunks = Array.from(
        { length: Math.ceil(parsed.rows.length / IMPORT_REQUEST_ROWS) },
        (_, index) => parsed.rows.slice(index * IMPORT_REQUEST_ROWS, (index + 1) * IMPORT_REQUEST_ROWS)
      );
      const aggregate: ImportReport = {
        batch_id: '', total_rows: parsed.errors.length, inserted: 0, updated: 0, distributed: 0,
        duplicates: 0, conflicts: 0, errors: parsed.errors.length,
        items: parsed.errors.map((error) => ({
          row_number: error.row_number,
          status: 'error',
          message: `${error.message} Linha ignorada; os demais leads válidos foram processados.`
        }))
      };
      const batchIds: string[] = [];

      for (let index = 0; index < chunks.length; index += 1) {
        setMessage(`Processando lote ${index + 1} de ${chunks.length}...`);
        const response = await fetch('/api/master/base-lead-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            file_name: fileName,
            file_sha256: fileHash,
            event_id: eventId || null,
            selected_store_ids: selectedStoreIds,
            chunk_index: index + 1,
            chunk_count: chunks.length,
            distribution_offset: aggregate.distributed,
            distribution: {
              enabled: distribute,
              mode: selectionMode,
              member_ids: selectionMode === 'members' ? selectedMemberIds : [],
              roles: selectionMode === 'roles' ? selectedRoles : []
            },
            rows: chunks[index]
          })
        });
        const result = await response.json();
        if (!response.ok) {
          if (aggregate.total_rows) setReport({ ...aggregate, batch_id: batchIds.join(',') });
          throw new Error(result.error || `Não foi possível concluir o lote ${index + 1}.`);
        }

        const current = result.report as ImportReport;
        batchIds.push(current.batch_id);
        aggregate.total_rows += current.total_rows;
        aggregate.inserted += current.inserted;
        aggregate.updated += current.updated;
        aggregate.distributed += current.distributed;
        aggregate.duplicates += current.duplicates;
        aggregate.conflicts += current.conflicts;
        aggregate.errors += current.errors;
        aggregate.items.push(...current.items);
      }

      aggregate.batch_id = batchIds.join(',');
      setReport(aggregate);
      setMessage('Importação concluída.');
      await onImported();
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao importar os leads.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[9px] font-black uppercase text-blue-700 hover:bg-blue-100">
        <FileUp size={13} /> Importar leads
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Importar leads">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/20 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white/95 px-5 py-4 backdrop-blur">
              <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-600">Base Master</p><h2 className="text-xl font-black text-slate-950">Importar e distribuir leads</h2></div>
              <button type="button" onClick={close} disabled={busy} className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 disabled:opacity-50" aria-label="Fechar"><X size={18} /></button>
            </div>

            <div className="space-y-5 p-5">
              {message ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{message}</div> : null}

              {report ? (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-center gap-2 text-emerald-800"><CheckCircle2 size={20} /><h3 className="font-black">Relatório da importação</h3></div>
                  <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-7">
                    {[['Linhas', report.total_rows], ['Novos', report.inserted], ['Atualizados', report.updated], ['Distribuídos', report.distributed], ['Duplicados', report.duplicates], ['Conflitos', report.conflicts], ['Erros', report.errors]].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl bg-white p-3"><span className="block text-[9px] font-black uppercase text-zinc-400">{label}</span><strong className="text-xl text-slate-950">{value}</strong></div>
                    ))}
                  </div>
                  {report.items.some((item) => item.status === 'conflict' || item.status === 'error') ? <div className="mt-4 max-h-40 overflow-y-auto rounded-xl bg-white p-3 text-xs text-zinc-700">{report.items.filter((item) => item.status === 'conflict' || item.status === 'error').map((item) => <p key={`${item.row_number}-${item.status}`}><strong>Linha {item.row_number}:</strong> {item.message || item.status}</p>)}</div> : null}
                  <button type="button" onClick={resetImport} className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black uppercase text-white">Importar outro arquivo</button>
                </section>
              ) : (
                <>
                  <section className="rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 p-5">
                    <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
                    <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-5 text-sm font-black text-blue-700 shadow-sm disabled:opacity-50">
                      {busy ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}{fileName || 'Selecionar XLSX, XLS ou CSV'}
                    </button>
                    <p className="mt-2 text-center text-[10px] font-bold text-blue-500">Máximo de 10 MB e {LEAD_IMPORT_MAX_ROWS.toLocaleString('pt-BR')} linhas. A primeira aba será importada.</p>
                  </section>

                  {headers.length ? (
                    <section className="rounded-2xl border border-zinc-200 p-4">
                      <h3 className="text-sm font-black text-slate-950">1. Vincular colunas</h3>
                      <p className="mt-1 text-xs text-zinc-500">O sistema compara os títulos e o formato dos dados, independentemente da posição das colunas.</p>
                      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
                        {mappingSuggestions.length} campo(s) reconhecido(s) automaticamente no navegador. Confira os vínculos antes de continuar.
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {leadImportFields.map((field) => {
                          const suggestion = suggestionByField.get(field);
                          return <label key={field} className="text-[10px] font-black uppercase text-zinc-500"><span className="flex items-center justify-between gap-2"><span>{leadImportFieldLabels[field]}{field === 'name' ? ' *' : ''}</span>{suggestion ? <span className={`rounded-full px-2 py-0.5 text-[8px] ${suggestion.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{suggestion.confidence === 'high' ? 'Reconhecido' : 'Confira'}</span> : null}</span><select value={mapping[field] ?? ''} onChange={(event) => updateMapping(field, event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold normal-case text-slate-800"><option value="">Não importar</option>{headers.map((header, index) => <option key={`${index}-${String(header)}`} value={index}>{String(header || `Coluna ${index + 1}`)}</option>)}</select></label>;
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-700">{parsed.rows.length} linha(s) válida(s)</span>{parsed.errors.length ? <span className="rounded-full bg-red-100 px-3 py-1 font-bold text-red-700">{parsed.errors.length} linha(s) com erro</span> : null}</div>
                      {parsed.errors.length ? <div className="mt-3 max-h-28 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p className="mb-1 font-black">As linhas abaixo serão ignoradas. Você pode continuar com as linhas válidas.</p>{parsed.errors.slice(0, 50).map((error) => <p key={`${error.row_number}-${error.message}`}>Linha {error.row_number}: {error.message}</p>)}</div> : null}
                    </section>
                  ) : null}

                  {parsed.rows.length ? (
                    <>
                      <section className="rounded-2xl border border-zinc-200 p-4">
                        <h3 className="text-sm font-black text-slate-950">2. Evento e lojas</h3>
                        <label className="mt-3 block text-[10px] font-black uppercase text-zinc-500">Evento<select value={eventId} onChange={(event) => setEventId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold normal-case text-slate-800"><option value="">Sem evento</option>{context.events.map((event) => <option key={event.id} value={event.id}>{event.event_name}</option>)}</select></label>
                        <p className="mt-3 text-[10px] font-black uppercase text-zinc-500">Lojas que podem receber os leads *</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{context.stores.map((store) => <label key={store.id} className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold"><input type="checkbox" checked={selectedStoreIds.includes(store.id)} onChange={() => toggleStore(store.id)} />{store.store_name}</label>)}</div>
                      </section>

                      <section className="rounded-2xl border border-zinc-200 p-4">
                        <h3 className="text-sm font-black text-slate-950">3. Distribuição</h3>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setDistribute(false)} className={`rounded-xl border p-3 text-left text-xs font-black ${!distribute ? 'border-red-300 bg-red-50 text-red-700' : 'border-zinc-200'}`}>Não distribuir agora<span className="mt-1 block font-medium opacity-70">Salvar somente na Base.</span></button><button type="button" onClick={() => setDistribute(true)} className={`rounded-xl border p-3 text-left text-xs font-black ${distribute ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-zinc-200'}`}>Distribuir igualmente<span className="mt-1 block font-medium opacity-70">Rodízio entre todas as pessoas selecionadas.</span></button></div>
                        {distribute ? <div className="mt-4"><div className="inline-flex rounded-xl bg-zinc-100 p-1"><button type="button" onClick={() => setSelectionMode('members')} className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase ${selectionMode === 'members' ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500'}`}>Por membros</button><button type="button" onClick={() => setSelectionMode('roles')} className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase ${selectionMode === 'roles' ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500'}`}>Por cargos</button></div>
                          {selectionMode === 'members' ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{visibleMembers.map((member) => <label key={member.id} className="flex items-start gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs"><input className="mt-0.5" type="checkbox" checked={selectedMemberIds.includes(member.id)} onChange={() => toggleValue(member.id, setSelectedMemberIds)} /><span><strong className="block">{member.full_name}</strong><small className="text-zinc-500">{context.role_labels[member.role] || member.role} · {member.store_name}</small></span></label>)}</div> : <div className="mt-3 grid gap-2 sm:grid-cols-3">{['pre_sales', 'seller', 'prospector'].map((role) => <label key={role} className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-3 text-xs font-bold"><input type="checkbox" checked={selectedRoles.includes(role)} onChange={() => toggleValue(role, setSelectedRoles)} />{context.role_labels[role] || role}</label>)}</div>}
                          {selectionMode === 'roles' ? <p className="mt-2 text-[10px] font-bold text-zinc-500">{selectedRoleMemberCount} pessoa(s) ativa(s), habilitada(s) para receber leads.</p> : null}
                        </div> : null}
                      </section>

                      <section className="rounded-2xl border border-zinc-200 p-4"><h3 className="text-sm font-black text-slate-950">Prévia</h3><div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-[9px] uppercase text-zinc-400"><tr><th className="p-2">Linha</th><th className="p-2">Nome</th><th className="p-2">Telefone</th><th className="p-2">CPF</th><th className="p-2">E-mail</th></tr></thead><tbody>{parsed.rows.slice(0, 5).map((row: LeadImportRow) => <tr key={row.row_number} className="border-t border-zinc-100"><td className="p-2">{row.row_number}</td><td className="p-2 font-bold">{row.name}</td><td className="p-2">{row.phone || '-'}</td><td className="p-2">{row.cpf || '-'}</td><td className="p-2">{row.email || '-'}</td></tr>)}</tbody></table></div></section>
                    </>
                  ) : null}

                  {loadingContext ? <div className="flex items-center gap-2 text-sm font-bold text-zinc-500"><Loader2 className="animate-spin" size={16} /> Carregando eventos, lojas e equipe...</div> : null}
                  <div className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-4"><div className="flex items-start gap-2 text-[10px] font-bold text-zinc-500"><AlertTriangle className="mt-0.5 shrink-0" size={14} /><span>Dados existentes nunca serão sobrescritos. Conflitos entre CPF, telefone e e-mail serão bloqueados para revisão.</span></div><button type="button" disabled={busy || !canImport()} onClick={() => void importLeads()} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-red-600 px-5 text-xs font-black uppercase text-white hover:bg-red-700 disabled:opacity-40">{busy ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />} Confirmar importação</button></div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
