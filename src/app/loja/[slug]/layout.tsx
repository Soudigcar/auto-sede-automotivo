import type { ReactNode } from 'react';
import { StorePortalShell } from '@/components/StorePortalShell';
import { PipelineLeadWorkspace } from '@/components/PipelineLeadWorkspace';
import { FinancingSimulationWorkspaceBridge } from '@/components/FinancingSimulationWorkspaceBridge';
import { StoreWhatsappMobileConversationUX } from '@/components/StoreWhatsappMobileConversationUX';
import { StoreWhatsappRealtimeSync } from '@/components/StoreWhatsappRealtimeSync';

export default function StorePortalLayout({ children }: { children: ReactNode }) {
  return (
    <StorePortalShell>
      <StoreWhatsappRealtimeSync />
      <PipelineLeadWorkspace />
      <FinancingSimulationWorkspaceBridge />
      <StoreWhatsappMobileConversationUX />
      {children}
    </StorePortalShell>
  );
}
