import Link from 'next/link';
import { BarChart3, Car, Download, FileText, Store, Users } from 'lucide-react';

const reports = [
  { title: 'Resumo executivo', description: 'Visao geral de leads, vendas, conversao, faturamento e estoque.', icon: BarChart3 },
  { title: 'Relatorio por loja', description: 'Performance de cada loja participante, leads recebidos, vendas e perdas.', icon: Store },
  { title: 'Relatorio por prospector', description: 'Abordagens, pesquisas, cadastros e leads direcionados por captador.', icon: Users },
  { title: 'Relatorio de estoque', description: 'Veiculos disponiveis, vendidos, reservados e valor movimentado.', icon: Car }
];

export default function MasterReportsPage() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div><div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div></div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-500">Gestao Master</p><p className="mt-1 font-bold">Relatorios</p><span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Master</span></div>
          <nav className="mt-8 space-y-3 text-sm"><Link href="/master/dashboard/live" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Dashboard</Link><Link href="/master/events" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><FileText size={18} /> Eventos</Link><Link href="/master/stores" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Lojas & Estoque</Link><Link href="/master/reports" className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><FileText size={18} /> Relatorios</Link></nav>
        </aside>
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="premium-eyebrow">Gestao Master</p><h1 className="premium-title mt-2 text-4xl md:text-5xl">Relatorios</h1><p className="premium-muted mt-3 max-w-3xl text-sm">Central de relatorios gerenciais. Esta tela substitui o uso incorreto do painel de navegacao como relatorio.</p></div><Link href="/master/dashboard/live" className="premium-button-secondary"><BarChart3 size={18} /> Voltar ao Dashboard</Link></header>
          <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{reports.map((report) => { const Icon = report.icon; return <div key={report.title} className="premium-card premium-card-hover p-5"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Icon size={22} /></div><h2 className="mt-5 text-xl font-black text-zinc-950">{report.title}</h2><p className="mt-2 text-sm text-zinc-500">{report.description}</p><button className="premium-button-primary mt-5 w-full"><Download size={16} /> Gerar relatorio</button></div>; })}</section>
          <section className="premium-card mt-6 p-6"><h2 className="text-2xl font-black text-zinc-950">Status da auditoria</h2><p className="premium-muted mt-2 text-sm">Relatorios agora possuem rota propria: <strong>/master/reports</strong>. O painel <strong>/routes</strong> fica reservado apenas para navegacao geral do MVP.</p></section>
        </div>
      </section>
    </main>
  );
}
