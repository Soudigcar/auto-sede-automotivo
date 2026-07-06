'use client';

import { useEffect, useState } from 'react';
import { createStreetSurvey, getActiveEvent, getActiveStores } from '@/lib/database';

export function ProspectorSurveyContent() {
  const [eventId, setEventId] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('store');
  const [form, setForm] = useState({ q1: '', q2: '', currentVehicle: '', desiredVehicle: '', name: '', phone: '', storeId: '', notes: '' });

  async function loadData() {
    try {
      const activeEvent = await getActiveEvent();
      setEventId(activeEvent.id);
      setStores(await getActiveStores(activeEvent.id));
    } catch {
      setMessage('Evento ativo nao encontrado.');
    }
  }

  useEffect(() => { loadData(); }, []);

  function getStoreName(id: string) {
    return stores.find((store) => store.id === id)?.store_name || 'loja selecionada';
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'store' && !form.storeId) {
      setMessage('Selecione a loja antes de direcionar.');
      return;
    }

    try {
      await createStreetSurvey({
        eventId,
        customerName: form.name,
        customerPhone: form.phone,
        foughtInTraffic: form.q1,
        extremeTrafficAnger: form.q2,
        currentVehicle: form.currentVehicle,
        desiredVehicle: form.desiredVehicle,
        assignedStoreId: mode === 'store' ? form.storeId : null,
        leadStatus: mode === 'store' ? 'new_lead' : 'pre_sales_queue',
        notes: form.notes || null
      });
      setMessage(mode === 'store' ? `Lead direcionado para ${getStoreName(form.storeId)}.` : 'Pesquisa enviada para pre-vendas.');
      setForm({ q1: '', q2: '', currentVehicle: '', desiredVehicle: '', name: '', phone: '', storeId: '', notes: '' });
    } catch {
      setMessage('Erro ao salvar pesquisa.');
    }
  }

  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Prospector</p>
        <h1 className="mt-2 text-4xl font-black">Pesquisa de Rua</h1>
        {message ? <div className="card mt-5 p-4 text-sm text-zinc-200">{message}</div> : null}

        <div className="mt-8 grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
          <aside className="card p-6">
            <h2 className="text-2xl font-bold">Lojas cadastradas</h2>
            <div className="mt-5 space-y-3">
              {stores.map((store) => <div key={store.id} className="rounded-xl border border-white/10 bg-white/5 p-3"><strong>{store.store_name}</strong><p className="text-sm text-zinc-400">{store.responsible_name}</p></div>)}
              {stores.length === 0 ? <p className="text-sm text-zinc-400">Nenhuma loja cadastrada.</p> : null}
            </div>
          </aside>

          <form onSubmit={submit} className="card p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Pesquisa de Rua</p>
            <h2 className="mt-2 text-2xl font-bold">Saude mental no transito</h2>
            <div className="mt-5 grid gap-3">
              <select className="rounded-xl px-4 py-3" value={form.q1} onChange={(e) => setForm({ ...form, q1: e.target.value })} required><option value="">1. Ja brigou no transito?</option><option value="sim">Sim</option><option value="nao">Nao</option></select>
              <select className="rounded-xl px-4 py-3" value={form.q2} onChange={(e) => setForm({ ...form, q2: e.target.value })} required><option value="">2. Ja sentiu vontade de reagir no transito?</option><option value="sim">Sim</option><option value="nao">Nao</option></select>
              <input className="rounded-xl px-4 py-3" placeholder="3. Qual carro voce dirige hoje?" value={form.currentVehicle} onChange={(e) => setForm({ ...form, currentVehicle: e.target.value })} />
              <input className="rounded-xl px-4 py-3" placeholder="4. Qual carro voce teria hoje?" value={form.desiredVehicle} onChange={(e) => setForm({ ...form, desiredVehicle: e.target.value })} />
              <input className="rounded-xl px-4 py-3" placeholder="5. Nome do lead" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input className="rounded-xl px-4 py-3" placeholder="6. Contato" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              <textarea className="rounded-xl px-4 py-3" placeholder="Obs: opcional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <select className="rounded-xl px-4 py-3" value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })}><option value="">Loja para direcionar</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select>
              <div className="grid gap-3 md:grid-cols-2"><button className="btn-primary" type="submit" onClick={() => setMode('store')}>Direcionar para a loja</button><button className="btn-secondary" type="submit" onClick={() => setMode('pre_sales')}>Finalizar pesquisa</button></div>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
