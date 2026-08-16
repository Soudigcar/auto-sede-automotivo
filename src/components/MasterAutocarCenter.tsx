'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, BookOpen, Bot, CheckCircle2, FileText, LibraryBig, Loader2, RefreshCw, Search, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { MasterAutocarMonitoring } from '@/components/MasterAutocarMonitoring';
import { createClient } from '@/lib/supabase';

type Mode = 'off' | 'copilot' | 'autopilot';
type Tab = 'overview' | 'method' | 'library' | 'stores' | 'rules' | 'tests' | 'monitoring';
type StoreRow = { id:string; store_name:string; slug:string|null; status:string|null; portal_enabled:boolean|null; autocar:{mode:Mode;status:string;updated_at:string}|null; ai_telemetry?:unknown };
type Doc = { id:string; title:string; original_filename:string; file_size_bytes:number; status:string; chunk_count:number; extracted_characters:number; extraction_error:string|null; created_at:string };
type Payload = {
  environment:string;
  stores:StoreRow[];
  documents:Doc[];
  summary:{total_stores:number;enabled:number;copilot:number;autopilot:number;global_documents:number};
  ai_platform?:{ version?:string; model_registry?:any; telemetry?:any };
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const tabs: Array<{id:Tab;label:string}> = [
  {id:'overview',label:'Visão Geral'}, {id:'method',label:'Método Venda Mais'}, {id:'library',label:'Biblioteca Global'},
  {id:'stores',label:'Lojas'}, {id:'rules',label:'Regras Globais'}, {id:'tests',label:'Testes'}, {id:'monitoring',label:'Monitoramento'}
];

function bytes(value:number){ if(value<1024)return `${value} B`; if(value<1048576)return `${(value/1024).toFixed(1)} KB`; return `${(value/1048576).toFixed(1)} MB`; }
async function readResponse(response:Response){ const text=await response.text(); if(!text)return {}; try{return JSON.parse(text);}catch{return {error:text.slice(0,300)}} }
function directUpload(signedUrl:string,file:File){ const form=new FormData(); form.append('cacheControl','3600'); form.append('',file); return fetch(signedUrl,{method:'PUT',headers:{'x-upsert':'false'},body:form}); }

export function MasterAutocarCenter(){
  const supabase=useMemo(()=>createClient(),[]);
  const [tab,setTab]=useState<Tab>('overview');
  const [data,setData]=useState<Payload|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [query,setQuery]=useState('');
  const [title,setTitle]=useState('');
  const [file,setFile]=useState<File|null>(null);

  const token=useCallback(async()=>{ const {data}=await supabase.auth.getSession(); return data.session?.access_token||''; },[supabase]);
  const load=useCallback(async()=>{
    setBusy(true);
    try{ const access=await token(); if(!access)throw new Error('Sessão Master expirada.'); const response=await fetch('/api/master/autocar',{headers:{Authorization:`Bearer ${access}`},cache:'no-store'}); const body=await readResponse(response); if(!response.ok)throw new Error(body.error||'Falha ao carregar AUTOCAR.'); setData(body); setMessage(''); }
    catch(error:any){ setMessage(error?.message||'Falha ao carregar AUTOCAR.'); } finally{ setBusy(false); }
  },[token]);
  useEffect(()=>{void load()},[load]);

  async function setMode(store:StoreRow,mode:Mode){
    setBusy(true); setMessage(`Atualizando AUTOCAR de ${store.store_name}...`);
    try{ const access=await token(); const response=await fetch('/api/master/autocar',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({action:'set-store-mode',store_id:store.id,mode})}); const body=await readResponse(response); if(!response.ok)throw new Error(body.error||'Não foi possível atualizar a loja.'); await load(); setMessage(`${store.store_name}: ${mode.toUpperCase()} salvo somente no ambiente AUTOCAR de teste.`); }
    catch(error:any){setMessage(error?.message||'Não foi possível atualizar a loja.')}finally{setBusy(false)}
  }

  async function upload(event:React.FormEvent){
    event.preventDefault(); if(!file||busy)return; if(file.size>MAX_FILE_BYTES){setMessage('O arquivo deve ter no máximo 25 MB.');return;}
    setBusy(true);
    try{
      const access=await token(); if(!access)throw new Error('Sessão Master expirada.');
      setMessage('Preparando upload privado do conhecimento global...');
      const prep=await fetch('/api/master/autocar',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({action:'prepare-upload',title:title||file.name,file_name:file.name,mime_type:file.type,file_size_bytes:file.size})});
      const prepared=await readResponse(prep); if(!prep.ok)throw new Error(prepared.error||'Não foi possível preparar o upload.');
      setMessage(`Enviando ${bytes(file.size)} diretamente ao Storage privado...`);
      const stored=await directUpload(prepared.upload.signed_url,file); if(!stored.ok){const body=await readResponse(stored);throw new Error(body.error||`Storage recusou o arquivo (HTTP ${stored.status}).`)}
      setMessage('Arquivo recebido. Extraindo texto e criando embeddings...');
      const final=await fetch('/api/master/autocar',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({action:'finalize-upload',title:title||file.name,file_name:file.name,mime_type:file.type,file_size_bytes:file.size,storage_path:prepared.upload.storage_path})});
      const result=await readResponse(final); if(!final.ok)throw new Error(result.error||'Não foi possível indexar o documento.');
      setFile(null);setTitle('');await load();setMessage('Conhecimento global processado e pronto para consulta pela AUTOCAR.');
    }catch(error:any){setMessage(error?.message||'Não foi possível processar o documento.')}finally{setBusy(false)}
  }

  async function archive(doc:Doc){
    setBusy(true);
    try{ const access=await token(); const response=await fetch('/api/master/autocar',{method:'DELETE',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({document_id:doc.id})}); const body=await readResponse(response); if(!response.ok)throw new Error(body.error||'Não foi possível arquivar.'); await load(); setMessage('Documento global arquivado.'); }
    catch(error:any){setMessage(error?.message||'Não foi possível arquivar.')}finally{setBusy(false)}
  }

  const stores=(data?.stores||[]).filter(s=>s.store_name.toLowerCase().includes(query.toLowerCase()));
  const summary=data?.summary;

  return <main className="premium-page"><section className="premium-shell flex min-h-screen"><MasterSidebar active="/master/autocar"/><div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex items-center gap-2 text-red-600"><Sparkles size={18}/><span className="premium-eyebrow">Governança Master</span></div><h1 className="premium-title mt-2 text-4xl md:text-5xl">I.A AUTOCAR</h1><p className="premium-muted mt-3 max-w-4xl text-sm">O Master governa o Método Venda Mais, a inteligência global e quais lojas recebem a AUTOCAR. Cada loja herda essa base e acrescenta apenas seu contexto operacional.</p></div><button onClick={()=>void load()} disabled={busy} className="premium-button-secondary"><RefreshCw size={16} className={busy?'animate-spin':''}/>Atualizar</button></header>

    <div className="mt-6 flex gap-2 overflow-x-auto pb-2">{tabs.map(item=><button key={item.id} onClick={()=>setTab(item.id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black ${tab===item.id?'bg-red-600 text-white':'border border-zinc-200 bg-white text-zinc-600'}`}>{item.label}</button>)}</div>
    {message?<div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{busy?<Loader2 size={16} className="mr-2 inline animate-spin text-red-600"/>:null}{message}</div>:null}

    {tab==='overview'?<section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Lojas no CRM" value={summary?.total_stores??0}/><Metric label="AUTOCAR liberada" value={summary?.enabled??0}/><Metric label="Copilot" value={summary?.copilot??0}/><Metric label="Autopilot" value={summary?.autopilot??0}/><Metric label="Conhecimento global" value={summary?.global_documents??0}/><div className="premium-card sm:col-span-2 xl:col-span-5 p-6"><h2 className="text-xl font-black">Hierarquia da inteligência</h2><p className="mt-3 text-sm leading-6 text-zinc-600"><strong>Master:</strong> Método Venda Mais + Biblioteca Global + hard policies → <strong>Loja:</strong> dados e conhecimento próprios → <strong>Atendimento:</strong> CRM + estoque + lead + conversa.</p><div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"><ShieldCheck size={15}/>Ambiente isolado: a governança AUTOCAR permanece separada do banco operacional do CRM.</div></div></section>:null}

    {(tab==='method'||tab==='library')?<section className="mt-6 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]"><form onSubmit={upload} className="premium-card p-5"><div className="flex items-center gap-2 text-red-600">{tab==='method'?<BookOpen size={19}/>:<LibraryBig size={19}/>}<h2 className="text-lg font-black text-zinc-950">{tab==='method'?'Método Venda Mais — Oficial':'Biblioteca Global'}</h2></div><p className="mt-2 text-xs leading-5 text-zinc-500">Somente o Master publica. O material é global e herdado por todas as lojas habilitadas.</p><label className="mt-4 block text-xs font-black">Título<input className="premium-input mt-1.5" value={title} onChange={e=>setTitle(e.target.value)} placeholder={tab==='method'?'Livro Método Venda Mais — edição oficial':'Ex.: Playbook de objeções'}/></label><label className="mt-3 block text-xs font-black">Arquivo<input className="premium-input mt-1.5" type="file" accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>{file?<p className="mt-2 text-xs font-bold text-zinc-500">{file.name} · {bytes(file.size)}</p>:null}<button disabled={!file||busy||Boolean(file&&file.size>MAX_FILE_BYTES)} className="premium-button-primary mt-4 w-full justify-center"><Upload size={16}/>{busy?'Processando...':'Enviar e indexar'}</button></form><GlobalDocs docs={data?.documents||[]} onArchive={archive}/></section>:null}

    {tab==='stores'?<section className="mt-6 premium-card p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-xl font-black">Liberação por loja</h2><p className="mt-1 text-xs text-zinc-500">OFF desliga; COPILOT sugere sem enviar; AUTOPILOT fica preparado para a automação controlada.</p></div><div className="relative"><Search size={15} className="absolute left-3 top-3 text-zinc-400"/><input className="premium-input pl-9" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar loja"/></div></div><div className="mt-5 space-y-2">{stores.map(store=><div key={store.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-black text-zinc-900">{store.store_name}</p><p className="mt-1 text-[11px] font-bold text-zinc-400">{store.slug||'sem slug'} · atual: {(store.autocar?.mode||'off').toUpperCase()}</p></div><div className="flex flex-wrap gap-2">{(['off','copilot','autopilot'] as Mode[]).map(mode=><button key={mode} disabled={busy} onClick={()=>void setMode(store,mode)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase ${((store.autocar?.mode||'off')===mode)?'bg-red-600 text-white':'border border-zinc-200 bg-white text-zinc-600'}`}>{mode}</button>)}</div></div>)}</div></section>:null}

    {['rules','tests'].includes(tab)?<section className="premium-card mt-6 p-7"><Bot size={28} className="text-red-600"/><h2 className="mt-4 text-2xl font-black">{tab==='rules'?'Regras Globais':'Laboratório de Testes'}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">{tab==='rules'?'Aqui ficarão os limites globais que nenhuma loja poderá ultrapassar. As hard policies do código continuam tendo prioridade.':'Área preparada para simular atendimentos com Método Venda Mais + contexto de uma loja antes de liberar automação.'}</p><span className="mt-4 inline-flex rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase text-amber-700">Preparado para próxima fase</span></section>:null}

    {tab==='monitoring'?<MasterAutocarMonitoring telemetry={data?.ai_platform?.telemetry} modelRegistry={data?.ai_platform?.model_registry}/>:null}
  </div></section></main>;
}

