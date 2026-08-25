'use client';

import { usePathname } from 'next/navigation';

const STORE_HOME = /^\/loja\/[^/]+\/?$/;
const STORE_PIPELINE = /^\/loja\/[^/]+\/pipeline\/?$/;

export function StoreMobilePolish() {
  const pathname = usePathname() || '';
  const dashboard = STORE_HOME.test(pathname);
  const pipeline = STORE_PIPELINE.test(pathname);

  if (!dashboard && !pipeline) return null;

  return (
    <style jsx global>{`
      @media (max-width: 767px) {
        ${dashboard ? `
          .store-portal-child {
            padding-left: 0 !important;
            padding-right: 0 !important;
          }

          .store-dashboard-aura {
            margin: 0 !important;
            width: 100% !important;
            min-height: 100dvh !important;
            padding: 14px 14px calc(6.5rem + env(safe-area-inset-bottom)) !important;
            overflow-x: clip !important;
          }

          .store-dashboard-aura > div {
            width: 100% !important;
            max-width: none !important;
          }

          .store-dashboard-aura > div > div:first-child {
            margin-bottom: 14px !important;
            gap: 10px !important;
          }

          .store-dashboard-aura > div > div:first-child > label {
            height: 44px !important;
            max-width: none !important;
            border-radius: 14px !important;
            padding-left: 13px !important;
            padding-right: 13px !important;
          }

          .store-dashboard-aura > div > div:first-child > label span {
            display: none !important;
          }

          .store-dashboard-aura > div > div:first-child > div {
            align-self: stretch !important;
            justify-content: flex-end !important;
            gap: 8px !important;
          }

          .store-dashboard-aura > div > div:first-child > div > svg {
            display: none !important;
          }

          .store-dashboard-aura > div > div:first-child > div > div {
            min-height: 52px !important;
            flex: 1 1 auto !important;
            justify-content: flex-start !important;
            border-radius: 14px !important;
            padding: 8px 10px !important;
          }

          .store-dashboard-aura > div > div:first-child > div > div > div:first-child {
            width: 36px !important;
            height: 36px !important;
          }

          .store-dashboard-aura > div > header {
            gap: 12px !important;
          }

          .store-dashboard-aura > div > header p:first-child {
            font-size: 10px !important;
            letter-spacing: .12em !important;
          }

          .store-dashboard-aura > div > header h1 {
            margin-top: 5px !important;
            font-size: 34px !important;
            line-height: 1 !important;
          }

          .store-dashboard-aura > div > header h1 + p {
            margin-top: 8px !important;
            max-width: 34rem !important;
            font-size: 13px !important;
            line-height: 1.45 !important;
          }

          .store-dashboard-aura > div > header > div:last-child {
            display: grid !important;
            grid-template-columns: 1fr 1.35fr !important;
            gap: 8px !important;
          }

          .store-dashboard-aura > div > header > div:last-child > * {
            width: 100% !important;
            height: 44px !important;
            min-height: 44px !important;
            border-radius: 14px !important;
            padding-left: 12px !important;
            padding-right: 12px !important;
            font-size: 12px !important;
          }

          .store-dashboard-aura > div > section.mt-7 {
            margin-top: 14px !important;
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 9px !important;
          }

          .store-dashboard-aura > div > section.mt-7 > article {
            min-width: 0 !important;
            border-radius: 16px !important;
            padding: 12px !important;
            box-shadow: none !important;
          }

          .store-dashboard-aura > div > section.mt-7 > article > div {
            align-items: flex-start !important;
            gap: 9px !important;
          }

          .store-dashboard-aura > div > section.mt-7 > article > div > div:first-child {
            width: 36px !important;
            height: 36px !important;
            border-radius: 12px !important;
          }

          .store-dashboard-aura > div > section.mt-7 > article p {
            font-size: 10px !important;
            line-height: 1.2 !important;
          }

          .store-dashboard-aura > div > section.mt-7 > article p.mt-1 {
            font-size: 22px !important;
          }

          .store-dashboard-aura > div > section.mt-7 > article > p:last-child {
            margin-top: 9px !important;
            font-size: 9px !important;
            line-height: 1.3 !important;
          }

          .store-dashboard-aura > div > section.mt-4.grid.md\\:grid-cols-5 {
            display: flex !important;
            gap: 8px !important;
            overflow-x: auto !important;
            scroll-snap-type: x proximity !important;
            scrollbar-width: none !important;
            padding: 10px !important;
          }

          .store-dashboard-aura > div > section.mt-4.grid.md\\:grid-cols-5::-webkit-scrollbar {
            display: none !important;
          }

          .store-dashboard-aura > div > section.mt-4.grid.md\\:grid-cols-5 > div {
            min-width: 142px !important;
            flex: 0 0 142px !important;
            scroll-snap-align: start !important;
            border-right: 0 !important;
          }

          .store-dashboard-aura > div > section.mt-4.grid.xl\\:grid-cols-\\[1\\.05fr_1\\.15fr\\] {
            gap: 10px !important;
          }
        ` : ''}

        ${pipeline ? `
          body.pipeline-aura-active .pipeline-aura-board-scroll {
            width: 100vw !important;
            margin-left: calc(50% - 50vw) !important;
            margin-right: calc(50% - 50vw) !important;
            padding: 0 14px 18px !important;
            overflow-x: auto !important;
            scroll-snap-type: x mandatory !important;
            scroll-padding-inline: 14px !important;
            overscroll-behavior-inline: contain !important;
            scrollbar-width: none !important;
            -webkit-overflow-scrolling: touch !important;
          }

          body.pipeline-aura-active .pipeline-aura-board-scroll::-webkit-scrollbar {
            display: none !important;
          }

          body.pipeline-aura-active .pipeline-aura-board {
            gap: 10px !important;
          }

          body.pipeline-aura-active .pipeline-aura-board > div {
            width: calc(100vw - 28px) !important;
            max-width: 420px !important;
            flex: 0 0 calc(100vw - 28px) !important;
            min-height: calc(100dvh - 280px) !important;
            scroll-snap-align: start !important;
            scroll-snap-stop: always !important;
            border-radius: 18px !important;
            padding: 10px !important;
          }

          body.pipeline-aura-active .pipeline-aura-board > div > div:first-child {
            position: sticky !important;
            top: 0 !important;
            padding: 12px 13px !important;
            border-radius: 14px !important;
          }

          body.pipeline-aura-active .pipeline-aura-board h2 {
            font-size: 15px !important;
          }

          body.pipeline-aura-active .pipeline-aura-lead-card,
          body.pipeline-aura-active [data-pipeline-compact-card='true'] {
            border-radius: 16px !important;
          }

          body.pipeline-aura-active .pipeline-aura-canvas {
            padding-left: 10px !important;
            padding-right: 10px !important;
            padding-bottom: calc(6.75rem + env(safe-area-inset-bottom)) !important;
          }

          body.pipeline-aura-active .pipeline-aura-kpis {
            width: 100vw !important;
            margin-left: calc(50% - 50vw) !important;
            padding-left: 14px !important;
            padding-right: 14px !important;
            gap: 8px !important;
            scrollbar-width: none !important;
          }

          body.pipeline-aura-active .pipeline-aura-kpis::-webkit-scrollbar {
            display: none !important;
          }

          body.pipeline-aura-active .pipeline-aura-kpis .premium-card {
            min-width: 145px !important;
            min-height: 96px !important;
            padding: 13px !important;
          }

          body.pipeline-aura-active .pipeline-aura-kpis strong {
            font-size: 23px !important;
          }

          body.pipeline-aura-active .pipeline-stock-add-button {
            right: 14px !important;
            top: auto !important;
            bottom: calc(6.25rem + env(safe-area-inset-bottom)) !important;
            width: 52px !important;
            min-width: 52px !important;
            height: 52px !important;
            min-height: 52px !important;
            padding: 0 !important;
            border-radius: 50% !important;
          }

          body.pipeline-aura-active .pipeline-stock-add-button span {
            display: none !important;
          }
        ` : ''}
      }
    `}</style>
  );
}
