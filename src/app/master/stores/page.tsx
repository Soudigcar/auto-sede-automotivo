'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, CalendarDays, Car, FileText, Store, UserCog } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getActiveEvent, getActiveStores } from '@/lib/database';

function getStorePortalPath(storeId: string) {
  return `/login?redirectedFrom=${encodeURIComponent(`/store/operation?store_id=${storeId}`)}`;
}

export default function MasterStoresPage() {
  const supabase = createClient();
  const [eventId, setEventId] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ storeName: '', responsibleName: '', responsiblePhone: '', responsibleEmail: '' });

  async function loadData() {
    try {
      const activeEvent = await getActiveEvent();
      setEventId(activeEvent.id);
      setStores(await getActiveStores(activeEvent.id));
    } catch {
      setMessage('Cadastre ou rode o seed do evento MVP no Supabase.');
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Salvando loja...');
    const { error } = await supabase.from('stores').insert({ event_id: eventId, store_name: form.storeName, responsible_name: form.responsibleName, responsible_phone: form.responsiblePhone, responsible_email: form.responsibleEmail, status: 'active' });
    if (error) {
      setMessage('Erro ao cadastrar loja. Verifique as politicas do Supabase.');
      return;
    }
    await supabase.from('users').upsert({ full_name: form.responsibleName, email: form.responsibleEmail, phone: form.responsiblePhone || null, role: 'store', status: 'active', must_change_password: true }, { onConflict: 'email' });
    setForm({ storeName: '', responsibleName: '', responsiblePhone: '', responsibleEmail: '' });
    setMessage('Loja cadastrada com sucesso. Perfil da loja preparado na tabela de usuarios.');
    await loadData();
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div><div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div></div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-500">Gestao Master</p><p className="mt-1 font-bold">Lojas & Estoque</p><span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Master</span></div>
          <nav className="mt-8 space-y-3 text-sm"><Link href="/master/dashboard/live" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Dashboard</Link><Link href="/master/events" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><CalendarDays size={18} /> Eventos</Link><Link href="/master/stores" className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><Store size={18} /> Lojas & Estoque</Link><Link href="/master/users" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><UserCog size={18} /> Equipe</Link><Link href="/master/reports" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><FileText size={18} /> Relatorios</Link></nav>
        </aside>
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="premium-eyebrow">Gestao Master</p><h1 className="premium-title mt-2 text-4xl md:text-5xl">Lojas Participantes</h1><p className="premium-muted mt-3 max-w-3xl text-sm">Cadastro, listagem e link individual de acesso ao portal da loja.</p></div><Link href="/master/dashboard/live" className="premium-button-secondary"><BarChart3 size={18} /> Voltar ao Dashboard</Link></header>
          {message ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">{message}</div> : null}
          <section className="mt-7 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <form onSubmit={handleSubmit} className="premium-card p-6"><h2 className="text-2xl font-black text-zinc-950">Cadastrar loja</h2><div className="mt-5 grid gap-3"><input className="premium-input" placeholder="Nome da loja" value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} required /><input className="premium-input" placeholder="Nome do responsavel" value={form.responsibleName} onChange={(event) => setForm({ ...form, responsibleName: event.target.value })} required /><input className="premium-input" placeholder="Telefone do responsavel" value={form.responsiblePhone} onChange={(event) => setForm({ ...form, responsiblePhone: event.target.value })} /><input className="premium-input" placeholder="E-mail do responsavel" value={form.responsibleEmail} onChange={(event) => setForm({ ...form, responsibleEmail: event.target.value })} required /><button className="premium-button-primary" type="submit">Cadastrar loja</button></div></form>
            <div className="premium-card p-6"><h2 className="text-2xl font-black text-zinc-950">Todas as lojas cadastradas</h2><p className="mt-1 text-sm text-zinc-500">Total: {stores.length}</p><div className="mt-5 grid gap-3">{stores.map((store) => <div key={store.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4"><h3 className="font-black text-zinc-950">{store.store_name}</h3><p className="mt-1 text-sm text-zinc-500">Responsavel: {store.responsible_name}</p><p className="mt-1 text-xs text-zinc-400">{store.responsible_phone || 'Telefone nao informado'} | {store.responsible_email || 'E-mail nao informado'}</p><div className="mt-4 flex flex-wrap gap-2"><Link href={getStorePortalPath(store.id)} className="premium-button-primary text-xs">Abrir portal da loja</Link><Link href={`/store/operation?store_id=${store.id}`} className="premium-button-secondary text-xs">Operacao direta</Link></div><p className="mt-3 break-all text-xs text-zinc-400">Link login: {getStorePortalPath(store.id)}</p></div>)}{stores.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma loja cadastrada.</p> : null}</div></div>
          </section>
        </div>
      </section>
    </main>
  );
}
