'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import { usePathname } from 'next/navigation';

const stages = [
  'Novos',
  'Atendimento',
  'Agendados',
  'Cancelados',
  'Não compareceu',
  'Compareceu',
  'Vendas',
  'Perdas'
];

function actionKind(label: string) {
  const normalized = label.toLocaleLowerCase('pt-BR');

  if (normalized.includes('whatsapp') || normalized === 'atender') return 'whatsapp';
  if (['agendar', 'chegou', 'venda'].some((item) => normalized === item)) return 'primary';
  if (normalized.includes('perda') || normalized.includes('cancelar venda')) return 'danger';
  if (normalized === 'cancelou') return 'warning';
  return 'secondary';
}

export function PipelineProfessionalLayout() {
  const pathname = usePathname();
  const active = /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname || '');
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    if (!active) return;

    document.body.classList.add('pipeline-professional-ui');
    let currentScroller: HTMLElement | null = null;
    let removeScrollListener = () => {};

    function bindScroller(scroller: HTMLElement, board: HTMLElement) {
      if (currentScroller === scroller) return;
      removeScrollListener();
      currentScroller = scroller;

      const handleScroll = () => {
        if (window.innerWidth >= 1024) return;
        const columns = Array.from(board.children) as HTMLElement[];
        if (!columns.length) return;

        const target = scroller.scrollLeft + scroller.clientWidth * 0.35;
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        columns.forEach((column, index) => {
          const distance = Math.abs(column.offsetLeft - target);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });

        setActiveStage(nearestIndex);
      };

      scroller.addEventListener('scroll', handleScroll, { passive: true });
      removeScrollListener = () => scroller.removeEventListener('scroll', handleScroll);
    }

    function enhancePipeline() {
      const page = document.querySelector('main.premium-page');
      if (!page) return;

      const board = Array.from(page.querySelectorAll<HTMLElement>('div')).find((element) => {
        const className = String(element.className || '');
        return className.includes('min-w-[1760px]') && className.includes('grid-cols-8');
      });

      if (!board) return;

      board.dataset.pipelineBoard = 'true';
      const scroller = board.parentElement as HTMLElement | null;

      if (scroller) {
        scroller.dataset.pipelineScroller = 'true';
        bindScroller(scroller, board);
      }

      const columns = Array.from(board.children) as HTMLElement[];

      columns.forEach((column, columnIndex) => {
        column.dataset.pipelineColumn = String(columnIndex);
        column.id = `pipeline-stage-${columnIndex}`;

        const header = column.firstElementChild as HTMLElement | null;
        if (header) header.dataset.pipelineColumnHeader = 'true';

        column.querySelectorAll<HTMLElement>('[role="button"][draggable="true"]').forEach((card) => {
          card.dataset.pipelineCard = 'true';
          card.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
            const label = String(button.textContent || '').replace(/\s+/g, ' ').trim();
            button.dataset.pipelineAction = actionKind(label);
            button.title = label;
          });
        });
      });
    }

    enhancePipeline();

    const observer = new MutationObserver(() => enhancePipeline());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      removeScrollListener();
      document.body.classList.remove('pipeline-professional-ui');
    };
  }, [active, pathname]);

  function goToStage(index: number) {
    const safeIndex = Math.max(0, Math.min(stages.length - 1, index));
    const board = document.querySelector<HTMLElement>('[data-pipeline-board="true"]');
    const scroller = document.querySelector<HTMLElement>('[data-pipeline-scroller="true"]');
    const column = document.querySelector<HTMLElement>(`[data-pipeline-column="${safeIndex}"]`);

    if (board && scroller && column) {
      scroller.scrollTo({
        left: Math.max(0, column.offsetLeft - board.offsetLeft),
        behavior: 'smooth'
      });
    }

    setActiveStage(safeIndex);
  }

  if (!active) return null;

  return (
    <>
      <style>{professionalStyles}</style>

      <div className="pipeline-mobile-dock lg:hidden" aria-label="Navegação das etapas do pipeline">
        <button
          type="button"
          onClick={() => goToStage(activeStage - 1)}
          disabled={activeStage === 0}
          aria-label="Etapa anterior"
        >
          <ChevronLeft size={20} />
        </button>

        <button
          type="button"
          className="pipeline-mobile-stage"
          onClick={() => goToStage((activeStage + 1) % stages.length)}
          aria-label="Avançar para a próxima etapa"
        >
          <Columns3 size={17} />
          <span>
            <small>Etapa {activeStage + 1} de {stages.length}</small>
            <strong>{stages[activeStage]}</strong>
          </span>
        </button>

        <button
          type="button"
          onClick={() => goToStage(activeStage + 1)}
          disabled={activeStage === stages.length - 1}
          aria-label="Próxima etapa"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </>
  );
}

