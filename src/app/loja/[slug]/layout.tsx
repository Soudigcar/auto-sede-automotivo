import type { ReactNode } from 'react';
import { StorePortalShell } from '@/components/StorePortalShell';

export default function StorePortalLayout({ children }: { children: ReactNode }) {
  return <StorePortalShell>{children}</StorePortalShell>;
}
