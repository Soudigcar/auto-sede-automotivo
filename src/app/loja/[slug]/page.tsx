'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, Car, CheckCircle2, ClipboardList, Clock3, LogOut, Package, Store, Users, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

export default function StoreSlugHomePage() {
  const supabase = createClient();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');
  const [store, setStore] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [message, setMessage] = useState('Validando acesso da loja...');

  async function loadDashboard() {
    const context = await getStorePortalContext(slug);
    if (context.status === 'unauthenticated') {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      return;
    }
    if (context.status !== 'ok') {
      setMessage('Acesso bloqueado. Este usuário não tem permissão para acessar esta loja.');
      return;
    }

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('assigned_store_id', context.store.id)
      .order('created_at', { ascending: false });

    setStore(context.store);
    setProfile(context.profile);
    setLeads(error ? [] : data || []);
    setMessage(error ? 'Não foi possível carregar os dados do dashboard.' : '');
  }

  useEffect(() => { loadDashboard().catch(() => setMessage('Não foi possível validar o acesso.')); }, [slug]);

  const metrics = useMemo(() => ({
    total: leads.length,
    active: leads.filter((lead) => !['sale_confirmed', 'lost'].includes(lead.status)).length,
    newLeads: leads.filter((lead) => lead.status === 'new_lead').length,
    inService: leads.filter((lead) => lead.status === 'in_service').length,
    scheduled: leads.filter((lead) => lead.status === 'scheduled').length,
    sold: leads.filter((lead) => lead.status === 'sale_confirmed').length,
    lost: leads.filter((lead) => lead.status === 'lost').length
  }), [leads]);

  const isManager = ['master', 'store'].includes(profile?.role);

  if (message && !store) return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{message}</main>;

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div><div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div></div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-500">Área operacional</p><p className="mt-1 font-bold">{store?.store_name}</p><span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">{profile?.role || 'Store'}</span></div>
          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><BarChart3 size={18} /> Dashboard</Link>
            {isManager ? <Link href={`/loja/${slug}/minha-loja`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Minha Loja</Link> : null}
            {isManager ? <Link href={`/loja/${slug}/estoque`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Package size={18} /> Estoque</Link> : null}
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Pipeline</Link>
            {isManager ? <Link href={`/loja/${slug}/operacao`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><ClipboardList size={18} /> Operação</Link> : null}
            {isManager ? <Link href={`/loja/${slug}/equipe`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Users size={18} /> Equipe</Link> : null}
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div><p className="premium-eyebrow">Loja Participante</p><h1 className="premium-title mt-2 text-4xl md:text-5xl">Dashboard da Loja</h1><p className="premium-muted mt-3 max-w-3xl text-sm">Visão operacional da loja {store?.store_name}: leads recebidos, atendimento, agendamentos, vendas e perdas.</p></div>
            <div className="flex flex-wrap gap-3"><button className="premium-button-secondary" type="button" onClick={loadDashboard}><BarChart3 size={18} /> Atualizar</button><Link href={`/loja/${slug}/pipeline`} className="premium-button-primary"><ArrowRight size={18} /> Abrir Pipeline</Link></div>
          </header>

          {message ? <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm font-medium text-zinc-600">{message}</div> : null}

          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Total de leads" value={metrics.total} icon={<Users size={22} />} />
            <Kpi label="Leads ativos" value={metrics.active} icon={<Clock3 size={22} />} />
            <Kpi label="Vendas" value={metrics.sold} icon={<CheckCircle2 size={22} />} tone="emerald" />
            <Kpi label="Perdas" value={metrics.lost} icon={<XCircle size={22} />} tone="red" />
          </section>

          <section className="mt-5 grid gap-4 sm:grid-cols-3">
            <Mini label="Novos" value={metrics.newLeads} />
            <Mini label="Em atendimento" value={metrics.inService} />
            <Mini label="Agendados" value={metrics.scheduled} />
          </section>

          {isManager ? <section className="premium-card mt-6 p-6"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">Gestão da equipe</p><h2 className="mt-2 text-2xl font-black text-zinc-950">Cadastre sua equipe e compartilhe os links</h2><p className="mt-2 text-sm text-zinc-500">Crie acessos de Pré-vendas, Vendedores e Prospectadores e controle quem recebe leads.</p></div><Link href={`/loja/${slug}/equipe`} className="premium-button-primary"><Users size={18} /> Abrir Equipe</Link></div></section> : null}

          <section className="premium-card mt-6 p-6"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black text-zinc-950">Últimos leads recebidos</h2><p className="mt-1 text-sm text-zinc-500">A visualização respeita as permissões do usuário conectado.</p></div><Link href={`/loja/${slug}/pipeline`} className="text-sm font-black uppercase tracking-wide text-red-600">Abrir todos</Link></div><div className="mt-5 grid gap-3">{leads.slice(0, 6).map((lead) => <div key={lead.id} className="grid gap-2 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 md:grid-cols-[1.2fr_1fr_150px] md:items-center"><div><p className="font-black text-zinc-950">{lead.customer_name || 'Cliente sem nome'}</p><p className="text-xs text-zinc-500">{lead.customer_phone || 'Sem telefone'}</p></div><p className="text-sm font-bold text-zinc-700">{lead.interested_vehicle || 'Interesse não informado'}</p><span className="rounded-full bg-white px-3 py-2 text-center text-xs font-black text-zinc-600">{lead.status}</span></div>)}{leads.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500">Nenhum lead disponível para este usuário.</div> : null}</div></section>
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value, icon, tone = 'zinc' }: { label: string; value: number; icon: React.ReactNode; tone?: string }) {
  const toneClass = tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-700';
  return <div className="premium-card p-5"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClass}`}>{icon}</div><p className="mt-5 text-sm font-bold text-zinc-500">{label}</p><p className="mt-1 text-4xl font-black text-zinc-950">{value}</p></div>;
}

function Mini({ label, value }: { label: string; value: number }) {
  return <div className="premium-card p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">{label}</p><p className="mt-2 text-3xl font-black text-zinc-950">{value}</p></div>;
}
