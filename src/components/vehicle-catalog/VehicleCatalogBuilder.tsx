'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase';

type BuilderRow = {
  id: string;
  selected: boolean;
  status: 'new' | 'duplicate' | 'conflict' | 'incomplete' | 'existing' | string;
  brand: string;
  model: string;
  version: string;
  manufacture_year: number | null;
  model_year: number | null;
  fuel: string;
  transmission: string;
  source_count: number;
  sources: string[];
  raw_brands: string[];
  raw_models: string[];
  raw_versions: string[];
  warnings: string[];
  existing?: Record<string, string | null>;
};

type Analysis = {
  generated_at?: string;
  summary: {
    scanned: number;
    ignored: number;
    groups: number;
    new: number;
    duplicates: number;
    conflicts: number;
    incomplete: number;
    existing: number;
  };
  rows: BuilderRow[];
  brands: { id: string; name: string }[];
};

const emptyAnalysis: Analysis = {
  summary: {
    scanned: 0,
    ignored: 0,
    groups: 0,
    new: 0,
    duplicates: 0,
    conflicts: 0,
    incomplete: 0,
    existing: 0
  },
  rows: [],
  brands: []
};

const inputClass =
  'min-w-[130px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';

const statusLabels: Record<string, string> = {
  new: 'Novo',
  duplicate: 'Agrupado',
  conflict: 'Conflito',
  incomplete: 'Incompleto',
  existing: 'Já cadastrado'
};

const statusClasses: Record<string, string> = {
  new: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  duplicate: 'border-blue-200 bg-blue-50 text-blue-700',
  conflict: 'border-amber-200 bg-amber-50 text-amber-800',
  incomplete: 'border-red-200 bg-red-50 text-red-700',
  existing: 'border-zinc-200 bg-zinc-100 text-zinc-600'
};

