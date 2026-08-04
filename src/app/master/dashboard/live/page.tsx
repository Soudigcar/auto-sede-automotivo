import { MasterGoalPerformance3D } from '@/components/MasterGoalPerformance3D';
import { MasterRealDashboardPolished } from '@/components/MasterRealDashboardPolished';

export default function MasterLiveDashboardPage() {
  return (
    <div className="master-dashboard-filter-first">
      <MasterRealDashboardPolished />
      <MasterGoalPerformance3D />

      <style>{`
        .master-dashboard-filter-first > main > div > div:last-child {
          display: flex;
          flex-direction: column;
        }

        .master-dashboard-filter-first > main > div > div:last-child > header {
          order: 0;
        }

        .master-dashboard-filter-first > main > div > div:last-child > header + div {
          order: 1;
        }

        .master-dashboard-filter-first > main > div > div:last-child > section:nth-of-type(3) {
          order: 2;
          margin-top: 20px;
        }

        .master-dashboard-filter-first > main > div > div:last-child > section:nth-of-type(1) {
          order: 3;
          margin-top: 16px;
        }

        .master-dashboard-filter-first > main > div > div:last-child > section:nth-of-type(2) {
          order: 4;
          margin-top: 16px;
        }

        .master-dashboard-filter-first > main > div > div:last-child > section:nth-of-type(n + 4) {
          order: 5;
        }
      `}</style>
    </div>
  );
}
