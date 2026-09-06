import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readRawBody, safeEqual } from '../src/lib/server/requestSecurity';

function route(overrides:Record<string,string>={},options:{row?:unknown;databaseError?:boolean;loggerThrows?:boolean}={}) {
  let reads=0;
  const diagnostics:string[]=[];
  const exports:any={};
  const query={
    select:()=>query,eq:()=>query,
    maybeSingle:async()=>({data:options.row || null,error:null}),
    then:(resolve:(value:unknown)=>unknown)=>resolve({error:options.databaseError ? {message:'PRIVATE-DATABASE-DETAIL'} : null})
  };
  const db={from:()=>{reads++;return query;}};
  const dependencies:Record<string,any>={
    'next/server':{NextResponse:{json:(body:unknown,options?:ResponseInit)=>Response.json(body,options)}},
    '@/lib/server/requestSecurity':{readRawBody,safeEqual},
    '@/lib/server/storeTeam':{createAdminClient:()=>db},
    '@/lib/server/autocar/runtimeEnvironment':{getAutocarRuntimeClient:()=>db},
    '@/lib/server/autocar/followUpV2Data':{
      assertFollowUpV2Environment:()=>({crmRef:'azszzdotbrczlhrmhrlw',autocarRef:'azszzdotbrczlhrmhrlw'}),
      createFollowUpV2DatabasePorts:()=>({})
    },
    '@/lib/server/autocar/followUpV2Execution':{},'@/lib/server/autocar/smartFollowUpV2':{validateFollowUpConfigV2:()=>({ok:false})}
  };
  const source=ts.transpileModule(readFileSync('src/app/api/internal/autocar/follow-up-v2-homologation/route.ts','utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,Response,URL,URLSearchParams,
    console:{warn:(value:string)=>{if(options.loggerThrows) throw Error('logger unavailable');diagnostics.push(value);}},
    process:{env:{VERCEL_ENV:'preview',
    VERCEL_GIT_COMMIT_REF:'fix/autocar-follow-up-v2-controlled',AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_ENABLED:'true',
    AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SECRET:'synthetic-test-only',...overrides}},require:(name:string)=>{
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
  const r=route();const response=await r.api.GET();const html=await response.text();
  assert.equal(response.status,200);assert.ok(!html.includes('synthetic-test-only'));
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
  const r=route(missingSecret?{AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SECRET:''}:{});
  const request=transport==='form'?form('PRIVATE-CREDENTIAL'):new Request(`${origin}/api/internal/autocar/follow-up-v2-homologation`,{
    method:'POST',headers:{authorization:'Bearer PRIVATE-CREDENTIAL','content-type':'application/json'},body:'{"phase":"isolation","customer":"PRIVATE-CUSTOMER"}'
  });
  const response=await r.api.POST(request);
  assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'Unavailable'});
  expectDiagnostic(r.diagnostics,missingSecret?'secret_not_configured':'credential_rejected',403);
  assert.equal(r.reads(),0);
});

function jsonRequest(body:string) {
  return new Request(`${origin}/api/internal/autocar/follow-up-v2-homologation`,{method:'POST',
    headers:{authorization:'Bearer synthetic-test-only','content-type':'application/json'},body});
}

test('valid bearer isolation has no rejection diagnostic',async()=>{
  const r=route();const response=await r.api.POST(jsonRequest('{"phase":"isolation"}'));
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
