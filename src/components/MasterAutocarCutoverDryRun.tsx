'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

const EXECUTION_CONFIRMATION = 'SINCRONIZAR AUTOCAR PRODUCTION';

type StoreCount = { store_id: string; count: number };
type TableReport = {
  table: string;
  source_count: number;
  destination_count: number;
  delta: number;
  source_hash: string;
  destination_hash: string;
  missing_in_destination_count: number;
  changed_count: number;
  extra_in_destination_count: number;
  source_by_store: StoreCount[];
  destination_by_store: StoreCount[];
  logical_identity: { cross_conflict_count: number };
  idempotency?: {
    source_duplicate_count: number;
    destination_duplicate_count: number;
    cross_conflict_count: number;
  };
};

type SyncPreparation = {
  batch_size: number;
  ready_for_separate_execution_authorization: boolean;
  blockers: string[];
  tables: Array<{
    table: string;
    insert_count: number;
    update_count: number;
    unchanged_count: number;
    upsert_count: number;
  }>;
};

type Report = {
  mode: 'dry-run-read-only';
  generated_at: string;
  destination: {
    project_ref: string;
    environment: string;
    schema_version: number;
    live_enabled: false;
  };
  safe_to_prepare_sync: boolean;
  blockers: string[];
  tables: TableReport[];
  sync_preparation: SyncPreparation;
};

type ExecutionPreflight = {
  mode: 'execution-preflight-read-only';
  generated_at: string;
  destination_project_ref: string;
  destination_environment: 'production';
  destination_schema_version: number;
  destination_live_enabled: false;
  write_gate_mode: 'code';
  write_gate_allowed_branch: string;
  write_gate_enabled: boolean;
  delete_operations: false;
  operation: 'upsert';
  on_conflict: 'id';
  batch_size: number;
  required_store_ref_count: number;
  present_store_ref_count: number;
  missing_store_ref_ids: string[];
  blockers: string[];
  ready_for_execution: boolean;
  tables: Array<{
    table: string;
    source_count: number;
    destination_count: number;
    insert_count: number;
    update_count: number;
    unchanged_count: number;
    upsert_count: number;
    logical_identity_conflicts: number;
    idempotency_conflicts: number;
  }>;
};

function shortHash(value: string) {
  return value ? `${value.slice(0, 10)}…${value.slice(-8)}` : '—';
}

function storeMap(source: StoreCount[], destination: StoreCount[]) {
  const rows = new Map<string, { store_id: string; source: number; destination: number }>();
  for (const item of source) rows.set(item.store_id, { store_id: item.store_id, source: item.count, destination: 0 });
  for (const item of destination) {
    const row = rows.get(item.store_id) || { store_id: item.store_id, source: 0, destination: 0 };
    row.destination = item.count;
    rows.set(item.store_id, row);
  }
  return [...rows.values()].sort((left, right) => left.store_id.localeCompare(right.store_id));
}

