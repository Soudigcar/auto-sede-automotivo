'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Play, ShieldCheck, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type StoreRow = { id: string; store_name: string; slug?: string | null };
type Mode = 'copilot' | 'autopilot';

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 300) }; }
}

export function MasterAutocarTestLab({ stores: fallbackStores = [] }: { stores?: StoreRow[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [stores, setStores] = useState<StoreRow[]>(fallbackStores);
  const [storeId, setStoreId] = useState(fallbackStores[0]?.id || '');
  const [mode, setMode] = useState<Mode>('copilot');
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

  const load = useCallback(async () => {
    try {
      const access = await token();
      if (!access) throw new Error('Sessão Master expirada.');
      const response = await fetch('/api/master/autocar/simulator', { headers: { Authorization: `Bearer ${access}` }, cache: 'no-store' });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error || 'Falha ao carregar o laboratório.');
      const rows = (body.stores || []) as StoreRow[];
      setStores(rows);
      setStoreId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id || '');
    } catch (error: any) { setMessage(error?.message || 'Falha ao carregar o laboratório.'); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function simulate() {
    if (!storeId || !question.trim()) return;
    setBusy(true); setResult(null); setMessage('Executando simulação privada, sem ações externas...');
    try {
      const access = await token();
      const response = await fetch('/api/master/autocar/simulator', {
        method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, customer_input: question, mode })
      });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error || 'Falha na simulação.');
      setResult(body); setMessage('Simulação concluída. Nenhuma ação externa foi executada.');
    } catch (error: any) { setMessage(error?.message || 'Falha na simulação.'); }
    finally { setBusy(false); }
  }

  const selected = stores.find((store) => store.id === storeId);
  return <section className="mt-6 space-y-5">
    <div className="premium-card p-5 md:p-6">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-zinc-950 p-2.5 text-white"><Bot size={19}/></span><div><h2 className="text-xl font-black">Laboratório seguro COPILOT / AUTOPILOT</h2><p className="mt-1 text-xs font-bold leading-5 text-zinc-500">Usa o mesmo simulador privado já validado. Consulta o contexto real da loja, mas não envia WhatsApp, não altera CRM, não muda modo e não executa ação externa.</p></div></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-xs font-black">Loja<select className="premium-input mt-1.5" value={storeId} onChange={(event) => setStoreId(event.target.value)}>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select></label><div><p className="text-xs font-black">Modo simulado</p><div className="mt-1.5 grid grid-cols-2 gap-2">{(['copilot','autopilot'] as Mode[]).map((item) => <button key={item} type="button" onClick={() => setMode(item)} className={`rounded-xl px-4 py-3 text-xs font-black uppercase ${mode === item ? 'bg-red-600 text-white' : 'border border-zinc-200 bg-white text-zinc-600'}`}>{item}</button>)}</div></div></div>
      <textarea className="premium-input mt-4 min-h-32" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Digite exatamente como o cliente falaria..." />
      <button type="button" disabled={busy || !storeId || !question.trim()} onClick={() => void simulate()} className="premium-button-primary mt-3 w-full justify-center"><Play size={16}/>{busy ? 'Simulando...' : `Simular ${mode.toUpperCase()}`}</button>
      {message ? <p className="mt-3 text-xs font-bold text-zinc-600">{busy ? <Loader2 size={13} className="mr-2 inline animate-spin"/> : null}{message}</p> : null}
    </div>
    {result ? <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]"><div className="premium-card p-5"><div className="flex items-center gap-2 text-emerald-700"><Sparkles size={18}/><h3 className="text-lg font-black">Resposta simulada</h3></div><p className="mt-4 whitespace-pre-wrap text-base font-bold leading-7 text-zinc-900">{result.response}</p><div className="mt-4 rounded-xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-600"><strong>Resumo operacional:</strong> {result.reasoning_summary}<br/><strong>Próxima ação:</strong> {result.next_action}</div></div><div className="premium-card p-5"><div className="flex items-center gap-2 text-red-600"><ShieldCheck size={18}/><h3 className="text-lg font-black">Decisão simulada</h3></div><div className="mt-4 rounded-xl bg-zinc-950 px-4 py-3 text-center text-xs font-black uppercase text-white">{String(result.execution_decision || '').replaceAll('_',' ')}</div><p className="mt-3 text-xs font-bold leading-5 text-zinc-600">{result.execution_reason}</p><div className="mt-4 space-y-2 text-[11px] font-bold text-zinc-600"><p>Loja: <strong>{selected?.store_name || '—'}</strong></p><p>Modelo: <strong>{result.model || '—'}</strong></p><p>Entrada: <strong>{Number(result.usage?.input_tokens || 0).toLocaleString('pt-BR')} tokens</strong></p><p>Saída: <strong>{Number(result.usage?.output_tokens || 0).toLocaleString('pt-BR')} tokens</strong></p><p className="text-emerald-700">SAFE CORE: <strong>APLICADO</strong></p><p className="text-red-600">Execução externa: <strong>NÃO</strong></p></div></div></div> : null}
  </section>;
}
