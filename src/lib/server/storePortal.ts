import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const storePortalRoles = ['master', 'store', 'pre_sales', 'seller', 'prospector'] as const;
export type StorePortalRole = (typeof storePortalRoles)[number];

export type StorePortalPermission =
  | 'view_dashboard'
  | 'manage_store'
  | 'view_pipeline'
  | 'view_whatsapp'
  | 'view_calendar'
  | 'manage_stock'
  | 'manage_operation'
  | 'manage_team';

export type StorePortalMenuItem = {
  key: string;
  label: string;
  segment: string;
  href: string;
  permission: StorePortalPermission;
};

const roleLabels: Record<StorePortalRole, string> = {
  master: 'Master',
  store: 'Gestor da loja',
  pre_sales: 'SDR / Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospectador'
};

const rolePermissions: Record<StorePortalRole, StorePortalPermission[]> = {
  master: ['view_dashboard', 'manage_store', 'view_pipeline', 'view_whatsapp', 'view_calendar', 'manage_stock', 'manage_operation', 'manage_team'],
  store: ['view_dashboard', 'manage_store', 'view_pipeline', 'view_whatsapp', 'view_calendar', 'manage_stock', 'manage_operation', 'manage_team'],
  pre_sales: ['view_dashboard', 'view_pipeline', 'view_whatsapp', 'view_calendar'],
  seller: ['view_dashboard', 'view_pipeline', 'view_whatsapp', 'view_calendar'],
  prospector: ['view_dashboard', 'view_pipeline', 'view_whatsapp', 'view_calendar']
};

const menuCatalog: Array<Omit<StorePortalMenuItem, 'href'>> = [
  { key: 'dashboard', label: 'Dashboard', segment: '', permission: 'view_dashboard' },
  { key: 'store', label: 'Minha Loja', segment: 'minha-loja', permission: 'manage_store' },
  { key: 'pipeline', label: 'Pipeline', segment: 'pipeline', permission: 'view_pipeline' },
  { key: 'whatsapp', label: 'WhatsApp CRM', segment: 'whatsapp', permission: 'view_whatsapp' },
  { key: 'calendar', label: 'Calendário', segment: 'calendario', permission: 'view_calendar' },
  { key: 'stock', label: 'Estoque', segment: 'estoque', permission: 'manage_stock' },
  { key: 'operation', label: 'Operação', segment: 'operacao', permission: 'manage_operation' },
  { key: 'team', label: 'Equipe', segment: 'equipe', permission: 'manage_team' }
];

export function asStorePortalRole(value: unknown): StorePortalRole | null {
  const role = String(value || '') as StorePortalRole;
  return storePortalRoles.includes(role) ? role : null;
}

export function storePortalRoleLabel(role: StorePortalRole) {
  return roleLabels[role];
}

export function storePortalPermissions(role: StorePortalRole) {
  return [...rolePermissions[role]];
}

export function storePortalMenu(role: StorePortalRole, slug: string): StorePortalMenuItem[] {
  const permissions = new Set(rolePermissions[role]);
  return menuCatalog
    .filter((item) => permissions.has(item.permission))
    .map((item) => ({
      ...item,
      href: item.segment ? `/loja/${slug}/${item.segment}` : `/loja/${slug}`
    }));
}

export function storePortalScopeLabel(role: StorePortalRole) {
  if (role === 'master' || role === 'store') return 'Todos os leads vinculados à loja';
  if (role === 'pre_sales') return 'Leads atribuídos ao seu atendimento de pré-vendas';
  if (role === 'seller') return 'Leads atribuídos à sua carteira de vendedor';
  return 'Leads captados ou atribuídos a você';
}

export async function authorizeStorePortal(request: Request, expectedSlug: string) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;
  }

  const profile = await getProfileFromToken(supabase, token);
  const role = asStorePortalRole(profile?.role);

  if (!profile || profile.status !== 'active' || !role) {
    return { error: NextResponse.json({ error: 'Usuário sem perfil ativo para o Portal da Loja.' }, { status: 403 }) } as const;
  }

  if (role !== 'master' && !profile.store_id) {
    return { error: NextResponse.json({ error: 'Usuário sem loja vinculada.' }, { status: 403 }) } as const;
  }

  const slug = cleanText(expectedSlug, 120);
  if (!slug) {
    return { error: NextResponse.json({ error: 'Informe a loja do portal.' }, { status: 400 }) } as const;
  }

  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id, store_name, slug, event_id, status, portal_enabled, responsible_name, responsible_email, responsible_phone, website_url')
    .eq('slug', slug)
    .maybeSingle();

  if (storeError) throw storeError;
  if (!store || store.status !== 'active' || !store.portal_enabled) {
    return { error: NextResponse.json({ error: 'Portal da loja indisponível ou desativado.' }, { status: 404 }) } as const;
  }

  if (role !== 'master' && profile.store_id !== store.id) {
    return { error: NextResponse.json({ error: 'Este usuário não pertence a esta loja.' }, { status: 403 }) } as const;
  }

  const permissions = storePortalPermissions(role);
  const menu = storePortalMenu(role, store.slug);

  return {
    supabase,
    profile: { ...profile, role },
    role,
    store,
    permissions,
    menu,
    scopeLabel: storePortalScopeLabel(role)
  } as const;
}
