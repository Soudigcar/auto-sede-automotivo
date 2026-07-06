'use client';

import { useEffect, useState } from 'react';
import { getDashboardSummary } from '@/lib/database';

export default function MasterLiveDashboardPage() {
  const [summary, setSummary] = useState({
    totalLeads: 0,
    leadsWithPhone: 0,
    surveysWithoutPhone: 0,
    salesCount: 0,
    lossesCount: 0,
    conversionRate: 0
  });
  const [message, setMessage] = useState('');

  async function loadSummary() {
    setMessage('Carregando indicadores...');
    try {
      const data = await getDashboardSummary();
      setSummary(data);
      setMessage('');
    } catch {
      setMessage('Não foi possível carregar indicadores. Verifique Supabase Auth, tabelas e políticas.');
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const cards = [
    { label: 'Pessoas abordadas', value: summary.totalLeads, helper: 'Pesquisas + cadastros rápidos' },
    { label: 'Leads com telefone', value: summary.leadsWithPhone, helper: 'Base válida para contato' },
    { label: 'Pesquisas sem telefone', value: summary.surveysWithoutPhone, helper: 'Abordagens sem contato' },
    { label: 'Vendas confirmadas', value: summary.salesCount, helper: 'Fechamentos registrados' },
    { label: 'Perdas registradas', value: summary.lossesCount, helper: 'Leads perdidos' },
    { label: 'Taxa de conversão', value: `${summary.conversionRate}%`, helper: 'Vendas / leads com telefone' }
  ];

  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Gestão Master</p>
            <h1 className="mt-2 text-4xl font-black">Dashboard conectado</h1>
          </div>
          <button className="btn-secondary" onClick={loadSummary}>Atualizar dashboard</button>
        </div>

        {message ? <div className="card mt-5 p-4 text-sm text-zinc-200">{message}</div> : null}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <div key={card.label} className="card p-5">
              <p className="text-sm text-zinc-400">{card.label}</p>
              <strong className="mt-2 block text-3xl">{card.value}</strong>
              <span className="mt-2 block text-xs text-zinc-500">{card.helper}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