export function MasterAutocarCutoverDryRun() {
  const supabase = useMemo(() => createClient(), []);
  const [serviceRoleKey, setServiceRoleKey] = useState('');
  const [executionServiceRoleKey, setExecutionServiceRoleKey] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledgeNoDeletes, setAcknowledgeNoDeletes] = useState(false);
  const [acknowledgeLiveFalse, setAcknowledgeLiveFalse] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [executionPreflight, setExecutionPreflight] = useState<ExecutionPreflight | null>(null);
  const [busy, setBusy] = useState(false);
  const [executionBusy, setExecutionBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [executionMessage, setExecutionMessage] = useState('');

  async function masterToken() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || '';
    if (!token) throw new Error('Sessão Master expirada.');
    return token;
  }

  async function runDryRun() {
    const key = serviceRoleKey.trim();
    if (!key || busy) return;
    setBusy(true);
    setReport(null);
    setExecutionPreflight(null);
    setMessage('Executando comparação somente leitura...');
    try {
      const accessToken = await masterToken();
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };

      const dryRunResponse = await fetch('/api/master/autocar/cutover-dry-run', {
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify({ production_service_role_key: key })
      });
      const dryRunBody = await dryRunResponse.json().catch(() => ({}));
      if (!dryRunResponse.ok) throw new Error(dryRunBody.error || 'Falha no dry-run AUTOCAR.');
      setReport(dryRunBody.report);

      const preflightResponse = await fetch('/api/master/autocar/cutover-sync', {
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify({ action: 'preflight', production_service_role_key: key })
      });
      const preflightBody = await preflightResponse.json().catch(() => ({}));
      if (!preflightResponse.ok) throw new Error(preflightBody.error || 'Falha no preflight de execução.');
      setExecutionPreflight(preflightBody.preflight);
      setMessage('Dry-run e preflight concluídos. Nenhum dado foi alterado.');
    } catch (error: any) {
      setMessage(error?.message || 'Falha no dry-run AUTOCAR.');
    } finally {
      setServiceRoleKey('');
      setBusy(false);
    }
  }

  async function executeSync() {
    if (!executionPreflight?.ready_for_execution || executionBusy) return;
    if (confirmation !== EXECUTION_CONFIRMATION) return;
    if (!acknowledgeNoDeletes || !acknowledgeLiveFalse) return;
    if (!executionServiceRoleKey.trim()) return;

    setExecutionBusy(true);
    setExecutionMessage('Executando preflight fresco antes da operação...');
    try {
      const accessToken = await masterToken();
      const response = await fetch('/api/master/autocar/cutover-sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({
          action: 'execute',
          production_service_role_key: executionServiceRoleKey.trim(),
          confirmation,
          acknowledge_no_deletes: acknowledgeNoDeletes,
          acknowledge_live_must_remain_false: acknowledgeLiveFalse
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Sincronização bloqueada pelo SAFE CORE.');
      setExecutionMessage('Sincronização concluída. Reexecute o dry-run para revisar o estado residual.');
    } catch (error: any) {
      setExecutionMessage(error?.message || 'Sincronização bloqueada pelo SAFE CORE.');
    } finally {
      setExecutionServiceRoleKey('');
      setConfirmation('');
      setAcknowledgeNoDeletes(false);
      setAcknowledgeLiveFalse(false);
      setExecutionBusy(false);
    }
  }

  const executionConfirmationReady =
    executionPreflight?.ready_for_execution === true
    && executionServiceRoleKey.trim().length > 0
    && confirmation === EXECUTION_CONFIRMATION
    && acknowledgeNoDeletes
    && acknowledgeLiveFalse;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:flex">
      <MasterSidebar active="/master/autocar" />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <ShieldCheck className="h-4 w-4" /> AUTOCAR · Cutover seguro
                </div>
                <h1 className="text-2xl font-bold">Dry-run DEV → Production</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Preview Master temporário. O dry-run e o preflight leem o estado atual antes de qualquer futura operação.
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                <strong>SAFE CORE</strong><br />Nenhuma execução automática.
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Service-role do AUTOCAR Production</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={serviceRoleKey}
                  onChange={(event) => setServiceRoleKey(event.target.value)}
                  placeholder="Usada somente nesta requisição; não é salva"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-slate-500"
                />
                <span className="mt-2 block text-xs text-slate-500">O campo é limpo após a requisição.</span>
              </label>
              <button
                type="button"
                disabled={busy || !serviceRoleKey.trim()}
                onClick={runDryRun}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Executar dry-run + preflight
              </button>
            </div>
            {message && <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">{message}</div>}
          </section>

          {report && (
            <section className={`rounded-2xl border p-5 ${report.safe_to_prepare_sync ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
              <div className="flex items-start gap-3">
                {report.safe_to_prepare_sync ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />}
                <div>
                  <div className="font-semibold">{report.safe_to_prepare_sync ? 'Runtime sem conflitos de identidade/idempotência' : 'Bloqueadores no dry-run'}</div>
                  <div className="mt-1 text-sm opacity-80">Production: {report.destination.project_ref} · schema {report.destination.schema_version} · live_enabled=false</div>
                  <div className="mt-1 text-xs opacity-60">Gerado em {new Date(report.generated_at).toLocaleString('pt-BR')}</div>
                </div>
              </div>
              {report.blockers.length > 0 && <ul className="mt-4 list-disc space-y-1 pl-6 text-sm">{report.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
            </section>
          )}

          {executionPreflight && (
            <section className={`rounded-2xl border p-5 ${executionPreflight.ready_for_execution ? 'border-red-500/40 bg-red-500/10' : 'border-violet-500/30 bg-violet-500/10'}`}>
              <div className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 h-5 w-5 text-violet-300" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">Endpoint de execução preparado · gate por código {executionPreflight.write_gate_enabled ? 'HABILITADO' : 'DESABILITADO'}</div>
                  <p className="mt-1 text-sm text-slate-300/80">
                    Gate controlado por código, fail-closed, restrito ao Preview e à branch {executionPreflight.write_gate_allowed_branch}. Variáveis da Vercel não habilitam escrita.
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4 text-sm"><div className="text-slate-500">Gate</div><div className="mt-1 font-semibold">{executionPreflight.write_gate_mode.toUpperCase()}</div></div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4 text-sm"><div className="text-slate-500">Operação</div><div className="mt-1 font-semibold">UPSERT por ID</div></div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4 text-sm"><div className="text-slate-500">Batch</div><div className="mt-1 font-semibold">{executionPreflight.batch_size}</div></div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4 text-sm"><div className="text-slate-500">Store refs</div><div className="mt-1 font-semibold">{executionPreflight.present_store_ref_count}/{executionPreflight.required_store_ref_count}</div></div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4 text-sm"><div className="text-slate-500">Pronto para executar</div><div className="mt-1 font-semibold">{executionPreflight.ready_for_execution ? 'SIM' : 'NÃO'}</div></div>
                  </div>

                  {executionPreflight.blockers.length > 0 && (
                    <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                      <div className="font-semibold text-amber-200">SAFE CORE bloqueou a execução</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100/80">
                        {executionPreflight.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {executionPreflight.tables.map((table) => (
                      <div key={table.table} className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                        <div className="font-mono text-xs text-violet-200">{table.table}</div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                          <div><div className="text-slate-500">Insert</div><div className="font-bold">{table.insert_count}</div></div>
                          <div><div className="text-slate-500">Update</div><div className="font-bold">{table.update_count}</div></div>
                          <div><div className="text-slate-500">Inalterados</div><div className="font-bold">{table.unchanged_count}</div></div>
                          <div><div className="text-slate-500">Upsert</div><div className="font-bold">{table.upsert_count}</div></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-xl border border-red-500/20 bg-slate-950/60 p-4">
                    <div className="font-semibold text-slate-200">Confirmação para uma futura execução</div>
                    <p className="mt-1 text-xs text-slate-500">Os controles só ficam utilizáveis quando todos os blockers forem resolvidos e uma alteração futura explícita habilitar o gate por código.</p>
                    <div className="mt-4 grid gap-3">
                      <input
                        type="password"
                        autoComplete="off"
                        value={executionServiceRoleKey}
                        onChange={(event) => setExecutionServiceRoleKey(event.target.value)}
                        disabled={!executionPreflight.ready_for_execution}
                        placeholder="Service-role do AUTOCAR Production"
                        className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm disabled:opacity-40"
                      />
                      <input
                        type="text"
                        autoComplete="off"
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        disabled={!executionPreflight.ready_for_execution}
                        placeholder={`Digite exatamente: ${EXECUTION_CONFIRMATION}`}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm disabled:opacity-40"
                      />
                      <label className="flex items-start gap-2 text-sm text-slate-300"><input type="checkbox" checked={acknowledgeNoDeletes} onChange={(event) => setAcknowledgeNoDeletes(event.target.checked)} disabled={!executionPreflight.ready_for_execution} className="mt-1" />Confirmo que esta operação não executará deletes.</label>
                      <label className="flex items-start gap-2 text-sm text-slate-300"><input type="checkbox" checked={acknowledgeLiveFalse} onChange={(event) => setAcknowledgeLiveFalse(event.target.checked)} disabled={!executionPreflight.ready_for_execution} className="mt-1" />Confirmo que `live_enabled` deve permanecer false.</label>
                      <button
                        type="button"
                        disabled={!executionConfirmationReady || executionBusy}
                        onClick={executeSync}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-red-500 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {executionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                        Executar sincronização protegida
                      </button>
                      {executionMessage && <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">{executionMessage}</div>}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {report?.tables.map((table) => (
            <section key={table.table} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">{table.table}</h2>
                <div className="text-xs text-slate-500">Δ {table.delta >= 0 ? '+' : ''}{table.delta}</div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ['DEV', table.source_count],
                  ['Production', table.destination_count],
                  ['Ausentes destino', table.missing_in_destination_count],
                  ['Alterados', table.changed_count],
                  ['Só no destino', table.extra_in_destination_count]
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="mt-1 text-xl font-bold">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs"><div className="text-slate-500">Hash DEV</div><div className="mt-1 font-mono">{shortHash(table.source_hash)}</div></div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs"><div className="text-slate-500">Hash Production</div><div className="mt-1 font-mono">{shortHash(table.destination_hash)}</div></div>
              </div>
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
                Identidade lógica: conflitos <strong>{table.logical_identity.cross_conflict_count}</strong>
                {table.idempotency && <> · Idempotência: duplicadas DEV <strong>{table.idempotency.source_duplicate_count}</strong> · Production <strong>{table.idempotency.destination_duplicate_count}</strong> · cruzados <strong>{table.idempotency.cross_conflict_count}</strong></>}
              </div>
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-slate-950/80 text-xs text-slate-500"><tr><th className="px-4 py-3">Store ID</th><th className="px-4 py-3">DEV</th><th className="px-4 py-3">Production</th><th className="px-4 py-3">Δ</th></tr></thead>
                  <tbody>
                    {storeMap(table.source_by_store, table.destination_by_store).map((row) => (
                      <tr key={row.store_id} className="border-t border-slate-800"><td className="px-4 py-3 font-mono text-xs">{row.store_id}</td><td className="px-4 py-3">{row.source}</td><td className="px-4 py-3">{row.destination}</td><td className="px-4 py-3">{row.source - row.destination >= 0 ? '+' : ''}{row.source - row.destination}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
