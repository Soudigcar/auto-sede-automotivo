'use client';

import { MasterSidebar } from '@/components/MasterSidebar';
import { EventLandingManager } from '@/components/campaigns/EventLandingManager';

export default function MasterCampaignsPage() {
  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="flex min-h-screen">
        <MasterSidebar active="/master/campaigns" />
        <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <EventLandingManager />
        </section>
      </div>
    </main>
  );
}
