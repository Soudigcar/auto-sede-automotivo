'use client';

import { useMemo, useState } from 'react';
import { CarFront, ChevronDown, Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { CampaignVehicleShowcase } from '@/components/campaigns/CampaignVehicleShowcase';

type Props = {
  vehicles: any[];
  primaryColor: string;
  onOpenSimulator: (vehicleId: string) => void;
};

function text(value: unknown) {
  return String(value || '').trim();
}

function fold(value: unknown) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function numberValue(value: unknown) {
  const normalized = String(value || '').replace(/[^\d]/g, '');
  return normalized ? Number(normalized) : 0;
}

function vehicleYear(vehicle: any) {
  return Number(vehicle?.model_year || String(vehicle?.year || '').match(/(?:19|20)\d{2}/g)?.slice(-1)[0] || 0);
}

function bodyType(vehicle: any) {
  return fold(vehicle?.body_type || vehicle?.category || vehicle?.vehicle_type || vehicle?.carroceria);
}

export function CampaignVehicleDiscovery({ vehicles, primaryColor, onOpenSimulator }: Props) {
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [kind, setKind] = useState('todos');
  const [transmission, setTransmission] = useState('');
  const [fuel, setFuel] = useState('');
  const [minYear, setMinYear] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('featured');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const brands = useMemo(() => Array.from(new Set(vehicles.map((vehicle) => text(vehicle.brand)).filter(Boolean))).sort(), [vehicles]);
  const transmissions = useMemo(() => Array.from(new Set(vehicles.map((vehicle) => text(vehicle.transmission)).filter(Boolean))).sort(), [vehicles]);
  const fuels = useMemo(() => Array.from(new Set(vehicles.map((vehicle) => text(vehicle.fuel)).filter(Boolean))).sort(), [vehicles]);

  const filtered = useMemo(() => {
    const normalizedQuery = fold(query);
    const limitPrice = numberValue(maxPrice);
    const yearFloor = numberValue(minYear);

    const result = vehicles.filter((vehicle) => {
      const searchable = fold([vehicle.brand, vehicle.model, vehicle.version, vehicle.store_name, vehicle.transmission, vehicle.fuel].filter(Boolean).join(' '));
      if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
      if (brand && text(vehicle.brand) !== brand) return false;
      if (transmission && text(vehicle.transmission) !== transmission) return false;
      if (fuel && text(vehicle.fuel) !== fuel) return false;
      if (yearFloor && vehicleYear(vehicle) < yearFloor) return false;
      if (limitPrice && Number(vehicle.price || 0) > limitPrice) return false;

      if (kind === '0km') {
        const mileage = numberValue(vehicle.mileage || vehicle.km);
        if (mileage > 100) return false;
      }
      if (kind === 'usados') {
        const mileage = numberValue(vehicle.mileage || vehicle.km);
        if (mileage <= 100) return false;
      }
      if (['suv', 'sedan', 'hatch', 'picape'].includes(kind) && !bodyType(vehicle).includes(kind)) return false;
      return true;
    });

    return [...result].sort((left, right) => {
      if (sort === 'price_asc') return Number(left.price || 0) - Number(right.price || 0);
      if (sort === 'price_desc') return Number(right.price || 0) - Number(left.price || 0);
      if (sort === 'year_desc') return vehicleYear(right) - vehicleYear(left);
      if (sort === 'mileage_asc') return numberValue(left.mileage || left.km) - numberValue(right.mileage || right.km);
      return Number(Boolean(right.is_featured)) - Number(Boolean(left.is_featured));
    });
  }, [vehicles, query, brand, kind, transmission, fuel, minYear, maxPrice, sort]);

  const activeCount = [query, brand, transmission, fuel, minYear, maxPrice, kind !== 'todos' ? kind : ''].filter(Boolean).length;
  const popularBrands = brands.slice(0, 10);

  function clearFilters() {
    setQuery('');
    setBrand('');
    setKind('todos');
    setTransmission('');
    setFuel('');
    setMinYear('');
    setMaxPrice('');
    setSort('featured');
  }

  return (
    <section id="veiculos" className="bg-slate-100 px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="rounded-[30px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <label className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={21} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por marca, modelo ou versão" className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white" />
              {query ? <button type="button" onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Limpar busca"><X size={18} /></button> : null}
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setFiltersOpen((value) => !value)} className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black lg:flex-none"><Filter size={19} /> Filtros {activeCount ? `(${activeCount})` : ''}</button>
              <label className="relative min-w-44 flex-1 lg:flex-none">
                <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-14 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold outline-none">
                  <option value="featured">Destaques</option>
                  <option value="price_asc">Menor preço</option>
                  <option value="price_desc">Maior preço</option>
                  <option value="year_desc">Ano mais recente</option>
                  <option value="mileage_asc">Menor quilometragem</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              </label>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {['todos', 'usados', '0km', 'suv', 'sedan', 'hatch', 'picape'].map((item) => (
              <button key={item} type="button" onClick={() => setKind(item)} className="shrink-0 rounded-full border px-4 py-2 text-xs font-black uppercase" style={kind === item ? { backgroundColor: primaryColor, borderColor: primaryColor, color: '#fff' } : { borderColor: '#e2e8f0', color: '#475569' }}>
                {item === 'todos' ? 'Todos' : item === '0km' ? '0 km' : item}
              </button>
            ))}
          </div>

          {popularBrands.length ? (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-3"><strong className="text-sm font-black">Marcas disponíveis</strong>{brand ? <button type="button" onClick={() => setBrand('')} className="text-xs font-black" style={{ color: primaryColor }}>Ver todas</button> : null}</div>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {popularBrands.map((item) => <button key={item} type="button" onClick={() => setBrand(brand === item ? '' : item)} className="flex min-w-28 shrink-0 flex-col items-center justify-center rounded-2xl border bg-white px-4 py-4 text-center shadow-sm" style={brand === item ? { borderColor: primaryColor, boxShadow: `0 0 0 2px ${primaryColor}20` } : { borderColor: '#e2e8f0' }}><CarFront size={23} style={{ color: brand === item ? primaryColor : '#64748b' }} /><span className="mt-2 text-sm font-black">{item}</span></button>)}
              </div>
            </div>
          ) : null}

          {filtersOpen ? (
            <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
              <select value={transmission} onChange={(event) => setTransmission(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold"><option value="">Todos os câmbios</option>{transmissions.map((item) => <option key={item}>{item}</option>)}</select>
              <select value={fuel} onChange={(event) => setFuel(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold"><option value="">Todos os combustíveis</option>{fuels.map((item) => <option key={item}>{item}</option>)}</select>
              <input value={minYear} onChange={(event) => setMinYear(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Ano a partir de" inputMode="numeric" className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-bold" />
              <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ''))} placeholder="Preço máximo" inputMode="numeric" className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-bold" />
              {activeCount ? <button type="button" onClick={clearFilters} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-600 lg:col-start-4"><X size={17} /> Limpar filtros</button> : null}
            </div>
          ) : null}
        </div>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Estoque do evento</p><h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Veículos disponíveis</h2></div>
          <p className="text-sm font-bold text-slate-500">{filtered.length} {filtered.length === 1 ? 'veículo encontrado' : 'veículos encontrados'}</p>
        </div>

        {filtered.length ? <CampaignVehicleShowcase vehicles={filtered} primaryColor={primaryColor} onOpenSimulator={onOpenSimulator} /> : <div className="mt-8 rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center"><SlidersHorizontal size={42} className="mx-auto text-slate-300" /><h3 className="mt-4 text-2xl font-black">Nenhum veículo encontrado</h3><p className="mt-2 text-sm text-slate-500">Tente remover alguns filtros ou buscar por outro modelo.</p><button type="button" onClick={clearFilters} className="mt-5 rounded-2xl px-5 py-3 text-sm font-black text-white" style={{ backgroundColor: primaryColor }}>Limpar filtros</button></div>}
      </div>
      <style jsx global>{`.campaign-discovery-showcase > section { padding-left: 0 !important; padding-right: 0 !important; background: transparent !important; }`}</style>
    </section>
  );
}
