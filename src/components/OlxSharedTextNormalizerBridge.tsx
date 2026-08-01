'use client';

import { useEffect } from 'react';
import { extractCanonicalOlxUrl } from '@/lib/olxSharedUrl';

function isTextControl(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return ['text', 'url', 'search'].includes(target.type || 'text');
}

function isOlxLinkField(element: HTMLInputElement | HTMLTextAreaElement) {
  const descriptor = [
    element.name,
    element.id,
    element.placeholder,
    element.getAttribute('aria-label') || ''
  ].join(' ').toLowerCase();

  return /olx|link|url|an[uú]ncio/.test(descriptor);
}

function replaceControlValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (setter) setter.call(element, value);
  else element.value = value;

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function OlxSharedTextNormalizerBridge() {
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!isTextControl(event.target) || !isOlxLinkField(event.target)) return;

      const pastedText = event.clipboardData?.getData('text/plain') || '';
      const normalized = extractCanonicalOlxUrl(pastedText);
      if (!normalized) return;

      event.preventDefault();
      replaceControlValue(event.target, normalized);
    };

    const onFocusOut = (event: FocusEvent) => {
      if (!isTextControl(event.target) || !isOlxLinkField(event.target)) return;

      const normalized = extractCanonicalOlxUrl(event.target.value);
      if (!normalized || normalized === event.target.value) return;

      replaceControlValue(event.target, normalized);
    };

    document.addEventListener('paste', onPaste, true);
    document.addEventListener('focusout', onFocusOut, true);

    return () => {
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, []);

  return null;
}
