'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const PIPELINE_PATH = /^\/loja\/[^/]+\/pipeline\/?$/;

type Diagnostic = {
  viewport: number;
  scrollY: number;
  documentHeight: number;
  bodyHeight: number;
  shellBottom: number | null;
  pageBottom: number | null;
  childBottom: number | null;
  overflow: Array<{ label: string; position: string; top: number; bottom: number; height: number }>;
};

function safeLabel(element: Element) {
  const node = element as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const id = node.id ? `#${node.id}` : '';
  const classes = typeof node.className === 'string'
    ? node.className.split(/\s+/).filter(Boolean).slice(0, 4).map((name) => `.${name}`).join('')
    : '';
  return `${tag}${id}${classes}`.slice(0, 110);
}

function documentBottom(element: Element | null) {
  if (!element) return null;
  return Math.round(element.getBoundingClientRect().bottom + window.scrollY);
}

function measure(): Diagnostic {
  const root = document.documentElement;
  const body = document.body;
  const documentHeight = Math.max(root.scrollHeight, body.scrollHeight);
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('body *'))
    .flatMap((element) => {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') return [];
      const rect = element.getBoundingClientRect();
      if (!Number.isFinite(rect.bottom) || rect.height <= 0) return [];
      const bottom = Math.round(rect.bottom + window.scrollY);
      if (bottom < documentHeight - 8) return [];
      return [{
        label: safeLabel(element),
        position: style.position,
        top: Math.round(rect.top + window.scrollY),
        bottom,
        height: Math.round(rect.height)
      }];
    })
    .sort((left, right) => right.bottom - left.bottom || right.height - left.height)
    .slice(0, 8);

  return {
    viewport: window.innerHeight,
    scrollY: Math.round(window.scrollY),
    documentHeight,
    bodyHeight: body.scrollHeight,
    shellBottom: documentBottom(document.querySelector('.pipeline-aura-portal-shell')),
    pageBottom: documentBottom(document.querySelector('.pipeline-aura-page')),
    childBottom: documentBottom(document.querySelector('.store-pipeline-page')),
    overflow: candidates
  };
}

export function StorePipelineScrollDiagnostics() {
  const pathname = usePathname() || '';
  const active = PIPELINE_PATH.test(pathname);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined' || window.innerWidth < 1024) return;
    let timer = 0;
    const refresh = () => setDiagnostic(measure());
    const delayed = window.setTimeout(refresh, 900);
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 80);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', refresh);
    return () => {
      window.clearTimeout(delayed);
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', refresh);
    };
  }, [active]);

  if (!active || !diagnostic) return null;

  return (
    <aside className="pipeline-scroll-diagnostic" aria-label="Diagnóstico temporário de rolagem">
      <strong>DIAGNÓSTICO DE ROLAGEM</strong>
      <span>viewport: {diagnostic.viewport}px · scrollY: {diagnostic.scrollY}px</span>
      <span>documento: {diagnostic.documentHeight}px · body: {diagnostic.bodyHeight}px</span>
      <span>shell fim: {diagnostic.shellBottom ?? '—'} · página fim: {diagnostic.pageBottom ?? '—'} · conteúdo fim: {diagnostic.childBottom ?? '—'}</span>
      <b>Elementos no fim do documento:</b>
      {diagnostic.overflow.map((item, index) => (
        <code key={`${item.label}-${index}`}>{index + 1}. {item.label} · {item.position} · top {item.top} · bottom {item.bottom} · h {item.height}</code>
      ))}
      <button type="button" onClick={() => setDiagnostic(measure())}>Medir agora</button>
      <style jsx>{`
        .pipeline-scroll-diagnostic{position:fixed;z-index:2147483600;right:12px;bottom:12px;display:grid;width:min(560px,calc(100vw - 24px));max-height:52vh;overflow:auto;gap:5px;border:2px solid #ef4444;border-radius:12px;background:rgba(10,12,18,.96);padding:12px;color:#fff;box-shadow:0 16px 50px rgba(0,0,0,.45);font:700 11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace}.pipeline-scroll-diagnostic strong{color:#f87171;font-size:12px}.pipeline-scroll-diagnostic span{color:#e5e7eb}.pipeline-scroll-diagnostic b{margin-top:4px;color:#fbbf24}.pipeline-scroll-diagnostic code{display:block;overflow-wrap:anywhere;color:#bfdbfe;white-space:normal}.pipeline-scroll-diagnostic button{margin-top:4px;border:1px solid #ef4444;border-radius:8px;background:#ef4444;padding:7px 10px;color:#fff;font-weight:900}
      `}</style>
    </aside>
  );
}
