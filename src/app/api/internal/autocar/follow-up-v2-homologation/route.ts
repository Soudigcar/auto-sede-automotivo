import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/server/requestSecurity';
import { createAdminClient } from '@/lib/server/storeTeam';
import { getAutocarRuntimeClient } from '@/lib/server/autocar/runtimeEnvironment';
import { assertFollowUpV2Environment, createFollowUpV2DatabasePorts } from '@/lib/server/autocar/followUpV2Data';
import { executeFollowUpV2, type FollowUpV2Event } from '@/lib/server/autocar/followUpV2Execution';
import { validateFollowUpConfigV2 } from '@/lib/server/autocar/smartFollowUpV2';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;

function authorized(request: Request) {
  if (process.env.VERCEL_ENV!=='preview' || process.env.VERCEL_GIT_COMMIT_REF!=='fix/autocar-follow-up-v2-controlled'
    || process.env.AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_ENABLED!=='true') return false;
  const secret=process.env.AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SECRET || '';
  return Boolean(secret && safeEqual((request.headers.get('authorization') || '').replace(/^Bearer\s+/i,''),secret));
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({error:'Unavailable'},{status:403});
  try {
    const environment=assertFollowUpV2Environment(true);
    const crm=createAdminClient(); const autocar=getAutocarRuntimeClient();
    // Also proves the actual client destinations, not just the environment variable names.
    createFollowUpV2DatabasePorts({crm,autocar,dryRun:true});
    const body=await request.json();
    if (body.phase==='isolation') {
      const [a,b]=await Promise.all([crm.from('stores').select('id',{head:true,count:'exact'}),autocar.from('ai_follow_up_autopilot_executions').select('id',{head:true,count:'exact'})]);
      if (a.error || b.error) throw new Error('isolation_query_failed');
      return NextResponse.json({isolated:true,crm_ref:environment.crmRef,autocar_ref:environment.autocarRef,
        commit:process.env.VERCEL_GIT_COMMIT_SHA,dry_run:true,external_execution:false});
    }
    if (body.phase!=='execute' || !/^[0-9a-f-]{36}$/i.test(String(body.event_id || ''))) return NextResponse.json({error:'Invalid request'},{status:400});
    const {data:row,error}=await autocar.from('ai_follow_up_autopilot_executions').select('*').eq('id',body.event_id).eq('dry_run',true).maybeSingle();
    if (error || !row || !String(row.metadata?.homologation || '').startsWith('AUTOCAR HOMOLOGACAO V2 ')) return NextResponse.json({error:'Synthetic scope required'},{status:403});
    const config=row.metadata?.homologation_config;
    if (!config || !validateFollowUpConfigV2(config).ok) return NextResponse.json({error:'Synthetic configuration required'},{status:400});
    const event:FollowUpV2Event={id:row.id,storeId:row.store_id,conversationId:row.production_conversation_id,leadId:row.production_lead_id,
      scenario:row.scenario_key,stepId:row.step_id,sourceId:row.source_id,sequenceKey:row.sequence_key,dueAt:row.due_at,
      anchorAt:row.anchor_at,inboundAt:row.trigger_last_customer_message_at,idempotencyKey:row.idempotency_key,dryRun:true};
    const ports=createFollowUpV2DatabasePorts({crm,autocar,dryRun:true,syntheticConfig:config});
    if (body.generation_mode==='invalid') ports.generate=async()=>({text:'',model:'',valid:false});
    const result=await executeFollowUpV2(event,ports,environment);
    return NextResponse.json({event_id:row.id,dry_run:true,...result});
  } catch {
    return NextResponse.json({error:'Homologation failed closed',external_execution:false},{status:500});
  }
}
