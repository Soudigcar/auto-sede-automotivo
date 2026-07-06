const actions = [
  'Registrar mensagem enviada',
  'Registrar resposta recebida',
  'Registrar ligação',
  'Agendar cliente',
  'Confirmar comparecimento',
  'Marcar não comparecimento',
  'Enviar para loja',
  'Adicionar observação'
];

export default function PreSalesPage() {
  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Pré-vendas</p>
        <h1 className="mt-2 text-4xl font-black">Controle de Atendimento</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {['Leads recebidos', 'Ligações', 'Agendamentos', 'Comparecimentos'].map((item) => (
            <div key={item} className="card p-5">
              <p className="text-sm text-zinc-400">{item}</p>
              <strong className="mt-2 block text-3xl">0</strong>
            </div>
          ))}
        </div>
        <div className="card mt-6 p-6">
          <h2 className="text-2xl font-bold">Ações do lead</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {actions.map((action) => <button key={action} className="btn-secondary">{action}</button>)}
          </div>
        </div>
      </section>
    </main>
  );
}
