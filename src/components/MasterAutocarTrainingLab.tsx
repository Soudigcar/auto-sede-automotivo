'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, FlaskConical, Loader2, PencilLine, Play, RefreshCw, Save, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type Scenario = {
  id:string; situation:string; intent:string|null; ideal_response:string; objective:string|null; next_action:string|null;
  restrictions:string[]; tags:string[]; examples:string[]; priority:number; status:'draft'|'approved'; version:number; updated_at:string;
};
type Simulation = {
  id:string; customer_input:string; ai_response:string; corrected_response:string|null; evaluation:'generated'|'approved'|'corrected'|'rejected';
  reasoning_summary:string|null; next_action:string|null; model:string|null; input_tokens:number; output_tokens:number; created_at:string;
};
type Payload = { scenarios:Scenario[]; simulations:Simulation[] };

type FormState = {
  scenario_id:string; situation:string; intent:string; ideal_response:string; objective:string; next_action:string;
  restrictions:string; tags:string; examples:string; priority:string; status:'draft'|'approved';
};
const blank:FormState={scenario_id:'',situation:'',intent:'',ideal_response:'',objective:'',next_action:'',restrictions:'',tags:'',examples:'',priority:'100',status:'approved'};

async function readResponse(response:Response){const text=await response.text();if(!text)return {};try{return JSON.parse(text)}catch{return {error:text.slice(0,300)}}}

