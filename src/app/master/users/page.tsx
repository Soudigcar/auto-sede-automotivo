'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

const roles = ['master', 'prospector', 'store', 'pre_sales'];

export default function MasterUsersPage() {
  const supabase = createClient();
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'prospector' });

  async function loadItems() {
    const { data } = await supabase
      .from('users')
      .select('id,full_name,email,phone,role,status,created_at')
      .order('created_at', { ascending: false });
    setItems(data || []);
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function saveItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Salvando...');

    const { error } = await supabase.from('users').upsert({
      full_name: form.name,
      email: form.email,
      phone: form.phone || null,
      role: form.role,
      status: 'active',
      must_change_password: true
    }, { onConflict: 'email' });

    if (error) {
      setMessage('Erro ao salvar.');
      return;
    }

    setForm({ name: '', email: '', phone: '', role: 'prospector' });
    setMessage('Perfil salvo com sucesso.');
    await loadItems();
  }

  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Gestao Master</p>
            <h1 className="mt-2 text-4xl font-black">Equipe do sistema</h1>
            <p className="mt-3 text-sm text-zinc-400">Controle os perfis que acessam o evento.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/master/dashboard/live" className="btn-secondary">Dashboard</Link>
            <Link href="/master/reports" className="btn-secondary">Relatorios</Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <form onSubmit={saveItem} className="card p-6">
            <h2 className="text-2xl font-bold">Novo perfil</h2>
            <div className="mt-5 grid gap-3">
              <input className="rounded-xl px-4 py-3" placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input className="rounded-xl px-4 py-3" placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <input className="rounded-xl px-4 py-3" placeholder="Telefone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <select className="rounded-xl px-4 py-3" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {roles.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <button className="btn-primary" type="submit">Salvar perfil</button>
              {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
            </div>
          </form>

          <div className="card p-6">
            <h2 className="text-2xl font-bold">Perfis cadastrados</h2>
            <div className="mt-5 space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="font-bold">{item.full_name}</h3>
                  <p className="text-sm text-zinc-400">{item.email}</p>
                  <p className="text-xs text-zinc-500">{item.role} | {item.status}</p>
                </div>
              ))}
              {items.length === 0 ? <p className="text-sm text-zinc-400">Nenhum perfil encontrado.</p> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
