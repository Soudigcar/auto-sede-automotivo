import { NextResponse } from 'next/server';
import { readRawBody, safeEqual } from '@/lib/server/requestSecurity';
import { createAdminClient } from '@/lib/server/storeTeam';
import { getAutocarRuntimeClient } from '@/lib/server/autocar/runtimeEnvironment';
import { assertFollowUpV2Environment, createFollowUpV2DatabasePorts } from '@/lib/server/autocar/followUpV2Data';
import { executeFollowUpV2, type FollowUpV2Event } from '@/lib/server/autocar/followUpV2Execution';
import { validateFollowUpConfigV2 } from '@/lib/server/autocar/smartFollowUpV2';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;

function available() {
  return process.env.VERCEL_ENV==='preview' && process.env.VERCEL_GIT_COMMIT_REF==='fix/autocar-follow-up-v2-controlled'
    && process.env.AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_ENABLED==='true';
}

type BlockReason = 'environment_not_preview' | 'branch_not_allowed' | 'homologation_disabled'
  | 'origin_missing' | 'origin_mismatch' | 'secret_not_configured' | 'credential_rejected'
  | 'invalid_request' | 'synthetic_scope_required' | 'synthetic_configuration_required' | 'request_failed_closed';

function recordBlock(method: 'GET' | 'POST', reason: BlockReason, status: 400 | 403 | 500) {
  // Fixed diagnostic codes only: never log headers, URLs, body, credentials or exceptions.
  try {
    console.warn(JSON.stringify({event:'autocar_follow_up_v2_homologation_blocked',method,reason,status}));
  } catch { /* Observability must not change authentication or the HTTP response. */ }
}

function unavailable(method: 'GET' | 'POST') {
  recordBlock(method,process.env.VERCEL_ENV!=='preview' ? 'environment_not_preview'
    : process.env.VERCEL_GIT_COMMIT_REF!=='fix/autocar-follow-up-v2-controlled' ? 'branch_not_allowed'
    : 'homologation_disabled',403);
  return NextResponse.json({error:'Unavailable'},{status:403});
}

function rejectedCredential() {
  recordBlock('POST',process.env.AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SECRET ? 'credential_rejected' : 'secret_not_configured',403);
  return NextResponse.json({error:'Unavailable'},{status:403});
}

export async function GET() {
  if (!available()) return unavailable('GET');
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Homologação AUTOCAR V2</title>
    <h1>Homologação AUTOCAR V2 — DEV</h1><p>Dados sintéticos. Envio externo bloqueado.</p>
    <form method="post" autocomplete="off">
    <label>Autenticação temporária <input name="credential" type="password" required autocomplete="off"></label>
    <label>Fase <select name="phase"><option value="isolation">Isolamento</option><option value="execute">Executar evento sintético</option></select></label>
    <label>Evento sintético <input name="event_id" maxlength="36"></label>
    <label>Geração <select name="generation_mode"><option value="model">Modelo</option><option value="invalid">Inválida (fail-closed)</option></select></label>
    <button type="submit">Executar homologação</button></form></html>`,{headers:{
      'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
      'Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'
    }});
}

function authorized(credential: string) {
  const secret=process.env.AUTOCAR_FOLLOW_UP_V2_HOMOLOGATION_SECRET || '';
  return Boolean(secret && safeEqual(credential,secret));
}

export async function POST(request: Request) {
  if (!available()) return unavailable('POST');
  try {
    let body: Record<string, unknown>;
    if ((request.headers.get('content-type') || '').startsWith('application/x-www-form-urlencoded')) {
      if (request.headers.get('origin')!==new URL(request.url).origin) {
        recordBlock('POST',request.headers.get('origin')===null ? 'origin_missing' : 'origin_mismatch',403);
        return NextResponse.json({error:'Unavailable'},{status:403});
      }
      const form=new URLSearchParams(await readRawBody(request,8192));
      if (!authorized(form.get('credential') || '')) return rejectedCredential();
      body={phase:form.get('phase'),event_id:form.get('event_id'),generation_mode:form.get('generation_mode')};
    } else {
      if (!authorized((request.headers.get('authorization') || '').replace(/^Bearer\s+/i,''))) return rejectedCredential();
      body=JSON.parse(await readRawBody(request,8192));
    }
    const environment=assertFollowUpV2Environment(true);
    const crm=createAdminClient(); const autocar=getAutocarRuntimeClient();
    // Also proves the actual client destinations, not just the environment variable names.
    createFollowUpV2DatabasePorts({crm,autocar,dryRun:true});
    if (body.phase==='isolation') {
      const [a,b]=await Promise.all([crm.from('stores').select('id',{head:true,count:'exact'}),autocar.from('ai_follow_up_autopilot_executions').select('id',{head:true,count:'exact'})]);
      if (a.error || b.error) throw new Error('isolation_query_failed');
      return NextResponse.json({isolated:true,crm_ref:environment.crmRef,autocar_ref:environment.autocarRef,
        commit:process.env.VERCEL_GIT_COMMIT_SHA,dry_run:true,external_execution:false});
    }
    if (body.phase!=='execute' || !/^[0-9a-f-]{36}$/i.test(String(body.event_id || ''))) {
      recordBlock('POST','invalid_request',400);
      return NextResponse.json({error:'Invalid request'},{status:400});
    }
    const {data:row,error}=await autocar.from('ai_follow_up_autopilot_executions').select('*').eq('id',body.event_id).eq('dry_run',true).maybeSingle();
    if (error || !row || !String(row.metadata?.homologation || '').startsWith('AUTOCAR HOMOLOGACAO V2 ')) {
      recordBlock('POST','synthetic_scope_required',403);
      return NextResponse.json({error:'Synthetic scope required'},{status:403});
    }
    const config=row.metadata?.homologation_config;
    if (!config || !validateFollowUpConfigV2(config).ok) {
      recordBlock('POST','synthetic_configuration_required',400);
      return NextResponse.json({error:'Synthetic configuration required'},{status:400});
    }
    const event:FollowUpV2Event={id:row.id,storeId:row.store_id,conversationId:row.production_conversation_id,leadId:row.production_lead_id,
      scenario:row.scenario_key,stepId:row.step_id,sourceId:row.source_id,sequenceKey:row.sequence_key,dueAt:row.due_at,
      anchorAt:row.anchor_at,inboundAt:row.trigger_last_customer_message_at,idempotencyKey:row.idempotency_key,dryRun:true};
    const ports=createFollowUpV2DatabasePorts({crm,autocar,dryRun:true,syntheticConfig:config});
    if (body.generation_mode==='invalid') ports.generate=async()=>({text:'',model:'',valid:false});
    const result=await executeFollowUpV2(event,ports,environment);
    return NextResponse.json({event_id:row.id,dry_run:true,...result});
  } catch {
    recordBlock('POST','request_failed_closed',500);
    return NextResponse.json({error:'Homologation failed closed',external_execution:false},{status:500});
  }
}
