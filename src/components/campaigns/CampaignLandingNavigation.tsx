'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Device } from './CampaignVisualEditorModel';
import { navigationDefaults, type LandingNavigationSettings, type LandingView } from './CampaignLandingSectionModel';

type Props = {
  settings?: Partial<LandingNavigationSettings>;
  active?: LandingView;
  onNavigate?: (view: LandingView) => void;
  preview?: boolean;
  device?: Device;
};

export function CampaignLandingNavigation({ settings, active = 'home', onNavigate, preview = false, device }: Props) {
  const cfg: LandingNavigationSettings = { ...navigationDefaults, ...(settings || {}), items: settings?.items || navigationDefaults.items };
  const [mobileOpen, setMobileOpen] = useState(false);
  const forcedMobile = device === 'mobile';
  const forcedDesktop = device === 'desktop' || device === 'tablet';
  const visibleItems = cfg.items.filter((item) => item.visible !== false);

  function choose(view: LandingView) {
    onNavigate?.(view);
    setMobileOpen(false);
  }

  const menu = <div
    className="flex items-stretch justify-center overflow-hidden border shadow-xl backdrop-blur-xl"
    style={{
      width: `min(100%, ${cfg.width}px)`, minHeight: cfg.height, borderRadius: cfg.radius,
      backgroundColor: cfg.backgroundColor, borderColor: cfg.borderColor, color: cfg.textColor
    }}
  >
    {visibleItems.map((item, index) => {
      const selected = active === item.id;
      return <button key={item.id} type="button" onClick={() => choose(item.id)}
        className="min-w-0 flex-1 px-4 transition hover:brightness-110"
        style={{
          borderLeft: index ? `1px solid ${cfg.borderColor}` : undefined,
          backgroundColor: selected ? cfg.activeColor : 'transparent', color: selected ? cfg.activeTextColor : cfg.textColor,
          fontSize: cfg.fontSize, fontWeight: cfg.fontWeight, letterSpacing: cfg.letterSpacing
        }}>
        <span className="block truncate">{item.label}</span>
      </button>;
    })}
  </div>;

  const desktopClass = forcedMobile ? 'hidden' : forcedDesktop ? 'flex' : 'hidden md:flex';
  const mobileClass = forcedMobile ? 'block' : forcedDesktop ? 'hidden' : 'md:hidden';

  return <>
    <nav aria-label="Navegação da landing page" className={`${preview || !cfg.stickyDesktop ? 'relative' : 'sticky top-0'} z-[85] w-full border-b border-white/10 bg-[#071020]/95 px-3 py-2.5 backdrop-blur-xl`}>
      <div className={`${desktopClass} mx-auto max-w-[1480px] justify-center`}>{menu}</div>
      <div className={`${mobileClass} h-12`} />
    </nav>

    <div className={`${mobileClass} ${preview ? 'absolute' : 'fixed'} right-3 top-3 z-[120]`}>
      <button type="button" onClick={() => setMobileOpen((value) => !value)} aria-label="Abrir menu"
        className="flex h-12 w-12 items-center justify-center border shadow-2xl backdrop-blur-xl"
        style={{ backgroundColor: cfg.mobileButtonBackground, color: cfg.mobileButtonColor, borderColor: cfg.borderColor, borderRadius: Math.min(cfg.radius, 18) }}>
        <MoreHorizontal size={25} />
      </button>
      {mobileOpen ? <div className="absolute right-0 mt-2 w-56 overflow-hidden border shadow-2xl" style={{ backgroundColor: cfg.backgroundColor, borderColor: cfg.borderColor, borderRadius: Math.min(cfg.radius, 20) }}>
        {visibleItems.map((item) => <button key={item.id} type="button" onClick={() => choose(item.id)} className="block w-full border-b px-4 py-4 text-left last:border-b-0"
          style={{ borderColor: cfg.borderColor, backgroundColor: active === item.id ? cfg.activeColor : 'transparent', color: active === item.id ? cfg.activeTextColor : cfg.textColor, fontSize: cfg.fontSize, fontWeight: cfg.fontWeight, letterSpacing: cfg.letterSpacing }}>
          {item.label}
        </button>)}
      </div> : null}
    </div>
  </>;
}
