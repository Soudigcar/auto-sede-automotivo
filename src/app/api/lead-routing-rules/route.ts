import { NextResponse } from 'next/server';
import { createAdminClient, getProfileFromToken, isStoreTeamRole, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

const validMatchTypes = new Set(['event','campaign','source','default']);
const validStrategies = new Set(['round_robin','fixed']);
const validStatuses = new Set(['active','paused','archived']);

function text(value: unknown, max = 160) { return String(value ?? '').replace(/\0/g,'').trim().slice(0,max); }
function uuid(value: unknown) { const v=text(value,80); return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : ''; }
function uuidList(value: unknown, max=500) { if(!Array.isArray(value)) return []; return Array.from(new Set(value.map(uuid).filter(Boolean))).slice(0,max); }
function roleList(value: unknown) { if(!Array.isArray(value)) return []; return Array.from(new Set(value.map((v)=>text(v,40)).filter(isStoreTeamRole))); }

async function auth(request: Request) {
  const supabase=createAdminClient();
  const profile=await getProfileFromToken(supabase,readBearerToken(request));
  if(!profile || profile.status!=='active') return { supabase, profile:null, storeId:'' };
  const url=new URL(request.url);
  const requested=uuid(url.searchParams.get('store_id'));
  if(profile.role==='master') return { supabase, profile, storeId:requested };
  if(profile.role==='store' && profile.store_id) return { supabase, profile, storeId:profile.store_id };
  return { supabase, profile:null, storeId:'' };
}

function migrationMissing(error: any) { return error?.code==='42P01' || /lead_routing_rules/i.test(error?.message||''); }

export async function GET(request: Request) {
  try {
    const {supabase,profile,storeId}=await auth(request);
    if(!profile) return NextResponse.json({error:'Acesso negado.'},{status:403});

    const storesPromise = profile.role==='master'
      ? supabase.from('stores').select('id,store_name,status').eq('status','active').order('store_name')
      : supabase.from('stores').select('id,store_name,status').eq('id',profile.store_id);

    if(!storeId) {
      const {data:stores,error}=await storesPromise;
      if(error) throw error;
      return NextResponse.json({scope:profile.role,stores:stores||[],rules:[],members:[],events:[],queue:[]});
    }

    if(profile.role!=='master' && storeId!==profile.store_id) return NextResponse.json({error:'Loja fora do seu escopo.'},{status:403});

    const [storesResult,rulesResult,membersResult,eventsResult,queueResult]=await Promise.all([
      storesPromise,
      supabase.from('lead_routing_rules').select('*').eq('store_id',storeId).order('priority').order('created_at'),
      supabase.from('users').select('id,full_name,role,store_id,status,receives_leads,routing_order,max_open_leads').eq('store_id',storeId).eq('status','active').in('role',['pre_sales','seller','prospector']).order('routing_order').order('full_name'),
      supabase.from('events').select('id,event_name,status,start_date,end_date').neq('status','deleted').order('start_date',{ascending:false,nullsFirst:false}),
      supabase.from('lead_unassigned_queue').select('lead_id,rule_id,reason,status,first_seen_at,last_seen_at').eq('store_id',storeId).eq('status','open').order('last_seen_at',{ascending:false}).limit(100)
    ]);
    const err=rulesResult.error||membersResult.error||eventsResult.error||queueResult.error||storesResult.error;
    if(err) {
      if(migrationMissing(err)) return NextResponse.json({error:'A migration do Motor de Roteamento ainda não foi instalada neste ambiente.',migration_required:true},{status:503});
      throw err;
    }
    return NextResponse.json({scope:profile.role,stores:storesResult.data||[],store_id:storeId,rules:rulesResult.data||[],members:membersResult.data||[],events:eventsResult.data||[],queue:queueResult.data||[]});
  } catch {
    return NextResponse.json({error:'Não foi possível carregar o roteamento de leads.'},{status:500});
  }
}

export async function POST(request: Request) {
  try {
    const {supabase,profile,storeId}=await auth(request);
    if(!profile || !storeId) return NextResponse.json({error:'Acesso negado.'},{status:403});
    if(profile.role!=='master' && storeId!==profile.store_id) return NextResponse.json({error:'Loja fora do seu escopo.'},{status:403});
    const body=await request.json().catch(()=>null);
    if(!body || typeof body!=='object') return NextResponse.json({error:'Dados inválidos.'},{status:400});

    const id=uuid(body.id)||undefined;
    const name=text(body.name,120);
    const matchType=text(body.match_type,20);
    const strategy=text(body.strategy,20);
    const status=text(body.status,20)||'active';
    const priority=Math.max(1,Math.min(Number(body.priority)||100,10000));
    const eventId=uuid(body.event_id)||null;
    const campaignId=uuid(body.campaign_id)||null;
    const campaignKey=text(body.campaign_key,240)||null;
    const sourceKey=text(body.source_key,120)||null;
    const fixedUserId=uuid(body.fixed_user_id)||null;
    const targetRoles=roleList(body.target_roles);
    const targetMemberIds=uuidList(body.target_member_ids);
    const excludedMemberIds=uuidList(body.excluded_member_ids);
    const startsAt=body.starts_at ? new Date(String(body.starts_at)).toISOString() : null;
    const endsAt=body.ends_at ? new Date(String(body.ends_at)).toISOString() : null;

    if(!name || !validMatchTypes.has(matchType) || !validStrategies.has(strategy) || !validStatuses.has(status)) return NextResponse.json({error:'Configuração inválida.'},{status:400});
    if(matchType==='event' && !eventId) return NextResponse.json({error:'Selecione o evento.'},{status:400});
    if(matchType==='campaign' && !campaignId && !campaignKey) return NextResponse.json({error:'Informe a campanha.'},{status:400});
    if(matchType==='source' && !sourceKey) return NextResponse.json({error:'Informe a origem.'},{status:400});
    if(strategy==='fixed' && !fixedUserId) return NextResponse.json({error:'Selecione o responsável fixo.'},{status:400});

    const allIds=Array.from(new Set([...targetMemberIds,...excludedMemberIds,...(fixedUserId?[fixedUserId]:[])]));
    if(allIds.length) {
      const {data:members,error}=await supabase.from('users').select('id,store_id,status,role').in('id',allIds);
      if(error) throw error;
      if((members||[]).length!==allIds.length || (members||[]).some((m:any)=>m.store_id!==storeId || m.status!=='active' || !isStoreTeamRole(m.role))) return NextResponse.json({error:'Há membros inválidos ou pertencentes a outra loja.'},{status:409});
    }

    const payload={store_id:storeId,name,status,priority,match_type:matchType,event_id:matchType==='event'?eventId:null,campaign_id:matchType==='campaign'?campaignId:null,campaign_key:matchType==='campaign'?campaignKey:null,source_key:matchType==='source'?sourceKey:null,strategy,target_roles:targetRoles,target_member_ids:targetMemberIds,excluded_member_ids:excludedMemberIds,fixed_user_id:strategy==='fixed'?fixedUserId:null,starts_at:startsAt,ends_at:endsAt,updated_by:profile.id};
    const result=id
      ? await supabase.from('lead_routing_rules').update(payload).eq('id',id).eq('store_id',storeId).select('*').single()
      : await supabase.from('lead_routing_rules').insert({...payload,created_by:profile.id}).select('*').single();
    if(result.error) {
      if(migrationMissing(result.error)) return NextResponse.json({error:'Migration ainda não instalada.',migration_required:true},{status:503});
      throw result.error;
    }
    return NextResponse.json({success:true,rule:result.data});
  } catch {
    return NextResponse.json({error:'Não foi possível salvar a regra.'},{status:500});
  }
}

export async function DELETE(request: Request) {
  try {
    const {supabase,profile,storeId}=await auth(request);
    if(!profile || !storeId) return NextResponse.json({error:'Acesso negado.'},{status:403});
    const id=uuid(new URL(request.url).searchParams.get('id'));
    if(!id) return NextResponse.json({error:'Regra inválida.'},{status:400});
    const {error}=await supabase.from('lead_routing_rules').update({status:'archived',updated_by:profile.id,updated_at:new Date().toISOString()}).eq('id',id).eq('store_id',storeId);
    if(error) {
      if(migrationMissing(error)) return NextResponse.json({error:'Migration ainda não instalada.',migration_required:true},{status:503});
      throw error;
    }
    return NextResponse.json({success:true});
  } catch {
    return NextResponse.json({error:'Não foi possível arquivar a regra.'},{status:500});
  }
}
