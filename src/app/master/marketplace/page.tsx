'use client';

import { MasterSidebar } from '@/components/MasterSidebar';
import { PortalMarketplaceWorkspace } from '@/components/marketplace/PortalMarketplaceWorkspace';

export default function MasterMarketplacePage() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="/master/marketplace" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <PortalMarketplaceWorkspace />
        </div>
      </section>
    </main>
  );
}
