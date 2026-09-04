import type { ReactNode } from 'react';
import { StorePortalShell } from '@/components/StorePortalShell';
import { PipelineLeadWorkspace } from '@/components/PipelineLeadWorkspace';
import { StorePipelineHistoricalAttendanceKpi } from '@/components/StorePipelineHistoricalAttendanceKpi';
import { StoreWhatsappMobileConversationUX } from '@/components/StoreWhatsappMobileConversationUX';
import { StoreWhatsappRealtimeSync } from '@/components/StoreWhatsappRealtimeSync';

export default function StorePortalLayout({ children }: { children: ReactNode }) {
  return <StorePortalShell><StoreWhatsappRealtimeSync /><StorePipelineHistoricalAttendanceKpi /><PipelineLeadWorkspace /><StoreWhatsappMobileConversationUX />{children}</StorePortalShell>;
}
