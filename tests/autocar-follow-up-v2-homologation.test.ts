import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readRawBody, safeEqual } from '../src/lib/server/requestSecurity';

type RouteOptions = {
  row?: any;
  databaseError?: boolean;
  loggerThrows?: boolean;
  validConfig?: boolean;
  baseSnapshot?: Record<string, unknown>;
};

function route(overrides:Record<string,string>={},options:RouteOptions={}) {
  let reads=0;
  const diagnostics:string[]=[];
  const exports:any={};
  const query={
    select:()=>query,eq:()=>query,
    maybeSingle:async()=>({data:options.row || null,error:null}),
    then:(resolve:(value:unknown)=>unknown)=>resolve({error:options.databaseError ? {message:'PRIVATE-DATABASE-DETAIL'} : null})
  };
  const db={from:()=>{reads++;return query;}};
  const basePorts:any={
    now:()=>new Date('2026-09-07T12:00:00Z'),
    snapshot:async()=>options.baseSnapshot || {},
    claim:async()=>({}),settle:async()=>true,audit:async()=>{},
    generate:async()=>({text:'Synthetic model output',model:'synthetic-model',valid:true}),arm:async()=>false
  };
  const dependencies:Record<string,any>={
    'next/server':{NextResponse:{json:(body:unknown,options?:ResponseInit)=>Response.json(body,options)}},
    '@/lib/server/requestSecurity':{readRawBody,safeEqual},
    '@/lib/server/storeTeam':{createAdminClient:()=>db},
    '@/lib/server/autocar/runtimeEnvironment':{getAutocarRuntimeClient:()=>db},
    '@/lib/server/autocar/followUpV2Data':{
      assertFollowUpV2Environment:()=>({crmRef:'azszzdotbrczlhrmhrlw',autocarRef:'azszzdotbrczlhrmhrlw'}),
      createFollowUpV2DatabasePorts:()=>basePorts
    },
    '@/lib/server/autocar/followUpV2Execution':{
      executeFollowUpV2:async(event:any,ports:any)=>{
        const snapshot=await ports.snapshot(event);
        const generated=await ports.generate(snapshot,event);
        const valid=Boolean(generated?.valid && String(generated?.model || '').trim() && String(generated?.text || '').trim());
        return {
          decision:valid?'dry_run_ready':'blocked',reason:valid?'all_gates_allow':'generation_invalid',
          proposed_text:valid?generated.text:null,model:valid?generated.model:undefined,external_execution:false,
          generation_fail_closed:valid?undefined:true,gates:snapshot,transport_available:typeof ports.send==='function'
        };
      }
    },
    '@/lib/server/autocar/smartFollowUpV2':{validateFollowUpConfigV2:()=>({ok:options.validConfig===true})}
  };
  const source=ts.transpileModule(readFileSync('src/app/api/internal/autocar/follow-up-v2-homologation/route.ts','utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,Response,URL,URLSearchParams,
    console:{warn:(value:string)=>{if(options.loggerThrows) throw Error('logger unavailable');diagnostics.push(value);}},
    process:{env:{VERCEL_ENV:'preview',
    VERCEL_GIT_COMMIT_REF:'fix/autocar-follow-up-v2-controlled',AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_ENABLED:'true',
    AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SECRET:'synthetic-test-only',AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SESSION_SECRET:'',...overrides}},require:(name:string)=>{
      assert.ok(Object.hasOwn(dependencies,name),`Unexpected dependency ${name}`);return dependencies[name];
    }});
  return {api:exports,reads:()=>reads,diagnostics};
}
const origin='https://synthetic-preview.vercel.app';
function form(credential='synthetic-test-only',source=origin) {
  return new Request(`${origin}/api/internal/autocar/follow-up-v2-homologation`,{method:'POST',headers:{origin:source},
    body:new URLSearchParams({credential,phase:'isolation'})});
}
for(const overrides of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_ENABLED:'false'}]) {
  test(`formulário indisponível fora da homologação: ${JSON.stringify(overrides)}`,async()=>{
    const r=route(overrides);assert.equal((await r.api.GET()).status,403);assert.equal((await r.api.POST(form())).status,403);assert.equal(r.reads(),0);
  });
}
test('formulário não expõe segredo, desabilita cache, scripts e frames',async()=>{
  const r=route({AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SESSION_SECRET:'PRIVATE-SESSION-SECRET'});const response=await r.api.GET();const html=await response.text();
  assert.equal(response.status,200);assert.ok(!html.includes('synthetic-test-only'));assert.ok(!html.includes('PRIVATE-SESSION-SECRET'));
  assert.match(html,/method="post"/);assert.match(html,/type="password"/);
  assert.match(response.headers.get('cache-control')||'',/no-store/);
  assert.match(response.headers.get('content-security-policy')||'',/default-src 'none'/);assert.equal(r.reads(),0);
});
test('origem externa e credencial inválida bloqueiam antes de I/O',async()=>{
  const r=route();assert.equal((await r.api.POST(form('synthetic-test-only','https://other.invalid'))).status,403);
  assert.equal((await r.api.POST(form('wrong'))).status,403);assert.equal(r.reads(),0);
});
test('formulário autenticado executa somente prova de isolamento sanitizada',async()=>{
  const r=route();const response=await r.api.POST(form());const result=await response.json();
  assert.equal(response.status,200);assert.equal(result.isolated,true);assert.equal(result.external_execution,false);
  assert.equal(r.reads(),2);assert.ok(!JSON.stringify(result).includes('synthetic-test-only'));
  assert.deepEqual(r.diagnostics,[]);
});

