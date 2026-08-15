'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Play, ShieldCheck, Sparkles } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type Mode = 'copilot' | 'autopilot';
type StoreRow = { id:string; store_name:string; slug:string|null; status:string|null; city?:string|null; state?:string|null };

async function readResponse(response:Response){const text=await response.text();if(!text)return {};try{return JSON.parse(text)}catch{return {error:text.slice(0,300)}}}

export function MasterAutocarSimulator(){
  const supabase=useMemo(()=>createClient(),[]);
  const [stores,setStores]=useState<StoreRow[]>([]);
  const [storeId,setStoreId]=useState('');
  const [mode,setMode]=useState<Mode>('copilot');
  const [question,setQuestion]=useState('');
  const [result,setResult]=useState<any|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');

  const token=useCallback(async()=>{const {data}=await supabase.auth.getSession();return data.session?.access_token||''},[supabase]);
  const load=useCallback(async()=>{
    setBusy(true);
    try{const access=await token();if(!access)throw new Error('Sessão Master expirada.');const response=await fetch('/api/master/autocar/simulator',{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});const body=await readResponse(response);if(!response.ok)throw new Error(body.error||'Falha ao carregar simulador.');setStores(body.stores||[]);if(!storeId&&body.stores?.length)setStoreId(body.stores[0].id);setMessage('');}
    catch(error:any){setMessage(error?.message||'Falha ao carregar simulador.')}finally{setBusy(false)}
  },[token,storeId]);
  useEffect(()=>{void load()},[load]);

  async function simulate(){
    if(!storeId||!question.trim())return;setBusy(true);setResult(null);setMessage(`Simulando ${mode.toUpperCase()} com o núcleo compartilhado da AUTOCAR...`);
    try{const access=await token();const response=await fetch('/api/master/autocar/simulator',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({store_id:storeId,customer_input:question,mode})});const body=await readResponse(response);if(!response.ok)throw new Error(body.error||'Falha na simulação.');setResult(body);setMessage('Simulação concluída. Nenhuma ação externa foi executada.');}
    catch(error:any){setMessage(error?.message||'Falha na simulação.')}finally{setBusy(false)}
  }

  const selected=stores.find(store=>store.id===storeId);

  return <main className="premium-page"><section className="premium-shell flex min-h-screen"><MasterSidebar active="/master/autocar/simulator"/><div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
    <header><div className="flex items-center gap-2 text-red-600"><Bot size={18}/><span className="premium-eyebrow">I.A AUTOCAR · Núcleo compartilhado</span></div><h1 className="premium-title mt-2 text-4xl md:text-5xl">Simulador COPILOT / AUTOPILOT</h1><p className="premium-muted mt-3 max-w-4xl text-sm">Os dois modos usam a mesma inteligência: hard policies, Método Venda Mais, Biblioteca Global, aprendizados aprovados, conhecimento específico e estoque interno em tempo real da loja. Neste Preview nada é enviado nem alterado automaticamente.</p></header>

    {message?<div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{busy?<Loader2 size={16} className="mr-2 inline animate-spin text-red-600"/>:null}{message}</div>:null}

    <section className="premium-card mt-6 p-5 md:p-6"><div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-black">Loja<select className="premium-input mt-1.5" value={storeId} onChange={e=>setStoreId(e.target.value)}>{stores.map(store=><option key={store.id} value={store.id}>{store.store_name}</option>)}</select></label><div><p className="text-xs font-black">Modo</p><div className="mt-1.5 grid grid-cols-2 gap-2">{(['copilot','autopilot'] as Mode[]).map(item=><button key={item} type="button" onClick={()=>setMode(item)} className={`rounded-xl px-4 py-3 text-xs font-black uppercase ${mode===item?'bg-red-600 text-white':'border border-zinc-200 bg-white text-zinc-600'}`}>{item}</button>)}</div></div></div>
      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-5 text-zinc-600"><strong>{mode==='copilot'?'COPILOT':'AUTOPILOT'}:</strong> {mode==='copilot'?'gera somente uma sugestão para o humano revisar e enviar.':'simula a resposta e a decisão de execução que o agente tomaria. Mesmo quando a decisão for “executaria”, este Preview não envia nem altera nada.'}</div>
      <textarea className="premium-input mt-4 min-h-32" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Digite exatamente como o cliente falaria..."/>
      <button type="button" onClick={()=>void simulate()} disabled={busy||!storeId||!question.trim()} className="premium-button-primary mt-3 w-full justify-center"><Play size={16}/>{busy?'Simulando...':`Simular ${mode.toUpperCase()}`}</button>
    </section>

    {result?<section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]"><div className="premium-card p-5"><div className="flex items-center gap-2 text-emerald-700"><Sparkles size={18}/><h2 className="text-lg font-black">Resposta que a AUTOCAR daria</h2></div><p className="mt-4 whitespace-pre-wrap text-base font-bold leading-7 text-zinc-900">{result.response}</p><div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Resumo operacional</p><p className="mt-2 text-sm leading-6 text-zinc-600">{result.reasoning_summary}</p><p className="mt-4 text-[10px] font-black uppercase tracking-wider text-zinc-400">Próxima ação sugerida</p><p className="mt-2 text-sm font-bold text-zinc-800">{result.next_action}</p></div>{Array.isArray(result.inventory_matches)&&result.inventory_matches.length?<div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Estoque interno consultado</p><div className="mt-3 space-y-3">{result.inventory_matches.slice(0,5).map((vehicle:any)=><div key={vehicle.id} className="rounded-xl bg-white p-3 text-xs text-zinc-700"><strong>{[vehicle.brand,vehicle.model,vehicle.version].filter(Boolean).join(' ')}</strong><div className="mt-1">{vehicle.year||'Ano não informado'} · {vehicle.mileage||'KM não informado'} · {vehicle.transmission||'Câmbio não informado'} · {vehicle.fuel||'Combustível não informado'}</div><div className="mt-1 font-black text-zinc-950">{Number(vehicle.price||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>{vehicle.portal_url?<a href={vehicle.portal_url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-black text-red-600">Abrir no Portal</a>:<div className="mt-2 text-zinc-400">Veículo interno não publicado no Portal</div>}</div>)}</div></div>:null}</div><div className="premium-card p-5"><div className="flex items-center gap-2 text-red-600"><ShieldCheck size={18}/><h2 className="text-lg font-black">Decisão de execução</h2></div><p className="mt-4 rounded-xl bg-zinc-950 px-4 py-3 text-center text-xs font-black uppercase text-white">{String(result.execution_decision||'').replaceAll('_',' ')}</p><p className="mt-3 text-sm leading-6 text-zinc-600">{result.execution_reason}</p><div className="mt-5 space-y-2 text-xs font-bold text-zinc-600"><p>Loja: <strong>{selected?.store_name||result.store?.store_name}</strong></p><p>Modo: <strong>{String(result.mode||mode).toUpperCase()}</strong></p><p>Veículos disponíveis no Estoque: <strong>{result.intelligence?.inventory_available_count??0}</strong></p><p>Veículos compatíveis encontrados: <strong>{result.intelligence?.inventory_matches??0}</strong></p><p className="text-emerald-700">Fonte do estoque: <strong>ESTOQUE INTERNO DA LOJA</strong></p><p>Aprendizados recuperados: <strong>{result.intelligence?.training_matches??0}</strong></p><p>Trechos do Método/Biblioteca: <strong>{result.intelligence?.method_matches??0}</strong></p><p>Trechos específicos da loja: <strong>{result.intelligence?.store_knowledge_matches??0}</strong></p><p className="text-emerald-700">Hard policies aplicadas: <strong>SIM</strong></p><p className="text-red-600">Execução externa neste Preview: <strong>NÃO</strong></p></div></div></section>:null}
  </div></section></main>;
}
