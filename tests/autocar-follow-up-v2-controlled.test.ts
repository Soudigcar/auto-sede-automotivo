import assert from 'node:assert/strict';
import test from 'node:test';
import { executeFollowUpV2, FOLLOW_UP_V2_CANARY, type FollowUpV2Event, type FollowUpV2Snapshot, type FollowUpV2Ports, type FollowUpV2Outcome } from '../src/lib/server/autocar/followUpV2Execution';
import { planFollowUpV2Sources, type FollowUpV2Facts } from '../src/lib/server/autocar/followUpV2Sources';
import { defaultFollowUpConfigV2 } from '../src/lib/server/autocar/smartFollowUpV2';
import { hasFollowUpOptOut } from '../src/lib/server/autocar/followUpV2Quality';

const preview={vercelEnv:'preview',crmRef:'azszzdotbrczlhrmhrlw',autocarRef:'azszzdotbrczlhrmhrlw',liveAuthorized:false};
const production={vercelEnv:'production',crmRef:'wufikrdgyxrsszlbpfmv',autocarRef:'icmwdggbvijexjgrvsbl',liveAuthorized:true};
function fixture() {
  const config=structuredClone(defaultFollowUpConfigV2);
  config.global={...config.global,enabled:true,mode:'autopilot',allowedStart:'09:00',allowedEnd:'19:00'};
  config.scenarios.forEach(s=>s.enabled=true);
  const event:FollowUpV2Event={id:'event',storeId:FOLLOW_UP_V2_CANARY,conversationId:'conversation',leadId:'lead',scenario:'silent_lead',
    stepId:'silent-30m',sourceId:'outbound',sequenceKey:'sequence',dueAt:'2026-09-06T13:30:00Z',anchorAt:'2026-09-06T13:00:00Z',inboundAt:'2026-09-06T12:00:00Z',
    idempotencyKey:'key',dryRun:true};
  const state:FollowUpV2Snapshot={config,masterEnabled:true,masterAutopilotAllowed:true,agentActive:true,storeSelectedMode:'autopilot',effectiveMode:'autopilot',
    humanState:'autocar_active',globalPolicy:'allow',storePolicy:'allow',safeCore:true,conversationOpen:true,leadEligible:true,saleConfirmed:false,
    optedOut:false,latestInboundAt:event.inboundAt,sourceValid:true,sourceAnchorAt:event.anchorAt,context:{vehicle:'Veículo sintético'}};
  const calls:string[]=[]; const outcomes:FollowUpV2Outcome[]=[];
  const ports:FollowUpV2Ports={now:()=>new Date('2026-09-06T16:00:00Z'),snapshot:async()=>{calls.push('snapshot');return state;},
    claim:async()=>{calls.push('claim');return {lease:{id:'event',owner:'worker',token:'fence'}};},
    settle:async(_lease,outcome)=>{calls.push('settle');outcomes.push(outcome);return true;},audit:async(_event,outcome)=>{calls.push('audit');outcomes.push(outcome);},
    generate:async()=>{calls.push('generate');return {text:'Mensagem contextual fornecida pelo modelo simulado.',model:'mock-model',valid:true};},
    arm:async()=>{calls.push('arm');return true;},send:async()=>{calls.push('send');return {providerMessageId:'simulated-provider-id'};}};
  return {event,state,ports,calls,outcomes};
}

test('Preview usa geração injetada, persiste dry-run e nunca toca no transport',async()=>{
  const f=fixture();const r=await executeFollowUpV2(f.event,f.ports,preview);
  assert.equal(r.decision,'dry_run_ready');assert.equal(r.proposed_text,'Mensagem contextual fornecida pelo modelo simulado.');
  assert.equal(r.external_execution,false);assert.deepEqual(f.calls,['snapshot','claim','generate','snapshot','settle']);
});

