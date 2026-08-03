import type { ReactNode } from 'react';
import { StorePortalShell } from '@/components/StorePortalShell';
import { PipelineLeadWorkspace } from '@/components/PipelineLeadWorkspace';

export default function StorePortalLayout({ children }: { children: ReactNode }) {
  return <StorePortalShell><PipelineLeadWorkspace />{children}</StorePortalShell>;
}
