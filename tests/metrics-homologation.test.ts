import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { validateMetricsHomologation, forbiddenMetricsRefs, metricsBranch, homologationRouteAllowed, homologationRequested, restrictedMetricsFetch, restrictedCrmFetch } from '../src/lib/commercialMetricsHomologation';
import { createAutocarMetricsClient } from '../src/lib/server/autocarMetricsEnvironment';
const crm='abcdefghijklmnopqrst', autocar='tsrqponmlkjihgfedcba';
const manifest={approved:true,branch:metricsBranch,crmProjectRef:crm,autocarProjectRef:autocar};
const env={VERCEL_ENV:'preview',NEXT_PUBLIC_VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:metricsBranch,COMMERCIAL_METRICS_HOMOLOGATION_ENABLED:'true',NEXT_PUBLIC_COMMERCIAL_METRICS_HOMOLOGATION_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:`https://${crm}.supabase.co`,AUTOCAR_METRICS_SUPABASE_URL:`https://${autocar}.supabase.co`,CRM_METRICS_EXPECTED_PROJECT_REF:crm,AUTOCAR_METRICS_EXPECTED_PROJECT_REF:autocar,SUPABASE_SERVICE_ROLE_KEY:'synthetic',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic',AUTOCAR_METRICS_SUPABASE_SERVICE_ROLE_KEY:'synthetic'};
test('dedicated Preview requires every independent guard',()=>{
 assert.deepEqual(validateMetricsHomologation(env,manifest),{crm,autocar});
 for(const key of Object.keys(env)){const copy={...env};delete copy[key as keyof typeof copy];assert.throws(()=>validateMetricsHomologation(copy,manifest),key);}
 assert.throws(()=>validateMetricsHomologation(env));
 assert.throws(()=>validateMetricsHomologation({...env,VERCEL_GIT_COMMIT_REF:'other'},manifest));
 assert.throws(()=>validateMetricsHomologation({...env,VERCEL_ENV:'development'},manifest));
});
for(const ref of forbiddenMetricsRefs) test(`forbidden project ${ref} rejected in either position`,()=>{
 assert.throws(()=>validateMetricsHomologation({...env,NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,CRM_METRICS_EXPECTED_PROJECT_REF:ref},{...manifest,crmProjectRef:ref}));
 assert.throws(()=>validateMetricsHomologation({...env,AUTOCAR_METRICS_SUPABASE_URL:`https://${ref}.supabase.co`,AUTOCAR_METRICS_EXPECTED_PROJECT_REF:ref},{...manifest,autocarProjectRef:ref}));
});
test('distinct projects, HTTPS, exact manifest and hostname required',()=>{
 for(const url of [`http://${crm}.supabase.co`,`https://${crm}.supabase.co.evil.invalid`,`https://secret@${crm}.supabase.co`,`https://${crm}.supabase.co/path`])assert.throws(()=>validateMetricsHomologation({...env,NEXT_PUBLIC_SUPABASE_URL:url},manifest));
 assert.throws(()=>validateMetricsHomologation(env,{...manifest,crmProjectRef:autocar}));
 assert.throws(()=>validateMetricsHomologation({...env,AUTOCAR_METRICS_SUPABASE_URL:env.NEXT_PUBLIC_SUPABASE_URL,AUTOCAR_METRICS_EXPECTED_PROJECT_REF:crm},{...manifest,autocarProjectRef:crm}));
});
test('Production ignores all homologation overrides and uses operational project',()=>{
 const production={...env,VERCEL_ENV:'production',AUTOCAR_SUPABASE_URL:'https://icmwdggbvijexjgrvsbl.supabase.co',AUTOCAR_SUPABASE_SERVICE_ROLE_KEY:'synthetic'};
 assert.equal(homologationRequested(production),false);
 const client=createAutocarMetricsClient(production);
 assert.equal((client as any).supabaseUrl,'https://icmwdggbvijexjgrvsbl.supabase.co');
 assert.throws(()=>createAutocarMetricsClient({...production,AUTOCAR_SUPABASE_URL:''}));
});
test('routes deny providers, picture refresh, write verbs, image proxy and server actions',()=>{
 for(const route of ['/api/store-whatsapp/profile-picture','/api/cron/autocar-follow-up-v2','/api/site-import','/api/webhooks/evolution','/_next/image','/api/store/portal/pipeline/extra','/loja/real-store/pipeline'])assert.equal(homologationRouteAllowed(route,'GET'),false,route);
 for(const route of ['/login','/api/store/portal/context','/api/store/portal/dashboard','/api/store/portal/pipeline','/loja/store-alpha/pipeline','/_next/static/chunks/example.js']){
 assert.equal(homologationRouteAllowed(route,'GET'),true); assert.equal(homologationRouteAllowed(route,'POST'),false);
 }
});
test('network denies arbitrary providers and redirects before transport',async()=>{
 let calls=0;const transport:typeof fetch=async(_input,init)=>{calls++;assert.equal(init?.redirect,'error');return new Response('{}');};
 const safe=restrictedMetricsFetch([`${autocar}.supabase.co`],transport);
 for(const host of ['api.openai.com','graph.facebook.com','api.autosede.com.br','web.whatsapp.com','arbitrary.invalid'])await assert.rejects(safe(`https://${host}/rest/v1/rpc/read_store_autocar_evidence_v1`));
 assert.equal(calls,0);await safe(`${env.AUTOCAR_METRICS_SUPABASE_URL}/rest/v1/rpc/read_store_autocar_evidence_v1`,{method:'POST'});assert.equal(calls,1);
 const read=restrictedCrmFetch(`${crm}.supabase.co`,transport);
 await assert.rejects(read(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/leads`,{method:'PATCH'}));
 await assert.rejects(read(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object`));
 await read(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/leads`);
});
test('profile picture UI exits before enqueue/fetch in homologation',()=>{
 const source=readFileSync('src/hooks/useStoreWhatsappProfilePictures.ts','utf8');
 const fn=source.slice(source.indexOf('function loadPicture('));
 assert.ok(fn.indexOf('NEXT_PUBLIC_COMMERCIAL_METRICS_HOMOLOGATION_ENABLED')<fn.indexOf('const key'));
 assert.ok(fn.indexOf("status: 'missing'")<fn.indexOf('fetch('));
});
const base='supabase/homologation/commercial-metrics-v1';
async function database(ref:string){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;set app.metrics_homologation='synthetic-only';set app.metrics_project_ref='${ref}';set app.settings.api_external_url='https://${ref}.supabase.co';`);return db;}
test('separate bootstraps install twice, preserve deterministic data and SQL permissions',async()=>{
 const c=await database(crm),a=await database(autocar);
 try{
 for(let round=0;round<2;round++){
 for(const [db,kind,functions] of [[c,'crm',['crm','crm-autocar']],[a,'autocar',['autocar']]] as const){
 await db.exec(readFileSync(`${base}/${kind}/schema.sql`,'utf8'));
 for(const fn of functions)await db.exec(readFileSync(`supabase/proposed/commercial-metrics-v1/${fn}.sql`,'utf8'));
 await db.exec(readFileSync(`${base}/${kind}/seed.sql`,'utf8'));
 }
 }
 assert.equal((await c.query<{n:number}>('select count(*)::int n from leads')).rows[0].n,572);
 assert.equal((await c.query<{n:number}>('select count(*)::int n from store_whatsapp_integrations')).rows[0].n,0);
 const result=(await c.query<{v:any}>("select read_store_commercial_metrics_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,'2026-02-01','{}') v")).rows[0].v;
 assert.equal(result.metrics.total,552);assert.equal(result.metrics.sold,2);
 const rank=(await c.query<{n:number}>("select n from(select id,row_number()over(order by created_at desc,id desc)::int n from leads where assigned_store_id='10000000-0000-4000-8000-000000000001')r where id='30000000-0000-4000-8000-000000000400'")).rows[0].n;assert.ok(rank>200);
 for(const db of [c,a]){
 const grants=await db.query<{allowed:boolean}>("select has_function_privilege('authenticated',p.oid,'execute') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'read_store_%'");assert.ok(grants.rows.every(r=>!r.allowed));
 assert.equal((await db.query<{n:number}>("select count(*)::int n from pg_trigger where not tgisinternal")).rows[0].n,0);
 }
 const evidence=(await a.query<{v:any}>("select read_store_autocar_evidence_v1('10000000-0000-4000-8000-000000000001','2026-02-01') v")).rows[0].v;
 assert.equal(evidence.claims.length,2);
 const ai=(await c.query<{v:any}>("select read_store_autocar_metrics_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,'2026-02-01',$1::jsonb) v",[JSON.stringify(evidence)])).rows[0].v;
 assert.equal(ai.sent_messages,2);assert.equal(ai.sales_with_participation,1);assert.equal(ai.appointments_with_participation,1);
 await c.exec("insert into auth.users values('90000000-0000-4000-8000-000000000001');update public.users set auth_user_id='90000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002';set test.uid='90000000-0000-4000-8000-000000000001';set role authenticated;");
 assert.equal((await c.query<{n:number}>('select count(*)::int n from leads')).rows[0].n,552);
 await assert.rejects(c.exec("update leads set status='lost'"));
 await c.exec('reset role');
 for (let n=3;n<=9;n++) {
 const suffix=String(n).padStart(12,'0');
 await c.exec(`insert into auth.users values('90000000-0000-4000-8000-${suffix}');update public.users set auth_user_id='90000000-0000-4000-8000-${suffix}' where id='20000000-0000-4000-8000-${suffix}';set test.uid='90000000-0000-4000-8000-${suffix}';set role authenticated;`);
 const foreignStore=n<=5?'10000000-0000-4000-8000-000000000002':'10000000-0000-4000-8000-000000000001';
 assert.equal((await c.query<{n:number}>('select count(*)::int n from leads where assigned_store_id=$1',[foreignStore])).rows[0].n,0);
 await c.exec('reset role');
 }
 assert.deepEqual((await c.query<{tablename:string}>("select tablename from pg_publication_tables where pubname='supabase_realtime'")).rows.map(r=>r.tablename),['leads']);
 }finally{await c.close();await a.close();}
});
test('SQL rejects missing or prohibited identity before DDL',async()=>{
 const db=await database(forbiddenMetricsRefs[0]);try{await assert.rejects(db.exec(readFileSync(`${base}/crm/schema.sql`,'utf8')));}finally{await db.close();}
});

test('UI picture loader makes zero network requests in dedicated Preview',async()=>{
 const {runInNewContext}=await import('node:vm'); const ts=(await import('typescript')).default;
 let calls=0;const exports:any={};
 const source=readFileSync('src/hooks/useStoreWhatsappProfilePictures.ts','utf8')+'\nexport { loadPicture };';
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
  exports,require:()=>({}),process:{env:{NEXT_PUBLIC_VERCEL_ENV:'preview',NEXT_PUBLIC_COMMERCIAL_METRICS_HOMOLOGATION_ENABLED:'true'}},
  fetch:()=>{calls++;throw new Error('Unexpected profile picture request');},Map,Promise,URL,URLSearchParams
 });
 const result=await exports.loadPicture('store-alpha',{id:'synthetic',provider:'evolution'},'synthetic');
 assert.equal(result.status,'missing');assert.equal(calls,0);
});
test('operational executors never import metrics environment',async()=>{
 const {readdirSync}=await import('node:fs');
 function inspect(path:string){for(const entry of readdirSync(path,{withFileTypes:true})){const file=`${path}/${entry.name}`;if(entry.isDirectory())inspect(file);else if(file.endsWith('.ts'))assert.doesNotMatch(readFileSync(file,'utf8'),/autocarMetricsEnvironment|commercialMetricsHomologation/,file);}}
 inspect('src/lib/server/autocar');
});
test('bootstrap renderer has no remote execution and default manifest rejects installation',async()=>{
 const {execFileSync}=await import('node:child_process');
 assert.throws(()=>execFileSync(process.execPath,['--import','tsx','scripts/render-metrics-homologation.ts','--kind','crm','--project-ref',crm],{stdio:'pipe'}));
 for(const kind of ['crm','autocar'])for(const file of ['schema','seed']){
 const sql=readFileSync(`${base}/${kind}/${file}.sql`,'utf8');
 assert.doesNotMatch(sql,/create\s+(?:or\s+replace\s+)?trigger|cron\.schedule|net\.http|http_post|vault\./i);
 assert.match(sql,/Unverified homologation database/);
 }
});
test('backend proxy rejects manual picture requests before route execution',async()=>{
 const {runInNewContext}=await import('node:vm');const ts=(await import('typescript')).default;
 const exports:any={};let nextCalls=0;
 runInNewContext(ts.transpileModule(readFileSync('src/proxy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
 exports,process:{env},URL,require:(name:string)=>name==='next/server'?{NextResponse:{json:(_body:unknown,options:any)=>({status:options.status}),next:()=>{nextCalls++;return {headers:new Headers()};}}}:{homologationRequested:()=>true,validateMetricsHomologation:()=>validateMetricsHomologation(env,manifest),homologationRouteAllowed}
 });
 assert.equal(exports.proxy({nextUrl:{pathname:'/api/store-whatsapp/profile-picture'},method:'GET'}).status,403);
 assert.equal(nextCalls,0);
});
