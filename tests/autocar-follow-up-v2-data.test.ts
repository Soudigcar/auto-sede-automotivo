import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { hasFollowUpOptOut } from '../src/lib/server/autocar/followUpV2Quality';

function loadAdapter() {
  const exports:any={};
  const dependencies:Record<string,any>={
    'node:crypto':{randomUUID:()=> 'worker'},'@/lib/server/evolution':{},'./followUpV2ConfigStore':{},
    './runtimeEnvironment':{currentAutocarExternalReferenceColumns:()=>({memory:{conversationId:'conversation_id'}}),
      resolveAutocarRuntimeTarget:()=>({projectRef:'azszzdotbrczlhrmhrlw'}),autocarProjectRefFromUrl:(url:string)=>new URL(url).hostname.split('.')[0]},
    './followUpV2Execution':{},'./followUpV2Sources':{},'./followUpV2ContextualReopening':{},'./followUpV2Quality':{hasFollowUpOptOut}
  };
  const source=ts.transpileModule(readFileSync('src/lib/server/autocar/followUpV2Data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,process:{env:{VERCEL_ENV:'preview',NEXT_PUBLIC_SUPABASE_URL:'https://azszzdotbrczlhrmhrlw.supabase.co'}},require:(name:string)=>{
    assert.ok(Object.hasOwn(dependencies,name),`Unexpected dependency ${name}`);return dependencies[name];
  }});
  return exports;
}
test('adapter usa store_name, preserva âncora anterior ao próprio follow-up e busca opt-out antigo',async()=>{
  const adapter=loadAdapter();const calls:Array<{table:string;select:string;filters:any[]}>=[];
  const db={from(table:string){const call={table,select:'',filters:[] as any[]};calls.push(call);const q:any={};
    q.select=(value:string)=>{call.select=value;if(table==='stores')assert.equal(value,'id,store_name,status,portal_enabled');return q;};
    for(const name of ['eq','order','limit','or'])q[name]=(...args:any[])=>{call.filters.push([name,...args]);return q;};
    q.maybeSingle=()=>q;
    q.then=(resolve:any,reject:any)=>Promise.resolve().then(()=>{
      if(table==='whatsapp_conversations')return {data:{id:'conversation',lead_id:'lead',store_id:'store'}};
      if(table==='stores')return {data:{id:'store',store_name:'AUTOCAR HOMOLOGACAO V2 ADAPTER',status:'active',portal_enabled:true}};
      if(table==='whatsapp_messages' && call.select==='direction,body')return {data:[{direction:'inbound',body:'Nao quero mais receber mensagens'}]};
      if(table==='whatsapp_messages')return {data:[
        {id:'inbound',direction:'inbound',body:'Quero conhecer',sent_at:'2026-09-06T12:00:00Z'},
        {id:'original',direction:'outbound',body:'Detalhes sintéticos',sent_at:'2026-09-06T13:00:00Z'},
        {id:'follow-up',direction:'outbound',body:'Continuação sintética',sent_at:'2026-09-06T14:00:00Z',raw_payload:{autocar_follow_up_v2:true}}
      ]};
      if(['appointments','sales','ai_store_policies','ai_follow_up_events'].includes(table))return {data:[]};
      return {data:null};
    }).then(resolve,reject);return q;
  }};
  const bundle=await adapter.readFollowUpV2Bundle(db,db,'store','conversation');
  assert.equal(bundle.store.store_name,'AUTOCAR HOMOLOGACAO V2 ADAPTER');assert.equal(bundle.facts.outboundId,'original');
  assert.equal(bundle.facts.outboundAt,'2026-09-06T13:00:00.000Z');assert.equal(bundle.optedOut,true);
  assert.ok(calls.some(c=>c.table==='whatsapp_messages'&&c.filters.some(f=>f[0]==='or')));
});
test('cliente real diferente da configuração é rejeitado antes de consultar dados',()=>{
  const adapter=loadAdapter();let calls=0;
  const crm={supabaseUrl:'https://wufikrdgyxrsszlbpfmv.supabase.co',from:()=>{calls++;throw Error('must not read');}};
  const autocar={supabaseUrl:'https://azszzdotbrczlhrmhrlw.supabase.co'};
  assert.throws(()=>adapter.createFollowUpV2DatabasePorts({crm,autocar,dryRun:true}),/destination_mismatch/);assert.equal(calls,0);
});
test('ports DEV não oferecem função de envio',()=>{
  const adapter=loadAdapter();const db={supabaseUrl:'https://azszzdotbrczlhrmhrlw.supabase.co'};
  const ports=adapter.createFollowUpV2DatabasePorts({crm:db,autocar:db,dryRun:true});
  assert.equal(ports.send,undefined);
});
test('executor permanece fechado sem autorização de rollout',async()=>{
  const adapter=loadAdapter();let calls=0;
  const result=await adapter.runControlledA4FollowUpV2({productionSupabase:{from:()=>{calls++;throw Error('must not read');}}});
  assert.equal(result.enabled,false);assert.equal(result.sent,0);assert.equal(calls,0);
});
