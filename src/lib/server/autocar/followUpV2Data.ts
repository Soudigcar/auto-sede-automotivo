import { randomUUID } from 'node:crypto';
import { sendEvolutionText } from '@/lib/server/evolution';
import { readStoreFollowUpV2 } from './followUpV2ConfigStore';
import { autocarProjectRefFromUrl, resolveAutocarRuntimeTarget, getAutocarRuntimeClient, evaluateAutocarExternalExecutionGate, currentAutocarExternalReferenceColumns } from './runtimeEnvironment';
import { executeFollowUpV2, FOLLOW_UP_V2_CANARY, type FollowUpV2Event, type FollowUpV2Generated, type FollowUpV2Ports, type FollowUpV2Snapshot } from './followUpV2Execution';
import { planFollowUpV2Sources, type FollowUpV2Facts } from './followUpV2Sources';
import { generateContextualFollowUpReopening, looksLikeNonLeadAutomation } from './followUpV2ContextualReopening';
import { contextualAutopilotQuality, hasFollowUpOptOut } from './followUpV2Quality';
import type { FollowUpConfigV2 } from './smartFollowUpV2';

const claimReasonsAuditedByDatabase = new Set([
  'not_due','sequence_expired','daily_limit','lead_reserved','cooldown','sequence_limit'
]);

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
    crm.from('stores').select('id,store_name,status,portal_enabled').eq('id',storeId).maybeSingle(),
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
    crm.from('store_whatsapp_integrations').select('instance_name,status').eq('store_id',storeId).eq('crm_number_id',conversation.whatsapp_number_id).eq('scope','store').maybeSingle(),
    // Search the full conversation for possible opt-outs, independently of the bounded model history.
    crm.from('whatsapp_messages').select('direction,body').eq('store_id',storeId).eq('conversation_id',conversationId).eq('direction','inbound')
      .or('body.ilike.%não%,body.ilike.%nao%,body.ilike.%pare%,body.ilike.%stop%,body.ilike.%sair%,body.ilike.%remov%,body.ilike.%retir%,body.ilike.%descadastr%,body.ilike.%unsubscribe%').limit(100)
  ];
  const [store,lead,messages,appointments,sales,agent,runtime,policy,storePolicies,callbacks,commercial,memory,contact,integration,optOutMessages] = await Promise.all(queries.map(data));
  const ordered = (messages || []).slice().sort((a: any,b: any) => Date.parse(a.sent_at || a.created_at)-Date.parse(b.sent_at || b.created_at));
  const inbound = ordered.filter((m: any) => m.direction==='inbound').at(-1);
  // Follow-up messages never restart their own sequence/cooldown anchor.
  const outbound = ordered.filter((m: any) => m.direction==='outbound' && !m.raw_payload?.autocar_follow_up_v2 && !m.raw_payload?.autocar_follow_up_autopilot).at(-1);
  const iso = (value: unknown) => value && Number.isFinite(Date.parse(String(value))) ? new Date(String(value)).toISOString() : null;
  const facts: FollowUpV2Facts = { storeId,conversationId,leadId:conversation.lead_id,leadStatus:lead?.status || '',
    inboundAt:iso(inbound?.sent_at || inbound?.created_at),outboundAt:iso(outbound?.sent_at || outbound?.created_at),outboundId:outbound?.id || null,
    scheduledAt:iso(lead?.scheduled_at),vehicleInterest:Boolean(lead?.interested_vehicle || lead?.interested_vehicle_id),
    financingPending:Boolean(commercial?.financing_bank || commercial?.financed_amount || /financ/i.test(commercial?.payment_type || '')),
    appointments:(appointments || []).map((a: any) => ({id:a.id,status:a.status,at:iso(`${a.appointment_date}T${String(a.appointment_time || '').slice(0,8)}-03:00`) || ''})),
    callbacks:(callbacks || []).map((c: any) => ({id:c.id,at:iso(c.due_at) || '',
      explicitlyRequested:c.source_type==='callback_request' && c.source_snapshot?.customer_requested_callback===true && c.anchor_message_id===inbound?.id,
      active:!['cancelled','superseded'].includes(c.status)})) };
  return {store,lead,conversation,messages:ordered,agent,runtime,policy,storePolicies,sales,commercial,memory,contact,integration,facts,
    optedOut:optOutMessages?.length>=100 || hasFollowUpOptOut(optOutMessages || [])};
}

