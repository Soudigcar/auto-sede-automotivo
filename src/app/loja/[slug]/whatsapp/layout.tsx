import type { ReactNode } from 'react';
import AutocarCopilotDock from '@/components/AutocarCopilotDock';

export default function StoreWhatsappLayout({ children }: { children: ReactNode }) {
  return <>{children}<AutocarCopilotDock /></>;
}
