'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, Plug, ShieldCheck, Webhook } from 'lucide-react';

const integrationSections = [
  {
    href: '/master/integrations',
    label: 'Central de Integrações',
    description: 'Meta, Pixel e conexões técnicas',
    icon: Plug
  },
  {
    href: '/master/integrations/umbler-talk',
    label: 'Umbler Talk',
    description: 'Webhook de leads com rodízio',
    icon: Webhook
  },
  {
    href: '/master/integrations/whatsapp',
    label: 'WhatsApp Oficial',
    description: 'Configuração da API oficial',
    icon: MessageCircle
  }
];

export default function MasterIntegrationsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/master/integrations') return;

    const insertShortcut = () => {
      const forms = Array.from(document.querySelectorAll('form'));
      const metaForm = forms.find((form) => form.textContent?.includes('Facebook Lead Forms'));
      if (!metaForm || metaForm.querySelector('[data-meta-form-mappings-link]')) return Boolean(metaForm);

      const saveButton = Array.from(metaForm.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Salvar Facebook Lead Forms')
      );
      if (!saveButton?.parentElement) return false;

      const link = document.createElement('a');
      link.href = '/master/integrations/meta-lead-forms';
      link.dataset.metaFormMappingsLink = 'true';
      link.className = 'premium-button-secondary justify-center';
      link.textContent = 'Gerenciar formulários por evento';
      saveButton.insertAdjacentElement('afterend', link);
      return true;
    };

    if (insertShortcut()) return;
    const observer = new MutationObserver(() => {
      if (insertShortcut()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <>
      <div className="border-b border-white/10 bg-[#071020] px-4 py-3 text-white md:px-7">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-sm font-black">Central de Integrações Master</p>
              <p className="text-xs text-zinc-500">Todas as conexões externas ficam organizadas neste ambiente.</p>
            </div>
          </div>

          <nav className="grid gap-2 md:grid-cols-3">
            {integrationSections.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:border-red-500/40 hover:bg-red-600/10"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-400 transition group-hover:text-red-400">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black text-white">{item.label}</span>
                    <span className="block truncate text-[10px] font-bold text-zinc-500">{item.description}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {children}
    </>
  );
}
