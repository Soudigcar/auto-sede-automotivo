'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { BarChart3, Car, CheckCircle2, ClipboardList, ExternalLink, Link as LinkIcon, LockKeyhole, LogOut, Plus, Store } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const statusLabel: Record<string, string> = {
  pending: 'Pendente',
  reviewing: 'Em conferência',
  imported: 'Importado',
  published: 'Publicado',
  rejected: 'Rejeitado',
  duplicate: 'Duplicado'
};

const statusClass: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  reviewing: 'bg-sky-50 text-sky-700',
  imported: 'bg-indigo-50 text-indigo-700',
  published: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  duplicate: 'bg-zinc-100 text-zinc-600'
};

export default function StoreMyStorePage() {
  const supabase = createClient();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [store, setStore] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [stockImports, setStockImports] = useState<any[]>([]);
  const [message, setMessage] = useState('Carregando Minha Loja...');
  const [saving, setSaving] = useState(false);

  const [storeForm, setStoreForm] = useState({
    storeName: '',
    responsibleName: '',
    phone: '',
    responsibleEmail: '',
    websiteUrl: ''
  });

  const [newVehicleUrl, setNewVehicleUrl] = useState('');
  const [loginForm, setLoginForm] = useState({
    newEmail: '',
    newPassword: ''
  });

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();

    if (!data.session?.access_token) {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      return '';
    }

    return data.session.access_token;
  }

  async function apiRequest(payload?: any) {
    const token = await getAuthToken();

    if (!token) return null;

    if (!payload) {
      const response = await fetch(`/api/store-profile?slug=${encodeURIComponent(slug)}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível carregar Minha Loja.');
      }

      return result;
    }

    const response = await fetch('/api/store-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ ...payload, slug })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Não foi possível salvar.');
    }

    return result;
  }

  async function loadData() {
    try {
      const result = await apiRequest();

      if (!result) return;

      setStore(result.store);
      setProfile(result.profile);
      setLinks(result.links || []);
      setStockImports(result.stock_imports || []);

      setStoreForm({
        storeName: result.store?.store_name || '',
        responsibleName: result.store?.responsible_name || '',
        phone: result.store?.responsible_phone || '',
        responsibleEmail: result.store?.responsible_email || '',
        websiteUrl: result.store?.website_url || ''
      });

      setLoginForm({
        newEmail: result.profile?.email || '',
        newPassword: ''
      });

      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao carregar Minha Loja.');
    }
  }

  useEffect(() => {
    loadData();
  }, [slug]);

  async function saveStoreData(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage('Salvando dados da loja...');

    try {
      await apiRequest({
        action: 'update-store',
        store_name: storeForm.storeName,
        responsible_name: storeForm.responsibleName,
        responsible_phone: storeForm.phone,
        responsible_email: storeForm.responsibleEmail,
        website_url: storeForm.websiteUrl
      });

      setMessage('Dados da loja atualizados.');
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar os dados.');
    }

    setSaving(false);
  }

  async function addVehicleLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage('Enviando novo link para análise do Master...');

    try {
      await apiRequest({
        action: 'add-vehicle-link',
        vehicle_url: newVehicleUrl
      });

      setNewVehicleUrl('');
      setMessage('Link enviado com sucesso. O Master vai conferir antes de publicar.');
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível enviar o link.');
    }

    setSaving(false);
  }

  async function updateLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage('Atualizando dados de acesso...');

    try {
      await apiRequest({
        action: 'update-login',
        new_email: loginForm.newEmail,
        new_password: loginForm.newPassword
      });

      setLoginForm((current) => ({ ...current, newPassword: '' }));
      setMessage('Acesso atualizado. Se alterou o e-mail, saia e entre novamente com o novo e-mail.');
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível atualizar acesso.');
    }

    setSaving(false);
  }

  if (message && !store) {
    return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{message}</main>;
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            <div>
              <p className="text-sm font-black tracking-wide">AUTO CONTROLE</p>
              <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500">Área operacional</p>
            <p className="mt-1 font-bold">{store?.store_name}</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span>
          </div>

          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Início</Link>
            <Link href={`/loja/${slug}/minha-loja`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><Store size={18} /> Minha Loja</Link>
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/operacao`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><ClipboardList size={18} /> Operação</Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Loja Participante</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Minha Loja</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Confira seus dados, acompanhe os links enviados e envie novos veículos para aprovação do Master.
              </p>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{message}</div> : null}

          <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_0.9fr]">
            <form onSubmit={saveStoreData} className="premium-card p-6">
              <h2 className="text-2xl font-black text-zinc-950">Dados da loja</h2>
              <p className="mt-1 text-sm text-zinc-500">Essas informações identificam sua loja dentro do evento.</p>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <input className="premium-input md:col-span-2" placeholder="Nome da loja" value={storeForm.storeName} onChange={(e) => setStoreForm({ ...storeForm, storeName: e.target.value })} required />
                <input className="premium-input" placeholder="Responsável" value={storeForm.responsibleName} onChange={(e) => setStoreForm({ ...storeForm, responsibleName: e.target.value })} required />
                <input className="premium-input" placeholder="Telefone / WhatsApp" value={storeForm.phone} onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })} />
                <input className="premium-input" type="email" placeholder="E-mail da loja" value={storeForm.responsibleEmail} onChange={(e) => setStoreForm({ ...storeForm, responsibleEmail: e.target.value })} />
                <input className="premium-input" placeholder="Site da loja" value={storeForm.websiteUrl} onChange={(e) => setStoreForm({ ...storeForm, websiteUrl: e.target.value })} />
              </div>

              <button className="premium-button-primary mt-5 w-full" type="submit" disabled={saving}>
                <CheckCircle2 size={18} /> Salvar dados da loja
              </button>
            </form>

            <form onSubmit={updateLogin} className="premium-card p-6">
              <h2 className="text-2xl font-black text-zinc-950">Acesso ao portal</h2>
              <p className="mt-1 text-sm text-zinc-500">Altere o e-mail ou senha usados para acessar seu portal.</p>

              <div className="mt-5 grid gap-3">
                <input className="premium-input" type="email" placeholder="Novo e-mail de acesso" value={loginForm.newEmail} onChange={(e) => setLoginForm({ ...loginForm, newEmail: e.target.value })} />
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input className="premium-input pl-11" type="password" placeholder="Nova senha" value={loginForm.newPassword} onChange={(e) => setLoginForm({ ...loginForm, newPassword: e.target.value })} />
                </div>
              </div>

              <button className="premium-button-secondary mt-5 w-full" type="submit" disabled={saving}>
                Atualizar e-mail/senha
              </button>

              <p className="mt-3 text-xs font-bold text-zinc-400">
                Se alterar o e-mail, use o novo e-mail no próximo login.
              </p>
            </form>
          </section>

          <section className="premium-card mt-6 p-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-2xl font-black text-zinc-950">Links de veículos enviados</h2>
                <p className="mt-1 text-sm text-zinc-500">O Master confere, edita e publica os veículos no site do evento.</p>
              </div>
              <span className="rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-600">{links.length} link(s)</span>
            </div>

            <form onSubmit={addVehicleLink} className="mt-5 grid gap-3 xl:grid-cols-[1fr_auto]">
              <div className="relative">
                <LinkIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input className="premium-input pl-11" placeholder="Cole aqui um novo link público de anúncio" value={newVehicleUrl} onChange={(e) => setNewVehicleUrl(e.target.value)} />
              </div>
              <button className="premium-button-primary" type="submit" disabled={saving}>
                <Plus size={18} /> Adicionar link
              </button>
            </form>

            <div className="mt-5 grid gap-3">
              {links.map((item) => (
                <div key={item.id} className="rounded-3xl border border-zinc-100 bg-zinc-50 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Link enviado</p>
                      <p className="mt-2 break-all text-sm font-bold text-zinc-700">{item.vehicle_url}</p>
                      <p className="mt-2 text-xs font-bold text-zinc-400">
                        Enviado em {new Date(item.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-2 text-xs font-black ${statusClass[item.status] || 'bg-zinc-100 text-zinc-600'}`}>
                        {statusLabel[item.status] || item.status}
                      </span>

                      <a className="premium-button-secondary text-xs" href={item.vehicle_url} target="_blank">
                        <ExternalLink size={14} /> Abrir anúncio
                      </a>
                    </div>
                  </div>
                </div>
              ))}

              {!links.length ? (
                <p className="rounded-2xl border border-dashed border-zinc-200 p-5 text-center text-sm font-bold text-zinc-400">
                  Nenhum link enviado ainda.
                </p>
              ) : null}
            </div>
          </section>

          <section className="premium-card mt-6 p-6">
            <h2 className="text-2xl font-black text-zinc-950">Arquivos de estoque enviados</h2>
            <p className="mt-1 text-sm text-zinc-500">Histórico de XML/CSV enviados no cadastro da loja.</p>

            <div className="mt-5 grid gap-3">
              {stockImports.map((item) => (
                <div key={item.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                  <p className="font-black text-zinc-950">{item.file_name}</p>
                  <p className="mt-1 text-xs font-bold text-zinc-400">
                    Status: {item.status} • {(Number(item.file_size_bytes || 0) / 1024).toFixed(1)} KB
                  </p>
                </div>
              ))}

              {!stockImports.length ? (
                <p className="text-sm font-bold text-zinc-400">Nenhum arquivo enviado.</p>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
