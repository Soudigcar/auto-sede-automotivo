import type { ReactNode } from 'react';
import AutocarConversationalCopilot from '@/components/AutocarConversationalCopilot';

export default function StoreWhatsappLayout({ children }: { children: ReactNode }) {
  return <>{children}<AutocarConversationalCopilot /></>;
}
