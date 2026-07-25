export function getRoleHomePath(role: string | null | undefined) {
  if (role === 'master') return '/master/dashboard/live';
  if (['store', 'pre_sales', 'seller', 'prospector'].includes(String(role || ''))) return '/routes';
  return '/routes';
}

export function canAccessPath(role: string | null | undefined, pathname: string) {
  if (!role) return false;
  if (pathname === '/routes' || pathname === '/logout') return true;
  if (role === 'master') return true;
  if (['store', 'pre_sales', 'seller', 'prospector'].includes(role)) return pathname.startsWith('/loja');
  return false;
}
