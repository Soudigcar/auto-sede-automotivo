'use client';

import { useEffect, useState } from 'react';
import { banks, vehicleCategories } from '@/lib/constants';
import { createQuickRegistration, createStreetSurvey, getActiveEvent, getActiveStores } from '@/lib/database';

export default function ProspectorLivePage() {
  const [eventId, setEventId] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [surveyForm, setSurveyForm] = useState({ customerName: '', customerPhone: '', customerBank: '', purchaseIntention: '', vehicleCategoryInterest: '', purchaseTimeline: '', hasTradeInVehicle: '', assignedStoreId: '', notes: '' });
  const [quickForm, setQuickForm] = useState({ customerName: '', customerPhone: '', customerBank: '', interestedVehicle: '', vehicleCategoryInterest: '', assignedStoreId: '', notes: '' });

  function getStoreName(storeId: string) {
    return stores.find((store) => store.id === storeId)?.store_name || 'loja selecionada';
  }

  async function loadData() {
    try {
      const activeEvent = await getActiveEvent();
      setEventId(activeEvent.id);
      const activeStores = await getActiveStores(activeEvent.id);
      setStores(activeStores);
    } catch {
      setMessage('Evento ativo nao encontrado. Rode o schema e o seed no Supabase.');
    }
  }

  useEffect(() => { loadData(); }, []);

  async function submitSurvey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Salvando pesquisa e direcionando lead...');
    try {
      await createStreetSurvey({ eventId, customerName: surveyForm.customerName, customerPhone: surveyForm.customerPhone || null, customerBank: surveyForm.customerBank || null, purchaseIntention: surveyForm.purchaseIntention || null, vehicleCategoryInterest: surveyForm.vehicleCategoryInterest || null, purchaseTimeline: surveyForm.purchaseTimeline || null, hasTradeInVehicle: surveyForm.hasTradeInVehicle === 'yes', assignedStoreId: surveyForm.assignedStoreId, notes: surveyForm.notes || null });
      setMessage(`Pesquisa salva. Lead direcionado para ${getStoreName(surveyForm.assignedStoreId)}.`);
      setSurveyForm({ customerName: '', customerPhone: '', customerBank: '', purchaseIntention: '', vehicleCategoryInterest: '', purchaseTimeline: '', hasTradeInVehicle: '', assignedStoreId: '', notes: '' });
    } catch {
      setMessage('Erro ao salvar pesquisa. Verifique login, tabelas e politicas do Supabase.');
    }
  }

  async function submitQuick(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Cadastrando e direcionando lead...');
    try {
      await createQuickRegistration({ eventId, customerName: quickForm.customerName, customerPhone: quickForm.customerPhone, customerBank: quickForm.customerBank || null, interestedVehicle: quickForm.interestedVehicle || null, vehicleCategoryInterest: quickForm.vehicleCategoryInterest || null, assignedStoreId: quickForm.assignedStoreId, notes: quickForm.notes || null });
      setMessage(`Cadastro salvo. Lead direcionado para ${getStoreName(quickForm.assignedStoreId)}.`);
      setQuickForm({ customerName: '', customerPhone: '', customerBank: '', interestedVehicle: '', vehicleCategoryInterest: '', assignedStoreId: '', notes: '' });
    } catch {
      setMessage('Erro ao cadastrar lead. Verifique login, tabelas e politicas do Supabase.');
    }
  }

  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Prospector</p>
        <h1 className="mt-2 text-4xl font-black">Captacao em tempo real</h1>
        <p className="mt-3 max-w-3xl text-sm text-zinc-400">O prospector capta o cliente e escolhe para qual loja enviar. O lead entra automaticamente na pipeline da loja escolhida.</p>
        {message ? <div className="card mt-5 p-4 text-sm text-zinc-200">{message}</div> : null}

        <div className="mt-8 grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
          <aside className="card p-6">
            <h2 className="text-2xl font-bold">Lojas cadastradas</h2>
            <p className="mt-2 text-sm text-zinc-400">Estas lojas aparecem nos formularios de direcionamento.</p>
            <div className="mt-5 space-y-3">
              {stores.map((store) => <div key={store.id} className="rounded-xl border border-white/10 bg-white/5 p-3"><strong>{store.store_name}</strong><p className="text-sm text-zinc-400">Responsavel: {store.responsible_name}</p></div>)}
              {stores.length === 0 ? <p className="text-sm text-zinc-400">Nenhuma loja cadastrada.</p> : null}
            </div>
          </aside>

          <div className="grid gap-4">
            <form onSubmit={submitSurvey} className="card p-6">
              <h2 className="text-2xl font-bold">Pesquisa de Rua</h2>
              <div className="mt-5 grid gap-3">
                <input className="rounded-xl px-4 py-3" placeholder="Nome do cliente" value={surveyForm.customerName} onChange={(event) => setSurveyForm({ ...surveyForm, customerName: event.target.value })} required />
                <input className="rounded-xl px-4 py-3" placeholder="Telefone opcional" value={surveyForm.customerPhone} onChange={(event) => setSurveyForm({ ...surveyForm, customerPhone: event.target.value })} />
                <select className="rounded-xl px-4 py-3" value={surveyForm.customerBank} onChange={(event) => setSurveyForm({ ...surveyForm, customerBank: event.target.value })}><option value="">Banco correntista</option>{banks.map((bank) => <option key={bank} value={bank}>{bank}</option>)}</select>
                <select className="rounded-xl px-4 py-3" value={surveyForm.purchaseIntention} onChange={(event) => setSurveyForm({ ...surveyForm, purchaseIntention: event.target.value })}><option value="">Compra, troca ou pesquisa?</option><option value="buy">Comprar</option><option value="trade">Trocar</option><option value="research">Apenas pesquisando</option></select>
                <select className="rounded-xl px-4 py-3" value={surveyForm.vehicleCategoryInterest} onChange={(event) => setSurveyForm({ ...surveyForm, vehicleCategoryInterest: event.target.value })}><option value="">Categoria de interesse</option>{vehicleCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                <select className="rounded-xl px-4 py-3" value={surveyForm.purchaseTimeline} onChange={(event) => setSurveyForm({ ...surveyForm, purchaseTimeline: event.target.value })}><option value="">Prazo de compra</option><option value="today">Hoje</option><option value="seven_days">Ate 7 dias</option><option value="thirty_days">Ate 30 dias</option><option value="more_than_thirty_days">Mais de 30 dias</option></select>
                <select className="rounded-xl px-4 py-3" value={surveyForm.hasTradeInVehicle} onChange={(event) => setSurveyForm({ ...surveyForm, hasTradeInVehicle: event.target.value })}><option value="">Tem veiculo para troca?</option><option value="yes">Sim</option><option value="no">Nao</option></select>
                <select className="rounded-xl px-4 py-3" value={surveyForm.assignedStoreId} onChange={(event) => setSurveyForm({ ...surveyForm, assignedStoreId: event.target.value })} required><option value="">Enviar para qual loja?</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select>
                <textarea className="rounded-xl px-4 py-3" placeholder="Observacoes" value={surveyForm.notes} onChange={(event) => setSurveyForm({ ...surveyForm, notes: event.target.value })} />
                <button className="btn-primary" type="submit">Salvar e enviar para loja</button>
              </div>
            </form>

            <form onSubmit={submitQuick} className="card p-6">
              <h2 className="text-2xl font-bold">Cadastro Rapido</h2>
              <div className="mt-5 grid gap-3">
                <input className="rounded-xl px-4 py-3" placeholder="Nome do cliente" value={quickForm.customerName} onChange={(event) => setQuickForm({ ...quickForm, customerName: event.target.value })} required />
                <input className="rounded-xl px-4 py-3" placeholder="Telefone obrigatorio" value={quickForm.customerPhone} onChange={(event) => setQuickForm({ ...quickForm, customerPhone: event.target.value })} required />
                <select className="rounded-xl px-4 py-3" value={quickForm.customerBank} onChange={(event) => setQuickForm({ ...quickForm, customerBank: event.target.value })}><option value="">Banco correntista</option>{banks.map((bank) => <option key={bank} value={bank}>{bank}</option>)}</select>
                <input className="rounded-xl px-4 py-3" placeholder="Carro de interesse" value={quickForm.interestedVehicle} onChange={(event) => setQuickForm({ ...quickForm, interestedVehicle: event.target.value })} />
                <select className="rounded-xl px-4 py-3" value={quickForm.vehicleCategoryInterest} onChange={(event) => setQuickForm({ ...quickForm, vehicleCategoryInterest: event.target.value })}><option value="">Categoria de interesse</option>{vehicleCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                <select className="rounded-xl px-4 py-3" value={quickForm.assignedStoreId} onChange={(event) => setQuickForm({ ...quickForm, assignedStoreId: event.target.value })} required><option value="">Enviar para qual loja?</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select>
                <textarea className="rounded-xl px-4 py-3" placeholder="Observacoes" value={quickForm.notes} onChange={(event) => setQuickForm({ ...quickForm, notes: event.target.value })} />
                <button className="btn-primary" type="submit">Cadastrar e enviar para loja</button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
