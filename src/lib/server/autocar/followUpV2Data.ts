import { randomUUID } from 'node:crypto';
import { sendEvolutionText } from '@/lib/server/evolution';
import { readStoreFollowUpV2 } from './followUpV2ConfigStore';
import { autocarProjectRefFromUrl, resolveAutocarRuntimeTarget, getAutocarRuntimeClient, evaluateAutocarExternalExecutionGate, currentAutocarExternalReferenceColumns } from './runtimeEnvironment';
import { executeFollowUpV2, FOLLOW_UP_V2_CANARY, type FollowUpV2Event, type FollowUpV2Ports, type FollowUpV2Snapshot } from './followUpV2Execution';
import { planFollowUpV2Sources, type FollowUpV2Facts } from './followUpV2Sources';
import { generateContextualFollowUpReopening, looksLikeNonLeadAutomation } from './followUpV2ContextualReopening';
import { contextualAutopilotQuality, hasFollowUpOptOut } from './followUpV2Quality';
import type { FollowUpConfigV2 } from './smartFollowUpV2';

async function data(query: any): Promise<any> {
  const result = await query;
  if (result.error) throw new Error(`follow_up_database:${result.error.code || 'query_failed'}`);
  return result.data;
}
export function followUpV2Environment() {
  const target = resolveAutocarRuntimeTarget();
  return { vercelEnv: process.env.VERCEL_ENV || '', crmRef: autocarProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || ''),
    autocarRef: target.projectRef, liveAuthorized: process.env.AUTOCAR_FOLLOW_UP_V2_LIVE_A4_ENABLED === 'true' };
}
export function assertFollowUpV2Environment(dryRun: boolean) {
  const env = followUpV2Environment();
  const allowed = dryRun
    ? env.vercelEnv === 'preview' && env.crmRef === 'azszzdotbrczlhrmhrlw' && env.autocarRef === 'azszzdotbrczlhrmhrlw'
    : env.vercelEnv === 'production' && env.crmRef === 'wufikrdgyxrsszlbpfmv' && env.autocarRef === 'icmwdggbvijexjgrvsbl' && env.liveAuthorized;
  if (!allowed) throw new Error('follow_up_environment_isolation');
  return env;
}
function assertClients(crm: any,autocar: any,dryRun: boolean) {
  const env=assertFollowUpV2Environment(dryRun);
  if (autocarProjectRefFromUrl(String(crm.supabaseUrl || ''))!==env.crmRef || autocarProjectRefFromUrl(String(autocar.supabaseUrl || ''))!==env.autocarRef) {
    throw new Error('follow_up_client_destination_mismatch');
  }
}

