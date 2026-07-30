import Link from 'next/link';
import type { PortalSettings } from '@/lib/portalSettings';
import { INTERNAL_SYSTEM_URL } from '@/lib/publicRoutes';

function digits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

export function PublicPortalFooter({ settings }: { settings: PortalSettings }) {
  const whatsapp = digits(settings.whatsapp_number);
  const phone = digits(settings.phone);

  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-black text-slate-950">{settings.brand_name}</p>
          <p className="mt-1 text-xs text-slate-500">{settings.brand_tagline} com atendimento integrado às lojas parceiras.</p>
          {settings.address_text ? <p className="mt-2 text-xs font-semibold text-slate-500">{settings.address_text}</p> : null}
        </div>

        <div className="flex flex-wrap gap-3 text-xs font-black">
          <Link href="/veiculos" className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700">Veículos</Link>
          <Link href="/lojas" className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700">Lojas</Link>
          {whatsapp ? <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">WhatsApp</a> : null}
          {phone ? <a href={`tel:${phone}`} className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700">{settings.phone}</a> : null}
          {settings.email ? <a href={`mailto:${settings.email}`} className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700">E-mail</a> : null}
          {settings.instagram_url ? <a href={settings.instagram_url} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700">Instagram</a> : null}
          <a href={INTERNAL_SYSTEM_URL} className="rounded-xl bg-slate-950 px-3 py-2 text-white">Acesso operacional</a>
        </div>
      </div>
    </footer>
  );
}
