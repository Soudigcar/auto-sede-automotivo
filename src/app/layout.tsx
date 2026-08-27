import './globals.css';
import type { Metadata, Viewport } from 'next';
import { appName } from '@/lib/constants';
import { AuthGate } from '@/components/AuthGate';
import { PipelineAddLeadWithStock } from '@/components/PipelineAddLeadWithStock';
import { PipelineSaleConfirmation } from '@/components/PipelineSaleConfirmation';
import { StoreCalendarRealtimeSync } from '@/components/StoreCalendarRealtimeSync';
import { StoreTeamManualMember } from '@/components/StoreTeamManualMember';
import { OlxSharedTextNormalizerBridge } from '@/components/OlxSharedTextNormalizerBridge';
import { StorePipelineDomSync } from '@/components/StorePipelineDomSync';
import { StorePipelineAuraTheme } from '@/components/StorePipelineAuraTheme';
import { StoreAiIdentityBoundary } from '@/components/StoreAiIdentityBoundary';
import { StorePipelineCockpitUx } from '@/components/StorePipelineCockpitUx';
import { StorePipelineResponsibleTopbar } from '@/components/StorePipelineResponsibleTopbar';
import { StorePipelineSidebarToggle } from '@/components/StorePipelineSidebarToggle';
import { StorePipelineNewLeadButton } from '@/components/StorePipelineNewLeadButton';
import { StorePipelineScheduleUxBridge } from '@/components/StorePipelineScheduleUxBridge';
import { StorePipelineNewLeadScheduleButton } from '@/components/StorePipelineNewLeadScheduleButton';
import { StorePipelineSaleActionBridge } from '@/components/StorePipelineSaleActionBridge';
import { StorePipelineCompactCardsUx } from '@/components/StorePipelineCompactCardsUx';
import { StoreMobilePolish } from '@/components/StoreMobilePolish';
import { WhatsappMobileInboxBridge } from '@/components/WhatsappMobileInboxBridge';
import { WhatsappMobileChromeGuard } from '@/components/WhatsappMobileChromeGuard';
import { StorePortalMobileNavigation } from '@/components/StorePortalMobileNavigation';
import { MasterMobileNavigation } from '@/components/MasterMobileNavigation';
import { PrivacyConsentCenter } from '@/components/PrivacyConsentCenter';
import { PwaInstallManager } from '@/components/PwaInstallManager';
import { resolvePwaAppVersion } from '@/lib/server/pwaAppVersion';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.autosede.com.br'),
  title: appName,
  description: 'Gestão de leads e vendas para eventos automotivos',
  applicationName: appName,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Auto Controle',
    statusBarStyle: 'black-translucent'
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  },
  other: {
    'mobile-web-app-capable': 'yes'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#070A12',
  colorScheme: 'dark light'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const appVersion = resolvePwaAppVersion();

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthGate>{children}</AuthGate>
        <PipelineAddLeadWithStock />
        <PipelineSaleConfirmation />
        <StoreCalendarRealtimeSync />
        <StoreTeamManualMember />
        <OlxSharedTextNormalizerBridge />
        <StorePipelineDomSync />
        <StorePipelineAuraTheme />
        <StoreAiIdentityBoundary />
        <StorePipelineCockpitUx />
        <StorePipelineResponsibleTopbar />
        <StorePipelineSidebarToggle />
        <StorePipelineNewLeadButton />
        <StorePipelineScheduleUxBridge />
        <StorePipelineNewLeadScheduleButton />
        <StorePipelineSaleActionBridge />
        <StorePipelineCompactCardsUx />
        <StoreMobilePolish />
        <WhatsappMobileInboxBridge />
        <WhatsappMobileChromeGuard />
        <StorePortalMobileNavigation />
        <MasterMobileNavigation />
        <PrivacyConsentCenter />
        <PwaInstallManager currentVersion={appVersion} />
      </body>
    </html>
  );
}
