import type { ReactNode } from 'react';
import { PublicPortalFooter } from '@/components/marketplace/PublicPortalFooter';
import { PublicPortalHeader } from '@/components/marketplace/PublicPortalHeader';
import type { PortalSettings } from '@/lib/portalSettings';

type Section = {
  title: string;
  content: ReactNode;
};

export function PublicInformationPage({
  settings,
  eyebrow,
  title,
  description,
  sections
}: {
  settings: PortalSettings;
  eyebrow: string;
  title: string;
  description: string;
  sections: Section[];
}) {
  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <PublicPortalHeader settings={settings} />

      <section className="bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-400">{eyebrow}</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300 sm:text-lg">{description}</p>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto grid max-w-5xl gap-5">
          {sections.map((section) => (
            <article key={section.title} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-8">
              <h2 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{section.title}</h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 sm:text-base">{section.content}</div>
            </article>
          ))}
        </div>
      </section>

      <PublicPortalFooter settings={settings} />
    </main>
  );
}