export function VehicleCatalogBuilder({ onApplied }: { onApplied: () => void | Promise<void> }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis>(emptyAnalysis);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<'all' | 'new' | 'duplicate' | 'conflict' | 'incomplete' | 'existing'>('all');
  const [search, setSearch] = useState('');

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function analyze() {
    if (loading || applying) return;
    setLoading(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sua sessão expirou.');
      const response = await fetch('/api/master/vehicle-catalog/assistant', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'analyze' })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível analisar o estoque.');
      setAnalysis({ ...emptyAnalysis, ...payload, rows: Array.isArray(payload.rows) ? payload.rows : [] });
      setMessage('Análise concluída. Revise as linhas antes de aprovar.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível analisar o estoque.');
    } finally {
      setLoading(false);
    }
  }

  function openBuilder() {
    setOpen(true);
    if (!analysis.rows.length) void analyze();
  }

  function updateRow(id: string, changes: Partial<BuilderRow>) {
    setAnalysis((current) => ({
      ...current,
      rows: current.rows.map((row) => row.id === id ? { ...row, ...changes } : row)
    }));
  }

  function selectVisible(value: boolean) {
    const visibleIds = new Set(filteredRows.map((row) => row.id));
    setAnalysis((current) => ({
      ...current,
      rows: current.rows.map((row) => {
        if (!visibleIds.has(row.id)) return row;
        if (['existing', 'incomplete'].includes(row.status)) return { ...row, selected: false };
        return { ...row, selected: value };
      })
    }));
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return analysis.rows.filter((row) => {
      if (filter !== 'all' && row.status !== filter) return false;
      if (!query) return true;
      return [row.brand, row.model, row.version, row.fuel, row.transmission, ...(row.warnings || [])]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [analysis.rows, filter, search]);

  const selectedRows = analysis.rows.filter((row) => row.selected && !['existing', 'incomplete'].includes(row.status));

  async function applySelected() {
    if (!selectedRows.length || applying || loading) return;
    setApplying(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sua sessão expirou.');
      const response = await fetch('/api/master/vehicle-catalog/assistant', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'apply', rows: selectedRows })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar o lote.');
      const result = payload.result || {};
      const errorCount = Array.isArray(result.errors) ? result.errors.length : 0;
      setMessage(
        `${result.processed || 0} linha(s) processada(s). ` +
        `${result.models_created || 0} modelo(s), ${result.versions_created || 0} versão(ões) e ` +
        `${result.configurations_created || 0} configuração(ões) criadas.` +
        (errorCount ? ` ${errorCount} linha(s) precisam de revisão.` : '')
      );
      await onApplied();
      await analyze();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar o lote.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openBuilder}
        className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-600/20 hover:bg-violet-700"
      >
        <Sparkles size={17} />
        Montar catálogo automaticamente
      </button>

      {open ? (
        <div className="fixed inset-0 z-[1500] flex flex-col bg-slate-950/80 p-2 md:p-5">
          <section className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col overflow-hidden rounded-[28px] border border-zinc-200 bg-[#f6f7fb] shadow-2xl">
            <header className="flex flex-col gap-4 border-b border-zinc-200 bg-white p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-violet-600">
                  <Bot size={16} /> Assistente de catálogo
                </p>
                <h2 className="mt-1 text-2xl font-black md:text-3xl">Construção automática com revisão em lote</h2>
                <p className="mt-2 text-sm font-semibold text-zinc-500">
                  Analisa site_vehicles e inventory. Nenhum dado existente é alterado sem sua aprovação.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void analyze()}
                  disabled={loading || applying}
                  className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-black text-zinc-700"
                >
                  {loading ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
                  Analisar novamente
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl border border-zinc-200 bg-white p-3 text-zinc-600"
                  aria-label="Fechar"
                >
                  <X size={19} />
                </button>
              </div>
            </header>

            <div className="grid gap-3 border-b border-zinc-200 bg-white px-5 pb-5 md:grid-cols-4 xl:grid-cols-8 md:px-6">
              {[
                ['Registros lidos', analysis.summary.scanned, Database],
                ['Grupos', analysis.summary.groups, Bot],
                ['Novos', analysis.summary.new, CheckCircle2],
                ['Agrupados', analysis.summary.duplicates, Sparkles],
                ['Conflitos', analysis.summary.conflicts, AlertTriangle],
                ['Incompletos', analysis.summary.incomplete, AlertTriangle],
                ['Existentes', analysis.summary.existing, CheckCircle2],
                ['Selecionados', selectedRows.length, Save]
              ].map(([label, value, Icon]: any) => (
                <div key={label} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{label}</p>
                    <Icon size={15} className="text-zinc-400" />
                  </div>
                  <strong className="mt-1 block text-2xl font-black">{value}</strong>
                </div>
              ))}
            </div>

            {message ? (
              <div className={`mx-5 mt-4 rounded-2xl border p-3 text-sm font-bold md:mx-6 ${
                /não|erro|falha|precisam/i.test(message)
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}>
                {message}
              </div>
            ) : null}

            <div className="grid gap-3 p-5 md:grid-cols-[1fr_220px_auto] md:p-6">
              <label className="relative block">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-sm font-bold outline-none focus:border-violet-400"
                  placeholder="Buscar marca, modelo, versão ou alerta..."
                />
              </label>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as any)}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-black"
              >
                <option value="all">Todos os resultados</option>
                <option value="new">Novos</option>
                <option value="duplicate">Agrupados</option>
                <option value="conflict">Conflitos</option>
                <option value="incomplete">Incompletos</option>
                <option value="existing">Já cadastrados</option>
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => selectVisible(true)}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-black"
                >
                  Selecionar visíveis
                </button>
                <button
                  type="button"
                  onClick={() => selectVisible(false)}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-black"
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 md:px-6 md:pb-6">
              {loading && !analysis.rows.length ? (
                <div className="flex min-h-80 items-center justify-center rounded-3xl border border-zinc-200 bg-white">
                  <div className="text-center">
                    <Loader2 className="mx-auto animate-spin text-violet-600" size={36} />
                    <p className="mt-3 text-sm font-black text-zinc-600">Lendo e agrupando o estoque...</p>
                  </div>
                </div>
              ) : (
                <div className="min-w-[1550px] overflow-hidden rounded-3xl border border-zinc-200 bg-white">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10 bg-[#101522] text-white">
                      <tr className="text-[10px] font-black uppercase tracking-wide">
                        <th className="w-12 px-3 py-4">Usar</th>
                        <th className="px-3 py-4">Situação</th>
                        <th className="px-3 py-4">Marca</th>
                        <th className="px-3 py-4">Modelo</th>
                        <th className="px-3 py-4">Versão</th>
                        <th className="px-3 py-4">Ano fab.</th>
                        <th className="px-3 py-4">Ano mod.</th>
                        <th className="px-3 py-4">Combustível</th>
                        <th className="px-3 py-4">Câmbio</th>
                        <th className="px-3 py-4">Ocorrências</th>
                        <th className="min-w-[320px] px-3 py-4">Revisão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const disabled = ['existing', 'incomplete'].includes(row.status);
                        return (
                          <tr key={row.id} className="border-t border-zinc-100 align-top hover:bg-zinc-50">
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={row.selected === true}
                                disabled={disabled}
                                onChange={(event) => updateRow(row.id, { selected: event.target.checked })}
                                className="h-5 w-5 accent-violet-600"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase ${statusClasses[row.status] || statusClasses.new}`}>
                                {statusLabels[row.status] || row.status}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <input
                                list="catalog-brand-options"
                                value={row.brand || ''}
                                onChange={(event) => updateRow(row.id, { brand: event.target.value, status: row.status === 'incomplete' ? 'conflict' : row.status })}
                                className={inputClass}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                value={row.model || ''}
                                onChange={(event) => updateRow(row.id, { model: event.target.value })}
                                className={inputClass}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                value={row.version || ''}
                                onChange={(event) => updateRow(row.id, { version: event.target.value })}
                                className={`${inputClass} min-w-[190px]`}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                value={row.manufacture_year || ''}
                                onChange={(event) => updateRow(row.id, { manufacture_year: event.target.value ? Number(event.target.value) : null })}
                                className={`${inputClass} min-w-[100px]`}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                value={row.model_year || ''}
                                onChange={(event) => updateRow(row.id, { model_year: event.target.value ? Number(event.target.value) : null })}
                                className={`${inputClass} min-w-[100px]`}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                value={row.fuel || ''}
                                onChange={(event) => updateRow(row.id, { fuel: event.target.value })}
                                className={inputClass}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                value={row.transmission || ''}
                                onChange={(event) => updateRow(row.id, { transmission: event.target.value })}
                                className={inputClass}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <strong className="block text-sm font-black">{row.source_count || 1}</strong>
                              <span className="mt-1 block text-[10px] font-bold text-zinc-500">
                                {(row.sources || []).map((source) => source === 'site_vehicles' ? 'Sites' : 'Estoque').join(' + ')}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="grid gap-1 text-xs font-semibold text-zinc-600">
                                {(row.warnings || []).length ? row.warnings.map((warning, index) => (
                                  <span key={`${row.id}-${index}`} className="flex gap-2">
                                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
                                    {warning}
                                  </span>
                                )) : (
                                  <span className="flex items-center gap-2 text-emerald-700">
                                    <CheckCircle2 size={14} /> Pronto para aprovação.
                                  </span>
                                )}
                                {(row.raw_models || []).length > 1 ? (
                                  <span className="mt-1 text-[10px] text-zinc-400" title={(row.raw_models || []).join(' | ')}>
                                    Modelos originais: {(row.raw_models || []).slice(0, 3).join(' • ')}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!filteredRows.length ? (
                    <div className="p-12 text-center text-sm font-bold text-zinc-500">Nenhuma linha encontrada com esse filtro.</div>
                  ) : null}
                </div>
              )}
            </div>

            <footer className="flex flex-col gap-3 border-t border-zinc-200 bg-white p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <p className="text-xs font-semibold text-zinc-500">
                A aprovação cria somente novos registros no Cadastro Mestre. Os estoques originais permanecem intactos.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-700"
                >
                  Fechar sem salvar
                </button>
                <button
                  type="button"
                  onClick={() => void applySelected()}
                  disabled={!selectedRows.length || applying || loading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-violet-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {applying ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
                  Aprovar {selectedRows.length} selecionado(s)
                </button>
              </div>
            </footer>
          </section>

          <datalist id="catalog-brand-options">
            {analysis.brands.map((brand) => <option key={brand.id} value={brand.name} />)}
          </datalist>
        </div>
      ) : null}
    </>
  );
}
