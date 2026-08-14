'use client';

import { ArrowLeft } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 1279px)';

type InboxNodes = {
  page: HTMLElement;
  canvas: HTMLElement;
  summary: HTMLElement | null;
  status: HTMLElement | null;
  inbox: HTMLElement;
  grid: HTMLElement;
  queue: HTMLElement;
  conversation: HTMLElement;
  mobileHeader: HTMLElement | null;
  portalChild: HTMLElement | null;
};

function findInboxNodes(): InboxNodes | null {
  const page = document.querySelector('.store-portal-child > .premium-page') as HTMLElement | null;
  if (!page) return null;

  const canvas = page.querySelector('.premium-canvas') as HTMLElement | null;
  if (!canvas) return null;

  const inbox = Array.from(canvas.querySelectorAll('section')).find((section) =>
    section.textContent?.includes('Fila de atendimento') && section.textContent?.includes('Conversas')
  ) as HTMLElement | undefined;
  if (!inbox) return null;

  const grid = inbox.firstElementChild as HTMLElement | null;
  if (!grid || grid.children.length < 2) return null;

  const queue = grid.children.item(0) as HTMLElement | null;
  const conversation = grid.children.item(1) as HTMLElement | null;
  if (!queue || !conversation) return null;

  const summary = canvas.firstElementChild as HTMLElement | null;
  const status = summary?.nextElementSibling instanceof HTMLElement && summary.nextElementSibling !== inbox
    ? summary.nextElementSibling as HTMLElement
    : null;

  return {
    page,
    canvas,
    summary,
    status,
    inbox,
    grid,
    queue,
    conversation,
    mobileHeader: document.querySelector('.store-mobile-header') as HTMLElement | null,
    portalChild: document.querySelector('.store-portal-child') as HTMLElement | null
  };
}

function resetNodeStyles(nodes: InboxNodes) {
  nodes.summary?.style.removeProperty('display');
  nodes.status?.style.removeProperty('display');
  nodes.queue.style.removeProperty('display');
  nodes.conversation.style.removeProperty('display');
  nodes.conversation.style.removeProperty('min-height');
  nodes.conversation.style.removeProperty('height');
  nodes.inbox.style.removeProperty('margin-top');
  nodes.inbox.style.removeProperty('border');
  nodes.inbox.style.removeProperty('border-radius');
  nodes.grid.style.removeProperty('min-height');
  nodes.mobileHeader?.style.removeProperty('display');
  nodes.portalChild?.style.removeProperty('padding');
  document.documentElement.style.removeProperty('scroll-behavior');
}

export function StoreWhatsappMobileConversationUX() {
  const pathname = usePathname() || '';
  const [chatOpen, setChatOpen] = useState(false);
  const isWhatsapp = /\/loja\/[^/]+\/whatsapp\/?$/.test(pathname);

  useEffect(() => {
    if (!isWhatsapp) {
      setChatOpen(false);
      return;
    }

    const media = window.matchMedia(MOBILE_QUERY);
    let nodes: InboxNodes | null = null;
    let observer: MutationObserver | null = null;
    let clickHandler: ((event: Event) => void) | null = null;

    const apply = () => {
      nodes = findInboxNodes();
      if (!nodes) return;

      resetNodeStyles(nodes);
      if (!media.matches) return;

      if (chatOpen) {
        if (nodes.summary) nodes.summary.style.display = 'none';
        if (nodes.status) nodes.status.style.display = 'none';
        nodes.queue.style.display = 'none';
        nodes.conversation.style.display = 'flex';
        nodes.conversation.style.minHeight = '100dvh';
        nodes.conversation.style.height = '100dvh';
        nodes.grid.style.minHeight = '100dvh';
        nodes.inbox.style.marginTop = '0';
        nodes.inbox.style.border = '0';
        nodes.inbox.style.borderRadius = '0';
        if (nodes.mobileHeader) nodes.mobileHeader.style.display = 'none';
        if (nodes.portalChild) nodes.portalChild.style.padding = '0';
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      } else {
        nodes.queue.style.display = 'flex';
        nodes.conversation.style.display = 'none';
      }
    };

    const bindQueue = () => {
      const current = findInboxNodes();
      if (!current) return false;
      nodes = current;
      clickHandler = (event: Event) => {
        if (!media.matches) return;
        const target = event.target as HTMLElement | null;
        const button = target?.closest('button');
        if (!button || !current.queue.contains(button)) return;
        window.setTimeout(() => setChatOpen(true), 0);
      };
      current.queue.addEventListener('click', clickHandler);
      return true;
    };

    const start = () => {
      apply();
      if (!bindQueue()) {
        observer = new MutationObserver(() => {
          if (bindQueue()) {
            observer?.disconnect();
            observer = null;
            apply();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };

    const onBreakpointChange = () => {
      if (!media.matches) setChatOpen(false);
      window.setTimeout(apply, 0);
    };

    start();
    media.addEventListener('change', onBreakpointChange);

    return () => {
      observer?.disconnect();
      media.removeEventListener('change', onBreakpointChange);
      if (nodes && clickHandler) nodes.queue.removeEventListener('click', clickHandler);
      if (nodes) resetNodeStyles(nodes);
    };
  }, [chatOpen, isWhatsapp, pathname]);

  if (!isWhatsapp || !chatOpen) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setChatOpen(false);
        window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }), 0);
      }}
      className="fixed left-3 top-3 z-[500] inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white/95 px-3 text-xs font-black text-zinc-700 shadow-lg backdrop-blur xl:hidden"
      aria-label="Voltar para conversas"
    >
      <ArrowLeft size={17} />
      Conversas
    </button>
  );
}
