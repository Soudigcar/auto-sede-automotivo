import Link from 'next/link';
import { ArrowRight, BarChart3, Car, ClipboardList, FileText, Landmark, LogOut, Plug, Route, Store, UserCog, Users } from 'lucide-react';

const routes = [
  { label: 'Dashboard Master', href: '/master/dashboard/live', description: 'Indicadores principais, funil, rankings e metricas executivas.', icon: BarChart3, tag: 'Master' },
  { label: 'Eventos', href: '/master/events', description: 'Gestao de eventos, campanhas e feiroes.', icon: Route, tag: 'Master' },
  { label: 'Lojas & Estoque', href: '/master/stores', description: 'Cadastro de lojas, acesso, estoque e veiculos.', icon: Store, tag: 'Master' },
  { label: 'Equipe', href: '/master/users', description: 'Usuarios, perfis e acessos operacionais.', icon: UserCog, tag: 'Master' },
  { label: 'Relatorios', href: '/master/reports', description: 'Central de relatorios executivos, lojas, prospectores e estoque.', icon: FileText, tag: 'Master' },
  { label: 'Financeiro', href: '/master/finance', description: 'Faturamento, ticket medio, bancos e formas de pagamento.', icon: Landmark, tag: 'Master' },
  { label: 'Integracao', href: '/master/integrations', description: 'Conexoes tecnicas, deploy, importacoes e APIs.', icon: Plug, tag: 'Master' },
  { label: 'Prospector', href: '/prospector/live', description: 'Pesquisa de rua, cadastro rapido e direcionamento de leads.', icon: Users, tag: 'Captacao' },
  { label: 'Portal da Loja', href: '/store', description: 'Central da loja com acesso ao pipeline e operacao.', icon: Store, tag: 'Loja' },
  { label: 'Pipeline da Loja', href: '/store/live', description: 'Kanban de leads recebidos e atendimento em tempo real.', icon: Route, tag: 'Loja' },
  { label: 'Operacao da Loja', href: '/store/operation', description: 'Fechamento, perda, bancos, estoque e responsaveis.', icon: ClipboardList, tag: 'Loja' },
  { label: 'Pre-vendas', href: '/pre-sales/live', description: 'Pipeline de pesquisas finalizadas para qualificacao.', icon: Users, tag: 'CRM' },
  { label: 'Sair', href: '/logout', description: 'Encerrar sessao atual com seguranca.', icon: LogOut, tag: 'Conta' }
];

export default function RoutesPage() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            <div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div>
          </div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-500">Central do sistema</p><p className="mt-1 font-bold">Painel de Navegacao</p><span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">MVP</span></div>
          <nav className="mt-8 space-y-3 text-sm"><Link href="/routes" className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><Route size={18} /> Navegacao</Link><Link href="/master/dashboard/live" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Master</Link><Link href="/master/finance" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Landmark size={18} /> Financeiro</Link><Link href="/master/integrations" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Plug size={18} /> Integracao</Link><Link href="/store" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Loja</Link><Link href="/prospector/live" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Users size={18} /> Prospector</Link></nav>
        </aside>
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="premium-eyebrow">MVP</p><h1 className="premium-title mt-2 text-4xl md:text-5xl">Painel de navegacao</h1><p className="premium-muted mt-3 max-w-3xl text-sm">Central para acessar cada perfil operacional.</p></div><Link href="/master/dashboard/live" className="premium-button-primary"><BarChart3 size={18} /> Abrir Master</Link></header>
          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{routes.map((route) => { const Icon = route.icon; return <Link key={route.href} href={route.href} className="premium-card premium-card-hover group relative overflow-hidden p-5"><div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-600 to-sky-600" /><div className="flex items-start justify-between gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Icon size={22} /></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-zinc-500">{route.tag}</span></div><h2 className="mt-5 text-2xl font-black text-zinc-950">{route.label}</h2><p className="mt-2 min-h-10 text-sm text-zinc-500">{route.description}</p><div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4"><span className="text-xs font-bold text-zinc-400">{route.href}</span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition group-hover:bg-red-600 group-hover:text-white"><ArrowRight size={16} /></span></div></Link>; })}</section>
        </div>
      </section>
    </main>
  );
}
