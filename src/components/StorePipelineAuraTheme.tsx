'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CalendarDays, MessageCircle, Monitor, Moon, Plus, Search, Settings2, Sparkles, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';

type Theme = 'dark' | 'light';

function isStorePipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function clickButton(label: string) {
  const target = normalize(label);
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((item) => {
    return normalize(String(item.textContent || '').replace(/\s+/g, ' ').trim()).includes(target);
  });
  button?.click();
}

function clickLink(label: string) {
  const target = normalize(label);
  const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find((item) => {
    return normalize(String(item.textContent || '').replace(/\s+/g, ' ').trim()).includes(target);
  });
  link?.click();
}

export function StorePipelineAuraTheme() {
  const pathname = usePathname() || '';
  const active = isStorePipeline(pathname);
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');
  const [query, setQuery] = useState('');
  const [auraOpen, setAuraOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = window.localStorage.getItem('store-pipeline-theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  useEffect(() => {
    if (!active) return;
    document.documentElement.dataset.pipelineTheme = theme;
    window.localStorage.setItem('store-pipeline-theme', theme);
    return () => {
      delete document.documentElement.dataset.pipelineTheme;
    };
  }, [active, theme]);

  useEffect(() => {
    if (!active) return;

    const decorate = () => {
      document.body.classList.add('pipeline-aura-active');

      const portalShell = Array.from(document.querySelectorAll<HTMLElement>('section.premium-shell')).find((shell) => {
        return Boolean(shell.querySelector(':scope > aside') && shell.querySelector('.store-portal-child'));
      });
      portalShell?.classList.add('pipeline-aura-portal-shell');

      const portalSidebar = portalShell?.querySelector<HTMLElement>(':scope > aside');
      portalSidebar?.classList.add('pipeline-aura-sidebar');

      const portalCanvas = portalShell?.querySelector<HTMLElement>(':scope > .premium-canvas');
      portalCanvas?.classList.add('pipeline-aura-portal-canvas');
      portalCanvas?.querySelector<HTMLElement>(':scope > header')?.classList.add('pipeline-aura-mobile-native-header');

      const pageMain = Array.from(document.querySelectorAll<HTMLElement>('main')).find((item) => {
        return item.querySelector('h1')?.textContent?.includes('Pipeline da Loja');
      });
      pageMain?.classList.add('pipeline-aura-page');

      const canvas = pageMain?.querySelector<HTMLElement>('.premium-canvas') || pageMain?.querySelector<HTMLElement>(':scope > section > div');
      canvas?.classList.add('pipeline-aura-canvas');

      const header = pageMain
        ? Array.from(pageMain.querySelectorAll<HTMLElement>('header')).find((item) => item.querySelector('h1')?.textContent?.includes('Pipeline da Loja'))
        : null;
      header?.classList.add('pipeline-aura-hero');

      const nativeActions = header
        ? Array.from(header.querySelectorAll<HTMLElement>('div')).find((item) => {
            const label = normalize(item.textContent || '');
            return label.includes('calendario') && label.includes('atualizar pipeline');
          })
        : null;
      nativeActions?.classList.add('pipeline-aura-native-actions');

      const kpiSection = pageMain
        ? Array.from(pageMain.querySelectorAll<HTMLElement>('section')).find((section) => section.querySelectorAll(':scope > .premium-card').length === 5)
        : null;
      kpiSection?.classList.add('pipeline-aura-kpis');

      const board = Array.from(document.querySelectorAll<HTMLElement>('div.grid')).find((element) => {
        return element.className.includes('grid-cols-8') && element.children.length >= 6;
      });
      board?.classList.add('pipeline-aura-board');
      board?.parentElement?.classList.add('pipeline-aura-board-scroll');

      document.querySelectorAll<HTMLElement>('[data-lead-id]').forEach((card) => card.classList.add('pipeline-aura-lead-card'));
    };

    decorate();
    window.addEventListener('pipeline-dom-sync', decorate);

    return () => {
      window.removeEventListener('pipeline-dom-sync', decorate);
      document.body.classList.remove('pipeline-aura-active');
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const term = normalize(query.trim());
    document.querySelectorAll<HTMLElement>('[data-lead-id]').forEach((card) => {
      const haystack = normalize(card.textContent || '');
      card.style.display = !term || haystack.includes(term) ? '' : 'none';
    });
  }, [active, query]);

  const themeLabel = useMemo(() => theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro', [theme]);

  if (!active || !mounted) return null;

  return createPortal(
    <>
      <style>{styles}</style>

      <header className="aura-topbar">
        <label className="aura-search">
          <Search size={20} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar leads, clientes, veículos..." />
          <span>⌘ K</span>
        </label>

        <div className="aura-top-actions">
          <button type="button" aria-label="Notificações"><Bell size={20} /><i /></button>
          <button type="button" aria-label="Abrir calendário" onClick={() => clickLink('calendário')}><CalendarDays size={20} /></button>
          <button type="button" aria-label={themeLabel} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button type="button" aria-label="Visualização em tela" className="aura-monitor"><Monitor size={20} /></button>
          <button type="button" className="aura-profile" onClick={() => setAuraOpen((value) => !value)}>
            <span className="aura-orb"><Sparkles size={18} /></span>
            <span><strong>AUTOCAR</strong><small>Assistente comercial</small></span>
            <span className="aura-face">••</span>
          </button>
        </div>
      </header>

      <div className="aura-hero-actions">
        <button type="button" className="aura-secondary" onClick={() => clickLink('calendário')}><CalendarDays size={18} /> Calendário</button>
        <button type="button" className="aura-primary" onClick={() => clickButton('adicionar lead')}><Plus size={19} /> Novo Lead</button>
        <button type="button" className="aura-customize"><Settings2 size={17} /> Personalizar pipeline</button>
      </div>

      <footer className="aura-bottom-dock">
        <div className="aura-sync"><span>Última atualização: agora há pouco</span><i /> Sincronizado com o servidor</div>
        <div className="aura-bottom-actions">
          <button type="button" className="aura-report"><Monitor size={17} /> Relatório do dia</button>
          <button type="button" className="aura-assistant" onClick={() => setAuraOpen((value) => !value)}><MessageCircle size={18} /> AUTOCAR</button>
        </div>
      </footer>

      {auraOpen ? (
        <aside className="aura-panel">
          <button type="button" onClick={() => setAuraOpen(false)} aria-label="Fechar">×</button>
          <span className="aura-panel-orb"><Sparkles size={24} /></span>
          <p>AUTOCAR</p>
          <h3>Assistente comercial</h3>
          <small>A AUTOCAR apoia o atendimento comercial da loja conforme as permissões e o modo definidos pelo Master.</small>
        </aside>
      ) : null}
    </>,
    document.body
  );
}

const styles = `
  :root[data-pipeline-theme='dark'] {
    --aura-bg: #080b10;
    --aura-surface: #11151c;
    --aura-surface-2: #171c24;
    --aura-card: #1b2029;
    --aura-border: rgba(148, 163, 184, .18);
    --aura-text: #f8fafc;
    --aura-muted: #9ca3af;
    --aura-soft: #cbd5e1;
    --aura-shadow: rgba(0, 0, 0, .38);
  }
  :root[data-pipeline-theme='light'] {
    --aura-bg: #edf1f6;
    --aura-surface: #ffffff;
    --aura-surface-2: #f5f7fa;
    --aura-card: #ffffff;
    --aura-border: rgba(15, 23, 42, .13);
    --aura-text: #111827;
    --aura-muted: #64748b;
    --aura-soft: #334155;
    --aura-shadow: rgba(15, 23, 42, .12);
  }

  body.pipeline-aura-active { background: var(--aura-bg) !important; color: var(--aura-text) !important; }
  body.pipeline-aura-active .pipeline-aura-portal-shell { background: var(--aura-bg) !important; }
  body.pipeline-aura-active .pipeline-aura-sidebar {
    position: sticky !important;
    top: 0 !important;
    z-index: 115 !important;
    display: none;
    height: 100vh;
    border-right: 1px solid rgba(148,163,184,.15);
    box-shadow: 18px 0 44px rgba(0,0,0,.18);
  }
  body.pipeline-aura-active .pipeline-aura-portal-canvas { background: var(--aura-bg) !important; }
  body.pipeline-aura-active .premium-shell { background: var(--aura-bg) !important; }
  body.pipeline-aura-active .store-portal-child { padding: 0 !important; }
  body.pipeline-aura-active .pipeline-aura-page { min-height: 100vh !important; background: var(--aura-bg) !important; color: var(--aura-text) !important; }
  body.pipeline-aura-active .pipeline-aura-canvas { padding: 104px 16px 98px !important; background: var(--aura-bg) !important; }
  body.pipeline-aura-active .pipeline-aura-canvas > * { max-width: 1600px; margin-left: auto; margin-right: auto; }

  .aura-topbar {
    position: fixed; inset: 0 0 auto 0; z-index: 110;
    display: flex; min-height: 80px; align-items: center; justify-content: space-between; gap: 20px;
    border-bottom: 1px solid var(--aura-border); background: color-mix(in srgb, var(--aura-bg) 92%, transparent);
    padding: 12px 28px; color: var(--aura-text); backdrop-filter: blur(18px);
  }
  .aura-search { display: flex; width: min(420px, 42vw); height: 50px; align-items: center; gap: 12px; border: 1px solid var(--aura-border); border-radius: 14px; background: var(--aura-surface); padding: 0 15px; color: var(--aura-muted); box-shadow: 0 12px 34px var(--aura-shadow); }
  .aura-search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--aura-text); font-size: 14px; font-weight: 650; }
  .aura-search input::placeholder { color: var(--aura-muted); }
  .aura-search span { border-radius: 8px; background: var(--aura-surface-2); padding: 4px 7px; font-size: 10px; font-weight: 900; color: var(--aura-muted); }
  .aura-top-actions { display: flex; align-items: center; gap: 10px; }
  .aura-top-actions > button:not(.aura-profile) { position: relative; display: flex; width: 42px; height: 42px; align-items: center; justify-content: center; border: 0; border-radius: 13px; background: transparent; color: var(--aura-muted); }
  .aura-top-actions > button:hover { background: var(--aura-surface-2); color: var(--aura-text); }
  .aura-top-actions button i { position: absolute; right: 8px; top: 8px; width: 7px; height: 7px; border-radius: 50%; background: #ef2d34; box-shadow: 0 0 0 3px var(--aura-bg); }
  .aura-profile { display: flex; align-items: center; gap: 11px; border: 0; background: transparent; color: var(--aura-text); padding: 4px; }
  .aura-profile > span:nth-child(2) { display: grid; text-align: left; }
  .aura-profile strong { font-size: 13px; }
  .aura-profile small { margin-top: 2px; color: var(--aura-muted); font-size: 10px; }
  .aura-orb, .aura-face { display: flex; width: 43px; height: 43px; align-items: center; justify-content: center; border: 1px solid rgba(239,45,52,.7); border-radius: 50%; background: radial-gradient(circle at 35% 30%, #555d68, #11151c 60%); color: white; box-shadow: 0 0 22px rgba(239,45,52,.28); }
  .aura-face { font-size: 17px; letter-spacing: 2px; background: #11151c; }

  body.pipeline-aura-active .pipeline-aura-hero {
    position: relative;
    min-height: 190px;
    align-items: flex-start !important;
    border: 1px solid var(--aura-border);
    border-radius: 22px;
    background: radial-gradient(circle at 75% 15%, rgba(239,45,52,.08), transparent 34%), var(--aura-surface);
    padding: 30px 430px 24px 30px !important;
    box-shadow: 0 18px 55px var(--aura-shadow);
  }
  body.pipeline-aura-active .pipeline-aura-hero > div:first-child { max-width: 650px; }
  body.pipeline-aura-active .pipeline-aura-hero .premium-eyebrow { color: #ef2d34 !important; letter-spacing: .22em !important; text-transform: uppercase; }
  body.pipeline-aura-active .pipeline-aura-hero h1 { color: var(--aura-text) !important; font-size: clamp(38px, 5vw, 58px) !important; letter-spacing: -.045em !important; }
  body.pipeline-aura-active .pipeline-aura-hero p { color: var(--aura-muted) !important; }
  body.pipeline-aura-active .pipeline-aura-native-actions { display: none !important; }

  .aura-hero-actions {
    position: absolute;
    z-index: 99;
    right: 32px;
    top: 108px;
    display: grid;
    grid-template-columns: auto auto;
    gap: 12px;
  }
  .aura-hero-actions button { display: inline-flex; min-height: 50px; align-items: center; justify-content: center; gap: 9px; border-radius: 13px; padding: 0 20px; font-size: 13px; font-weight: 900; }
  .aura-secondary, .aura-customize { border: 1px solid var(--aura-border); background: var(--aura-surface-2); color: var(--aura-soft); }
  .aura-primary { border: 1px solid #ef2d34; background: #ef2d34; color: white; box-shadow: 0 14px 30px rgba(239,45,52,.24); }
  .aura-customize { grid-column: 2; }

  body.pipeline-aura-active .pipeline-aura-kpis { grid-template-columns: repeat(5, minmax(170px, 1fr)) !important; gap: 12px !important; }
  body.pipeline-aura-active .pipeline-aura-kpis .premium-card { min-height: 110px; border: 1px solid var(--aura-border) !important; border-radius: 14px !important; background: linear-gradient(145deg, var(--aura-surface), var(--aura-surface-2)) !important; color: var(--aura-text) !important; padding: 18px !important; box-shadow: 0 14px 34px var(--aura-shadow) !important; }
  body.pipeline-aura-active .pipeline-aura-kpis p { color: var(--aura-muted) !important; }
  body.pipeline-aura-active .pipeline-aura-kpis strong { color: var(--aura-text) !important; font-size: 27px !important; }

  body.pipeline-aura-active .pipeline-aura-board-scroll { margin-top: 20px !important; overflow-x: auto !important; padding-bottom: 16px !important; }
  body.pipeline-aura-active .pipeline-aura-board { display: flex !important; min-width: max-content !important; grid-template-columns: none !important; gap: 10px !important; }
  body.pipeline-aura-active .pipeline-aura-board > div { width: 250px !important; min-height: 490px !important; flex: 0 0 250px !important; border: 1px solid var(--aura-border) !important; border-radius: 14px !important; background: color-mix(in srgb, var(--aura-surface) 90%, transparent) !important; padding: 10px !important; box-shadow: 0 14px 38px var(--aura-shadow) !important; }
  body.pipeline-aura-active .pipeline-aura-board > div > div:first-child { position: sticky; top: 0; z-index: 2; margin-bottom: 10px !important; border-color: var(--aura-border) !important; border-radius: 11px !important; background: var(--aura-surface-2) !important; padding: 11px 10px !important; }
  body.pipeline-aura-active .pipeline-aura-board h2 { font-size: 13px !important; }
  body.pipeline-aura-active .pipeline-aura-board > div > div:nth-child(2) > div:only-child { border-color: var(--aura-border) !important; background: transparent !important; color: var(--aura-muted) !important; }

  body.pipeline-aura-active .pipeline-aura-lead-card { border: 1px solid var(--aura-border) !important; border-radius: 12px !important; background: linear-gradient(145deg, var(--aura-card), var(--aura-surface-2)) !important; color: var(--aura-text) !important; padding: 13px !important; box-shadow: 0 10px 28px var(--aura-shadow) !important; }
  body.pipeline-aura-active .pipeline-aura-lead-card h3 { color: var(--aura-text) !important; }
  body.pipeline-aura-active .pipeline-aura-lead-card p { color: var(--aura-muted) !important; }
  body.pipeline-aura-active .pipeline-aura-lead-card > div:first-child > span { display: none !important; }
  body.pipeline-aura-active .pipeline-aura-lead-card button { border-color: var(--aura-border) !important; }

  .aura-bottom-dock { position: fixed; inset: auto 16px 16px 16px; z-index: 98; display: flex; align-items: center; justify-content: space-between; gap: 20px; pointer-events: none; }
  .aura-sync, .aura-bottom-actions { pointer-events: auto; }
  .aura-sync { display: flex; align-items: center; gap: 9px; border: 1px solid var(--aura-border); border-radius: 12px; background: color-mix(in srgb, var(--aura-surface) 92%, transparent); padding: 12px 16px; color: var(--aura-muted); font-size: 10px; backdrop-filter: blur(14px); }
  .aura-sync i { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 12px rgba(34,197,94,.7); }
  .aura-bottom-actions { display: flex; gap: 12px; }
  .aura-bottom-actions button { display: inline-flex; min-height: 46px; align-items: center; gap: 8px; border-radius: 14px; padding: 0 22px; font-size: 12px; font-weight: 900; }
  .aura-report { border: 1px solid var(--aura-border); background: var(--aura-surface); color: var(--aura-soft); }
  .aura-assistant { border: 1px solid #ef2d34; background: #ef2d34; color: white; min-width: 150px; justify-content: center; box-shadow: 0 14px 34px rgba(239,45,52,.28); }

  .aura-panel { position: fixed; right: 24px; bottom: 82px; z-index: 130; width: 310px; border: 1px solid var(--aura-border); border-radius: 20px; background: var(--aura-surface); padding: 24px; color: var(--aura-text); box-shadow: 0 24px 70px var(--aura-shadow); }
  .aura-panel > button { position: absolute; right: 13px; top: 10px; border: 0; background: transparent; color: var(--aura-muted); font-size: 24px; }
  .aura-panel-orb { display: flex; width: 54px; height: 54px; align-items: center; justify-content: center; border-radius: 50%; background: radial-gradient(circle, #ef4444, #151922 68%); color: white; box-shadow: 0 0 32px rgba(239,45,52,.35); }
  .aura-panel p { margin-top: 16px; color: #ef2d34; font-size: 11px; font-weight: 900; letter-spacing: .2em; }
  .aura-panel h3 { margin-top: 4px; font-size: 22px; }
  .aura-panel small { display: block; margin-top: 10px; color: var(--aura-muted); line-height: 1.6; }

  body.pipeline-aura-active .pipeline-add-lead-button { display: none !important; }

  @media (min-width: 1024px) {
    body.pipeline-aura-active .pipeline-aura-sidebar { display: flex !important; }
    .aura-topbar { left: 18rem; }
    .aura-bottom-dock { left: calc(18rem + 16px); }
  }

  @media (max-width: 1279px) {
    body.pipeline-aura-active .pipeline-aura-hero { padding-right: 350px !important; }
    .aura-hero-actions { right: 22px; }
  }

  @media (max-width: 1023px) {
    .aura-topbar { padding: 10px 14px; }
    .aura-search { width: min(380px, 58vw); }
    .aura-profile > span:nth-child(2), .aura-face, .aura-monitor { display: none !important; }
    .aura-hero-actions { top: 166px; right: 16px; }
    body.pipeline-aura-active .pipeline-aura-mobile-native-header { top: 80px !important; z-index: 90 !important; }
    body.pipeline-aura-active .pipeline-aura-canvas { padding-top: 94px !important; }
    body.pipeline-aura-active .pipeline-aura-hero { min-height: 220px; padding: 28px 330px 24px 24px !important; }
    body.pipeline-aura-active .pipeline-aura-kpis { grid-template-columns: repeat(2, minmax(150px, 1fr)) !important; }
  }

  @media (max-width: 760px) {
    .aura-hero-actions { position: static; margin: -78px 14px 22px; grid-template-columns: 1fr 1fr; }
    .aura-customize { grid-column: 1 / -1; }
    body.pipeline-aura-active .pipeline-aura-hero { min-height: 170px; padding: 24px 20px !important; }
  }

  @media (max-width: 640px) {
    .aura-topbar { min-height: 70px; }
    .aura-search { width: 100%; }
    .aura-search span, .aura-top-actions > button:not(:last-child), .aura-orb { display: none !important; }
    .aura-top-actions { flex: none; }
    .aura-profile { padding: 0; }
    .aura-face { display: flex !important; width: 40px; height: 40px; }
    body.pipeline-aura-active .pipeline-aura-mobile-native-header { top: 70px !important; }
    .aura-hero-actions { margin-top: -66px; }
    .aura-hero-actions button { min-height: 44px; padding: 0 10px; font-size: 11px; }
    .aura-customize { display: none !important; }
    body.pipeline-aura-active .pipeline-aura-canvas { padding: 84px 10px 112px !important; }
    body.pipeline-aura-active .pipeline-aura-hero { min-height: 150px; }
    body.pipeline-aura-active .pipeline-aura-hero h1 { font-size: 34px !important; }
    body.pipeline-aura-active .pipeline-aura-kpis { display: flex !important; overflow-x: auto; }
    body.pipeline-aura-active .pipeline-aura-kpis .premium-card { min-width: 160px; }
    body.pipeline-aura-active .pipeline-aura-board > div { width: min(84vw, 285px) !important; flex-basis: min(84vw, 285px) !important; }
    .aura-bottom-dock { align-items: flex-end; }
    .aura-sync { display: none; }
    .aura-bottom-actions { width: 100%; }
    .aura-bottom-actions button { flex: 1; justify-content: center; padding: 0 12px; }
    .aura-panel { right: 12px; bottom: 78px; width: calc(100vw - 24px); }
  }
`;
