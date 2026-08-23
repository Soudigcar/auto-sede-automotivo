'use client';

import { useCallback } from 'react';

type CampaignLandingNavigationProps = {
  primaryColor?: string;
  homeSelector?: string;
  vehiclesSelector?: string;
  simulationSelector?: string;
  preview?: boolean;
};

type NavigationItem = {
  label: string;
  selector?: string;
  home?: boolean;
};

export function CampaignLandingNavigation({
  primaryColor = '#DC2626',
  homeSelector,
  vehiclesSelector = '#editor-vehicles, #veiculos',
  simulationSelector = '#editor-inline-simulator, #simulacao',
  preview = false
}: CampaignLandingNavigationProps) {
  const navigate = useCallback((item: NavigationItem) => {
    if (item.home && !homeSelector) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const selector = item.home ? homeSelector : item.selector;
    if (!selector) return;

    const target = document.querySelector<HTMLElement>(selector);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  }, [homeSelector]);

  const items: NavigationItem[] = [
    { label: 'INÍCIO', home: true },
    { label: 'VEÍCULOS', selector: vehiclesSelector },
    { label: 'SIMULAÇÃO', selector: simulationSelector }
  ];

  return (
    <nav
      aria-label="Navegação da landing page"
      className={`${preview ? 'relative' : 'sticky top-0'} z-[85] w-full border-b border-white/10 bg-[#071020]/95 text-white shadow-xl backdrop-blur-xl`}
    >
      <div className="mx-auto flex min-h-14 max-w-[1480px] items-center justify-center px-3 sm:min-h-16 sm:px-6">
        <div className="flex w-full max-w-xl items-center justify-center divide-x divide-white/20 overflow-hidden rounded-full border border-white/15 bg-white/5 p-1">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => navigate(item)}
              className="group relative min-h-10 min-w-0 flex-1 px-2 text-[10px] font-black tracking-[0.08em] text-white transition hover:bg-white/10 sm:px-5 sm:text-xs sm:tracking-[0.18em]"
            >
              <span className="block truncate">{item.label}</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-5 bottom-1 h-0.5 origin-center scale-x-0 rounded-full transition-transform group-hover:scale-x-100"
                style={{ backgroundColor: primaryColor }}
              />
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
