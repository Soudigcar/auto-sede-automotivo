import './globals.css';
import type { Metadata } from 'next';
import { appName } from '@/lib/constants';
import { AuthGate } from '@/components/AuthGate';
import { PipelineAddLeadWithStock } from '@/components/PipelineAddLeadWithStock';
import { PipelineSaleConfirmation } from '@/components/PipelineSaleConfirmation';
import { StoreCalendarRealtimeSync } from '@/components/StoreCalendarRealtimeSync';
import { StoreTeamManualMember } from '@/components/StoreTeamManualMember';
import { OlxSharedTextNormalizerBridge } from '@/components/OlxSharedTextNormalizerBridge';
import { StorePipelineAuraTheme } from '@/components/StorePipelineAuraTheme';
import { StorePipelineCockpitUx } from '@/components/StorePipelineCockpitUx';
import { StorePipelineResponsibleTopbar } from '@/components/StorePipelineResponsibleTopbar';
import { StorePipelineSidebarToggle } from '@/components/StorePipelineSidebarToggle';
import { StorePipelineNewLeadButton } from '@/components/StorePipelineNewLeadButton';
import { StorePipelineScheduleUxBridge } from '@/components/StorePipelineScheduleUxBridge';
import { StorePipelineNewLeadScheduleButton } from '@/components/StorePipelineNewLeadScheduleButton';
import { StorePipelineSaleActionBridge } from '@/components/StorePipelineSaleActionBridge';
import { StorePipelineCompactCardsUx } from '@/components/StorePipelineCompactCardsUx';
import { StoreWhatsappRealtimeSync } from '@/components/StoreWhatsappRealtimeSync';
import { StoreWhatsappHeaderActionsUx } from '@/components/StoreWhatsappHeaderActionsUx';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.autosede.com.br'),
  title: appName,
  description: 'Gestão de leads e vendas para eventos automotivos'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthGate>{children}</AuthGate>
        <PipelineAddLeadWithStock />
        <PipelineSaleConfirmation />
        <StoreCalendarRealtimeSync />
        <StoreTeamManualMember />
        <OlxSharedTextNormalizerBridge />
        <StorePipelineAuraTheme />
        <StorePipelineCockpitUx />
        <StorePipelineResponsibleTopbar />
        <StorePipelineSidebarToggle />
        <StorePipelineNewLeadButton />
        <StorePipelineScheduleUxBridge />
        <StorePipelineNewLeadScheduleButton />
        <StorePipelineSaleActionBridge />
        <StorePipelineCompactCardsUx />
        <StoreWhatsappRealtimeSync />
        <StoreWhatsappHeaderActionsUx />
      </body>
    </html>
  );
}