export function createFollowUpV2DatabasePorts(input: {
  crm: any; autocar: any; dryRun: boolean;
  // Synthetic overrides are accepted only after proving DEV destinations and the synthetic store marker.
  syntheticConfig?: FollowUpConfigV2;
}): FollowUpV2Ports {
  assertClients(input.crm,input.autocar,input.dryRun);
  const owner = randomUUID();
  let latest: Awaited<ReturnType<typeof readFollowUpV2Bundle>> | null = null;
  let latestEvent: FollowUpV2Event | null = null;
  let latestSnapshot: FollowUpV2Snapshot | null = null;
  let liveClaimId: string | null = null;
  let liveOutboundMessageId: string | null = null;
  let liveGeneratedModel: string | null = null;
  return {
    now: () => new Date(),
    async snapshot(event) {
      assertFollowUpV2Environment(event.dryRun);
      const bundle = await readFollowUpV2Bundle(input.crm,input.autocar,event.storeId,event.conversationId);
      latest = bundle;
      latestEvent = event;
      if (input.syntheticConfig && (!input.dryRun || !String(bundle.store?.store_name).startsWith('AUTOCAR HOMOLOGACAO V2 '))) throw new Error('synthetic_scope_required');
      const config = input.syntheticConfig || (await readStoreFollowUpV2(input.autocar,event.storeId)).effective;
      const source = planFollowUpV2Sources(bundle.facts,config,event.dryRun).find(e => e.sourceId===event.sourceId && e.scenario===event.scenario && e.stepId===event.stepId);
      const safeCore = input.dryRun ? true : (await evaluateAutocarExternalExecutionGate()).allowed;
      const operationalAppointment = bundle.facts.appointments.find(a=>a.id===event.sourceId) ||
        (['visit_confirmation','no_show','post_visit'].includes(event.scenario)
          ? {id:event.sourceId,at:event.anchorAt,status:bundle.lead?.status || '',source:'lead.scheduled_at'} : null);
      const state: FollowUpV2Snapshot = {
        config, masterEnabled:bundle.agent?.master_enabled===true,masterAutopilotAllowed:bundle.agent?.master_autopilot_allowed===true,
        agentActive:bundle.agent?.status==='active',storeSelectedMode:bundle.agent?.store_selected_mode || '',effectiveMode:bundle.runtime?.effective_mode || '',humanState:bundle.runtime?.human_state || '',
        globalPolicy:bundle.policy?.effect || 'deny',storePolicy:bundle.storePolicies?.length && bundle.storePolicies.every((p: any)=>p.effect==='allow') ? 'allow':'deny',safeCore,
        conversationOpen:bundle.conversation.status==='open',leadEligible:Boolean(bundle.lead && bundle.store?.status==='active' && bundle.store?.portal_enabled===true
          && !['won','lost','sale_confirmed','sold','closed','cancelled'].includes(bundle.lead.status) && !looksLikeNonLeadAutomation(bundle.messages)),
        saleConfirmed:Boolean(bundle.sales?.length),optedOut:bundle.optedOut || hasFollowUpOptOut(bundle.messages),latestInboundAt:bundle.facts.inboundAt,
        sourceValid:Boolean(source) && (event.scenario!=='visit_confirmation' || Date.parse(event.anchorAt)>Date.now()),
        sourceAnchorAt:source?.anchorAt || null,
        context:{store:bundle.store,lead:bundle.lead,commercial:bundle.commercial,messages:bundle.messages,memory:bundle.memory,
          appointment:operationalAppointment,scenario:event.scenario,now:new Date().toISOString()}
      };
      if (!input.dryRun && (bundle.integration?.status!=='connected' || !bundle.integration?.instance_name || !bundle.contact)) state.safeCore=false;
      latestSnapshot = state;
      return state;
    },
    async claim(event,snapshot) {
      const claimed=await data(input.autocar.rpc('claim_autocar_follow_up_v2',{p_id:event.id,p_owner:owner,p_limits:snapshot.config.global}));
      const reason=String(claimed?.reason || '');
      return {...(claimed || {}),audited:claimReasonsAuditedByDatabase.has(reason)};
    },
    async settle(lease,outcome) {
      const settled=await data(input.autocar.rpc('transition_autocar_follow_up_v2',{p_id:lease.id,p_owner:lease.owner,p_token:lease.token,p_outcome:outcome}));
      if (settled && outcome.decision==='sent' && outcome.production_outbound_message_id) {
        await data(input.autocar.from('ai_follow_up_autopilot_executions').update({production_outbound_message_id:outcome.production_outbound_message_id})
          .eq('id',lease.id).eq('status','sent'));
      }
      if (settled && liveClaimId) {
        const claimPatch:any={status:outcome.decision==='sent'?'completed':'failed',
          result:{follow_up_autopilot:true,follow_up_execution_id:lease.id,external_execution:outcome.external_execution,
            provider_message_id:outcome.provider_message_id || null,production_outbound_message_id:outcome.production_outbound_message_id || null,
            sent_text:outcome.external_execution===true?outcome.proposed_text:null,decision:outcome.decision,reason:outcome.reason},
          completed_at:new Date().toISOString(),updated_at:new Date().toISOString()};
        if (outcome.production_outbound_message_id) claimPatch.production_message_id=outcome.production_outbound_message_id;
        await data(input.autocar.from('ai_runtime_message_claims').update(claimPatch).eq('id',liveClaimId).eq('purpose','live_text_send'));
      }
      return settled;
    },
    async audit(event,outcome) {
      await data(input.autocar.rpc('audit_autocar_follow_up_v2',{p_id:event.id,p_outcome:outcome}));
    },
    async generate(snapshot,event) {
      const context = snapshot.context as any;
      const generated = await generateContextualFollowUpReopening({store:{id:event.storeId,store_name:context.store.store_name},
        lead:context.lead,commercial:context.commercial,messages:context.messages,scenarioKey:event.scenario,inventorySupabase:input.crm,
        operationalContext:{memory:context.memory,appointment:context.appointment,now:context.now,next_best_action:context.memory?.next_best_action || null}});
      const quality=contextualAutopilotQuality(generated.plan);
      return {text:String(generated.plan.suggested_message || ''),model:String(generated.model || ''),valid:quality.safe,
        qualityReason:quality.reason,qualityScore:quality.score,usage:generated.usage || {}};
    },
    async arm(lease,generated) {
      if (input.dryRun || !latest || !latestEvent || latestEvent.id!==lease.id || latestEvent.storeId!==FOLLOW_UP_V2_CANARY || !latest.facts.outboundId) return false;
      // Reserve the future CRM outbound UUID per execution; source_id keeps the original CRM anchor separately.
      liveOutboundMessageId=randomUUID();
      liveGeneratedModel=generated.model;
      const armed=await data(input.autocar.rpc('arm_autocar_follow_up_v2',{
        p_id:lease.id,p_owner:lease.owner,p_token:lease.token,p_message_id:liveOutboundMessageId,
        p_text:generated.text,p_model:generated.model
      }));
      liveClaimId=armed?.runtime_claim_id || null;
      if (!liveClaimId) liveOutboundMessageId=null;
      return Boolean(liveClaimId);
    },
    // There is no transport or fallback persistence function at all in DEV/Preview.
    ...(input.dryRun ? {} : {
      fallback:async (event: FollowUpV2Event,snapshot: FollowUpV2Snapshot,generated: FollowUpV2Generated) => {
        assertFollowUpV2Environment(false);
        if (event.storeId!==FOLLOW_UP_V2_CANARY || !latest || !latestEvent || latestEvent.id!==event.id || latest.conversation.id!==event.conversationId) return false;
        const text=String(generated.text || '').trim();
        if (!text || !generated.model?.trim()) return false;
        const idempotencyKey=`autopilot-fallback:${event.idempotencyKey}`;
        await data(input.autocar.from('ai_follow_up_copilot_suggestions').upsert({
          store_id:event.storeId,production_conversation_id:event.conversationId,production_lead_id:event.leadId,
          scenario_key:event.scenario,step_id:event.stepId,due_at:event.dueAt,
          context_last_message_at:latest.facts.outboundAt || event.inboundAt,suggested_message:text.slice(0,4000),status:'pending',
          idempotency_key:idempotencyKey,model:generated.model,usage:generated.usage || {},
          metadata:{contextual_reopening:true,autopilot_fallback:true,execution_id:event.id,
            quality_score:generated.qualityScore ?? null,quality_reason:generated.qualityReason || 'quality_gate'},updated_at:new Date().toISOString()
        },{onConflict:'idempotency_key'}));
        return snapshot.humanState==='autocar_active';
      },
      send:async (event: FollowUpV2Event,text: string) => {
        assertFollowUpV2Environment(false);
        if (event.storeId!==FOLLOW_UP_V2_CANARY || !latest || latest.conversation.id!==event.conversationId || !liveClaimId || !liveOutboundMessageId) throw new Error('send_scope_denied');
        const bundle = latest;
        const outboundMessageId=liveOutboundMessageId;
        const recipient = String(bundle.contact?.phone || bundle.contact?.wa_id || '').split('@')[0].split(':')[0].replace(/\D/g,'');
        if (!recipient) throw new Error('recipient_missing');
        const result = await sendEvolutionText(bundle.integration.instance_name,recipient,text);
        const receipt = String(result?.key?.id || result?.message?.key?.id || result?.id || '').trim();
        if (!receipt) throw new Error('provider_receipt_missing');
        const sentAt=new Date().toISOString();
        const scopedId=`evolution:${bundle.conversation.whatsapp_number_id}:${receipt}`;
        let productionOutboundMessageId:string|undefined;
        try {
          const saved=await data(input.crm.from('whatsapp_messages').insert({id:outboundMessageId,store_id:event.storeId,conversation_id:event.conversationId,
            whatsapp_number_id:bundle.conversation.whatsapp_number_id,contact_id:bundle.conversation.contact_id,
            lead_id:event.leadId,base_lead_id:bundle.conversation.base_lead_id,direction:'outbound',message_type:'text',body:text,status:'sent',
            wa_message_id:scopedId,sent_at:sentAt,
            raw_payload:{provider:'evolution',autocar_follow_up_v2:true,autocar_follow_up_autopilot:true,follow_up_execution_id:event.id,live_claim_id:liveClaimId}})
            .select('id').single());
          productionOutboundMessageId=String(saved?.id || outboundMessageId);
          await data(input.crm.from('whatsapp_conversations').update({last_message:text,last_message_at:sentAt,updated_at:sentAt})
            .eq('id',event.conversationId).eq('store_id',event.storeId));
        } catch {
          // The webhook may have persisted the provider receipt first; reconcile without retrying provider I/O.
          try {
            const existing=await data(input.crm.from('whatsapp_messages').select('id').eq('whatsapp_number_id',bundle.conversation.whatsapp_number_id)
              .in('wa_message_id',[receipt,scopedId]).limit(1).maybeSingle());
            if (existing?.id) productionOutboundMessageId=String(existing.id);
          } catch { /* provider receipt remains authoritative in the execution ledger */ }
        }
        const scenario=latestSnapshot?.config.scenarios.find(row=>row.key===event.scenario);
        try {
          await data(input.autocar.from('ai_follow_up_performance_events').insert({
            store_id:event.storeId,scenario_key:event.scenario,production_conversation_id:event.conversationId,production_lead_id:event.leadId,
            event_type:'sent',attribution_window_minutes:scenario?.attributionWindowMinutes || 1440,source_occurred_at:sentAt,
            attributed_to_follow_up:true,metadata:{autopilot:true,canary:true,execution_id:event.id,model:liveGeneratedModel,
              production_outbound_message_id:productionOutboundMessageId || null}
          }));
        } catch { /* observability must not turn a confirmed provider receipt into an unknown delivery */ }
        return {providerMessageId:receipt,productionOutboundMessageId};
      }
    })
  };
}