const professionalStyles = `
  .pipeline-professional-ui main.premium-page {
    background: #f3f5f9;
  }

  .pipeline-professional-ui [data-pipeline-scroller="true"] {
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
    scroll-padding-inline: 4px;
  }

  .pipeline-professional-ui [data-pipeline-scroller="true"]::-webkit-scrollbar {
    height: 9px;
  }

  .pipeline-professional-ui [data-pipeline-scroller="true"]::-webkit-scrollbar-track {
    background: transparent;
  }

  .pipeline-professional-ui [data-pipeline-scroller="true"]::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border: 2px solid #f3f5f9;
    border-radius: 999px;
  }

  .pipeline-professional-ui [data-pipeline-board="true"] {
    display: grid !important;
    grid-template-columns: repeat(8, minmax(292px, 310px)) !important;
    min-width: max-content !important;
    gap: 16px !important;
    padding: 4px 4px 22px;
  }

  .pipeline-professional-ui [data-pipeline-column] {
    width: 100%;
    min-width: 292px !important;
    min-height: 560px !important;
    padding: 10px !important;
    border: 1px solid #e5e9f0 !important;
    border-radius: 24px !important;
    background: #f8fafc !important;
    box-shadow: none !important;
  }

  .pipeline-professional-ui [data-pipeline-column-header="true"] {
    position: sticky;
    top: 0;
    z-index: 5;
    margin-bottom: 12px !important;
    padding: 13px 14px !important;
    border-radius: 17px !important;
    box-shadow: 0 5px 15px rgba(15, 23, 42, 0.05);
    backdrop-filter: blur(12px);
  }

  .pipeline-professional-ui [data-pipeline-column-header="true"] h2 {
    max-width: 190px;
    font-size: 13px !important;
    line-height: 1.25 !important;
    overflow-wrap: normal !important;
    word-break: normal !important;
  }

  .pipeline-professional-ui [data-pipeline-card="true"] {
    min-width: 0;
    overflow: hidden;
    padding: 14px !important;
    border: 1px solid #e5e9f0 !important;
    border-radius: 18px !important;
    background: #ffffff !important;
    box-shadow: 0 3px 9px rgba(15, 23, 42, 0.04), 0 12px 28px rgba(15, 23, 42, 0.035) !important;
    transform: none !important;
  }

  .pipeline-professional-ui [data-pipeline-card="true"]:hover {
    border-color: #cbd5e1 !important;
    box-shadow: 0 7px 18px rgba(15, 23, 42, 0.07), 0 20px 36px rgba(15, 23, 42, 0.05) !important;
  }

  .pipeline-professional-ui [data-pipeline-card="true"] h3 {
    display: -webkit-box;
    overflow: hidden;
    max-width: 100%;
    font-size: 15px !important;
    line-height: 1.28 !important;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere !important;
    word-break: normal !important;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .pipeline-professional-ui [data-pipeline-card="true"] h3 + p {
    display: -webkit-box;
    overflow: hidden;
    font-size: 12px !important;
    line-height: 1.45 !important;
    overflow-wrap: anywhere !important;
    word-break: normal !important;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .pipeline-professional-ui [data-pipeline-card="true"] span {
    max-width: 100%;
  }

  .pipeline-professional-ui [data-pipeline-card="true"] > div:nth-last-child(1):has(button) {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px !important;
    margin-top: 13px !important;
  }

  .pipeline-professional-ui [data-pipeline-card="true"] button[data-pipeline-action] {
    display: inline-flex !important;
    width: 100%;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 6px !important;
    padding: 8px 10px !important;
    border-radius: 11px !important;
    font-size: 11px !important;
    font-weight: 800 !important;
    line-height: 1.1 !important;
    letter-spacing: 0 !important;
    text-transform: none !important;
    box-shadow: none !important;
  }

  .pipeline-professional-ui [data-pipeline-action="whatsapp"] {
    grid-column: 1 / -1;
    border-color: #059669 !important;
    background: #059669 !important;
    color: #ffffff !important;
  }

  .pipeline-professional-ui [data-pipeline-action="primary"] {
    grid-column: 1 / -1;
    border-color: #0f172a !important;
    background: #0f172a !important;
    color: #ffffff !important;
  }

  .pipeline-professional-ui [data-pipeline-action="secondary"] {
    border-color: #dbe1e8 !important;
    background: #ffffff !important;
    color: #334155 !important;
  }

  .pipeline-professional-ui [data-pipeline-action="danger"] {
    border-color: #fecaca !important;
    background: #fff1f2 !important;
    color: #be123c !important;
  }

  .pipeline-professional-ui [data-pipeline-action="warning"] {
    border-color: #fed7aa !important;
    background: #fff7ed !important;
    color: #c2410c !important;
  }

  .pipeline-professional-ui [data-pipeline-card="true"] [class*="rounded-full"] {
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .pipeline-mobile-dock {
    position: fixed;
    right: 12px;
    bottom: max(12px, env(safe-area-inset-bottom));
    left: 12px;
    z-index: 60;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) 48px;
    gap: 8px;
    padding: 8px;
    border: 1px solid rgba(226, 232, 240, 0.9);
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 20px 55px rgba(15, 23, 42, 0.2);
    backdrop-filter: blur(18px);
  }

  .pipeline-mobile-dock > button {
    display: flex;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    background: #f1f5f9;
    color: #334155;
  }

  .pipeline-mobile-dock > button:disabled {
    opacity: 0.35;
  }

  .pipeline-mobile-dock .pipeline-mobile-stage {
    justify-content: flex-start;
    gap: 10px;
    padding: 7px 13px;
    background: #0f172a;
    color: #ffffff;
    text-align: left;
  }

  .pipeline-mobile-stage span {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .pipeline-mobile-stage small {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .pipeline-mobile-stage strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 1023px) {
    .pipeline-professional-ui .premium-canvas {
      padding: 18px 12px 108px !important;
    }

    .pipeline-professional-ui .premium-title {
      font-size: 32px !important;
      line-height: 1.05 !important;
    }

    .pipeline-professional-ui [data-pipeline-scroller="true"] {
      margin-right: -12px;
      margin-left: -12px;
      padding-right: 12px;
      padding-left: 12px;
      scroll-snap-type: x mandatory;
    }

    .pipeline-professional-ui [data-pipeline-board="true"] {
      display: flex !important;
      width: max-content;
      min-width: 0 !important;
      gap: 12px !important;
      padding-bottom: 18px;
    }

    .pipeline-professional-ui [data-pipeline-column] {
      width: calc(100vw - 32px) !important;
      min-width: calc(100vw - 32px) !important;
      max-width: 390px;
      min-height: 520px !important;
      scroll-snap-align: start;
      scroll-snap-stop: always;
    }

    .pipeline-professional-ui [data-pipeline-card="true"] {
      padding: 16px !important;
      border-radius: 20px !important;
    }

    .pipeline-professional-ui [data-pipeline-card="true"] button[data-pipeline-action] {
      min-height: 44px;
      font-size: 12px !important;
    }

    .pipeline-professional-ui section.grid.md\\:grid-cols-5 {
      display: flex !important;
      overflow-x: auto;
      gap: 10px;
      padding-bottom: 4px;
      scrollbar-width: none;
    }

    .pipeline-professional-ui section.grid.md\\:grid-cols-5 > * {
      min-width: 136px;
    }
  }
`;
