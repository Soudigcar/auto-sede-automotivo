import type { Metadata } from 'next';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { PublicPortalFooter } from '@/components/marketplace/PublicPortalFooter';
import { PublicPortalHeader } from '@/components/marketplace/PublicPortalHeader';
import { loadPortalSettings } from '@/lib/server/portalSettings';

const canonical = 'https://www.autosede.com.br/contato';

export const metadata: Metadata = {
  title: 'Contato | Auto Sede',
  description: 'Fale com o portal Auto Sede e consulte os canais oficiais de atendimento.',
  alternates: { canonical },
  robots: { index: true, follow: true }
};

function digits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

export default async function ContactPage() {
  const settings = await loadPortalSettings();
  const whatsapp = digits(settings.whatsapp_number);
  const phone = digits(settings.phone);

  const channels = [
    whatsapp ? { label: 'WhatsApp', value: settings.whatsapp_number, href: `https://wa.me/${whatsapp}`, icon: MessageCircle } : null,
    phone ? { label: 'Telefone', value: settings.phone, href: `tel:${phone}`, icon: Phone } : null,
    settings.email ? { label: 'E-mail', value: settings.email, href: `mailto:${settings.email}`, icon: Mail } : null,
    settings.address_text ? { label: 'Endereço', value: settings.address_text, href: '', icon: MapPin } : null
  ].filter(Boolean) as Array<{ label: string; value: string; href: string; icon: typeof Phone }>;

  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <PublicPortalHeader settings={settings} />
      <section className="bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-400">Canais oficiais</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">Fale com o {settings.brand_name}</h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300 sm:text-lg">Para informações sobre um veículo específico, utilize o botão de atendimento no próprio anúncio. Assim, seu contato será encaminhado à loja responsável.</p>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-5xl">
          {channels.length ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {channels.map((channel) => {
                const Icon = channel.icon;
                const content = (
                  <>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white"><Icon size={22} /></span>
                    <span className="mt-5 block text-xs font-black uppercase tracking-[0.18em] text-red-600">{channel.label}</span>
                    <span className="mt-2 block break-words text-lg font-black text-slate-950">{channel.value}</span>
                  </>
                );

                return channel.href ? (
                  <a key={channel.label} href={channel.href} target={channel.href.startsWith('http') ? '_blank' : undefined} rel={channel.href.startsWith('http') ? 'noreferrer' : undefined} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_12px_35px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-red-200">{content}</a>
                ) : (
                  <article key={channel.label} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">{content}</article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
              <h2 className="text-2xl font-black">Canais em atualização</h2>
              <p className="mt-3 text-sm text-slate-500">Os contatos oficiais serão publicados aqui pelo painel Master.</p>
            </div>
          )}

          <div className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm leading-relaxed text-amber-900">
            <strong>Segurança:</strong> não envie senha bancária, token, código de autenticação ou pagamento para suposta liberação de crédito. A aprovação e a contratação financeira são confirmadas diretamente com a instituição e a loja responsável.
          </div>
        </div>
      </section>
      <PublicPortalFooter settings={settings} />
    </main>
  );
}