export async function readFollowUpV2Bundle(crm: any, autocar: any, storeId: string, conversationId: string) {
  const conversation = await data(crm.from('whatsapp_conversations')
    .select('id,store_id,lead_id,base_lead_id,status,whatsapp_number_id,contact_id')
    .eq('id', conversationId).eq('store_id', storeId).maybeSingle());
  if (!conversation) throw new Error('follow_up_conversation_missing');
  const columns = currentAutocarExternalReferenceColumns();
  const queries = [
    crm.from('stores').select('id,name,status,portal_enabled').eq('id',storeId).maybeSingle(),
    crm.from('leads').select('id,customer_name,status,interested_vehicle,interested_vehicle_id,scheduled_at')
      .eq('id',conversation.lead_id).eq('assigned_store_id',storeId).maybeSingle(),
    crm.from('whatsapp_messages').select('id,direction,message_type,body,sent_at,created_at,raw_payload')
      .eq('conversation_id',conversationId).eq('store_id',storeId).order('created_at',{ascending:false}).limit(100),
    crm.from('appointments').select('id,appointment_date,appointment_time,status').eq('lead_id',conversation.lead_id).eq('store_id',storeId).order('appointment_date',{ascending:false}).limit(20),
    crm.from('sales').select('id').eq('lead_id',conversation.lead_id).eq('store_id',storeId).eq('status','confirmed').limit(1),
    autocar.from('ai_store_agents').select('status,master_enabled,master_autopilot_allowed,store_selected_mode').eq('store_id',storeId).maybeSingle(),
    autocar.from('ai_runtime_conversations').select('effective_mode,human_state,metadata').eq('store_id',storeId).eq('production_conversation_id',conversationId).maybeSingle(),
    autocar.from('ai_global_capability_policies').select('effect,version').eq('capability','create_follow_up').eq('is_active',true).order('version',{ascending:false}).limit(1).maybeSingle(),
    autocar.from('ai_store_policies').select('effect,version').eq('store_id',storeId).eq('policy_key','create_follow_up').eq('is_active',true).order('priority',{ascending:false}).order('version',{ascending:false}),
    autocar.from('ai_follow_up_events').select('id,due_at,source_type,source_snapshot,status,anchor_message_id')
      .eq('store_id',storeId).eq('production_conversation_id',conversationId).eq('trigger_type','callback_requested'),
    crm.from('lead_commercial_details').select('payment_type,financing_bank,financed_amount').eq('lead_id',conversation.lead_id).eq('store_id',storeId).maybeSingle(),
    autocar.from('ai_conversation_memory').select('rolling_summary,next_best_action,open_questions,active_objections')
      .eq('store_id',storeId).eq(columns.memory.conversationId,conversationId).maybeSingle(),
    crm.from('whatsapp_contacts').select('phone,wa_id').eq('id',conversation.contact_id).eq('store_id',storeId).maybeSingle(),
    crm.from('store_whatsapp_integrations').select('instance_name,status').eq('store_id',storeId).eq('crm_number_id',conversation.whatsapp_number_id).eq('scope','store').maybeSingle()
  ];
  const [store,lead,messages,appointments,sales,agent,runtime,policy,storePolicies,callbacks,commercial,memory,contact,integration] = await Promise.all(queries.map(data));
  const ordered = (messages || []).slice().sort((a: any,b: any) => Date.parse(a.sent_at || a.created_at)-Date.parse(b.sent_at || b.created_at));
  const inbound = ordered.filter((m: any) => m.direction==='inbound').at(-1);
  // Follow-up messages never restart their own sequence/cooldown anchor.
  const outbound = ordered.filter((m: any) => m.direction==='outbound' && !m.raw_payload?.autocar_follow_up_v2 && !m.raw_payload?.autocar_follow_up_autopilot).at(-1);
  const iso = (value: unknown) => value && Number.isFinite(Date.parse(String(value))) ? new Date(String(value)).toISOString() : null;
  const facts: FollowUpV2Facts = { storeId,conversationId,leadId:conversation.lead_id,leadStatus:lead?.status || '',
    inboundAt:iso(inbound?.sent_at || inbound?.created_at),outboundAt:iso(outbound?.sent_at || outbound?.created_at),outboundId:outbound?.id || null,
    scheduledAt:lead?.scheduled_at || null,vehicleInterest:Boolean(lead?.interested_vehicle || lead?.interested_vehicle_id),
    financingPending:Boolean(commercial?.financing_bank || commercial?.financed_amount || /financ/i.test(commercial?.payment_type || '')),
    appointments:(appointments || []).map((a: any) => ({id:a.id,status:a.status,at:iso(`${a.appointment_date}T${String(a.appointment_time || '').slice(0,8)}-03:00`) || ''})),
    callbacks:(callbacks || []).map((c: any) => ({id:c.id,at:iso(c.due_at) || '',
      explicitlyRequested:c.source_type==='callback_request' && c.source_snapshot?.customer_requested_callback===true && c.anchor_message_id===inbound?.id,
      active:!['cancelled','superseded'].includes(c.status)})) };
  return {store,lead,conversation,messages:ordered,agent,runtime,policy,storePolicies,sales,commercial,memory,contact,integration,facts};
}