export async function runControlledA4FollowUpV2(input: {productionSupabase:any;now?:Date;maxSends?:number}) {
  // Explicit rollout gate defaults closed; this task never configures it in Production.
  if (process.env.AUTOCAR_FOLLOW_UP_V2_LIVE_A4_ENABLED!=='true') return {success:true,enabled:false,sent:0,results:[],reason:'v2_canary_not_authorized'};
  const environment = assertFollowUpV2Environment(false);
  const autocar = getAutocarRuntimeClient();
  const crm = input.productionSupabase;
  assertClients(crm,autocar,false);
  const runNow=input.now || new Date();
  const config = (await readStoreFollowUpV2(autocar,FOLLOW_UP_V2_CANARY)).effective;
  const pending = await data(autocar.from('ai_follow_up_autopilot_executions').select('*').eq('store_id',FOLLOW_UP_V2_CANARY).eq('dry_run',false)
    .in('status',['planned','claimed']).not('sequence_key','is',null).lte('due_at',runNow.toISOString()).limit(60));
  const conversations = await data(crm.from('whatsapp_conversations').select('id').eq('store_id',FOLLOW_UP_V2_CANARY).eq('status','open').order('last_message_at',{ascending:true}).limit(60));
  const events = new Map<string,FollowUpV2Event>();
  for (const row of pending || []) events.set(row.id,{id:row.id,storeId:row.store_id,conversationId:row.production_conversation_id,leadId:row.production_lead_id,
    scenario:row.scenario_key,stepId:row.step_id,sourceId:row.source_id,sequenceKey:row.sequence_key,dueAt:row.due_at,anchorAt:row.anchor_at,
    inboundAt:row.trigger_last_customer_message_at,idempotencyKey:row.idempotency_key,dryRun:false});

  const plannedDue = new Map<string,FollowUpV2Event>();
  for (const conversation of conversations || []) {
    const bundle = await readFollowUpV2Bundle(crm,autocar,FOLLOW_UP_V2_CANARY,conversation.id);
    for (const event of planFollowUpV2Sources(bundle.facts,config,false)) {
      event.id=await data(autocar.rpc('plan_autocar_follow_up_v2',{p_event:event}));
      if (Number.isFinite(Date.parse(event.dueAt)) && Date.parse(event.dueAt)<=runNow.getTime()) plannedDue.set(event.id,event);
    }
  }
  if (plannedDue.size) {
    const runnable=await data(autocar.from('ai_follow_up_autopilot_executions').select('id,status').in('id',Array.from(plannedDue.keys())).in('status',['planned','claimed']));
    const runnableIds=new Set((runnable || []).map((row:any)=>String(row.id)));
    for (const [id,event] of plannedDue) if (runnableIds.has(id)) events.set(id,event);
  }

  const results = [];
  let sent=0;
  const runnableEvents=Array.from(events.values())
    .filter(event=>Number.isFinite(Date.parse(event.dueAt)) && Date.parse(event.dueAt)<=runNow.getTime())
    .sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));
  for (const event of runnableEvents) {
    if (sent>=Math.max(1,Math.min(input.maxSends || 3,3))) break;
    const result=await executeFollowUpV2(event,createFollowUpV2DatabasePorts({crm,autocar,dryRun:false}),environment);
    results.push({execution_id:event.id,decision:result.decision,reason:result.reason,external_execution:result.external_execution});
    if (result.external_execution===true) sent++;
    if (result.external_execution===null) break;
  }
  return {success:true,enabled:true,store_id:FOLLOW_UP_V2_CANARY,sent,results};
}
