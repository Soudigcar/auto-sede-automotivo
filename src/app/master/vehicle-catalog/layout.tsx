import type { ReactNode } from 'react';
import { VehicleCatalogBuilderBridge } from '@/components/vehicle-catalog/VehicleCatalogBuilderBridge';

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}<VehicleCatalogBuilderBridge /></>;
}
