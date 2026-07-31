import type { Metadata } from 'next';
import { BadgeCheck, CalendarDays, ShieldCheck, Store } from 'lucide-react';
import { PublicPortalFooter } from '@/components/marketplace/PublicPortalFooter';
import { PublicPortalHeader } from '@/components/marketplace/PublicPortalHeader';
import { StorePortalApplicationForm } from '@/components/marketplace/StorePortalApplicationForm';
import { OFFICIAL_PORTAL_URL } from '@/lib/publicRoutes';
import { loadPortalSettings } from '@/lib/server/portalSettings';

export const metadata: Metadata = {
  title: 'Cadastre sua loja | Auto Sede',
  description: 'Solicite o cadastro permanente da sua revenda no Portal Auto Sede e receba convites para participar de eventos automotivos.',
  alternates: { canonical: `${OFFICIAL_PORTAL_URL}/cadastre-sua-loja` },
  openGraph: {
    title: 'Cadastre sua loja no Portal Auto Sede',
    description: 'Solicite a análise da sua revenda para fazer parte do portal e dos próximos eventos Auto Sede.',
    url: `${OFFICIAL_PORTAL_URL}/cadastre-sua-loja`,
    type: 'website',
    locale: 'pt_BR'
  }
};

export default async function StoreApplicationPage() {
  const settings = await loadPortalSettings();

  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <PublicPortalHeader settings={settings} />

      <section className="bg-slate-950 px-4 py-14 text-white sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto grid max-w-[1480px] gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-red-400">Rede de lojas parceiras</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-[-0.045em] sm:text-5xl lg:text-6xl">Cadastre sua revenda no Portal Auto Sede</h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300 sm:text-lg">O cadastro da loja é permanente e independente de campanhas. Depois da aprovação, sua revenda pode publicar estoque no portal e ser convidada para diferentes eventos sem criar uma nova conta.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <Benefit icon={<Store size={21} />} title="Perfil permanente" text="A loja continua no portal após o término de cada evento." />
            <Benefit icon={<CalendarDays size={21} />} title="Vários eventos" text="A mesma conta pode participar de campanhas futuras." />
            <Benefit icon={<ShieldCheck size={21} />} title="Aprovação prévia" text="A equipe valida os dados antes de publicar a revenda." />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1480px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8 lg:py-16">
        <aside className="h-fit rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
          <BadgeCheck size={38} className="text-red-600" />
          <h2 className="mt-4 text-2xl font-black tracking-tight">Como funciona</h2>
          <div className="mt-5 space-y-4 text-sm leading-relaxed text-slate-600">
            <Step number="1" text="Você envia os dados comerciais da revenda." />
            <Step number="2" text="O usuário master analisa e valida a solicitação." />
            <Step number="3" text="A loja aprovada recebe acesso permanente ao sistema." />
            <Step number="4" text="Cada evento é adicionado ao histórico da mesma loja." />
          </div>
          <p className="mt-6 rounded-2xl bg-red-50 p-4 text-xs font-bold leading-relaxed text-red-700">Enviar a solicitação não garante aprovação automática e não publica veículos sem validação.</p>
        </aside>

        <StorePortalApplicationForm />
      </section>

      <PublicPortalFooter settings={settings} />
    </main>
  );
}

function Benefit({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><span className="text-red-400">{icon}</span><h2 className="mt-3 text-sm font-black">{title}</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">{text}</p></div>;
}

function Step({ number, text }: { number: string; text: string }) {
  return <div className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">{number}</span><p>{text}</p></div>;
}