export function createFollowUpV2DatabasePorts(input: {
  crm: any; autocar: any; dryRun: boolean;
  // Synthetic overrides are accepted only after proving DEV destinations and the synthetic store marker.
  syntheticConfig?: FollowUpConfigV2;
}): FollowUpV2Ports {
  assertClients(input.crm,input.autocar,input.dryRun);
  const owner = randomUUID();
  let latest: Awaited<ReturnType<typeof readFollowUpV2Bundle>> | null = null;
  return {
    now: () => new Date(),
    async snapshot(event) {
      assertFollowUpV2Environment(event.dryRun);
      const bundle = await readFollowUpV2Bundle(input.crm,input.autocar,event.storeId,event.conversationId);
      latest = bundle;
      if (input.syntheticConfig && (!input.dryRun || !String(bundle.store?.name).startsWith('AUTOCAR HOMOLOGACAO V2 '))) throw new Error('synthetic_scope_required');
      const config = input.syntheticConfig || (await readStoreFollowUpV2(input.autocar,event.storeId)).effective;
      const source = planFollowUpV2Sources(bundle.facts,config,event.dryRun).find(e => e.sourceId===event.sourceId && e.scenario===event.scenario && e.stepId===event.stepId);
      const safeCore = input.dryRun ? true : (await evaluateAutocarExternalExecutionGate()).allowed;
      const state: FollowUpV2Snapshot = {
        config, masterEnabled:bundle.agent?.master_enabled===true,masterAutopilotAllowed:bundle.agent?.master_autopilot_allowed===true,
        agentActive:bundle.agent?.status==='active',storeSelectedMode:bundle.agent?.store_selected_mode || '',effectiveMode:bundle.runtime?.effective_mode || '',humanState:bundle.runtime?.human_state || '',
        globalPolicy:bundle.policy?.effect || 'deny',storePolicy:bundle.storePolicies?.length && bundle.storePolicies.every((p: any)=>p.effect==='allow') ? 'allow':'deny',safeCore,
        conversationOpen:bundle.conversation.status==='open',leadEligible:Boolean(bundle.lead && bundle.store?.status==='active' && bundle.store?.portal_enabled===true
          && !['won','lost','sale_confirmed','sold','closed','cancelled'].includes(bundle.lead.status) && !looksLikeNonLeadAutomation(bundle.messages)),
        saleConfirmed:Boolean(bundle.sales?.length),optedOut:hasFollowUpOptOut(bundle.messages),latestInboundAt:bundle.facts.inboundAt,
        sourceValid:Boolean(source) && (event.scenario!=='visit_confirmation' || Date.parse(event.anchorAt)>Date.now()),
        sourceAnchorAt:source?.anchorAt || null,
        context:{store:bundle.store,lead:bundle.lead,commercial:bundle.commercial,messages:bundle.messages,memory:bundle.memory,
          appointment:bundle.facts.appointments.find(a=>a.id===event.sourceId) || null,scenario:event.scenario,now:new Date().toISOString()}
      };
      if (!input.dryRun && (bundle.integration?.status!=='connected' || !bundle.integration?.instance_name || !bundle.contact)) state.safeCore=false;
      return state;
    },
    async claim(event,snapshot) {
      return await data(input.autocar.rpc('claim_autocar_follow_up_v2',{p_id:event.id,p_owner:owner,p_limits:snapshot.config.global}));
    },
    async settle(lease,outcome) {
      return await data(input.autocar.rpc('transition_autocar_follow_up_v2',{p_id:lease.id,p_owner:lease.owner,p_token:lease.token,p_outcome:outcome}));
    },
    async audit(event,outcome) {
      await data(input.autocar.rpc('audit_autocar_follow_up_v2',{p_id:event.id,p_outcome:outcome}));
    },
    async generate(snapshot,event) {
      const context = snapshot.context as any;
      const generated = await generateContextualFollowUpReopening({store:{id:event.storeId,store_name:context.store.name},
        lead:context.lead,commercial:context.commercial,messages:context.messages,scenarioKey:event.scenario,inventorySupabase:input.crm,
        operationalContext:{memory:context.memory,appointment:context.appointment,now:context.now,next_best_action:context.memory?.next_best_action || null}});
      return {text:String(generated.plan.suggested_message || ''),model:String(generated.model || ''),valid:contextualAutopilotQuality(generated.plan).safe};
    },
    async arm(lease) {
      if (input.dryRun) return false;
      return await data(input.autocar.rpc('transition_autocar_follow_up_v2',{p_id:lease.id,p_owner:lease.owner,p_token:lease.token,
        p_outcome:{decision:'dispatching',reason:'provider_dispatch_armed',external_execution:null}}));
    },
    // There is no transport function at all in DEV/Preview.
    ...(input.dryRun ? {} : {send:async (event: FollowUpV2Event,text: string) => {
      assertFollowUpV2Environment(false);
      if (event.storeId!==FOLLOW_UP_V2_CANARY || !latest || latest.conversation.id!==event.conversationId) throw new Error('send_scope_denied');
      const bundle = latest;
      const recipient = String(bundle.contact?.phone || bundle.contact?.wa_id || '').split('@')[0].split(':')[0].replace(/\D/g,'');
      if (!recipient) throw new Error('recipient_missing');
      const result = await sendEvolutionText(bundle.integration.instance_name,recipient,text);
      const receipt = String(result?.key?.id || result?.message?.key?.id || result?.id || '').trim();
      if (!receipt) throw new Error('provider_receipt_missing');
      // The execution ledger records the provider receipt even if the CRM write fails.
      try {
        await data(input.crm.from('whatsapp_messages').insert({store_id:event.storeId,conversation_id:event.conversationId,
          whatsapp_number_id:bundle.conversation.whatsapp_number_id,contact_id:bundle.conversation.contact_id,
          lead_id:event.leadId,base_lead_id:bundle.conversation.base_lead_id,direction:'outbound',message_type:'text',body:text,status:'sent',
          wa_message_id:`evolution:${bundle.conversation.whatsapp_number_id}:${receipt}`,sent_at:new Date().toISOString(),
          raw_payload:{provider:'evolution',autocar_follow_up_v2:true,follow_up_execution_id:event.id}}));
      } catch { /* No retry of provider I/O; reconcile from the execution receipt. */ }
      return {providerMessageId:receipt};
    }})
  };
}

