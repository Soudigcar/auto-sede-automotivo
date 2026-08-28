import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';
import { resolveStoreBillingAccess, type BillingAccessDecision } from '@/lib/server/billing/access';

export const storePortalRoles = ['master', 'store', 'pre_sales', 'seller', 'prospector'] as const;
export type StorePortalRole = (typeof storePortalRoles)[number];

export type StorePortalPermission =
  | 'view_dashboard'
  | 'manage_store'
  | 'view_pipeline'
  | 'view_whatsapp'
  | 'manage_integrations'
  | 'view_calendar'
  | 'view_stock'
  | 'manage_stock'
  | 'submit_stock_import'
  | 'manage_operation'
  | 'manage_team'
  | 'manage_lead_routing'
  | 'view_billing'
  | 'view_autocar'
  | 'manage_autocar'
  | 'approve_autocar_actions';

export type StorePortalMenuItem = { key:string; label:string; segment:string; href:string; permission:StorePortalPermission };

const roleLabels: Record<StorePortalRole, string> = {
  master: 'Master', store: 'Gestor da loja', pre_sales: 'SDR / Pré-vendas', seller: 'Vendedor', prospector: 'Prospectador'
};

const rolePermissions: Record<StorePortalRole, StorePortalPermission[]> = {
  master: ['view_dashboard','manage_store','view_pipeline','view_whatsapp','manage_integrations','view_calendar','manage_stock','submit_stock_import','manage_operation','manage_team','manage_lead_routing','view_billing','view_autocar','manage_autocar','approve_autocar_actions'],
  store: ['view_dashboard','manage_store','view_pipeline','view_whatsapp','manage_integrations','view_calendar','manage_stock','submit_stock_import','manage_operation','manage_team','manage_lead_routing','view_billing','view_autocar','manage_autocar','approve_autocar_actions'],
  pre_sales: ['view_dashboard','view_pipeline','view_whatsapp','view_calendar','view_stock','view_autocar'],
  seller: ['view_dashboard','view_pipeline','view_whatsapp','view_calendar','view_stock','view_autocar'],
  prospector: ['view_dashboard','view_pipeline','view_whatsapp','view_calendar','view_stock','view_autocar']
};

const menuCatalog: Array<Omit<StorePortalMenuItem,'href'>> = [
  { key:'dashboard', label:'Dashboard', segment:'', permission:'view_dashboard' },
  { key:'store', label:'Minha Loja', segment:'minha-loja', permission:'manage_store' },
  { key:'pipeline', label:'Pipeline', segment:'pipeline', permission:'view_pipeline' },
  { key:'routing', label:'Roteamento de Leads', segment:'roteamento-leads', permission:'manage_lead_routing' },
  { key:'whatsapp', label:'WhatsApp CRM', segment:'whatsapp', permission:'view_whatsapp' },
  { key:'autocar', label:'I.A AUTOCAR', segment:'autocar', permission:'view_autocar' },
  { key:'integrations', label:'Integrações', segment:'integracoes', permission:'manage_integrations' },
  { key:'calendar', label:'Calendário', segment:'calendario', permission:'view_calendar' },
  { key:'stock-import', label:'Importar OLX', segment:'importar-veiculo', permission:'submit_stock_import' },
  { key:'stock', label:'Estoque', segment:'estoque-consulta', permission:'view_stock' },
  { key:'stock', label:'Estoque', segment:'estoque', permission:'manage_stock' },
  { key:'operation', label:'Operação', segment:'operacao', permission:'manage_operation' },
  { key:'team', label:'Equipe', segment:'equipe', permission:'manage_team' },
  { key:'billing', label:'Plano & Assinatura', segment:'assinatura', permission:'view_billing' }
];

export function asStorePortalRole(value: unknown): StorePortalRole | null { const role=String(value||'') as StorePortalRole; return storePortalRoles.includes(role)?role:null; }
export function storePortalRoleLabel(role: StorePortalRole) { return roleLabels[role]; }
export function storePortalPermissions(role: StorePortalRole) { return [...rolePermissions[role]]; }
export function storePortalMenu(role: StorePortalRole, slug: string): StorePortalMenuItem[] { const permissions=new Set(rolePermissions[role]); return menuCatalog.filter((item)=>permissions.has(item.permission)).map((item)=>({...item,href:item.segment?`/loja/${slug}/${item.segment}`:`/loja/${slug}`})); }
export function storePortalScopeLabel(role: StorePortalRole) { if(role==='master'||role==='store') return 'Todos os leads vinculados à loja'; return 'Leads sob sua responsabilidade atual'; }
export function storeVisibleLeadOrigin(value: unknown) { const origin=cleanText(value,180); return origin==='master_transfer'?'Transferência Master':origin; }

export function canAccessStoreLead(profile:any,role:StorePortalRole,lead:any){ if(role==='master') return true; if(!profile?.store_id||profile.store_id!==lead?.assigned_store_id) return false; if(role==='store') return true; return Boolean(profile?.id&&lead?.assigned_user_id===profile.id); }