const blockedCases:Array<[string,(s:FollowUpV2Snapshot)=>void,string]>=[
  ['master off',s=>s.masterEnabled=false,'master_disabled'],['master autopilot deny',s=>s.masterAutopilotAllowed=false,'master_autopilot_denied'],
  ['human_active',s=>s.humanState='human_active','human_protected'],['autocar_handoff',s=>s.humanState='autocar_handoff','human_protected'],
  ['sale',s=>s.saleConfirmed=true,'sale_confirmed'],['closed',s=>s.conversationOpen=false,'conversation_closed'],
  ['optout',s=>s.optedOut=true,'opt_out'],['inbound',s=>s.latestInboundAt='2026-09-06T15:30:00Z','new_inbound'],
  ['global policy deny',s=>s.globalPolicy='deny','policy_denied'],['store policy deny',s=>s.storePolicy='deny','policy_denied'],
  ['global off',s=>s.config.global.enabled=false,'follow_up_disabled'],['store off (effective)',s=>s.config.global.mode='off','follow_up_disabled'],
  ['store COPILOT',s=>s.storeSelectedMode='copilot','mode_not_autopilot'],['store OFF',s=>s.storeSelectedMode='off','mode_not_autopilot'],
  ['effective COPILOT',s=>s.effectiveMode='copilot','mode_not_autopilot'],['SAFE CORE',s=>s.safeCore=false,'safe_core_denied'],
  ['source changed',s=>s.sourceAnchorAt='2026-09-07T13:00:00Z','source_changed'],['source cancelled',s=>s.sourceValid=false,'source_cancelled'],
  ['outside hours',s=>s.config.global.allowedEnd='12:00','outside_window']
];
for(const [name,change,reason] of blockedCases) {
  test(`${name} impede geração e execução`,async()=>{
    const f=fixture();change(f.state);const r=await executeFollowUpV2(f.event,f.ports,preview);
    assert.equal(r.reason,reason);assert.equal(r.external_execution,false);assert.equal(r.proposed_text,null);
    assert.ok(!f.calls.includes('generate'));assert.ok(!f.calls.includes('send'));assert.equal(f.outcomes.length,1);
  });
  test(`${name} alterado durante IA é revalidado`,async()=>{
    const f=fixture();const generate=f.ports.generate;
    f.ports.generate=async(...args)=>{const result=await generate(...args);change(f.state);return result;};
    const r=await executeFollowUpV2(f.event,f.ports,preview);
    assert.equal(r.reason,reason);assert.equal(r.proposed_text,null);assert.ok(!f.calls.includes('send'));
  });
}
for(const env of [{...preview,crmRef:'wufikrdgyxrsszlbpfmv'},{...preview,autocarRef:'icmwdggbvijexjgrvsbl'},{...preview,vercelEnv:'development'}]) {
  test(`isolamento antes de qualquer I/O ${JSON.stringify(env)}`,async()=>{
    const f=fixture();const r=await executeFollowUpV2(f.event,f.ports,env);assert.equal(r.reason,'environment_isolation');assert.deepEqual(f.calls,[]);
  });
}
test('LIVE é impossível em Preview mesmo com flag true',async()=>{
  const f=fixture();f.event.dryRun=false;
  assert.equal((await executeFollowUpV2(f.event,f.ports,{...preview,liveAuthorized:true})).reason,'environment_isolation');assert.deepEqual(f.calls,[]);
});
test('LIVE futuro é impossível fora da A4',async()=>{
  const f=fixture();f.event.dryRun=false;f.event.storeId='other';
  assert.equal((await executeFollowUpV2(f.event,f.ports,production)).reason,'environment_isolation');assert.deepEqual(f.calls,[]);
});
for(const failure of ['throw','empty','invalid','missing model']) test(`IA ${failure} falha fechada sem template`,async()=>{
  const f=fixture();f.ports.generate=async()=>{
    if(failure==='throw')throw Error('private provider detail');
    return {text:failure==='empty'?'':'Texto simulado',model:failure==='missing model'?'':'mock',valid:failure!=='invalid'};
  };
  const r=await executeFollowUpV2(f.event,f.ports,preview);assert.equal(r.decision,'blocked');assert.equal(r.proposed_text,null);
  assert.equal(r.generation_fail_closed,true);assert.equal(r.external_execution,false);assert.ok(!f.calls.includes('send'));
});
for(const reason of ['daily_limit','cooldown','sequence_limit','duplicate_or_leased']) test(`${reason} impede geração`,async()=>{
  const f=fixture();f.ports.claim=async()=>({reason});const r=await executeFollowUpV2(f.event,f.ports,preview);
  assert.equal(r.reason,reason);assert.ok(!f.calls.includes('generate'));
});
test('worker com lease vencida não arma nem envia',async()=>{
  const f=fixture();f.event.dryRun=false;f.ports.arm=async()=>false;
  const r=await executeFollowUpV2(f.event,f.ports,production);assert.equal(r.reason,'lease_lost');assert.ok(!f.calls.includes('send'));
});
test('atendimento humano durante arm bloqueia imediatamente antes do transport',async()=>{
  const f=fixture();f.event.dryRun=false;f.ports.arm=async()=>{f.state.humanState='human_active';return true;};
  const r=await executeFollowUpV2(f.event,f.ports,production);assert.equal(r.reason,'human_protected');assert.ok(!f.calls.includes('send'));
});
test('recibo do provider mantém external_execution=true se persistência falha',async()=>{
  const f=fixture();f.event.dryRun=false;f.ports.settle=async()=>{throw Error('database unavailable');};
  const r=await executeFollowUpV2(f.event,f.ports,production);assert.equal(r.decision,'sent');assert.equal(r.external_execution,true);
});
test('timeout de provider fica unknown, nunca false nem retry cego',async()=>{
  const f=fixture();f.event.dryRun=false;let calls=0;f.ports.send=async()=>{calls++;throw Error('timeout');};
  const r=await executeFollowUpV2(f.event,f.ports,production);assert.equal(r.decision,'delivery_unknown');assert.equal(r.external_execution,null);assert.equal(calls,1);
});
test('opt-out recente não é descartado num histórico descendente longo',()=>{
  assert.equal(hasFollowUpOptOut([{direction:'inbound',body:'STOP'},...Array.from({length:30},()=>({direction:'inbound',body:'Quero um carro'}))]),true);
  assert.equal(hasFollowUpOptOut([{direction:'inbound',body:'Nao quero receber mensagens'}]),true);
});
test('cenários operacionais usam offsets oficiais, callback usa horário pedido',()=>{
  const f=fixture();const facts:FollowUpV2Facts={storeId:'synthetic',conversationId:'c',leadId:'l',leadStatus:'scheduled',
    inboundAt:'2026-09-06T12:00:00Z',outboundAt:'2026-09-06T13:00:00Z',outboundId:'m',scheduledAt:'2026-09-07T18:00:00Z',vehicleInterest:false,financingPending:false,
    appointments:[{id:'a',at:'2026-09-07T18:00:00Z',status:'scheduled'}],callbacks:[]};
  let planned=planFollowUpV2Sources(facts,f.state.config,true);
  assert.equal(planned.find(e=>e.scenario==='visit_confirmation')?.dueAt,'2026-09-06T18:00:00.000Z');
  assert.equal(planned.find(e=>e.scenario==='no_show')?.dueAt,'2026-09-07T18:30:00.000Z');
  facts.leadStatus='showed_up';planned=planFollowUpV2Sources(facts,f.state.config,true);
  assert.deepEqual(planned.map(e=>e.scenario),['post_visit']);assert.equal(planned[0].dueAt,'2026-09-07T20:00:00.000Z');
  facts.appointments=[];facts.callbacks=[{id:'cb',at:'2026-09-07T14:17:00Z',explicitlyRequested:true,active:true}];
  planned=planFollowUpV2Sources(facts,f.state.config,true);assert.equal(planned[0].scenario,'callback_requested');assert.equal(planned[0].dueAt,'2026-09-07T14:17:00.000Z');
  facts.callbacks[0].explicitlyRequested=false;assert.deepEqual(planFollowUpV2Sources(facts,f.state.config,true),[]);
});

