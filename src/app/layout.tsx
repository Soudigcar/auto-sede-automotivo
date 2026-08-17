import './globals.css';
import type { Metadata } from 'next';
import { appName } from '@/lib/constants';
import { AuthGate } from '@/components/AuthGate';
import { StoreCalendarRealtimeSync } from '@/components/StoreCalendarRealtimeSync';
import { StoreTeamManualMember } from '@/components/StoreTeamManualMember';
import { OlxSharedTextNormalizerBridge } from '@/components/OlxSharedTextNormalizerBridge';
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
        <StoreCalendarRealtimeSync />
        <StoreTeamManualMember />
        <OlxSharedTextNormalizerBridge />
        <StoreWhatsappRealtimeSync />
        <StoreWhatsappHeaderActionsUx />
      </body>
    </html>
  );
}
