export default function StorePage() {
  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Loja Participante</p>
        <h1 className="mt-2 text-4xl font-black">Pipeline de Leads</h1>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="card p-6 lg:col-span-2">
            <h2 className="text-2xl font-bold">Leads recebidos</h2>
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="font-bold">Cliente exemplo</h3>
              <p className="text-sm text-zinc-400">SUV automático • Novo Lead</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-secondary">Iniciar atendimento</button>
                <button className="btn-secondary">Agendar cliente</button>
                <button className="btn-secondary">Confirmar comparecimento</button>
                <button className="btn-primary">Confirmar venda</button>
                <button className="btn-secondary">Registrar perda</button>
              </div>
            </div>
          </div>
          <div className="card p-6">
            <h2 className="text-2xl font-bold">Estoque</h2>
            <p className="mt-3 text-sm text-zinc-400">Upload de CSV/XLSX e cadastro manual entram na próxima etapa.</p>
            <button className="btn-primary mt-5 w-full">Anexar estoque</button>
          </div>
        </div>
      </section>
    </main>
  );
}
