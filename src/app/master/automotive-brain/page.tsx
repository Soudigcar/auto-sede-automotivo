import { AutomotiveBrainDashboard } from '@/components/AutomotiveBrainDashboard';
import { AutomotiveMarketRadarPanel } from '@/components/AutomotiveMarketRadarPanel';

export default function AutomotiveBrainPage() {
  return (
    <>
      <AutomotiveBrainDashboard />
      <div className="mx-auto max-w-[1680px] px-3 pb-8 md:px-6">
        <AutomotiveMarketRadarPanel />
      </div>
    </>
  );
}
