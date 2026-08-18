'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PRIVACY_CONSENT_EVENT, readPrivacyConsent, savePrivacyConsent } from '@/lib/privacyConsent';

function isPublicRoute(pathname: string) {
  return pathname === '/' || /^\/(veiculos|lojas|cadastre-sua-loja|campanha|sobre|contato|privacidade|termos)(?:\/|$)/.test(pathname);
}

export function PrivacyConsentCenter() {
  const pathname = usePathname() || '';
  const active = isPublicRoute(pathname);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [optional, setOptional] = useState(false);

  useEffect(() => {
    if (!active) return;
    const current = readPrivacyConsent();
    setOptional(current?.advertising === true);
    setOpen(!current);
    setReady(true);
  }, [active]);

  function decide(value: boolean) {
    setOptional(value);
    savePrivacyConsent(value);
    setOpen(false);
  }

  if (!active || !ready) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 left-3 z-[190] rounded-full border border-zinc-300 bg-white px-3 py-2 text-[11px] font-black text-zinc-700 shadow-lg"
      >
        Privacidade
      </button>

      {open ? (
        <div className="fixed inset-x-3 bottom-3 z-[200] mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-800 shadow-2xl sm:bottom-5 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="privacy-consent-title">
          <h2 id="privacy-consent-title" className="text-base font-black text-zinc-950">Suas preferências de privacidade</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Recursos essenciais ficam ativos para segurança e funcionamento. Publicidade e medição opcional só são carregadas com sua autorização.
          </p>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-bold">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-red-600" checked={optional} onChange={(event) => setOptional(event.target.checked)} />
            <span>Permitir publicidade e medição opcional, incluindo Meta Pixel.</span>
          </label>
          <p className="mt-3 text-xs text-zinc-500">
            Você pode alterar esta escolha a qualquer momento. Consulte a <Link href="/privacidade" className="font-black text-red-600 underline">Política de Privacidade</Link>.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-black" onClick={() => decide(false)}>Recusar opcionais</button>
            <button type="button" className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-black text-white" onClick={() => decide(optional)}>Salvar preferência</button>
            <button type="button" className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white" onClick={() => decide(true)}>Aceitar opcionais</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

declare global {
  interface WindowEventMap {
    [PRIVACY_CONSENT_EVENT]: CustomEvent;
  }
}
