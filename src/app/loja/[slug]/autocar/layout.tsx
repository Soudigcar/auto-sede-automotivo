import type { ReactNode } from 'react';
import { StoreAutocarModeControl } from '@/components/StoreAutocarModeControl';
import { StoreAutocarSubnav } from '@/components/StoreAutocarSubnav';

export default async function StoreAutocarLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <><StoreAutocarSubnav slug={slug}/>{children}<StoreAutocarModeControl /></>;
}
