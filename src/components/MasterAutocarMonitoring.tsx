'use client';

import { useMemo, useState } from 'react';
import { Activity, Bot, BrainCircuit, Calculator, Clock3, Gauge, Route, ShieldCheck, Store, TriangleAlert } from 'lucide-react';

type StoreRow = { id: string; store_name: string; autocar?: any };
type PeriodKey = '24h' | '7d' | '30d' | 'sample';

type Props = {
  telemetry?: any;
  modelRegistry?: any;
  stores?: StoreRow[];
  controlPlane?: any;
  report?: any;
  runtime?: any;
};

function n(value: unknown) { return Math.max(0, Number(value || 0)).toLocaleString('pt-BR'); }
function brl(value: unknown) { return value === null || value === undefined ? '—' : Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 6 }); }
function ms(value: unknown) { const number = Number(value || 0); return number > 0 ? (number < 1000 ? `${Math.round(number)} ms` : `${(number / 1000).toFixed(1).replace('.', ',')} s`) : '—'; }
function date(value: unknown) { const text = String(value || ''); return text ? new Date(text).toLocaleString('pt-BR') : '—'; }

function Metric({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p><p className="mt-2 text-3xl font-black text-zinc-950">{value}</p></div><span className="rounded-xl bg-zinc-950 p-2.5 text-white">{icon}</span></div><p className="mt-3 text-[11px] font-bold leading-5 text-zinc-500">{helper}</p></div>;
}

export function MasterAutocarMonitoring({ telemetry, modelRegistry, stores = [], controlPlane, report, runtime }: Props) {
  const [period, setPeriod] = useState<PeriodKey>('24h');
  const selected = report?.periods?.[period] || {};
  const global = selected.global || {};
  const storeNames = useMemo(() => new Map(stores.map((store) => [store.id, store.store_name])), [stores]);
  const storeRows = Object.entries(selected.stores || {}).map(([storeId, metrics]: any) => ({ storeId, name: storeNames.get(storeId) || storeId, ...metrics })).sort((a: any, b: any) => Number(b.estimated_cost_brl || 0) - Number(a.estimated_cost_brl || 0));
  const lanes = controlPlane?.model_registry?.lanes || modelRegistry?.lanes || {};

  return <section className="mt-6 space-y-5">
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700"><ShieldCheck size={14}/>AI Control Plane V2</p><h2 className="mt-2 text-2xl font-black">Governança, roteamento e custo comprovável</h2><p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-zinc-600">O painel não rateia uso desconhecido. Custos aparecem somente quando modelo, quantidade de uso e tarifa interna estão comprovados.</p></div><div className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs font-black text-zinc-700"><p>{runtime?.runtime_environment || 'autocar-dev'}</p><p className="mt-1 text-[9px] text-zinc-400">ref {runtime?.project_ref || '—'} · {runtime?.database_state || '—'}</p></div></div></div>

    <div className="premium-card p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h3 className="text-lg font-black">Período observado</h3><p className="mt-1 text-xs font-bold text-zinc-500">Janela pedida: {period === 'sample' ? 'amostra disponível' : period}. Observado de {date(selected.observed_from)} até {date(selected.observed_to)}.</p></div><div className="flex flex-wrap gap-2">{(['24h','7d','30d','sample'] as PeriodKey[]).map((item) => <button key={item} onClick={() => setPeriod(item)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase ${period === item ? 'bg-red-600 text-white' : 'border border-zinc-200 bg-white text-zinc-600'}`}>{item === 'sample' ? 'Amostra' : item}</button>)}</div></div>{selected.sample_truncated ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-[10px] font-black text-amber-800"><TriangleAlert size={14}/>A amostra atingiu o limite de {n(report?.sample_limit)} claims; o período pode estar incompleto.</div> : null}</div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Claims" value={n(global.claims)} helper={`${n(global.completed)} concluídos · ${n(global.failed)} falhos · ${n(global.skipped)} ignorados`} icon={<Activity size={19}/>} /><Metric label="Tokens atribuídos" value={n(global.tokens?.attributed_total)} helper={`${n(global.tokens?.priced)} precificados · ${n(global.tokens?.unpriced)} sem preço · ${n(global.tokens?.unattributed)} sem modelo`} icon={<BrainCircuit size={19}/>} /><Metric label="Custo comprovável" value={brl(global.estimated_cost_brl)} helper={global.cost_is_partial ? 'Valor parcial: existe consumo não alocado ou não precificado.' : 'Somente consumo com atribuição determinística.'} icon={<Calculator size={19}/>} /><Metric label="Latência média" value={ms(global.average_claim_latency_ms)} helper="Tempo do claim quando início e conclusão estão disponíveis." icon={<Gauge size={19}/>} /></div>

    <div className="grid gap-5 xl:grid-cols-2"><div className="premium-card p-5"><div className="flex items-center gap-2"><Route size={18} className="text-red-600"/><h3 className="text-lg font-black">Model Router</h3></div><div className="mt-4 space-y-2">{Object.entries(lanes).map(([lane, entry]: any) => <div key={lane} className="grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-[90px_1fr_auto] md:items-center"><div><p className="font-black capitalize">{lane}</p><p className="text-[9px] font-bold uppercase text-zinc-400">{entry?.role || 'lane'}</p></div><code className="text-xs font-bold text-zinc-600">{entry?.model || '—'}</code><span className="rounded-lg bg-white px-3 py-1.5 text-xs font-black">{n(global.lane_calls?.[lane])} chamadas</span></div>)}</div><p className="mt-3 text-[10px] font-bold text-zinc-500">Escaladas para Sol: <strong>{n(global.sol_escalations)}</strong> · roteadas sem usage atribuível: <strong>{n(global.unmetered_routed_calls)}</strong> · áudio/TTS sem unidade de custo: <strong>{n(global.unmetered_audio_calls)}</strong>.</p></div><div className="premium-card p-5"><div className="flex items-center gap-2"><Clock3 size={18} className="text-red-600"/><h3 className="text-lg font-black">Precisão do custo</h3></div><p className="mt-3 text-xs font-bold leading-5 text-zinc-600">{report?.pricing?.note || 'Sem relatório de custo.'}</p><div className="mt-4 rounded-xl bg-zinc-50 p-4 text-xs font-bold text-zinc-600"><p>Schema de preços: <strong>{report?.pricing?.schema_ready ? 'PRONTO' : 'NÃO PROVISIONADO'}</strong></p><p className="mt-2">Modelos com preço ativo: <strong>{n(report?.pricing?.active_models)}</strong></p><p className="mt-2">Telemetria V1 ainda disponível: <strong>{n(telemetry?.global?.claims)} claims</strong></p></div></div></div>

    <div className="premium-card p-5"><div className="flex items-center gap-2"><Store size={18} className="text-red-600"/><h3 className="text-lg font-black">Consumo por loja</h3></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-[9px] font-black uppercase text-zinc-400"><tr><th className="pb-2">Loja</th><th>Claims</th><th>Tokens</th><th>Custo</th><th>Não precificados</th><th>Latência</th></tr></thead><tbody>{storeRows.map((row: any) => <tr key={row.storeId} className="border-t border-zinc-100"><td className="py-3 font-black text-zinc-900">{row.name}</td><td>{n(row.claims)}</td><td>{n(row.tokens?.attributed_total)}</td><td className="font-black">{brl(row.estimated_cost_brl)}</td><td>{n(row.tokens?.unpriced + row.tokens?.unattributed)}</td><td>{ms(row.average_claim_latency_ms)}</td></tr>)}</tbody></table>{!storeRows.length ? <p className="py-5 text-center text-xs font-bold text-zinc-400">Sem claims no período selecionado.</p> : null}</div></div>

    <div className="premium-card p-5"><div className="flex items-center gap-2"><Bot size={18} className="text-red-600"/><h3 className="text-lg font-black">Conversas com consumo comprovado</h3></div><p className="mt-2 text-xs font-bold text-zinc-500">Somente identificador técnico, loja e métricas. Nenhum conteúdo da conversa é exibido.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-[9px] font-black uppercase text-zinc-400"><tr><th className="pb-2">Conversa</th><th>Loja</th><th>Claims</th><th>Tokens</th><th>Custo</th></tr></thead><tbody>{(selected.conversations || []).map((row: any) => <tr key={`${row.store_id}:${row.conversation_id}`} className="border-t border-zinc-100"><td className="py-3"><code className="text-[10px] font-bold text-zinc-600">{row.conversation_id}</code></td><td className="font-black">{storeNames.get(row.store_id) || row.store_id}</td><td>{n(row.claims)}</td><td>{n(row.tokens?.attributed_total)}</td><td className="font-black">{brl(row.estimated_cost_brl)}</td></tr>)}</tbody></table>{!(selected.conversations || []).length ? <p className="py-5 text-center text-xs font-bold text-zinc-400">Sem conversas mensuráveis no período.</p> : null}</div></div>
  </section>;
}
