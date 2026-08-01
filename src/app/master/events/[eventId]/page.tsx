'use client';

import { useParams } from 'next/navigation';
import { MasterSidebar } from '@/components/MasterSidebar';
import { EventWorkspace } from '@/components/events/EventWorkspace';

export default function MasterEventWorkspacePage() {
  const params = useParams();
  const eventId = String(params?.eventId || '');

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Eventos" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <EventWorkspace eventId={eventId} />
        </div>
      </section>
    </main>
  );
}
