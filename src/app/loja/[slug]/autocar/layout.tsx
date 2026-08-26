import type { ReactNode } from 'react';
import { StoreAutocarModeControl } from '@/components/StoreAutocarModeControl';
import { StoreAutocarFollowUpEntry } from '@/components/StoreAutocarFollowUpEntry';

export default function StoreAutocarLayout({ children }: { children: ReactNode }) {
  return <>{children}<StoreAutocarModeControl /><StoreAutocarFollowUpEntry /></>;
}
