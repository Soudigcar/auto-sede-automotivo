import type { ReactNode } from 'react';
import { StoreAutocarModeControl } from '@/components/StoreAutocarModeControl';

export default function StoreAutocarLayout({ children }: { children: ReactNode }) {
  return <>{children}<StoreAutocarModeControl /></>;
}
