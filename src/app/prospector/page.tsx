'use client';

import { banks, vehicleCategories } from '@/lib/constants';

export default function ProspectorPage() {
  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Prospector</p>
        <h1 className="mt-2 text-4xl font-black">Captação de Clientes</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="card p-6">
            <h2 className="text-2xl font-bold">Pesquisa de Rua</h2>
            <p className="mt-2 text-sm text-zinc-400">Para registrar abordagens e intenção de compra.</p>
            <form className="mt-6 grid gap-3">
              <input className="rounded-xl px-4 py-3" placeholder="Nome do cliente" />
              <input className="rounded-xl px-4 py-3" placeholder="Telefone opcional" />
              <select className="rounded-xl px-4 py-3"><option>Banco correntista</option>{banks.map((bank) => <option key={bank}>{bank}</option>)}</select>
              <select className="rounded-xl px-4 py-3"><option>Compra, troca ou pesquisa?</option><option>Comprar</option><option>Trocar</option><option>Apenas pesquisando</option></select>
              <select className="rounded-xl px-4 py-3"><option>Categoria de interesse</option>{vehicleCategories.map((item) => <option key={item.value}>{item.label}</option>)}</select>
              <select className="rounded-xl px-4 py-3"><option>Prazo de compra</option><option>Hoje</option><option>Até 7 dias</option><option>Até 30 dias</option><option>Mais de 30 dias</option></select>
              <select className="rounded-xl px-4 py-3"><option>Tem veículo para troca?</option><option>Sim</option><option>Não</option></select>
              <input className="rounded-xl px-4 py-3" placeholder="Loja para direcionar" />
              <button className="btn-primary" type="button">Salvar pesquisa</button>
            </form>
          </div>

          <div className="card p-6">
            <h2 className="text-2xl font-bold">Cadastro Rápido</h2>
            <p className="mt-2 text-sm text-zinc-400">Para lead direto com telefone e veículo de interesse.</p>
            <form className="mt-6 grid gap-3">
              <input className="rounded-xl px-4 py-3" placeholder="Nome do cliente" />
              <input className="rounded-xl px-4 py-3" placeholder="Telefone obrigatório" />
              <select className="rounded-xl px-4 py-3"><option>Banco correntista</option>{banks.map((bank) => <option key={bank}>{bank}</option>)}</select>
              <input className="rounded-xl px-4 py-3" placeholder="Carro de interesse" />
              <input className="rounded-xl px-4 py-3" placeholder="Loja para direcionar" />
              <button className="btn-primary" type="button">Cadastrar lead</button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
