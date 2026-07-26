'use client';

import { MasterRealDashboard } from '@/components/MasterRealDashboard';

export function MasterRealDashboardPolished() {
  return (
    <div className="master-dashboard-polished">
      <MasterRealDashboard />

      <style jsx global>{`
        .master-dashboard-polished section.mt-6.space-y-4 {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr);
          gap: 16px;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid {
          display: contents !important;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div {
          display: flex !important;
          min-width: 0;
          min-height: 208px;
          height: 100%;
          flex-direction: column;
          border-radius: 22px !important;
          padding: 16px !important;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(2) {
          gap: 12px !important;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(2) > div:first-child {
          min-width: 0;
          flex: 1 1 auto;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(2) p {
          min-height: 32px;
          max-width: 17rem;
          font-size: 12px !important;
          font-weight: 750 !important;
          line-height: 16px !important;
          letter-spacing: -0.01em;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(2) strong {
          display: block;
          margin-top: 10px !important;
          overflow: hidden;
          max-width: 100%;
          white-space: nowrap;
          text-overflow: ellipsis;
          font-size: clamp(1.75rem, 2.15vw, 2.35rem) !important;
          line-height: 1 !important;
          letter-spacing: -0.045em;
          font-variant-numeric: tabular-nums;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(2) span {
          display: -webkit-box !important;
          min-height: 32px;
          margin-top: 9px !important;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          font-size: 11px !important;
          line-height: 16px !important;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(2) > div:last-child {
          width: 42px !important;
          height: 42px !important;
          border-radius: 14px !important;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16) !important;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(2) > div:last-child svg {
          width: 18px;
          height: 18px;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(3) {
          min-height: 28px;
          margin-top: auto !important;
          padding-top: 14px;
          gap: 8px !important;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(3) > span:first-child {
          flex: 0 0 auto;
          padding: 5px 9px !important;
          font-size: 9px !important;
          line-height: 1 !important;
          letter-spacing: 0.06em !important;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(3) > span:last-child:not(:first-child) {
          min-width: 0;
          font-size: 10px !important;
          line-height: 13px !important;
        }

        .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(4) {
          height: 6px !important;
          margin-top: 9px !important;
        }

        @media (min-width: 640px) {
          .master-dashboard-polished section.mt-6.space-y-4 {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (min-width: 1280px) {
          .master-dashboard-polished section.mt-6.space-y-4 {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }

        @media (min-width: 1900px) {
          .master-dashboard-polished section.mt-6.space-y-4 {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }

        @media (max-width: 639px) {
          .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div {
            min-height: 190px;
          }

          .master-dashboard-polished section.mt-6.space-y-4 > div.grid > div > div:nth-child(2) strong {
            font-size: 2rem !important;
          }
        }
      `}</style>
    </div>
  );
}