export async function runControlledA4FollowUpV2(input: {productionSupabase:any;now?:Date;maxSends?:number}) {
  // Explicit rollout gate defaults closed; this task never configures it in Production.
  if (process.env.AUTOCAR_FOLLOW_UP_V2_LIVE_A4_ENABLED!=='true') return {success:true,enabled:false,sent:0,results:[],reason:'v2_canary_not_authorized'};
  const environment = assertFollowUpV2Environment(false);
  const autocar = getAutocarRuntimeClient();
  const crm = input.productionSupabase;
  assertClients(crm,autocar,false);
  const config = (await readStoreFollowUpV2(autocar,FOLLOW_UP_V2_CANARY)).effective;
  const pending = await data(autocar.from('ai_follow_up_autopilot_executions').select('*').eq('store_id',FOLLOW_UP_V2_CANARY).eq('dry_run',false).in('status',['planned','claimed']).not('sequence_key','is',null).limit(60));
  const conversations = await data(crm.from('whatsapp_conversations').select('id').eq('store_id',FOLLOW_UP_V2_CANARY).eq('status','open').order('last_message_at',{ascending:true}).limit(60));
  const events = new Map<string,FollowUpV2Event>();
  for (const row of pending || []) events.set(row.id,{id:row.id,storeId:row.store_id,conversationId:row.production_conversation_id,leadId:row.production_lead_id,
    scenario:row.scenario_key,stepId:row.step_id,sourceId:row.source_id,sequenceKey:row.sequence_key,dueAt:row.due_at,anchorAt:row.anchor_at,
    inboundAt:row.trigger_last_customer_message_at,idempotencyKey:row.idempotency_key,dryRun:false});
  for (const conversation of conversations || []) {
    const bundle = await readFollowUpV2Bundle(crm,autocar,FOLLOW_UP_V2_CANARY,conversation.id);
    for (const event of planFollowUpV2Sources(bundle.facts,config,false)) {
      event.id=await data(autocar.rpc('plan_autocar_follow_up_v2',{p_event:event})); events.set(event.id,event);
    }
  }
  const results = [];
  let sent=0;
  for (const event of Array.from(events.values()).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt))) {
    if (sent>=Math.max(1,Math.min(input.maxSends || 3,3))) break;
    const result=await executeFollowUpV2(event,createFollowUpV2DatabasePorts({crm,autocar,dryRun:false}),environment);
    results.push({execution_id:event.id,decision:result.decision,reason:result.reason,external_execution:result.external_execution});
    if (result.external_execution===true) sent++;
    if (result.external_execution===null) break;
  }
  return {success:true,enabled:true,store_id:FOLLOW_UP_V2_CANARY,sent,results};
}
