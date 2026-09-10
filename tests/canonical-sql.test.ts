import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const at = (n: number) => new Date(Date.UTC(2026,0,1,0,n)).toISOString();
const store=id(1), foreign=id(2), actor=id(101), seller=id(102), preSales=id(103), prospector=id(104), lead=id(201), conv=id(301);
let crm: PGlite, autocar: PGlite;
before(async () => {
  crm=new PGlite(); autocar=new PGlite();
  await crm.exec(readFileSync('tests/fixtures/canonical-metrics/schema.sql','utf8'));
  await crm.exec(readFileSync('supabase/proposed/commercial-metrics-v1/crm.sql','utf8'));
  await crm.exec(readFileSync('supabase/proposed/commercial-metrics-v1/crm-autocar.sql','utf8'));
  await autocar.exec(`create role anon; create role authenticated; create role service_role;
    create table ai_runtime_message_claims(id uuid,store_id uuid,production_conversation_id uuid,status text,result jsonb,completed_at timestamptz,purpose text);
    create table ai_runtime_conversations(store_id uuid,production_conversation_id uuid,production_lead_id uuid,human_state text,effective_mode text,updated_at timestamptz);
    create table ai_store_agents(store_id uuid,status text,mode text,master_enabled boolean,master_autopilot_allowed boolean);`);
  await autocar.exec(readFileSync('supabase/proposed/commercial-metrics-v1/autocar.sql','utf8'));
});
after(async()=>{await crm?.close();await autocar?.close();});
beforeEach(async()=>{
  await crm.exec('truncate stores,users,leads,sales,lead_activity_logs,whatsapp_conversations,whatsapp_messages');
  await autocar.exec('truncate ai_runtime_message_claims,ai_runtime_conversations,ai_store_agents');
  await crm.query("insert into stores values($1,'active',true),($2,'active',true)",[store,foreign]);
  for(const [user,role] of [[actor,'store'],[seller,'seller'],[preSales,'pre_sales'],[prospector,'prospector']] as const)
    await crm.query("insert into users values($1,$2,'active',$3,$4)",[user,store,role,`Synthetic ${role}`]);
  await crm.query("insert into leads values($1,$2,'in_service',$3,$4,$4,$5,$6)",[lead,store,at(-60),seller,preSales,prospector]);
  await crm.query("insert into whatsapp_conversations values($1,$2,$3,'open')",[conv,lead,store]);
});
async function metrics(who=actor,subject:string|null=null){
  return (await crm.query<any>('select read_store_commercial_metrics_v1($1,$2,$3,$4,$5) result',[store,who,subject,at(100),[lead]])).rows[0].result;
}
async function msg(n:number,minute:number,patch:Record<string,any>={}){
  const m={store,conversation:conv,lead,direction:'outbound',status:'sent',type:'text',payload:{metric_sender_type:'human',metric_sender_source:'crm',metric_sender_user_id:seller},sent_at:at(minute),created_at:at(minute),provider:null,...patch};
  await crm.query('insert into whatsapp_messages values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id(n),m.store,m.conversation,m.lead,m.provider,m.direction,m.status,m.type,JSON.stringify(m.payload),m.sent_at,m.created_at]);
}
async function inbound(){await msg(401,0,{direction:'inbound',status:'received',payload:{}});}
async function sale(){await crm.query("update leads set status='sale_confirmed' where id=$1",[lead]);await crm.query("insert into sales values($1,$2,$3,'confirmed',$4,$4,$5,$6,$7)",[id(901),lead,store,at(20),seller,preSales,prospector]);}
async function claim(n=501,patch:Record<string,any>={}){
 const c={store,conversation:conv,status:'completed',external:true,purpose:'live_text_send',...patch};
 await autocar.query('insert into ai_runtime_message_claims values($1,$2,$3,$4,$5,$6,$7)',[id(n),c.store,c.conversation,c.status,JSON.stringify({external_execution:c.external}),at(2),c.purpose]);
}
async function ai(){
 const evidence=(await autocar.query<any>('select read_store_autocar_evidence_v1($1,$2) result',[store,at(100)])).rows[0].result;
 return (await crm.query<any>('select read_store_autocar_metrics_v1($1,$2,null,$3,$4) result',[store,actor,at(100),JSON.stringify(evidence)])).rows[0].result;
}
test('SQL first response crosses conversations without restarting',async()=>{
 await inbound();await crm.query("insert into whatsapp_conversations values($1,$2,$3,'open')",[id(302),lead,store]);
 await msg(402,5,{conversation:id(302)});const r=(await metrics()).metrics.response;
 assert.equal(r.eligible_leads,1);assert.equal(r.measured_leads,1);assert.equal(r.median_minutes,5);
});
for(const [name,patch,category] of [
 ['human',{},'measured'],['failed',{status:'failed'},'unanswered'],['pending',{status:'pending'},'unanswered'],
 ['unknown delivery',{status:'unknown'},'indeterminate'],['unknown author',{payload:{}},'indeterminate'],
 ['autocar',{payload:{autocar_live_pilot:true}},'unanswered'],['system',{type:'system'},'unanswered'],
 ['read',{status:'read'},'measured'],['delivered',{status:'delivered'},'measured']
] as const)test(`SQL ${name} classification`,async()=>{
 await inbound();await msg(402,5,patch);const r=(await metrics()).metrics.response;
 assert.equal(r[`${category}_leads`],1);assert.equal(r.eligible_leads,r.measured_leads+r.unanswered_leads+r.indeterminate_leads);
});
test('SQL uncertain earlier response excludes measured median',async()=>{await inbound();await msg(402,1,{payload:{}});await msg(403,5);assert.equal((await metrics()).metrics.response.indeterminate_leads,1);});
test('SQL fallback and provider retry retain original time',async()=>{
 await inbound();await msg(402,5,{sent_at:null,created_at:at(5),provider:'synthetic-provider'});
 await msg(403,8,{provider:'synthetic-provider'});assert.equal((await metrics()).metrics.response.median_minutes,5);
});
test('store sale remains one across three participants and changed owner',async()=>{
 await sale();await crm.query('update leads set assigned_user_id=$1',[actor]);const r=await metrics();
 assert.equal(r.metrics.sold,1);assert.equal(r.team.find((m:any)=>m.id===seller).seller_participation,1);
 assert.equal(r.team.find((m:any)=>m.id===preSales).pre_sales_participation,1);
 assert.equal(r.team.find((m:any)=>m.id===prospector).prospector_participation,1);
 assert.equal(r.team.find((m:any)=>m.id===preSales).conversion_rate,null);
 for(const user of [seller,preSales,prospector])assert.equal((await metrics(user,user)).metrics.sold,1);
});
test('same participant in two roles does not duplicate total',async()=>{await sale();await crm.query('update sales set pre_sales_user_id=seller_user_id');const r=await metrics();assert.equal(r.metrics.sold,1);const member=r.team.find((m:any)=>m.id===seller);assert.equal(member.seller_participation,1);assert.equal(member.pre_sales_participation,1);});
test('SQL totals ignore card pagination and count old sale beyond 200',async()=>{
 await sale();await crm.exec(`insert into leads(id,assigned_store_id,status,created_at,assigned_user_id)
 select ('00000000-0000-4000-8000-'||lpad((1000+i)::text,12,'0'))::uuid,'${store}','new_lead','2026-01-01T00:00:00Z', '${seller}' from generate_series(1,550)i;`);
 await crm.query("insert into leads values($1,$2,'sale_confirmed',$3,$4,$4,null,null)",[id(202),store,at(30),seller]);
 await crm.query("insert into sales values($1,$2,$3,'confirmed',$4,$4,$5,null,null)",[id(902),id(202),store,at(40),seller]);
 const r=await metrics();assert.equal(r.metrics.total,552);assert.equal(r.metrics.sold,2);assert.equal(r.stage_totals.sale_confirmed,2);
 const positions=await crm.query<any>("select position from(select id,row_number() over(order by created_at desc,id desc) position from leads)r where id=$1",[lead]);
 assert.ok(Number(positions.rows[0].position)>200);
});
test('historical attendance includes later sold lead',async()=>{await sale();await crm.query("insert into lead_activity_logs values($1,$2,$3,'showed_up_marked',null,$4)",[id(801),lead,store,at(1)]);assert.equal((await metrics()).metrics.showed_up,1);});
for(const who of [seller,preSales,prospector])test(`SQL member scope cannot expand: ${who.slice(-3)}`,async()=>{await assert.rejects(metrics(who,null));});
test('SQL foreign membership and messages cannot cross store',async()=>{
 await inbound();await msg(402,1,{store:foreign});assert.equal((await metrics()).metrics.response.measured_leads,0);
 await crm.query('update users set store_id=$1 where id=$2',[foreign,actor]);await assert.rejects(metrics());
});
test('anon and authenticated cannot execute the RPC',async()=>{
 for(const role of ['anon','authenticated']){await crm.exec(`set role ${role}`);try{await assert.rejects(metrics());}finally{await crm.exec('reset role');}}
});
for(const [name,patch] of [['generation only',{status:'ready',external:false}],['failed execution',{status:'failed'}],['no external execution',{external:false}]] as const)
 test(`AUTOCAR excludes ${name}`,async()=>{await inbound();await claim(501,patch);await msg(402,2,{payload:{live_claim_id:id(501),autocar_live_pilot:true}});assert.equal((await ai()).sent_messages,0);});
test('AUTOCAR successful execution, several photos and duplicate claims count messages once',async()=>{
 await inbound();await claim();await claim();
 for(let n=402;n<405;n++)await msg(n,2,{payload:{live_claim_id:id(501),autocar_live_photo_pilot:true},provider:`synthetic-${n}`});
 const r=await ai();assert.equal(r.sent_messages,3);assert.equal(r.answered_leads,1);assert.equal(r.first_response.p50_minutes,2);
});
for(const humanMinute of [1,5])test(`AUTOCAR and human clocks remain separate: human at ${humanMinute}`,async()=>{
 await inbound();await claim();await msg(402,2,{payload:{live_claim_id:id(501),autocar_live_pilot:true}});await msg(403,humanMinute);
 assert.equal((await ai()).first_response.p50_minutes,2);assert.equal((await metrics()).metrics.response.median_minutes,humanMinute);
});
for(const [kind,minute,expected] of [['appointment',1,0],['appointment',5,1],['sale',1,0],['sale',5,1]] as const)
 test(`AUTOCAR ${kind} participation at ${minute}`,async()=>{
 await inbound();await claim();await msg(402,2,{payload:{live_claim_id:id(501),autocar_live_pilot:true}});
 if(kind==='sale'){await sale();await crm.query('update sales set confirmed_at=$1',[at(minute)]);}
 else await crm.query("insert into lead_activity_logs values($1,$2,$3,'stage_changed','scheduled',$4)",[id(801),lead,store,at(minute)]);
 const r=await ai();assert.equal(kind==='sale'?r.sales_with_participation:r.appointments_with_participation,expected);
});
test('AUTOCAR current state excludes closed conversations and final leads',async()=>{
 await autocar.query("insert into ai_store_agents values($1,'active','autopilot',true,true)",[store]);
 await autocar.query("insert into ai_runtime_conversations values($1,$2,$3,'autocar_active','autopilot',$4)",[store,conv,lead,at(0)]);
 assert.equal((await ai()).currently_active_conversations,1);
 await crm.exec("update whatsapp_conversations set status='closed'");assert.equal((await ai()).currently_active_conversations,0);
 await crm.exec("update whatsapp_conversations set status='open'; update leads set status='lost'");assert.equal((await ai()).currently_active_conversations,0);
});
test('AUTOCAR zero activity and cross-store claims stay zero',async()=>{
 assert.equal((await ai()).sent_messages,0);await claim(501,{store:foreign});await msg(402,2,{payload:{live_claim_id:id(501)}});assert.equal((await ai()).sent_messages,0);
});

for (const status of ['sale_confirmed','lost']) test(`SQL later ${status} preserves the first response`,async()=>{
 await inbound();await msg(402,5);await crm.query('update leads set status=$1,assigned_user_id=$2',[status,preSales]);
 assert.equal((await metrics()).metrics.response.median_minutes,5);
});
test('SQL Master scope remains store bounded',async()=>{
 await crm.query("update users set role='master',store_id=null where id=$1",[actor]);
 await crm.query("insert into leads(id,assigned_store_id,status,created_at) values($1,$2,'new_lead',$3)",[id(202),foreign,at(0)]);
 assert.equal((await metrics()).metrics.total,1);
});
test('SQL subject filter cannot expand to another store',async()=>{
 await crm.query('update users set store_id=$1 where id=$2',[foreign,seller]);
 await assert.rejects(metrics(actor,seller));
});
test('SQL original-send timestamp is preserved after receipt',async()=>{
 await inbound();await msg(402,5,{status:'read',created_at:at(50)});
 assert.equal((await metrics()).metrics.response.median_minutes,5);
});