test('session secret temporário autentica sem substituir o segredo principal',async()=>{
  const r=route({AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SESSION_SECRET:'synthetic-session-test-only'});
  const response=await r.api.POST(form('synthetic-session-test-only'));const result=await response.json();
  assert.equal(response.status,200);assert.equal(result.isolated,true);assert.equal(result.external_execution,false);
  assert.equal(r.reads(),2);assert.deepEqual(r.diagnostics,[]);
});

function expectDiagnostic(values:string[],reason:string,status:number,method='POST') {
  assert.deepEqual(values.map(value=>JSON.parse(value)),[
    {event:'autocar_follow_up_v2_homologation_blocked',method,reason,status}
  ]);
}

for(const [env,reason] of [
  [{VERCEL_ENV:'production'},'environment_not_preview'],
  [{VERCEL_GIT_COMMIT_REF:'main'},'branch_not_allowed'],
  [{AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_ENABLED:'false'},'homologation_disabled']
] as const) test(`availability diagnostic preserves generic rejection: ${reason}`,async()=>{
  for(const method of ['GET','POST']) {
    const r=route(env);const response=method==='GET'?await r.api.GET():await r.api.POST(form());
    assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'Unavailable'});
    expectDiagnostic(r.diagnostics,reason,403,method);assert.equal(r.reads(),0);
  }
});

for(const source of [undefined,'https://foreign.invalid/private-origin']) test(`origin diagnostic does not log origin or form data: ${source===undefined?'missing':'mismatch'}`,async()=>{
  const r=route();const request=new Request(`${origin}/api/internal/autocar/follow-up-v2-homologation?private=query`,{
    method:'POST',headers:source?{origin:source}:{},body:new URLSearchParams({credential:'PRIVATE-CREDENTIAL',customer:'PRIVATE-CUSTOMER'})
  });
  const response=await r.api.POST(request);
  assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'Unavailable'});
  expectDiagnostic(r.diagnostics,source===undefined?'origin_missing':'origin_mismatch',403);
  assert.equal(r.reads(),0);assert.equal(request.bodyUsed,false);
});

for(const transport of ['form','bearer']) for(const missingSecret of [false,true]) test(`credential diagnostic preserves rejection: ${transport}, missingSecret=${missingSecret}`,async()=>{
  const r=route(missingSecret?{AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SECRET:'',AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SESSION_SECRET:''}:{});
  const request=transport==='form'?form('PRIVATE-CREDENTIAL'):new Request(`${origin}/api/internal/autocar/follow-up-v2-homologation`,{
    method:'POST',headers:{authorization:'Bearer PRIVATE-CREDENTIAL','content-type':'application/json'},body:'{"phase":"isolation","customer":"PRIVATE-CUSTOMER"}'
  });
  const response=await r.api.POST(request);
  assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'Unavailable'});
  expectDiagnostic(r.diagnostics,missingSecret?'secret_not_configured':'credential_rejected',403);
  assert.equal(r.reads(),0);
});

function jsonRequest(body:string,credential='synthetic-test-only') {
  return new Request(`${origin}/api/internal/autocar/follow-up-v2-homologation`,{method:'POST',
    headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},body});
}

function syntheticRow(marker='AUTOCAR HOMOLOGACAO V2 TEST') {
  return {
    id:'00000000-0000-4000-8000-000000000001',store_id:'00000000-0000-4000-8000-000000000002',
    production_conversation_id:'00000000-0000-4000-8000-000000000003',production_lead_id:'00000000-0000-4000-8000-000000000004',
    scenario_key:'silent_lead',step_id:'silent-30m',source_id:'00000000-0000-4000-8000-000000000005',sequence_key:'synthetic-sequence',
    due_at:'2026-09-07T11:00:00.000Z',anchor_at:'2026-09-07T10:30:00.000Z',trigger_last_customer_message_at:'2026-09-07T10:00:00.000Z',
    idempotency_key:'synthetic-idempotency',metadata:{homologation:marker,homologation_config:{version:2}}
  };
}

test('valid bearer isolation has no rejection diagnostic',async()=>{
  const r=route();const response=await r.api.POST(jsonRequest('{"phase":"isolation"}'));
  assert.equal(response.status,200);assert.equal((await response.json()).external_execution,false);
  assert.equal(r.reads(),2);assert.deepEqual(r.diagnostics,[]);
});

