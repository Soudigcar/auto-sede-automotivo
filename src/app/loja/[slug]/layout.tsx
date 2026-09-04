import type { ReactNode } from 'react';
import { StorePortalShell } from '@/components/StorePortalShell';
import { PipelineLeadWorkspace } from '@/components/PipelineLeadWorkspace';
import { StoreWhatsappMobileConversationUX } from '@/components/StoreWhatsappMobileConversationUX';
import { StoreWhatsappRealtimeSync } from '@/components/StoreWhatsappRealtimeSync';

export default function StorePortalLayout({ children }: { children: ReactNode }) {
  return <StorePortalShell><StoreWhatsappRealtimeSync /><PipelineLeadWorkspace /><StoreWhatsappMobileConversationUX />{children}</StorePortalShell>;
}
