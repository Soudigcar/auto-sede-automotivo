import './globals.css';
import type { Metadata } from 'next';
import { appName } from '@/lib/constants';
import { AuthGate } from '@/components/AuthGate';
import { PipelineOptimizedRuntime } from '@/components/PipelineOptimizedRuntime';
import { PipelineLeadEditorLazyLoader } from '@/components/PipelineLeadEditorLazyLoader';
import { PipelineAddLeadWithStock } from '@/components/PipelineAddLeadWithStock';
import { PipelineSaleConfirmation } from '@/components/PipelineSaleConfirmation';
import { PipelineInstallmentQuickSelector } from '@/components/PipelineInstallmentQuickSelector';
import { PipelineCommercialStageLabel } from '@/components/PipelineCommercialStageLabel';
import { StoreCalendarRealtimeSync } from '@/components/StoreCalendarRealtimeSync';
import { StoreTeamManualMember } from '@/components/StoreTeamManualMember';

export const metadata: Metadata = {
  title: appName,
  description: 'Gestão de leads e vendas para eventos automotivos'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthGate>{children}</AuthGate>
        <PipelineOptimizedRuntime />
        <PipelineLeadEditorLazyLoader />
        <PipelineAddLeadWithStock />
        <PipelineSaleConfirmation />
        <PipelineInstallmentQuickSelector />
        <PipelineCommercialStageLabel />
        <StoreCalendarRealtimeSync />
        <StoreTeamManualMember />
      </body>
    </html>
  );
}
