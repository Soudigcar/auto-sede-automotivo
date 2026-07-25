'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Car,
  Check,
  Clipboard,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  LogOut,
  RefreshCcw,
  Save,
  Share2,
  ShieldCheck,
  Store,
  UserCheck,
  UserRoundCog,
  UsersRound,
  UserX
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

const roleConfigs = [
  {
    role: 'pre_sales',
    title: 'Pré-vendas',
    description: 'Recebe o lead da loja, realiza o primeiro contato e encaminha para o vendedor.',
    icon: UserCheck
  },
  {
    role: 'seller',
    title: 'Vendedores',
    description: 'Recebem os leads qualificados e acompanham negociação, comparecimento e venda.',
    icon: UsersRound
  },
  {
    role: 'prospector',
    title: 'Prospectadores',
    description: 'Cadastram captações e acompanham somente os próprios clientes e resultados.',
    icon: UserRoundCog
  }
] as const;

const roleLabels: Record<string, string> = {
  pre_sales: 'Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospectador'
};

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  active: 'Ativo',
  paused: 'Pausado',
  inactive: 'Inativo'
};

type TeamMember = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  receives_leads: boolean;
  routing_order: number;
  max_open_leads: number | null;
  created_at: string;
};

type RegistrationLink = {
  id: string;
  role: string;
  role_label: string;
  status: string;
  registration_url: string;
  expires_at: string | null;
  usage_count: number;
  created_at: string;
};

function formatDateTime(value: string | null) {
  if (!value) return 'Sem validade';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data inválida';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function activeLinkForRole(links: RegistrationLink[], role: string) {
  return links.find((link) => {
    if (link.role !== role || link.status !== 'active') return false;
    if (!link.expires_at) return true;
    return new Date(link.expires_at).getTime() > Date.now();
  });
}

