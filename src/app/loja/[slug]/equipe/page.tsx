'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { BarChart3, Car, ClipboardList, Copy, Link2, LogOut, Package, Store, UserCog, UserPlus, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

const roleLabels: Record<string, string> = { pre_sales: 'Pré-vendas', seller: 'Vendedores', prospector: 'Prospectadores' };

export default function StoreTeamPage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');
  const supabase = createClient();
  const [store, setStore] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('Validando acesso...');

  async function authHeaders() {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json' };
  }

  async function load() {
    const context = await getStorePortalContext(slug);
    if (context.status === 'unauthenticated') {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      return;
    }
    if (context.status !== 'ok' || !['master', 'store'].includes(context.profile?.role)) {
      setMessage('Somente o Gestor da loja ou o Master pode acessar a equipe.');
      return;
    }
    setStore(context.store);
    setProfile(context.profile);
    const headers = await authHeaders();
    const query = context.profile.role === 'master' ? `?store_id=${context.store.id}` : '';
    const [membersResponse, linksResponse] = await Promise.all([
      fetch(`/api/store/team-members${query}`, { headers }),
      fetch(`/api/store/team-links${query}`, { headers })
    ]);
    const membersData = await membersResponse.json();
    const linksData = await linksResponse.json();
    setMembers(membersData.members || []);
    setLinks(linksData.links || []);
    setMessage('');
  }

  useEffect(() => { load().catch(() => setMessage('Não foi possível carregar a equipe.')); }, [slug]);

  async function generateLink(role: string) {
    setMessage(`Gerando link de ${roleLabels[role]}...`);
    const headers = await authHeaders();
    const response = await fetch('/api/store/team-links', {
      method: 'POST', headers,
      body: JSON.stringify({ role, store_id: store.id })
    });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || 'Erro ao gerar link.'); return; }
    const url = `${window.location.origin}/equipe/cadastro?token=${data.token}`;
    setGenerated((current) => ({ ...current, [role]: url }));
    setMessage('Link gerado. Copie e compartilhe com o colaborador.');
    await load();
  }

  async function copyLink(role: string) {
    const value = generated[role];
    if (!value) { setMessage('Gere um novo link antes de copiar.'); return; }
    await navigator.clipboard.writeText(value);
    setMessage('Link copiado.');
  }

  async function updateMember(member: any, patch: Record<string, any>) {
    const headers = await authHeaders();
    const response = await fetch('/api/store/team-members', { method: 'PATCH', headers, body: JSON.stringify({ id: member.id, ...patch }) });
    const data = await response.json();
    setMessage(response.ok ? 'Colaborador atualizado.' : data.error || 'Erro ao atualizar colaborador.');
    if (response.ok) await load();
  }

  if (message && !store) return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-white">{message}</main>;

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div><div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div></div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-500">Área operacional</p><p className="mt-1 font-bold">{store?.store_name}</p><span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span></div>
          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Dashboard</Link>
            <Link href={`/loja/${slug}/minha-loja`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Minha Loja</Link>
            <Link href={`/loja/${slug}/estoque`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Package size={18} /> Estoque</Link>
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/operacao`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><ClipboardList size={18} /> Operação</Link>
            <Link href={`/loja/${slug}/equipe`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><Users size={18} /> Equipe</Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header><p className="premium-eyebrow">Gestão da loja</p><h1 className="premium-title mt-2 text-4xl md:text-5xl">Equipe</h1><p className="premium-muted mt-3 max-w-3xl text-sm">Cadastre colaboradores por link e controle quem participa do rodízio interno.</p></header>
          {message ? <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm font-medium text-zinc-600">{message}</div> : null}

          <section className="mt-7 grid gap-4 lg:grid-cols-3">
            {['pre_sales', 'seller', 'prospector'].map((role) => {
              const latest = links.find((item) => item.role === role && item.status === 'active');
              return (
                <div key={role} className="premium-card p-5">
                  <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Link2 size={20} /></div><div><h2 className="text-lg font-black text-zinc-950">Link para {roleLabels[role]}</h2><p className="text-xs text-zinc-500">Vinculado automaticamente a {store?.store_name}</p></div></div>
                  <p className="mt-4 text-sm text-zinc-600">{latest ? `Link ativo até ${latest.expires_at ? new Date(latest.expires_at).toLocaleDateString('pt-BR') : 'sem validade'}. Usos: ${latest.use_count}/${latest.max_uses}.` : 'Nenhum link ativo.'}</p>
                  {generated[role] ? <input readOnly value={generated[role]} className="mt-4 w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs" /> : null}
                  <div className="mt-4 flex gap-2"><button type="button" onClick={() => generateLink(role)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-3 text-sm font-black text-white"><UserPlus size={16} /> Gerar link</button><button type="button" onClick={() => copyLink(role)} className="rounded-xl border border-zinc-200 px-4 text-zinc-700"><Copy size={17} /></button></div>
                </div>
              );
            })}
          </section>

          <section className="premium-card mt-6 p-6">
            <div className="flex items-center gap-3"><UserCog className="text-red-600" /><div><h2 className="text-2xl font-black text-zinc-950">Colaboradores cadastrados</h2><p className="text-sm text-zinc-500">O acesso é criado imediatamente, mas o rodízio só é ativado pelo Gestor.</p></div></div>
            <div className="mt-5 grid gap-3">
              {members.map((member) => (
                <div key={member.id} className="grid gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 lg:grid-cols-[1.2fr_1fr_170px_200px] lg:items-center">
                  <div><p className="font-black text-zinc-950">{member.full_name}</p><p className="text-xs text-zinc-500">{member.email} · {member.phone || 'sem telefone'}</p></div>
                  <div><p className="text-sm font-bold text-zinc-700">{roleLabels[member.role] || member.role}</p><p className="text-xs text-zinc-500">Status: {member.status}</p></div>
                  <label className="flex items-center gap-2 text-sm font-bold text-zinc-700"><input type="checkbox" checked={Boolean(member.receives_leads)} onChange={(event) => updateMember(member, { receives_leads: event.target.checked })} /> Recebe leads</label>
                  <select value={member.status} onChange={(event) => updateMember(member, { status: event.target.value, receives_leads: event.target.value === 'active' ? member.receives_leads : false })} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"><option value="active">Ativo</option><option value="paused">Pausado</option><option value="inactive">Inativo</option></select>
                </div>
              ))}
              {members.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500">Nenhum colaborador cadastrado ainda.</div> : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
