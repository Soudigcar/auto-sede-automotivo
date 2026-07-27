'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  Building2,
  CarFront,
  CheckCircle2,
  Loader2,
  LogIn,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  X
} from 'lucide-react';
import { MarketplaceVehicleModal } from '@/components/marketplace/MarketplaceVehicleModal';
import { PublicVehicleCard } from '@/components/marketplace/PublicVehicleCard';
import type { MarketplaceFilters, MarketplaceVehicle } from '@/components/marketplace/types';

const emptyFilters: MarketplaceFilters = {
  brands: [],
  transmissions: [],
  fuels: [],
  min_price: 0,
  max_price: 0
};

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function normalized(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

export function PublicMarketplace() {
  const [vehicles, setVehicles] = useState<MarketplaceVehicle[]>([]);
  const [availableFilters, setAvailableFilters] = useState<MarketplaceFilters>(emptyFilters);
  const [selectedVehicle, setSelectedVehicle] = useState<MarketplaceVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    brand: '',
    transmission: '',
    fuel: '',
    minPrice: '',
    maxPrice: ''
  });

  useEffect(() => {
    let cancelled = false;

    async function loadVehicles() {
      try {
        const response = await fetch('/api/marketplace/vehicles', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os veículos.');
        if (cancelled) return;

        setVehicles(payload.vehicles || []);
        setAvailableFilters(payload.filters || emptyFilters);
        setMessage('');
      } catch (error: any) {
        if (!cancelled) setMessage(error?.message || 'Não foi possível carregar os veículos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadVehicles();
    return () => { cancelled = true; };
  }, []);

  const filteredVehicles = useMemo(() => {
    const search = normalized(filters.search);
    const minPrice = Number(filters.minPrice || 0);
    const maxPrice = Number(filters.maxPrice || 0);

    return vehicles.filter((vehicle) => {
      const searchable = normalized([
        vehicle.brand,
        vehicle.model,
        vehicle.version,
        vehicle.year,
        vehicle.color,
        vehicle.store.name
      ].filter(Boolean).join(' '));

      if (search && !searchable.includes(search)) return false;
      if (filters.brand && vehicle.brand !== filters.brand) return false;
      if (filters.transmission && vehicle.transmission !== filters.transmission) return false;
      if (filters.fuel && vehicle.fuel !== filters.fuel) return false;
      if (minPrice > 0 && vehicle.price < minPrice) return false;
      if (maxPrice > 0 && vehicle.price > maxPrice) return false;

      return true;
    });
  }, [vehicles, filters]);

  const storeCount = useMemo(() => new Set(vehicles.map((vehicle) => vehicle.store.id)).size, [vehicles]);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  function resetFilters() {
    setFilters({ search: '', brand: '', transmission: '', fuel: '', minPrice: '', maxPrice: '' });
  }

  const filterPanel = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <label className="relative md:col-span-2 xl:col-span-2">
        <span className="sr-only">Buscar veículo</span>
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          placeholder="Busque por marca, modelo, versão ou loja"
          className="h-13 w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
        />
      </label>

      <select value={filters.brand} onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value }))} className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-red-400">
        <option value="">Todas as marcas</option>
        {availableFilters.brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
      </select>

      <select value={filters.transmission} onChange={(event) => setFilters((current) => ({ ...current, transmission: event.target.value }))} className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-red-400">
        <option value="">Todos os câmbios</option>
        {availableFilters.transmissions.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>

      <select value={filters.fuel} onChange={(event) => setFilters((current) => ({ ...current, fuel: event.target.value }))} className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-red-400">
        <option value="">Combustível</option>
        {availableFilters.fuels.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>

      <div className="grid grid-cols-2 gap-2 md:col-span-2 xl:col-span-1">
        <input
          value={filters.minPrice}
          onChange={(event) => setFilters((current) => ({ ...current, minPrice: event.target.value.replace(/\D/g, '') }))}
          inputMode="numeric"
          placeholder="Preço mín."
          className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-red-400"
        />
        <input
          value={filters.maxPrice}
          onChange={(event) => setFilters((current) => ({ ...current, maxPrice: event.target.value.replace(/\D/g, '') }))}
          inputMode="numeric"
          placeholder="Preço máx."
          className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-red-400"
        />
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#inicio" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg"><CarFront size={23} /></div>
            <div>
              <p className="text-sm font-black tracking-tight text-slate-950 sm:text-base">AUTO CONTROLE</p>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-600">Marketplace Automotivo</p>
            </div>
          </a>

          <nav className="hidden items-center gap-7 text-sm font-black text-slate-600 lg:flex">
            <a href="#veiculos" className="transition hover:text-red-600">Veículos</a>
            <a href="#como-funciona" className="transition hover:text-red-600">Como funciona</a>
            <a href="#seguranca" className="transition hover:text-red-600">Segurança</a>
          </nav>

          <Link href="/login" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-800 shadow-sm transition hover:border-red-200 hover:text-red-600 sm:text-sm">
            <LogIn size={17} /> <span className="hidden sm:inline">Acesso da loja</span><span className="sm:hidden">Entrar</span>
          </Link>
        </div>
      </header>

      <section id="inicio" className="relative overflow-hidden bg-[#071020] px-4 pb-20 pt-16 text-white sm:px-6 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(229,27,35,0.28),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(37,99,235,0.20),transparent_28%),radial-gradient(circle_at_75%_85%,rgba(255,255,255,0.08),transparent_30%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(5,13,28,0.98),rgba(7,16,32,0.95)_55%,rgba(35,5,12,0.94))]" />

        <div className="relative mx-auto grid max-w-[1480px] gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-red-300">
              <Sparkles size={15} /> Veículos de lojas parceiras
            </span>

            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.045em] sm:text-5xl lg:text-7xl">
              Encontre seu próximo carro em um só lugar.
            </h1>
            <p className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-slate-300 sm:text-lg">
              Compare veículos disponíveis, faça uma simulação inicial e fale diretamente com a loja responsável pelo anúncio.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#veiculos" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 text-sm font-black text-white shadow-xl shadow-red-600/25 transition hover:-translate-y-0.5 hover:bg-red-500">
                Ver veículos disponíveis <ArrowDown size={18} />
              </a>
              <a href="#como-funciona" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 text-sm font-black text-white backdrop-blur transition hover:bg-white/[0.1]">
                <ShieldCheck size={18} /> Entenda o atendimento
              </a>
            </div>

            <div className="mt-9 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur"><p className="text-3xl font-black">{loading ? '—' : vehicles.length}</p><p className="mt-1 text-xs font-bold text-slate-400">veículos publicados</p></div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur"><p className="text-3xl font-black">{loading ? '—' : storeCount}</p><p className="mt-1 text-xs font-bold text-slate-400">lojas participantes</p></div>
              <div className="col-span-2 rounded-3xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur sm:col-span-1"><p className="text-3xl font-black">Direto</p><p className="mt-1 text-xs font-bold text-slate-400">para a loja do veículo</p></div>
            </div>
          </div>

          <div className="relative hidden min-h-[480px] lg:block">
            <div className="absolute left-6 top-8 w-[78%] rotate-[-4deg] overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.08] p-3 shadow-2xl backdrop-blur">
              {vehicles[0]?.image_url ? <img src={vehicles[0].image_url} alt="Veículo em destaque" className="aspect-[16/10] w-full rounded-[25px] object-cover" /> : <div className="flex aspect-[16/10] items-center justify-center rounded-[25px] bg-white/[0.05] text-slate-600"><CarFront size={80} /></div>}
            </div>
            <div className="absolute bottom-4 right-0 w-[70%] rotate-[5deg] overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.08] p-3 shadow-2xl backdrop-blur">
              {vehicles[1]?.image_url ? <img src={vehicles[1].image_url} alt="Outro veículo disponível" className="aspect-[16/10] w-full rounded-[22px] object-cover" /> : <div className="flex aspect-[16/10] items-center justify-center rounded-[22px] bg-white/[0.05] text-slate-600"><Store size={70} /></div>}
            </div>
          </div>
        </div>
      </section>

      <section id="veiculos" className="mx-auto max-w-[1480px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-red-600">Catálogo permanente</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl">Veículos disponíveis agora</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">O anúncio permanece vinculado à loja proprietária. Ao solicitar atendimento, seu contato não entra no rodízio de outras lojas.</p>
          </div>

          <button type="button" onClick={() => setMobileFiltersOpen((current) => !current)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm lg:hidden">
            <SlidersHorizontal size={18} /> Filtros {activeFilterCount ? `(${activeFilterCount})` : ''}
          </button>
        </div>

        <div className={`mt-7 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-5 ${mobileFiltersOpen ? 'block' : 'hidden lg:block'}`}>
          <div className="mb-3 flex items-center justify-between lg:hidden"><p className="font-black">Filtrar veículos</p><button type="button" onClick={() => setMobileFiltersOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100"><X size={17} /></button></div>
          {filterPanel}
          {activeFilterCount ? (
            <div className="mt-3 flex justify-end"><button type="button" onClick={resetFilters} className="text-xs font-black text-red-600 hover:text-red-700">Limpar todos os filtros</button></div>
          ) : null}
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-500"><strong className="text-slate-950">{filteredVehicles.length}</strong> veículo(s) encontrado(s)</p>
          {availableFilters.max_price > 0 ? <p className="text-xs font-semibold text-slate-400">Faixa atual: {money(availableFilters.min_price)} a {money(availableFilters.max_price)}</p> : null}
        </div>

        {loading ? (
          <div className="flex min-h-80 items-center justify-center"><div className="text-center"><Loader2 size={34} className="mx-auto animate-spin text-red-600" /><p className="mt-3 text-sm font-bold text-slate-500">Carregando catálogo seguro...</p></div></div>
        ) : message ? (
          <div className="mt-8 rounded-[28px] border border-red-100 bg-red-50 p-8 text-center"><p className="font-black text-red-700">{message}</p><p className="mt-2 text-sm text-red-600">Tente novamente em alguns instantes.</p></div>
        ) : filteredVehicles.length ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredVehicles.map((vehicle) => <PublicVehicleCard key={vehicle.id} vehicle={vehicle} onOpen={setSelectedVehicle} />)}
          </div>
        ) : (
          <div className="mt-8 rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center">
            <Search size={38} className="mx-auto text-slate-300" />
            <h3 className="mt-4 text-xl font-black text-slate-900">Nenhum veículo encontrado</h3>
            <p className="mt-2 text-sm text-slate-500">Ajuste os filtros para ampliar sua busca.</p>
            <button type="button" onClick={resetFilters} className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Limpar filtros</button>
          </div>
        )}
      </section>

      <section id="como-funciona" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <div className="max-w-3xl"><p className="text-xs font-black uppercase tracking-[0.22em] text-red-600">Como funciona</p><h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Um caminho simples até a loja certa</h2></div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: Search, number: '01', title: 'Escolha o veículo', text: 'Use os filtros para encontrar o carro compatível com seu orçamento e preferência.' },
              { icon: SlidersHorizontal, number: '02', title: 'Faça a simulação', text: 'Informe entrada e prazo para visualizar uma estimativa inicial de financiamento.' },
              { icon: Building2, number: '03', title: 'Fale com a proprietária', text: 'O lead é entregue diretamente à loja que publicou aquele veículo.' }
            ].map((item) => {
              const Icon = item.icon;
              return <article key={item.number} className="rounded-[28px] border border-slate-200 bg-slate-50 p-6"><div className="flex items-center justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white"><Icon size={22} /></div><span className="text-3xl font-black text-slate-200">{item.number}</span></div><h3 className="mt-5 text-xl font-black text-slate-950">{item.title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-500">{item.text}</p></article>;
            })}
          </div>
        </div>
      </section>

      <section id="seguranca" className="mx-auto max-w-[1480px] px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 rounded-[34px] bg-slate-950 p-6 text-white sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400"><ShieldCheck size={28} /></div><div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">Direcionamento seguro</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">Cada veículo permanece ligado à sua loja.</h2><p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">A vitrine publica somente anúncios com proprietário único e loja ativa. Veículos sem vínculo confiável ficam fora do catálogo até a revisão.</p></div></div>
          <div className="grid gap-2 text-sm font-bold text-slate-300 sm:grid-cols-3 lg:grid-cols-1"><span className="flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-400" /> Estoque validado</span><span className="flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-400" /> Loja identificada</span><span className="flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-400" /> Lead sem rodízio</span></div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-950">AUTO CONTROLE AUTOMOTIVO</p><p className="mt-1 text-xs">Marketplace, CRM e eventos automotivos no mesmo ecossistema.</p></div><Link href="/login" className="inline-flex items-center gap-2 font-black text-slate-700 hover:text-red-600"><LogIn size={16} /> Acesso operacional</Link></div>
      </footer>

      {selectedVehicle ? <MarketplaceVehicleModal vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} /> : null}
    </main>
  );
}
