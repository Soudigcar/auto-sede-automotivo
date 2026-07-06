export function getRoleHomePath(role: string | null | undefined) {
  if (role === 'master') return '/master/dashboard/live';
  if (role === 'prospector') return '/prospector/live';
  if (role === 'store') return '/store/operation';
  if (role === 'pre_sales') return '/pre-sales';
  return '/routes';
}

export function canAccessPath(role: string | null | undefined, pathname: string) {
  if (!role) return false;
  if (pathname === '/routes' || pathname === '/logout') return true;
  if (role === 'master') return true;
  if (role === 'prospector') return pathname.startsWith('/prospector');
  if (role === 'store') return pathname.startsWith('/store');
  if (role === 'pre_sales') return pathname.startsWith('/pre-sales');
  return false;
}