test('bloqueio anterior à geração registra gates sanitizados',async()=>{
  const f=fixture();f.state.globalPolicy='deny';
  f.state.context={secret:'DO-NOT-AUDIT',customer:'PRIVATE-CUSTOMER'};
  await executeFollowUpV2(f.event,f.ports,preview);
  assert.equal(f.outcomes[0].gates?.global_policy,'deny');
  assert.equal(f.outcomes[0].gates?.human_state,'autocar_active');
  assert.equal(f.outcomes[0].gates?.idempotency_key,'key');
  assert.ok(!JSON.stringify(f.outcomes).includes('DO-NOT-AUDIT'));
  assert.ok(!JSON.stringify(f.outcomes).includes('PRIVATE-CUSTOMER'));
});

test('limite de claim mantém evidência operacional sem chamar o modelo',async()=>{
  const f=fixture();f.ports.claim=async()=>({reason:'daily_limit'});
  await executeFollowUpV2(f.event,f.ports,preview);
  assert.equal(f.outcomes[0].reason,'daily_limit');
  assert.equal(f.outcomes[0].gates?.follow_up_enabled,true);
  assert.equal(f.outcomes[0].gates?.effective_mode,'autopilot');
  assert.ok(!f.calls.includes('generate'));
});

test('auditoria de bloqueio final usa snapshot novo, sem reutilizar o anterior',async()=>{
  const f=fixture();f.event.dryRun=false;let reads=0;
  f.ports.snapshot=async()=>({...structuredClone(f.state),humanState:++reads===3?'human_active':'autocar_active'});
  const result=await executeFollowUpV2(f.event,f.ports,production);
  assert.equal(result.reason,'human_protected');
  assert.equal(f.outcomes[0].gates?.human_state,'human_active');
  assert.ok(!f.calls.includes('send'));
});

for(const uncertain of [false,true]) test(`resultado do transport simulado preserva gates finais e modelo: uncertain=${uncertain}`,async()=>{
  const f=fixture();f.event.dryRun=false;let reads=0;
  f.ports.snapshot=async()=>{const state=structuredClone(f.state);state.config.global.maxPerLeadPerDay=++reads===3?1:2;return state;};
  if(uncertain) f.ports.send=async()=>{throw Error('private provider error');};
  const result=await executeFollowUpV2(f.event,f.ports,production);
  assert.equal(result.external_execution,uncertain?null:true);
  assert.equal(f.outcomes[0].gates?.max_per_lead_per_day,1);
  assert.equal(f.outcomes[0].model,'mock-model');
  assert.equal(f.outcomes[0].gates?.global_policy,'allow');
});