export default function StoreTeamPage() {
  const supabase = createClient();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [store, setStore] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [links, setLinks] = useState<RegistrationLink[]>([]);
  const [message, setMessage] = useState('Validando acesso da loja...');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadTeam() {
    setLoading(true);
    const context = await getStorePortalContext(slug);

    if (context.status === 'unauthenticated') {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      return;
    }

    if (context.status !== 'ok' || !['master', 'store'].includes(context.profile?.role || '')) {
      setMessage('Acesso bloqueado. Somente o Gestor da loja ou Master pode administrar a equipe.');
      setLoading(false);
      return;
    }

    const token = await getAccessToken();
    const response = await fetch(`/api/store/team?slug=${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error || 'Não foi possível carregar a equipe.');
      setLoading(false);
      return;
    }

    setStore(payload.store);
    setProfile(context.profile);
    setMembers(payload.members || []);
    setLinks(payload.links || []);
    setMessage('');
    setLoading(false);
  }

  useEffect(() => {
    loadTeam().catch(() => {
      setMessage('Não foi possível carregar a equipe.');
      setLoading(false);
    });
  }, [slug]);

  const counters = useMemo(() => ({
    total: members.length,
    active: members.filter((member) => member.status === 'active').length,
    pending: members.filter((member) => member.status === 'pending').length,
    routing: members.filter((member) => member.status === 'active' && member.receives_leads).length
  }), [members]);

  async function postAction(payload: Record<string, unknown>) {
    const token = await getAccessToken();
    const response = await fetch('/api/store/team', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ slug, ...payload })
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a ação.');
    return data;
  }

  async function generateLink(role: string) {
    setBusyKey(`link:${role}`);
    setMessage('Gerando novo link...');

    try {
      await postAction({ action: 'generate_link', role, expires_days: 30 });
      setMessage('Novo link gerado. O link anterior deste cargo foi desativado.');
      await loadTeam();
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao gerar link.');
    } finally {
      setBusyKey('');
    }
  }

  async function revokeLink(linkId: string, role: string) {
    setBusyKey(`revoke:${role}`);
    setMessage('Desativando link...');

    try {
      await postAction({ action: 'revoke_link', link_id: linkId });
      setMessage('Link desativado.');
      await loadTeam();
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao desativar link.');
    } finally {
      setBusyKey('');
    }
  }

  async function copyLink(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(''), 1800);
  }

  async function shareLink(link: RegistrationLink) {
    const title = `Cadastro de ${link.role_label} - ${store?.store_name || 'Loja'}`;

    if (navigator.share) {
      await navigator.share({ title, text: `Preencha seus dados para entrar na equipe da ${store?.store_name}.`, url: link.registration_url });
      return;
    }

    await copyLink(link.registration_url, `share:${link.role}`);
    setMessage('Link copiado. Cole no WhatsApp para compartilhar.');
  }

  function updateMemberDraft(memberId: string, patch: Partial<TeamMember>) {
    setMembers((current) => current.map((member) => member.id === memberId ? { ...member, ...patch } : member));
  }

  async function saveMember(member: TeamMember) {
    setBusyKey(`member:${member.id}`);
    setMessage(`Salvando ${member.full_name}...`);

    try {
      await postAction({
        action: 'update_member',
        member_id: member.id,
        status: member.status,
        receives_leads: member.receives_leads,
        routing_order: member.routing_order,
        max_open_leads: member.max_open_leads
      });
      setMessage('Colaborador atualizado com sucesso.');
      await loadTeam();
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao atualizar colaborador.');
    } finally {
      setBusyKey('');
    }
  }

  if (message && !store && !loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{message}</main>;
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            <div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div>
          </div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500">Gestão da equipe</p>
            <p className="mt-1 font-bold">{store?.store_name || 'Carregando...'}</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">{profile?.role === 'master' ? 'Master' : 'Gestor'}</span>
          </div>
          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Dashboard</Link>
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/equipe`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold text-white shadow-lg shadow-red-600/20"><UsersRound size={18} /> Equipe</Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Portal da loja</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Equipe</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Compartilhe os links por cargo, aprove os cadastros e controle quem participa do rodízio interno de leads.
              </p>
            </div>
            <button type="button" onClick={() => loadTeam()} disabled={loading} className="premium-button-secondary">
              <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} /> Atualizar
            </button>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-zinc-100 bg-white p-4 text-sm font-semibold text-zinc-600 shadow-sm">{message}</div> : null}

          <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Colaboradores" value={counters.total} />
            <Kpi label="Ativos" value={counters.active} />
            <Kpi label="Pendentes" value={counters.pending} />
            <Kpi label="No rodízio" value={counters.routing} />
          </section>

          <section className="mt-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Link2 size={22} /></div>
              <div><h2 className="text-2xl font-black text-zinc-950">Links para cadastro</h2><p className="premium-muted text-sm">Cada link já define a loja e o cargo. Validade padrão: 30 dias.</p></div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              {roleConfigs.map((config) => {
                const Icon = config.icon;
                const link = activeLinkForRole(links, config.role);
                const busy = busyKey === `link:${config.role}` || busyKey === `revoke:${config.role}`;

                return (
                  <article key={config.role} className="premium-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700"><Icon size={21} /></div>
                      <span className={link ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700' : 'rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-500'}>{link ? 'Link ativo' : 'Sem link'}</span>
                    </div>
                    <h3 className="mt-4 text-xl font-black text-zinc-950">{config.title}</h3>
                    <p className="mt-2 min-h-16 text-sm leading-relaxed text-zinc-500">{config.description}</p>

                    {link ? (
                      <>
                        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <p className="truncate text-xs font-semibold text-zinc-600">{link.registration_url}</p>
                          <p className="mt-2 text-[11px] text-zinc-400">Expira: {formatDateTime(link.expires_at)} · {link.usage_count} cadastro(s)</p>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => copyLink(link.registration_url, config.role)} className="premium-button-secondary justify-center text-sm">
                            {copiedKey === config.role ? <Check size={16} /> : <Copy size={16} />}{copiedKey === config.role ? 'Copiado' : 'Copiar'}
                          </button>
                          <button type="button" onClick={() => shareLink(link)} className="premium-button-secondary justify-center text-sm"><Share2 size={16} /> Compartilhar</button>
                          <a href={link.registration_url} target="_blank" rel="noreferrer" className="premium-button-secondary justify-center text-sm"><ExternalLink size={16} /> Abrir</a>
                          <button type="button" onClick={() => revokeLink(link.id, config.role)} disabled={busy} className="premium-button-secondary justify-center text-sm text-red-600 disabled:opacity-50"><UserX size={16} /> Desativar</button>
                        </div>
                      </>
                    ) : (
                      <button type="button" onClick={() => generateLink(config.role)} disabled={busy} className="premium-button-primary mt-5 w-full justify-center disabled:opacity-50">
                        {busy ? <Loader2 size={17} className="animate-spin" /> : <Link2 size={17} />} Gerar link
                      </button>
                    )}

                    {link ? (
                      <button type="button" onClick={() => generateLink(config.role)} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 text-xs font-black text-zinc-500 hover:text-red-600 disabled:opacity-50"><RefreshCcw size={14} /> Gerar novo link</button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="mt-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700"><UsersRound size={22} /></div>
              <div><h2 className="text-2xl font-black text-zinc-950">Colaboradores cadastrados</h2><p className="premium-muted text-sm">Ative o usuário e habilite o rodízio somente quando estiver pronto para receber leads.</p></div>
            </div>

            {loading ? (
              <div className="mt-5 flex min-h-44 items-center justify-center rounded-3xl border border-zinc-100 bg-white"><Loader2 className="animate-spin text-red-600" size={28} /></div>
            ) : members.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center">
                <Clipboard className="mx-auto text-zinc-300" size={34} />
                <h3 className="mt-4 text-xl font-black text-zinc-800">Nenhum colaborador cadastrado</h3>
                <p className="mt-2 text-sm text-zinc-500">Gere e compartilhe um dos links acima para receber o primeiro cadastro.</p>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {members.map((member) => {
                  const saving = busyKey === `member:${member.id}`;
                  return (
                    <article key={member.id} className="premium-card p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-black text-zinc-950">{member.full_name}</h3>
                            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600">{roleLabels[member.role] || member.role}</span>
                            <span className={member.status === 'active' ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700' : member.status === 'pending' ? 'rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700' : 'rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-500'}>{statusLabels[member.status] || member.status}</span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-zinc-600">{member.email}</p>
                          <p className="mt-1 text-xs text-zinc-400">{member.phone || 'Telefone não informado'}</p>
                        </div>
                        {member.status === 'active' ? <ShieldCheck className="text-emerald-500" size={22} /> : <UserRoundCog className="text-zinc-300" size={22} />}
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <label className="text-xs font-black uppercase tracking-wide text-zinc-500">
                          Status
                          <select value={member.status} onChange={(event) => updateMemberDraft(member.id, { status: event.target.value, receives_leads: event.target.value === 'active' ? member.receives_leads : false })} className="premium-input mt-2 text-sm normal-case">
                            <option value="pending">Pendente</option>
                            <option value="active">Ativo</option>
                            <option value="paused">Pausado</option>
                            <option value="inactive">Inativo</option>
                          </select>
                        </label>
                        <label className="text-xs font-black uppercase tracking-wide text-zinc-500">
                          Ordem
                          <input type="number" min={0} max={9999} value={member.routing_order || 0} onChange={(event) => updateMemberDraft(member.id, { routing_order: Number(event.target.value || 0) })} className="premium-input mt-2 text-sm normal-case" />
                        </label>
                        <label className="text-xs font-black uppercase tracking-wide text-zinc-500">
                          Limite aberto
                          <input type="number" min={1} value={member.max_open_leads ?? ''} onChange={(event) => updateMemberDraft(member.id, { max_open_leads: event.target.value ? Number(event.target.value) : null })} className="premium-input mt-2 text-sm normal-case" placeholder="Sem limite" />
                        </label>
                      </div>

                      <label className="mt-4 flex cursor-pointer items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div><p className="text-sm font-black text-zinc-800">Receber leads automaticamente</p><p className="mt-1 text-xs text-zinc-500">Participa do rodízio interno deste cargo.</p></div>
                        <input type="checkbox" checked={Boolean(member.receives_leads)} disabled={member.status !== 'active'} onChange={(event) => updateMemberDraft(member.id, { receives_leads: event.target.checked })} className="h-5 w-5 accent-red-600" />
                      </label>

                      <button type="button" onClick={() => saveMember(member)} disabled={saving} className="premium-button-primary mt-4 w-full justify-center disabled:opacity-50">
                        {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Salvar colaborador
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="premium-card p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-zinc-950">{value}</p>
    </div>
  );
}
