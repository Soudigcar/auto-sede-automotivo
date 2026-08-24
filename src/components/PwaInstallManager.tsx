'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstallManager() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isIos = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Falha silenciosa: o sistema web continua funcionando normalmente.
      });
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstallPrompt(null);
      setShowIosHelp(false);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (dismissed || isStandaloneMode()) return null;

  const canPromptInstall = Boolean(installPrompt);
  const shouldOfferIosHelp = isIos && !canPromptInstall;

  if (!canPromptInstall && !shouldOfferIosHelp) return null;

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
      setDismissed(true);
    }
  }

  return (
    <>
      <div className="fixed bottom-4 left-1/2 z-[100] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/15 bg-[#0B0F19]/95 p-3 text-white shadow-2xl backdrop-blur md:left-auto md:right-5 md:w-auto md:max-w-none md:translate-x-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600">
          <Download size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">Instalar Auto Controle</p>
          <p className="text-xs text-zinc-300">Abra o sistema como aplicativo.</p>
        </div>
        {canPromptInstall ? (
          <button
            type="button"
            onClick={install}
            className="rounded-xl bg-white px-3 py-2 text-xs font-black text-zinc-950 transition hover:bg-zinc-100"
          >
            Instalar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowIosHelp(true)}
            className="rounded-xl bg-white px-3 py-2 text-xs font-black text-zinc-950 transition hover:bg-zinc-100"
          >
            Como instalar
          </button>
        )}
        <button
          type="button"
          aria-label="Fechar aviso de instalação"
          onClick={() => setDismissed(true)}
          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      {showIosHelp ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
          <section className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0B0F19] p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600">
                <Share2 size={21} />
              </div>
              <button
                type="button"
                aria-label="Fechar instruções"
                onClick={() => setShowIosHelp(false)}
                className="rounded-xl p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <h2 className="mt-5 text-xl font-black">Instalar no iPhone ou iPad</h2>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-300">
              <li><strong className="text-white">1.</strong> Abra este endereço no Safari.</li>
              <li><strong className="text-white">2.</strong> Toque em <strong className="text-white">Compartilhar</strong>.</li>
              <li><strong className="text-white">3.</strong> Escolha <strong className="text-white">Adicionar à Tela de Início</strong>.</li>
              <li><strong className="text-white">4.</strong> Confirme para abrir o Auto Controle como app.</li>
            </ol>
          </section>
        </div>
      ) : null}
    </>
  );
}