export function MasterAutocarTrainingLab(){
  const supabase=useMemo(()=>createClient(),[]);
  const [data,setData]=useState<Payload>({scenarios:[],simulations:[]});
  const [form,setForm]=useState<FormState>(blank);
  const [question,setQuestion]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [result,setResult]=useState<any|null>(null);
  const [correction,setCorrection]=useState('');
  const [saveLearning,setSaveLearning]=useState(true);

  const token=useCallback(async()=>{const {data}=await supabase.auth.getSession();return data.session?.access_token||''},[supabase]);
  const load=useCallback(async()=>{
    setBusy(true);
    try{const access=await token();if(!access)throw new Error('Sessão Master expirada.');const response=await fetch('/api/master/autocar/training',{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});const body=await readResponse(response);if(!response.ok)throw new Error(body.error||'Falha ao carregar treinamento.');setData({scenarios:body.scenarios||[],simulations:body.simulations||[]});setMessage('');}
    catch(error:any){setMessage(error?.message||'Falha ao carregar treinamento.')}finally{setBusy(false)}
  },[token]);
  useEffect(()=>{void load()},[load]);

  function editScenario(item:Scenario){setForm({scenario_id:item.id,situation:item.situation,intent:item.intent||'',ideal_response:item.ideal_response,objective:item.objective||'',next_action:item.next_action||'',restrictions:(item.restrictions||[]).join('\n'),tags:(item.tags||[]).join(', '),examples:(item.examples||[]).join('\n'),priority:String(item.priority||100),status:item.status});window.scrollTo({top:0,behavior:'smooth'});}

  async function saveScenario(event:React.FormEvent){
    event.preventDefault();setBusy(true);setMessage('Salvando aprendizado oficial...');
    try{const access=await token();const response=await fetch('/api/master/autocar/training',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({action:'save-scenario',...form,restrictions:form.restrictions,examples:form.examples,tags:form.tags,priority:Number(form.priority||100)})});const body=await readResponse(response);if(!response.ok)throw new Error(body.error||'Não foi possível salvar.');setForm(blank);await load();setMessage('Aprendizado salvo e indexado semanticamente.');}
    catch(error:any){setMessage(error?.message||'Não foi possível salvar.')}finally{setBusy(false)}
  }

  async function simulate(){
    if(!question.trim())return;setBusy(true);setMessage('Simulando AUTOCAR com Método Venda Mais + aprendizados aprovados...');setResult(null);
    try{const access=await token();const response=await fetch('/api/master/autocar/training',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({action:'simulate',customer_input:question})});const body=await readResponse(response);if(!response.ok)throw new Error(body.error||'Falha na simulação.');setResult(body);setCorrection(body.response||'');setMessage('Simulação concluída. Revise a resposta antes de transformar em aprendizado.');await load();}
    catch(error:any){setMessage(error?.message||'Falha na simulação.')}finally{setBusy(false)}
  }

  async function review(evaluation:'approved'|'corrected'|'rejected'){
    if(!result?.simulation?.id)return;setBusy(true);
    try{const access=await token();const response=await fetch('/api/master/autocar/training',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({action:'review-simulation',simulation_id:result.simulation.id,evaluation,corrected_response:evaluation==='corrected'?correction:null,save_as_learning:saveLearning&&evaluation!=='rejected',situation:question,ideal_response:correction,tags:'simulador-master'})});const body=await readResponse(response);if(!response.ok)throw new Error(body.error||'Falha ao revisar.');setMessage(body.learning?'Resposta revisada e salva como aprendizado oficial.':'Simulação revisada.');setResult(null);setQuestion('');setCorrection('');await load();}
    catch(error:any){setMessage(error?.message||'Falha ao revisar.')}finally{setBusy(false)}
  }

  async function archive(id:string){setBusy(true);try{const access=await token();const response=await fetch('/api/master/autocar/training',{method:'DELETE',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({scenario_id:id})});const body=await readResponse(response);if(!response.ok)throw new Error(body.error||'Falha ao arquivar.');await load();setMessage('Aprendizado arquivado.');}catch(error:any){setMessage(error?.message||'Falha ao arquivar.')}finally{setBusy(false)}}

  return <main className="premium-page"><section className="premium-shell flex min-h-screen"><MasterSidebar active="/master/autocar/training"/><div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex items-center gap-2 text-red-600"><FlaskConical size={18}/><span className="premium-eyebrow">I.A AUTOCAR · Master</span></div><h1 className="premium-title mt-2 text-4xl md:text-5xl">Treinar e Testar</h1><p className="premium-muted mt-3 max-w-4xl text-sm">Ensine situações reais, teste perguntas de clientes e transforme correções aprovadas em comportamento oficial da AUTOCAR.</p></div><button onClick={()=>void load()} disabled={busy} className="premium-button-secondary"><RefreshCw size={16} className={busy?'animate-spin':''}/>Atualizar</button></header>

    {message?<div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{busy?<Loader2 size={16} className="mr-2 inline animate-spin text-red-600"/>:null}{message}</div>:null}

    <section className="mt-6 grid gap-5 2xl:grid-cols-2">
      <form onSubmit={saveScenario} className="premium-card p-5 md:p-6"><div className="flex items-center gap-2 text-red-600"><Save size={18}/><h2 className="text-xl font-black text-zinc-950">Ensinar</h2></div><p className="mt-2 text-xs leading-5 text-zinc-500">Cadastre como a AUTOCAR deve conduzir uma situação. Aprendizados aprovados entram na busca semântica do simulador.</p>
        <div className="mt-4 grid gap-3">
          <Field label="Pergunta ou situação do cliente"><textarea className="premium-input min-h-24" value={form.situation} onChange={e=>setForm({...form,situation:e.target.value})} placeholder="Ex.: Só tenho R$ 5 mil de entrada. Dá negócio?"/></Field>
          <Field label="Intenção"><input className="premium-input" value={form.intent} onChange={e=>setForm({...form,intent:e.target.value})} placeholder="Ex.: financiamento / entrada"/></Field>
          <Field label="Resposta ideal"><textarea className="premium-input min-h-28" value={form.ideal_response} onChange={e=>setForm({...form,ideal_response:e.target.value})} placeholder="Como a AUTOCAR deve responder"/></Field>
          <div className="grid gap-3 md:grid-cols-2"><Field label="Objetivo comercial"><textarea className="premium-input min-h-20" value={form.objective} onChange={e=>setForm({...form,objective:e.target.value})}/></Field><Field label="Próxima ação"><textarea className="premium-input min-h-20" value={form.next_action} onChange={e=>setForm({...form,next_action:e.target.value})}/></Field></div>
          <div className="grid gap-3 md:grid-cols-2"><Field label="Restrições — uma por linha"><textarea className="premium-input min-h-20" value={form.restrictions} onChange={e=>setForm({...form,restrictions:e.target.value})} placeholder="Não prometer aprovação\nNão inventar parcela"/></Field><Field label="Tags"><input className="premium-input" value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="financiamento, objeção, entrada"/></Field></div>
          <Field label="Outros exemplos de fala do cliente — um por linha"><textarea className="premium-input min-h-20" value={form.examples} onChange={e=>setForm({...form,examples:e.target.value})}/></Field>
          <div className="grid gap-3 md:grid-cols-2"><Field label="Prioridade"><input className="premium-input" type="number" min="1" max="1000" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}/></Field><Field label="Status"><select className="premium-input" value={form.status} onChange={e=>setForm({...form,status:e.target.value as 'draft'|'approved'})}><option value="approved">Aprovado / ativo</option><option value="draft">Rascunho</option></select></Field></div>
        </div><div className="mt-4 flex gap-2"><button disabled={busy||!form.situation.trim()||!form.ideal_response.trim()} className="premium-button-primary flex-1 justify-center"><Save size={16}/>{form.scenario_id?'Atualizar aprendizado':'Salvar aprendizado'}</button>{form.scenario_id?<button type="button" className="premium-button-secondary" onClick={()=>setForm(blank)}>Cancelar edição</button>:null}</div>
      </form>

      <div className="premium-card p-5 md:p-6"><div className="flex items-center gap-2 text-red-600"><Sparkles size={18}/><h2 className="text-xl font-black text-zinc-950">Simular</h2></div><p className="mt-2 text-xs leading-5 text-zinc-500">Faça a pergunta como um cliente faria. A resposta usa aprendizados aprovados + Método Venda Mais + Biblioteca Global. Nada é enviado ao WhatsApp.</p>
        <textarea className="premium-input mt-4 min-h-28" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ex.: Esse carro está muito caro, vi outro mais barato."/>
        <button type="button" onClick={()=>void simulate()} disabled={busy||!question.trim()} className="premium-button-primary mt-3 w-full justify-center"><Play size={16}/>{busy?'Simulando...':'Simular AUTOCAR'}</button>
        {result?<div className="mt-5 space-y-3"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Resposta AUTOCAR</p><p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-zinc-900">{result.response}</p></div><div className="rounded-2xl border border-zinc-200 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Por que respondeu assim</p><p className="mt-2 text-xs leading-5 text-zinc-600">{result.reasoning_summary}</p><p className="mt-3 text-[10px] font-black uppercase text-zinc-400">Próxima ação</p><p className="mt-1 text-xs font-bold text-zinc-700">{result.next_action}</p></div><Field label="Corrigir resposta"><textarea className="premium-input min-h-24" value={correction} onChange={e=>setCorrection(e.target.value)}/></Field><label className="flex items-center gap-2 text-xs font-bold text-zinc-700"><input type="checkbox" checked={saveLearning} onChange={e=>setSaveLearning(e.target.checked)}/>Salvar resposta aprovada/corrigida como aprendizado oficial</label><div className="grid gap-2 sm:grid-cols-3"><button type="button" onClick={()=>void review('approved')} className="rounded-xl bg-emerald-600 px-3 py-3 text-xs font-black text-white"><ThumbsUp size={15} className="mr-1 inline"/>Aprovar</button><button type="button" onClick={()=>void review('corrected')} className="rounded-xl bg-amber-500 px-3 py-3 text-xs font-black text-white"><PencilLine size={15} className="mr-1 inline"/>Salvar correção</button><button type="button" onClick={()=>void review('rejected')} className="rounded-xl bg-zinc-800 px-3 py-3 text-xs font-black text-white"><ThumbsDown size={15} className="mr-1 inline"/>Rejeitar</button></div></div>:null}
      </div>
    </section>

    <section className="premium-card mt-6 p-5 md:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Aprendizados oficiais</h2><p className="mt-1 text-xs text-zinc-500">{data.scenarios.length} cenários cadastrados no ambiente de treinamento.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">autocar-dev</span></div><div className="mt-4 grid gap-3 xl:grid-cols-2">{data.scenarios.map(item=><div key={item.id} className="rounded-2xl border border-zinc-200 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${item.status==='approved'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{item.status==='approved'?'Aprovado':'Rascunho'}</span>{item.intent?<span className="rounded-full bg-zinc-100 px-2 py-1 text-[9px] font-black text-zinc-600">{item.intent}</span>:null}</div><p className="mt-3 text-sm font-black text-zinc-900">{item.situation}</p><p className="mt-2 text-xs leading-5 text-zinc-600"><strong>Resposta ideal:</strong> {item.ideal_response}</p>{item.objective?<p className="mt-2 text-xs text-zinc-500"><strong>Objetivo:</strong> {item.objective}</p>:null}</div><CheckCircle2 size={18} className={item.status==='approved'?'text-emerald-600':'text-zinc-300'}/></div><div className="mt-3 flex gap-2"><button type="button" onClick={()=>editScenario(item)} className="rounded-lg border border-zinc-200 px-3 py-2 text-[10px] font-black text-zinc-700"><PencilLine size={12} className="mr-1 inline"/>Editar</button><button type="button" onClick={()=>void archive(item.id)} className="rounded-lg border border-zinc-200 px-3 py-2 text-[10px] font-black text-zinc-500"><Archive size={12} className="mr-1 inline"/>Arquivar</button></div></div>)}{!data.scenarios.length?<div className="rounded-2xl border border-dashed border-zinc-300 p-7 text-center text-sm font-bold text-zinc-400">Nenhum aprendizado ainda. Cadastre o primeiro cenário acima.</div>:null}</div></section>

    <section className="premium-card mt-6 p-5 md:p-6"><h2 className="text-xl font-black">Histórico de simulações</h2><div className="mt-4 space-y-2">{data.simulations.slice(0,12).map(item=><div key={item.id} className="rounded-xl border border-zinc-200 p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black text-zinc-900">Cliente: {item.customer_input}</p><span className="rounded-full bg-zinc-100 px-2 py-1 text-[9px] font-black uppercase text-zinc-600">{item.evaluation}</span></div><p className="mt-2 text-xs leading-5 text-zinc-600">AUTOCAR: {item.corrected_response||item.ai_response}</p></div>)}{!data.simulations.length?<p className="text-xs font-bold text-zinc-400">Nenhuma simulação realizada ainda.</p>:null}</div></section>
  </div></section></main>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block text-xs font-black text-zinc-700">{label}<div className="mt-1.5">{children}</div></label>}
