const kpis = [
  { label: 'Pessoas abordadas', value: 0, helper: 'Pesquisas + cadastros rápidos' },
  { label: 'Leads com telefone', value: 0, helper: 'Base válida para contato' },
  { label: 'Pesquisas sem telefone', value: 0, helper: 'Abordagens sem contato' },
  { label: 'Vendas confirmadas', value: 0, helper: 'Fechamentos registrados' },
  { label: 'Taxa de conversão', value: '0%', helper: 'Vendas / leads com telefone' },
  { label: 'Ticket médio', value: 'R$ 0', helper: 'Valor vendido / vendas' }
];

export default function MasterDashboardPage() {
  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Gestão Master</p>
            <h1 className="mt-2 text-3xl font-black md:text-5xl">Dashboard Geral</h1>
          </div>
          <button className="btn-primary">Exportar relatório</button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {kpis.map((item) => (
            <div key={item.label} className="card p-5">
              <p className="text-sm text-zinc-400">{item.label}</p>
              <strong className="mt-2 block text-3xl">{item.value}</strong>
              <span className="mt-2 block text-xs text-zinc-500">{item.helper}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="card p-6">
            <h2 className="text-xl font-bold">Funil do Evento</h2>
            <div className="mt-4 space-y-3 text-sm text-zinc-300">
              <p>Pessoas Abordadas → Leads com Telefone → Atendimento → Agendamento → Comparecimento → Venda</p>
              <p>Na próxima etapa, este bloco será conectado aos dados reais do Supabase.</p>
            </div>
          </div>
          <div className="card p-6">
            <h2 className="text-xl font-bold">Análises Inteligentes</h2>
            <ul className="mt-4 space-y-2 text-sm text-zinc-300">
              <li>Performance por loja</li>
              <li>Performance por prospector</li>
              <li>Banco correntista x banco financiador</li>
              <li>Horários de pico</li>
              <li>Categorias de veículos mais procuradas</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
