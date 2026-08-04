'use client';

import { MasterRealDashboard } from '@/components/MasterRealDashboard';

export function MasterRealDashboardPolished() {
  return (
    <div className="master-executive-dashboard">
      <MasterRealDashboard />

      <style jsx global>{`
        .master-executive-dashboard {
          --dash-bg: #050914;
          --dash-panel: #09111f;
          --dash-panel-2: #0d1728;
          --dash-card: rgba(14, 25, 43, 0.88);
          --dash-card-soft: rgba(20, 34, 56, 0.72);
          --dash-border: rgba(148, 163, 184, 0.14);
          --dash-text: #f8fafc;
          --dash-muted: #8290a6;
          --dash-red: #ff2b3d;
          --dash-cyan: #33d2ff;
          --dash-green: #2ee6a6;
          --dash-amber: #ffbd45;
          --dash-purple: #a778ff;
          min-height: 100vh;
          background:
            radial-gradient(circle at 74% 0%, rgba(42, 112, 255, 0.13), transparent 32%),
            radial-gradient(circle at 32% 40%, rgba(255, 43, 61, 0.08), transparent 28%),
            var(--dash-bg);
        }

        .master-executive-dashboard main {
          min-height: 100vh !important;
          background: transparent !important;
          padding: 0 !important;
          color: var(--dash-text) !important;
        }

        .master-executive-dashboard main > section {
          max-width: none !important;
          min-height: 100vh;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        .master-executive-dashboard aside {
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
          background:
            linear-gradient(180deg, rgba(11, 20, 36, 0.98), rgba(4, 9, 18, 0.99)) !important;
          border-right: 1px solid rgba(148, 163, 184, 0.11);
          box-shadow: 24px 0 50px rgba(0, 0, 0, 0.18);
        }

        .master-executive-dashboard aside > div:first-child > div:first-child > div:first-child {
          background: rgba(255, 43, 61, 0.14) !important;
          color: var(--dash-red) !important;
          box-shadow: 0 0 28px rgba(255, 43, 61, 0.16);
        }

        .master-executive-dashboard aside nav a {
          border: 1px solid transparent;
          transition: all 180ms ease;
        }

        .master-executive-dashboard aside nav a:hover {
          transform: translateX(3px);
          border-color: rgba(148, 163, 184, 0.1);
          background: rgba(255, 255, 255, 0.045) !important;
        }

        .master-executive-dashboard aside nav a.bg-red-600 {
          background: linear-gradient(135deg, #ff3048, #d90824) !important;
          border-color: rgba(255, 255, 255, 0.12);
          box-shadow: 0 12px 34px rgba(255, 43, 61, 0.3), inset 0 1px rgba(255,255,255,.14) !important;
        }

        .master-executive-dashboard main > section > div:last-child {
          background: transparent !important;
          padding: 28px 30px 42px !important;
        }

        .master-executive-dashboard header {
          position: relative;
          margin-bottom: 20px;
          padding: 6px 2px 2px;
        }

        .master-executive-dashboard header p:first-child {
          color: var(--dash-red) !important;
          font-size: 11px !important;
          letter-spacing: .28em !important;
        }

        .master-executive-dashboard header h1 {
          color: var(--dash-text) !important;
          font-size: clamp(2rem, 3vw, 3.2rem) !important;
          letter-spacing: -.045em !important;
          text-shadow: 0 5px 24px rgba(0,0,0,.26);
        }

        .master-executive-dashboard header p:last-child {
          color: var(--dash-muted) !important;
        }

        .master-executive-dashboard header button {
          border-color: rgba(148, 163, 184, 0.16) !important;
          background: linear-gradient(180deg, rgba(20, 35, 57, 0.95), rgba(10, 19, 33, 0.95)) !important;
          color: #dce6f5 !important;
          box-shadow: 0 14px 34px rgba(0,0,0,.24), inset 0 1px rgba(255,255,255,.05) !important;
        }

        .master-executive-dashboard header button:hover {
          border-color: rgba(255, 43, 61, .45) !important;
          color: white !important;
          box-shadow: 0 14px 36px rgba(255,43,61,.13) !important;
        }

        .master-executive-dashboard header + div {
          border-color: rgba(255, 189, 69, .22) !important;
          background: rgba(255, 189, 69, .08) !important;
          color: #ffd98b !important;
        }

        .master-executive-dashboard section.mt-5.rounded-\[28px\] {
          border: 1px solid var(--dash-border) !important;
          background:
            linear-gradient(135deg, rgba(17, 31, 53, .96), rgba(8, 16, 29, .96)) !important;
          box-shadow: 0 22px 55px rgba(0,0,0,.26), inset 0 1px rgba(255,255,255,.035) !important;
        }

        .master-executive-dashboard section.mt-5.rounded-\[28px\] p,
        .master-executive-dashboard section.mt-5.rounded-\[28px\] h2,
        .master-executive-dashboard section.mt-5.rounded-\[28px\] strong {
          color: var(--dash-text) !important;
        }

        .master-executive-dashboard section.mt-5.rounded-\[28px\] > div:first-child > div:first-child p {
          color: var(--dash-red) !important;
        }

        .master-executive-dashboard section.mt-5.rounded-\[28px\] > div:first-child > div:last-child > div {
          border-color: rgba(148, 163, 184, .1) !important;
          background: rgba(255,255,255,.035) !important;
        }

        .master-executive-dashboard section.mt-5.rounded-\[28px\] > div:last-child {
          border-color: rgba(148,163,184,.1) !important;
          background: rgba(2,8,18,.48) !important;
        }

        .master-executive-dashboard section.mt-5.grid > div {
          border: 1px solid var(--dash-border) !important;
          background: linear-gradient(180deg, rgba(18, 31, 51, .88), rgba(10, 19, 33, .88)) !important;
          box-shadow: inset 0 1px rgba(255,255,255,.03), 0 12px 30px rgba(0,0,0,.14) !important;
        }

        .master-executive-dashboard section.mt-5.grid > div > label,
        .master-executive-dashboard section.mt-5.grid > div p {
          color: var(--dash-muted) !important;
        }

        .master-executive-dashboard section.mt-5.grid select,
        .master-executive-dashboard section.mt-5.grid input {
          color: var(--dash-text) !important;
          color-scheme: dark;
        }

        .master-executive-dashboard section.mt-5.grid option {
          color: #111827;
        }

        .master-executive-dashboard section.mt-6.space-y-4 {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .master-executive-dashboard section.mt-6.space-y-4 > div.grid {
          display: contents !important;
        }

        .master-executive-dashboard section.mt-6.space-y-4 > div.grid > div {
          position: relative;
          display: flex !important;
          min-width: 0;
          min-height: 206px;
          height: 100%;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--dash-border) !important;
          border-radius: 20px !important;
          background:
            radial-gradient(circle at 96% 0%, rgba(57, 137, 255, .11), transparent 38%),
            linear-gradient(160deg, rgba(17, 31, 53, .96), rgba(7, 15, 27, .98)) !important;
          padding: 18px !important;
          box-shadow: 0 18px 38px rgba(0,0,0,.18), inset 0 1px rgba(255,255,255,.035) !important;
          transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
        }

        .master-executive-dashboard section.mt-6.space-y-4 > div.grid > div:hover {
          transform: translateY(-3px);
          border-color: rgba(95, 159, 255, .26) !important;
          box-shadow: 0 24px 46px rgba(0,0,0,.25), 0 0 26px rgba(56,130,246,.06) !important;
        }

        .master-executive-dashboard section.mt-6.space-y-4 > div.grid > div > div:first-child {
          opacity: .95;
        }

        .master-executive-dashboard section.mt-6.space-y-4 p {
          color: #92a0b5 !important;
          font-size: 12px !important;
        }

        .master-executive-dashboard section.mt-6.space-y-4 strong {
          margin-top: 10px !important;
          color: var(--dash-text) !important;
          font-size: clamp(1.7rem, 2.2vw, 2.45rem) !important;
          line-height: 1 !important;
          letter-spacing: -.045em !important;
          font-variant-numeric: tabular-nums;
        }

        .master-executive-dashboard section.mt-6.space-y-4 span {
          color: #728197 !important;
        }

        .master-executive-dashboard section.mt-6.space-y-4 span.rounded-full {
          background: rgba(255,255,255,.055) !important;
          color: #aab7ca !important;
        }

        .master-executive-dashboard section.mt-6.space-y-4 div.bg-zinc-100 {
          background: rgba(255,255,255,.065) !important;
        }

        .master-executive-dashboard section.mt-5.grid.gap-5 > div,
        .master-executive-dashboard section.mt-5.grid.gap-5 > div > div {
          border-color: var(--dash-border) !important;
          background:
            linear-gradient(160deg, rgba(15, 27, 46, .94), rgba(7, 15, 27, .97)) !important;
          box-shadow: 0 18px 42px rgba(0,0,0,.2), inset 0 1px rgba(255,255,255,.025) !important;
        }

        .master-executive-dashboard section.mt-5.grid.gap-5 h2,
        .master-executive-dashboard section.mt-5.grid.gap-5 h3,
        .master-executive-dashboard section.mt-5.grid.gap-5 strong {
          color: var(--dash-text) !important;
        }

        .master-executive-dashboard section.mt-5.grid.gap-5 p,
        .master-executive-dashboard section.mt-5.grid.gap-5 span {
          color: var(--dash-muted) !important;
        }

        .master-executive-dashboard section.mt-5.grid.gap-5 div.bg-zinc-100,
        .master-executive-dashboard section.mt-5.grid.gap-5 div.bg-zinc-50 {
          background: rgba(255,255,255,.055) !important;
        }

        .master-executive-dashboard section.mt-5.grid.gap-5 div.border-zinc-100,
        .master-executive-dashboard section.mt-5.grid.gap-5 div.border-zinc-300 {
          border-color: rgba(148,163,184,.13) !important;
        }

        .master-executive-dashboard section.mt-5.grid.gap-5 .bg-sky-600 {
          background: linear-gradient(90deg, #25c2ff, #3478ff) !important;
          box-shadow: 0 0 20px rgba(37,194,255,.16);
        }

        @media (min-width: 1280px) {
          .master-executive-dashboard section.mt-6.space-y-4 {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }

        @media (max-width: 1023px) {
          .master-executive-dashboard main > section > div:last-child {
            padding: 22px 18px 34px !important;
          }
        }

        @media (max-width: 639px) {
          .master-executive-dashboard section.mt-6.space-y-4 {
            grid-template-columns: 1fr;
          }

          .master-executive-dashboard section.mt-6.space-y-4 > div.grid > div {
            min-height: 182px;
          }

          .master-executive-dashboard header h1 {
            font-size: 2rem !important;
          }
        }
      `}</style>
    </div>
  );
}