export function canAccessStoreConversation(profile:any,role:StorePortalRole,conversation:any,lead:any){ if(!profile||!conversation)return false; if(role==='master')return true; if(!profile.store_id||profile.store_id!==conversation.store_id)return false; if(role==='store')return true; if(!lead||conversation.lead_id!==lead.id)return false; return canAccessStoreLead(profile,role,lead); }

export function isOperationalStorePortal(store:any){ return Boolean(store&&store.status==='active'&&store.portal_enabled===true); }
export function isOperationalStoreSaas(store:any){ return Boolean(store&&store.status==='active'); }

export type StoreEntitlementAuthorization =
  | { error: NextResponse }
  | { role: StorePortalRole; store: any; billing: BillingAccessDecision };

export async function authorizeStoreEntitlement(supabase:any,input:{
  role:unknown;
  storeId:unknown;
  profileStoreId?:unknown;
  store?:any;
  allowMasterWhenStoreUnavailable?:boolean;
}): Promise<StoreEntitlementAuthorization>{
  const role=asStorePortalRole(input.role);
  const storeId=cleanText(input.storeId,80);
  if(!role||!storeId) return {error:NextResponse.json({error:'Loja do sistema inválida.'},{status:403})} as const;
  if(role!=='master'&&cleanText(input.profileStoreId,80)!==storeId){
    return {error:NextResponse.json({error:'Este usuário não pertence a esta loja.'},{status:403})} as const;
  }
  let store=input.store&&cleanText(input.store.id,80)===storeId?input.store:null;
  if(!store){
    const {data,error}=await supabase.from('stores').select('id,store_name,slug,status,portal_enabled').eq('id',storeId).maybeSingle();
    if(error)throw error;
    store=data;
  }
  if(!store) return {error:NextResponse.json({error:'Loja não encontrada.'},{status:404})} as const;
  const operationalStore=isOperationalStoreSaas(store);
  if(!operationalStore&&!(role==='master'&&input.allowMasterWhenStoreUnavailable)){
    return {error:NextResponse.json({error:'Acesso da loja ao sistema indisponível.'},{status:404})} as const;
  }
  const billing=await resolveStoreBillingAccess(supabase,{role,storeId,operationalStore});
  if(!billing.allowed){
    return {error:NextResponse.json({error:'O acesso ao sistema requer uma assinatura válida.',code:billing.reason},{status:402})} as const;
  }
  return {role,store,billing} as const;
}

export async function canUseStoreWhatsapp(supabase:any,profile:any,storeId:unknown){
  const role=asStorePortalRole(profile?.role);
  if(!role)return false;
  const scopedStoreId=cleanText(storeId,80);
  if(role==='master'&&!scopedStoreId)return true;
  const entitlement=await authorizeStoreEntitlement(supabase,{
    role,
    storeId:scopedStoreId,
    profileStoreId:profile?.store_id,
    allowMasterWhenStoreUnavailable:true
  });
  return !('error' in entitlement)&&entitlement.billing.allowed;
}

export function applyStoreLeadScope(query:any,profile:any,role:StorePortalRole){ if(role==='master'||role==='store')return query; const userId=cleanText(profile?.id,80); if(!userId)return query.eq('id','__unauthorized__'); return query.eq('assigned_user_id',userId); }

async function authorizeStorePortalAccess(request:Request,expectedSlug:string,allowMasterWhenStoreUnavailable:boolean){
  const supabase:any=createAdminClient();
  const token=readBearerToken(request);
  if(!token) return {error:NextResponse.json({error:'Sessão não encontrada.'},{status:401})} as const;
  const profile=await getProfileFromToken(supabase,token);
  const role=asStorePortalRole(profile?.role);
  if(!profile||profile.status!=='active'||!role) return {error:NextResponse.json({error:'Usuário sem perfil ativo para o Portal da Loja.'},{status:403})} as const;
  if(role!=='master'&&!profile.store_id) return {error:NextResponse.json({error:'Usuário sem loja vinculada.'},{status:403})} as const;
  const slug=cleanText(expectedSlug,120);
  if(!slug) return {error:NextResponse.json({error:'Informe a loja do portal.'},{status:400})} as const;
  const {data:store,error:storeError}=await supabase.from('stores').select('id, store_name, slug, event_id, status, portal_enabled, responsible_name, responsible_email, responsible_phone, website_url').eq('slug',slug).maybeSingle();
  if(storeError) throw storeError;
  if(!store) return {error:NextResponse.json({error:'Loja não encontrada.'},{status:404})} as const;
  const entitlement=await authorizeStoreEntitlement(supabase,{
    role,
    storeId:store.id,
    profileStoreId:profile.store_id,
    store,
    allowMasterWhenStoreUnavailable
  });
  if('error' in entitlement)return entitlement;
  const billing=entitlement.billing;
  const permissions=storePortalPermissions(role);
  const menu=storePortalMenu(role,store.slug);
  return {supabase,profile:{...profile,role},role,store,billing,permissions,menu,scopeLabel:storePortalScopeLabel(role)} as const;
}

export function authorizeStorePortal(request:Request,expectedSlug:string){ return authorizeStorePortalAccess(request,expectedSlug,false); }
export function authorizeStoreWhatsappPortal(request:Request,expectedSlug:string){ return authorizeStorePortalAccess(request,expectedSlug,true); }