test('session secret temporário funciona também no bearer JSON',async()=>{
  const r=route({AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SESSION_SECRET:'synthetic-session-test-only'});
  const response=await r.api.POST(jsonRequest('{"phase":"isolation"}','synthetic-session-test-only'));
  assert.equal(response.status,200);assert.equal((await response.json()).external_execution,false);
  assert.equal(r.reads(),2);assert.deepEqual(r.diagnostics,[]);
});

test('invalid event request keeps its existing 400 response',async()=>{
  const r=route();const response=await r.api.POST(jsonRequest('{"phase":"PRIVATE-PHASE","event_id":"PRIVATE-ID"}'));
  assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'Invalid request'});
  expectDiagnostic(r.diagnostics,'invalid_request',400);assert.equal(r.reads(),0);
});

for(const configuration of [false,true]) test(`synthetic event rejection is sanitized: configuration=${configuration}`,async()=>{
  const r=route({},configuration?{row:{metadata:{homologation:'AUTOCAR HOMOLOGACAO V2 PRIVATE-MARKER',homologation_config:{}}}}:{});
  const response=await r.api.POST(jsonRequest('{"phase":"execute","event_id":"00000000-0000-4000-8000-000000000001"}'));
  assert.equal(response.status,configuration?400:403);
  assert.deepEqual(await response.json(),{error:configuration?'Synthetic configuration required':'Synthetic scope required'});
  expectDiagnostic(r.diagnostics,configuration?'synthetic_configuration_required':'synthetic_scope_required',configuration?400:403);
});

test('non-marked execution cannot reach synthetic gate overrides',async()=>{
  const r=route({}, {row:syntheticRow('REAL DATA'),validConfig:true});
  const response=await r.api.POST(jsonRequest('{"phase":"execute","event_id":"00000000-0000-4000-8000-000000000001","generation_mode":"model"}'));
  assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'Synthetic scope required'});
  expectDiagnostic(r.diagnostics,'synthetic_scope_required',403);
});

for(const generationMode of ['model','invalid'] as const) test(`synthetic execute applies fixed Preview-only gates with no transport: ${generationMode}`,async()=>{
  const r=route({}, {row:syntheticRow(),validConfig:true,baseSnapshot:{
    masterEnabled:false,masterAutopilotAllowed:false,agentActive:false,storeSelectedMode:'off',effectiveMode:'off',humanState:'human_active',
    globalPolicy:'deny',storePolicy:'deny',safeCore:true,conversationOpen:true,leadEligible:true,saleConfirmed:false,optedOut:false,
    config:{global:{enabled:true,mode:'autopilot'}},latestInboundAt:'2026-09-07T10:00:00.000Z',sourceValid:true,sourceAnchorAt:'2026-09-07T10:30:00.000Z',context:{}
  }});
  const response=await r.api.POST(jsonRequest(JSON.stringify({phase:'execute',event_id:'00000000-0000-4000-8000-000000000001',generation_mode:generationMode})));
  const result=await response.json();
  assert.equal(response.status,200);assert.equal(result.external_execution,false);assert.equal(result.transport_available,false);
  assert.equal(result.gates.masterEnabled,true);assert.equal(result.gates.masterAutopilotAllowed,true);assert.equal(result.gates.agentActive,true);
  assert.equal(result.gates.storeSelectedMode,'autopilot');assert.equal(result.gates.effectiveMode,'autopilot');assert.equal(result.gates.humanState,'autocar_active');
  assert.equal(result.gates.globalPolicy,'allow');assert.equal(result.gates.storePolicy,'allow');
  if(generationMode==='model') {
    assert.equal(result.decision,'dry_run_ready');assert.equal(result.reason,'all_gates_allow');assert.equal(result.generation_fail_closed,undefined);
  } else {
    assert.equal(result.decision,'blocked');assert.equal(result.reason,'generation_invalid');assert.equal(result.generation_fail_closed,true);
  }
});

for(const failure of ['invalid_json','oversized_form','database']) test(`fail-closed diagnostic does not expose the underlying failure: ${failure}`,async()=>{
  const r=route({}, {databaseError:failure==='database'});
  const request=failure==='invalid_json'?jsonRequest('PRIVATE-INVALID-JSON')
    :failure==='oversized_form'?form('PRIVATE-LARGE-BODY'.repeat(600)):form();
  const response=await r.api.POST(request);
  assert.equal(response.status,500);assert.deepEqual(await response.json(),{error:'Homologation failed closed',external_execution:false});
  expectDiagnostic(r.diagnostics,'request_failed_closed',500);
});

test('logging failure cannot change the authentication gate or response',async()=>{
  const r=route({}, {loggerThrows:true});const response=await r.api.POST(form('PRIVATE-CREDENTIAL'));
  assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'Unavailable'});assert.equal(r.reads(),0);
});