function Metric({label,value}:{label:string;value:number}){return <div className="premium-card p-5"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p><p className="mt-2 text-3xl font-black text-zinc-950">{value}</p></div>}
function GlobalDocs({docs,onArchive}:{docs:Doc[];onArchive:(doc:Doc)=>void}){return <div className="premium-card p-5"><div className="flex items-center gap-2"><FileText size={18} className="text-red-600"/><h2 className="text-lg font-black">Conhecimento global indexado</h2></div><div className="mt-4 space-y-2">{!docs.length?<div className="rounded-xl border border-dashed border-zinc-300 p-5 text-center text-xs font-bold text-zinc-400">Nenhum documento global neste ambiente.</div>:docs.map(doc=><div key={doc.id} className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{doc.title}</p><p className="mt-1 truncate text-[10px] font-bold text-zinc-400">{doc.original_filename} · {bytes(doc.file_size_bytes)}</p><div className="mt-2 flex gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${doc.status==='ready'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{doc.status==='ready'?<><CheckCircle2 size={10} className="mr-1 inline"/>Pronto</>:doc.status}</span>{doc.chunk_count?<span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-zinc-500">{doc.chunk_count} trechos</span>:null}</div>{doc.extraction_error?<p className="mt-2 text-[10px] font-bold text-red-600">{doc.extraction_error}</p>:null}</div><button type="button" onClick={()=>onArchive(doc)} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 hover:text-red-600" title="Arquivar"><Archive size={14}/></button></div>)}</div></div>}
