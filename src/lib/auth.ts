const storePortalRoles = ['store', 'pre_sales', 'seller', 'prospector'];

export function getRoleHomePath(role: string | null | undefined) {
  if (role === 'master') return '/master/dashboard/live';
  if (storePortalRoles.includes(role || '')) return '/store';
  return '/routes';
}

export function canAccessPath(role: string | null | undefined, pathname: string) {
  if (!role) return false;
  if (pathname === '/routes' || pathname === '/logout') return true;
  if (role === 'master') return true;
  if (storePortalRoles.includes(role)) {
    return pathname.startsWith('/store') || pathname.startsWith('/loja');
  }
  return false;
}
