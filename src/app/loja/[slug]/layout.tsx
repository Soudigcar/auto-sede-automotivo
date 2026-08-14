import type { ReactNode } from 'react';
import { StorePortalShell } from '@/components/StorePortalShell';
import { PipelineLeadWorkspace } from '@/components/PipelineLeadWorkspace';
import { StoreWhatsappMobileConversationUX } from '@/components/StoreWhatsappMobileConversationUX';

export default function StorePortalLayout({ children }: { children: ReactNode }) {
  return <StorePortalShell><PipelineLeadWorkspace /><StoreWhatsappMobileConversationUX />{children}</StorePortalShell>;
}
