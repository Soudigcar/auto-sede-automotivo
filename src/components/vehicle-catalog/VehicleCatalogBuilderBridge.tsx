'use client';

import { VehicleCatalogBuilder } from './VehicleCatalogBuilder';

export function VehicleCatalogBuilderBridge() {
  return (
    <div className="fixed bottom-6 right-6 z-[1100] max-w-[calc(100vw-3rem)] md:bottom-8 md:right-8">
      <VehicleCatalogBuilder onApplied={() => window.location.reload()} />
    </div>
  );
}
