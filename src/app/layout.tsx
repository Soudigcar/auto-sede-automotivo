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
import { StorePipelineSidebarToggle } from '@/components/StorePipelineSidebarToggle';

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
        <StorePipelineSidebarToggle />
      </body>
    </html>
  );
}
