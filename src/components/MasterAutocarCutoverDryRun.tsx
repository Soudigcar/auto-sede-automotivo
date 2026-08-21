'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

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
  idempotency?: {
    source_duplicate_count: number;
    destination_duplicate_count: number;
    cross_conflict_count: number;
  };
};

type Report = {
  mode: 'dry-run-read-only';
  generated_at: string;
  source: { project_ref: string; schema: string };
  destination: {
    project_ref: string;
    environment: string;
    schema_version: number;
    live_enabled: false;
  };
  write_operations_available: false;
  safe_to_prepare_sync: boolean;
  blockers: string[];
  tables: TableReport[];
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
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function runDryRun() {
    if (!serviceRoleKey.trim() || busy) return;
    setBusy(true);
    setReport(null);
    setMessage('Executando comparação somente leitura...');
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token || '';
      if (!accessToken) throw new Error('Sessão Master expirada.');

      const response = await fetch('/api/master/autocar/cutover-dry-run', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({ production_service_role_key: serviceRoleKey.trim() })
      });
      const body = await response.json().catch(() => ({}));
      setServiceRoleKey('');
      if (!response.ok) throw new Error(body.error || 'Falha no dry-run AUTOCAR.');
      setReport(body.report);
      setMessage('Dry-run concluído. Nenhum dado foi alterado.');
    } catch (error: any) {
      setServiceRoleKey('');
      setMessage(error?.message || 'Falha no dry-run AUTOCAR.');
    } finally {
      setBusy(false);
    }
  }

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
                  Ferramenta temporária exclusiva do Preview. Compara runtime, IDs, hashes e idempotência sem disponibilizar nenhuma operação de escrita.
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                <strong>READ ONLY</strong><br />Nenhum insert, update, upsert ou delete.
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
                  placeholder="Usada apenas nesta requisição; não é salva"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none ring-0 placeholder:text-slate-600 focus:border-slate-500"
                />
                <span className="mt-2 block text-xs text-slate-500">
                  O campo é limpo imediatamente após a execução. A chave não é gravada pelo aplicativo, GitHub ou Vercel.
                </span>
              </label>
              <button
                type="button"
                disabled={busy || !serviceRoleKey.trim()}
                onClick={runDryRun}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Executar dry-run
              </button>
            </div>

            {message && <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">{message}</div>}
          </section>

          {report && (
            <>
              <section className={`rounded-2xl border p-5 ${report.safe_to_prepare_sync ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                <div className="flex items-start gap-3">
                  {report.safe_to_prepare_sync ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />}
                  <div>
                    <div className="font-semibold">{report.safe_to_prepare_sync ? 'Sem bloqueadores estruturais detectados' : 'Bloqueadores detectados'}</div>
                    <div className="mt-1 text-sm opacity-80">Production: {report.destination.project_ref} · schema {report.destination.schema_version} · live_enabled=false</div>
                    <div className="mt-1 text-xs opacity-60">Gerado em {new Date(report.generated_at).toLocaleString('pt-BR')}</div>
                  </div>
                </div>
                {report.blockers.length > 0 && (
                  <ul className="mt-4 list-disc space-y-1 pl-6 text-sm">
                    {report.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                  </ul>
                )}
              </section>

              {report.tables.map((table) => (
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
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs">
                      <div className="text-slate-500">Hash DEV</div><div className="mt-1 font-mono">{shortHash(table.source_hash)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs">
                      <div className="text-slate-500">Hash Production</div><div className="mt-1 font-mono">{shortHash(table.destination_hash)}</div>
                    </div>
                  </div>

                  {table.idempotency && (
                    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
                      Idempotência: duplicadas DEV <strong>{table.idempotency.source_duplicate_count}</strong> · duplicadas Production <strong>{table.idempotency.destination_duplicate_count}</strong> · conflitos cruzados <strong>{table.idempotency.cross_conflict_count}</strong>
                    </div>
                  )}

                  <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead className="bg-slate-950/80 text-xs text-slate-500"><tr><th className="px-4 py-3">Store ID</th><th className="px-4 py-3">DEV</th><th className="px-4 py-3">Production</th><th className="px-4 py-3">Δ</th></tr></thead>
                      <tbody>
                        {storeMap(table.source_by_store, table.destination_by_store).map((row) => (
                          <tr key={row.store_id} className="border-t border-slate-800">
                            <td className="px-4 py-3 font-mono text-xs">{row.store_id}</td>
                            <td className="px-4 py-3">{row.source}</td>
                            <td className="px-4 py-3">{row.destination}</td>
                            <td className="px-4 py-3">{row.source - row.destination >= 0 ? '+' : ''}{row.source - row.destination}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
