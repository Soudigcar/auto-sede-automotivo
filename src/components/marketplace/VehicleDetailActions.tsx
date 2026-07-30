'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calculator, Store } from 'lucide-react';
import { MarketplaceVehicleModal } from '@/components/marketplace/MarketplaceVehicleModal';
import type { MarketplaceVehicle } from '@/components/marketplace/types';
import { publicStorePath } from '@/lib/publicRoutes';

export function VehicleDetailActions({ vehicle }: { vehicle: MarketplaceVehicle }) {
  const [simulationOpen, setSimulationOpen] = useState(false);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setSimulationOpen(true)} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 text-sm font-black text-white shadow-lg shadow-red-600/20 transition hover:bg-red-500">
          <Calculator size={19} /> Simular financiamento
        </button>
        <Link href={publicStorePath(vehicle.store.slug)} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-800 transition hover:border-red-200 hover:text-red-600">
          <Store size={19} /> Ver loja responsável
        </Link>
      </div>

      {simulationOpen ? <MarketplaceVehicleModal vehicle={vehicle} onClose={() => setSimulationOpen(false)} /> : null}
    </>
  );
}
