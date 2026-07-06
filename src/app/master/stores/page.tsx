'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { getActiveEvent, getActiveStores } from '@/lib/database';

export default function MasterStoresPage() {
  const supabase = createClient();
  const [eventId, setEventId] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    storeName: '',
    responsibleName: '',
    responsiblePhone: '',
    responsibleEmail: ''
  });

  async function loadData() {
    try {
      const activeEvent = await getActiveEvent();
      setEventId(activeEvent.id);
      const activeStores = await getActiveStores(activeEvent.id);
      setStores(activeStores);
    } catch {
      setMessage('Cadastre ou rode o seed do evento MVP no Supabase.');
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Salvando loja...');

    const { error } = await supabase.from('stores').insert({
      event_id: eventId,
      store_name: form.storeName,
      responsible_name: form.responsibleName,
      responsible_phone: form.responsiblePhone,
      responsible_email: form.responsibleEmail,
      status: 'active'
    });

    if (error) {
      setMessage('Erro ao cadastrar loja. Verifique as políticas do Supabase.');
      return;
    }

    setForm({ storeName: '', responsibleName: '', responsiblePhone: '', responsibleEmail: '' });
    setMessage('Loja cadastrada com sucesso.');
    await loadData();
  }

  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Gestão Master</p>
        <h1 className="mt-2 text-4xl font-black">Lojas Participantes</h1>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <form onSubmit={handleSubmit} className="card p-6">
            <h2 className="text-2xl font-bold">Cadastrar loja</h2>
            <div className="mt-5 grid gap-3">
              <input className="rounded-xl px-4 py-3" placeholder="Nome da loja" value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} required />
              <input className="rounded-xl px-4 py-3" placeholder="Nome do responsável" value={form.responsibleName} onChange={(event) => setForm({ ...form, responsibleName: event.target.value })} required />
              <input className="rounded-xl px-4 py-3" placeholder="Telefone do responsável" value={form.responsiblePhone} onChange={(event) => setForm({ ...form, responsiblePhone: event.target.value })} />
              <input className="rounded-xl px-4 py-3" placeholder="E-mail do responsável" value={form.responsibleEmail} onChange={(event) => setForm({ ...form, responsibleEmail: event.target.value })} />
              <button className="btn-primary" type="submit">Cadastrar loja</button>
              {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
            </div>
          </form>

          <div className="card p-6">
            <h2 className="text-2xl font-bold">Lojas cadastradas</h2>
            <div className="mt-5 space-y-3">
              {stores.map((store) => (
                <div key={store.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="font-bold">{store.store_name}</h3>
                  <p className="text-sm text-zinc-400">{store.responsible_name}</p>
                </div>
              ))}
              {stores.length === 0 ? <p className="text-sm text-zinc-400">Nenhuma loja cadastrada.</p> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
