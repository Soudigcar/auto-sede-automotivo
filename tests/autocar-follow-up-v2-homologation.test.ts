import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readRawBody, safeEqual } from '../src/lib/server/requestSecurity';

function route(overrides:Record<string,string>={}) {
  let reads=0;
  const exports:any={};
  const db={from:()=>{reads++;return {select:async()=>({error:null})};}};
  const dependencies:Record<string,any>={
    'next/server':{NextResponse:{json:(body:unknown,options?:ResponseInit)=>Response.json(body,options)}},
    '@/lib/server/requestSecurity':{readRawBody,safeEqual},
    '@/lib/server/storeTeam':{createAdminClient:()=>db},
    '@/lib/server/autocar/runtimeEnvironment':{getAutocarRuntimeClient:()=>db},
    '@/lib/server/autocar/followUpV2Data':{
      assertFollowUpV2Environment:()=>({crmRef:'azszzdotbrczlhrmhrlw',autocarRef:'azszzdotbrczlhrmhrlw'}),
      createFollowUpV2DatabasePorts:()=>({})
    },
    '@/lib/server/autocar/followUpV2Execution':{},'@/lib/server/autocar/smartFollowUpV2':{}
  };
  const source=ts.transpileModule(readFileSync('src/app/api/internal/autocar/follow-up-v2-homologation/route.ts','utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,Response,URL,URLSearchParams,process:{env:{VERCEL_ENV:'preview',
    VERCEL_GIT_COMMIT_REF:'fix/autocar-follow-up-v2-controlled',AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_ENABLED:'true',
    AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SECRET:'synthetic-test-only',...overrides}},require:(name:string)=>{
      assert.ok(Object.hasOwn(dependencies,name),`Unexpected dependency ${name}`);return dependencies[name];
    }});
  return {api:exports,reads:()=>reads};
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
});
