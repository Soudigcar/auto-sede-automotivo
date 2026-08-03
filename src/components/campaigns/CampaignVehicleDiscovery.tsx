'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Filter, Search, SlidersHorizontal, X } from 'lucide-react';
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

function digits(value: unknown) {
  const normalized = String(value || '').replace(/[^\d]/g, '');
  return normalized ? Number(normalized) : 0;
}

function vehicleYear(vehicle: any) {
  const matches = String(vehicle?.year || '').match(/(?:19|20)\d{2}/g) || [];
  return Number(vehicle?.model_year || matches[matches.length - 1] || 0);
}

function mileage(vehicle: any) {
  return digits(vehicle?.mileage || vehicle?.km);
}

function vehicleCondition(vehicle: any) {
  return fold(vehicle?.condition || vehicle?.vehicle_condition || vehicle?.new_used || vehicle?.status_label);
}

function matchesKind(vehicle: any, kind: string) {
  if (kind === 'todos') return true;

  const condition = vehicleCondition(vehicle);
  const currentMileage = mileage(vehicle);
  if (kind === '0km') {
    return condition.includes('novo')
      || condition.includes('0km')
      || condition.includes('0 km')
      || (currentMileage > 0 && currentMileage <= 100);
  }
  if (kind === 'usados') {
    return condition.includes('usado') || currentMileage > 100;
  }

  const body = fold([
    vehicle?.body_type,
    vehicle?.category,
    vehicle?.vehicle_type,
    vehicle?.carroceria
  ].filter(Boolean).join(' '));

  if (kind === 'suv') return body.includes('suv') || body.includes('utilitario esportivo');
  if (kind === 'sedan') return body.includes('sedan');
  if (kind === 'hatch') return body.includes('hatch');
  if (kind === 'picape') return body.includes('picape') || body.includes('pickup') || body.includes('pick up');
  return true;
}

const kindOptions = ['todos', 'usados', '0km', 'suv', 'sedan', 'hatch', 'picape'];

export function CampaignVehicleDiscovery({ vehicles, primaryColor, onOpenSimulator }: Props) {
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [kind, setKind] = useState('todos');
  const [transmission, setTransmission] = useState('');
  const [fuel, setFuel] = useState('');
  const [minYear, setMinYear] = useState('');
  const [maxYear, setMaxYear] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('featured');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showcaseRef = useRef<HTMLDivElement | null>(null);

  const brandStats = useMemo(() => {
    const counts = new Map<string, number>();
    vehicles.forEach((vehicle) => {
      const name = text(vehicle.brand);
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'pt-BR'));
  }, [vehicles]);

  const models = useMemo(() => Array.from(new Set(
    vehicles
      .filter((vehicle) => !brand || text(vehicle.brand) === brand)
      .map((vehicle) => text(vehicle.model))
      .filter(Boolean)
  )).sort((left, right) => left.localeCompare(right, 'pt-BR')), [vehicles, brand]);
  const transmissions = useMemo(() => Array.from(new Set(vehicles.map((vehicle) => text(vehicle.transmission)).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'pt-BR')), [vehicles]);
  const fuels = useMemo(() => Array.from(new Set(vehicles.map((vehicle) => text(vehicle.fuel)).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'pt-BR')), [vehicles]);

  const filtered = useMemo(() => {
    const normalizedQuery = fold(query);
    const yearFloor = digits(minYear);
    const yearCeiling = digits(maxYear);
    const priceFloor = digits(minPrice);
    const priceCeiling = digits(maxPrice);

    const result = vehicles.filter((vehicle) => {
      const searchable = fold([
        vehicle.brand,
        vehicle.model,
        vehicle.version,
        vehicle.store_name,
        vehicle.transmission,
        vehicle.fuel
      ].filter(Boolean).join(' '));
      const year = vehicleYear(vehicle);
      const price = Number(vehicle.price || 0);

      if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
      if (brand && text(vehicle.brand) !== brand) return false;
      if (model && text(vehicle.model) !== model) return false;
      if (transmission && text(vehicle.transmission) !== transmission) return false;
      if (fuel && text(vehicle.fuel) !== fuel) return false;
      if (yearFloor && year < yearFloor) return false;
      if (yearCeiling && year > yearCeiling) return false;
      if (priceFloor && price < priceFloor) return false;
      if (priceCeiling && price > priceCeiling) return false;
      return matchesKind(vehicle, kind);
    });

    return [...result].sort((left, right) => {
      if (sort === 'price_asc') return Number(left.price || 0) - Number(right.price || 0);
      if (sort === 'price_desc') return Number(right.price || 0) - Number(left.price || 0);
      if (sort === 'year_desc') return vehicleYear(right) - vehicleYear(left);
      if (sort === 'mileage_asc') return mileage(left) - mileage(right);
      if (Boolean(left.is_featured) !== Boolean(right.is_featured)) return left.is_featured ? -1 : 1;
      return Number(left.display_order || 0) - Number(right.display_order || 0);
    });
  }, [vehicles, query, brand, model, kind, transmission, fuel, minYear, maxYear, minPrice, maxPrice, sort]);

  useEffect(() => {
    const nestedSection = showcaseRef.current?.querySelector('section#veiculos');
    nestedSection?.removeAttribute('id');
  }, [filtered.length]);

  const filterCount = [
    brand,
    model,
    transmission,
    fuel,
    minYear,
    maxYear,
    minPrice,
    maxPrice,
    kind !== 'todos' ? kind : ''
  ].filter(Boolean).length;
  const activeCount = filterCount + (query ? 1 : 0);

  function selectBrand(nextBrand: string) {
    setBrand(brand === nextBrand ? '' : nextBrand);
    setModel('');
  }

  function clearFilters() {
    setQuery('');
    setBrand('');
    setModel('');
    setKind('todos');
    setTransmission('');
    setFuel('');
    setMinYear('');
    setMaxYear('');
    setMinPrice('');
    setMaxPrice('');
    setSort('featured');
  }

  function renderFilterPanel() {
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-white">Categorias</h3>
            {kind !== 'todos' ? <button type="button" onClick={() => setKind('todos')} className="text-[11px] font-black" style={{ color: primaryColor }}>Limpar</button> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {kindOptions.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={kind === item}
                onClick={() => setKind(item)}
                className="rounded-full border border-slate-700 bg-slate-800 px-3.5 py-2 text-[11px] font-black uppercase text-white transition hover:border-slate-500"
                style={kind === item ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
              >
                {item === 'todos' ? 'Todos' : item === '0km' ? '0 km' : item}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-700 pt-5">
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-white">Detalhes</h3>

          <label className="relative block">
            <select value={model} onChange={(event) => setModel(event.target.value)} className="campaign-filter-field h-12 w-full appearance-none rounded-xl border border-slate-700 bg-slate-800 px-3.5 pr-9 text-sm font-bold text-white outline-none focus:border-slate-500">
              <option value="">Todos os modelos</option>
              {models.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" size={17} />
          </label>

          <label className="relative block">
            <select value={transmission} onChange={(event) => setTransmission(event.target.value)} className="campaign-filter-field h-12 w-full appearance-none rounded-xl border border-slate-700 bg-slate-800 px-3.5 pr-9 text-sm font-bold text-white outline-none focus:border-slate-500">
              <option value="">Todos os câmbios</option>
              {transmissions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" size={17} />
          </label>

          <label className="relative block">
            <select value={fuel} onChange={(event) => setFuel(event.target.value)} className="campaign-filter-field h-12 w-full appearance-none rounded-xl border border-slate-700 bg-slate-800 px-3.5 pr-9 text-sm font-bold text-white outline-none focus:border-slate-500">
              <option value="">Todos os combustíveis</option>
              {fuels.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" size={17} />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <input value={minYear} onChange={(event) => setMinYear(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Ano de" inputMode="numeric" className="campaign-filter-field h-12 min-w-0 rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-slate-500" />
            <input value={maxYear} onChange={(event) => setMaxYear(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Ano até" inputMode="numeric" className="campaign-filter-field h-12 min-w-0 rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-slate-500" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ''))} placeholder="Preço de" inputMode="numeric" className="campaign-filter-field h-12 min-w-0 rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-slate-500" />
            <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ''))} placeholder="Preço até" inputMode="numeric" className="campaign-filter-field h-12 min-w-0 rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-slate-500" />
          </div>
        </div>

        {brandStats.length ? (
          <div className="border-t border-slate-700 pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-white">Marcas</h3>
              {brand ? <button type="button" onClick={() => selectBrand(brand)} className="text-[11px] font-black" style={{ color: primaryColor }}>Ver todas</button> : null}
            </div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {brandStats.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={brand === item.name}
                  onClick={() => selectBrand(item.name)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-left text-white transition hover:border-slate-500"
                  style={brand === item.name ? { borderColor: primaryColor, boxShadow: `0 0 0 1px ${primaryColor}` } : undefined}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ backgroundColor: brand === item.name ? primaryColor : '#475569' }}>{item.name.slice(0, 2).toUpperCase()}</span>
                    <span className="truncate text-xs font-black">{item.name}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-700 px-2 py-1 text-[10px] font-black text-white">{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {activeCount ? (
          <button type="button" onClick={clearFilters} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 text-xs font-black text-white transition hover:bg-slate-700">
            <X size={16} /> Limpar filtros
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section id="veiculos" className="bg-slate-100 px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={21} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por marca, modelo ou versão"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
              />
              {query ? <button type="button" onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Limpar busca"><X size={18} /></button> : null}
            </label>

            <button type="button" onClick={() => setFiltersOpen((value) => !value)} className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 text-sm font-black text-white lg:hidden" aria-expanded={filtersOpen} aria-controls="campaign-mobile-filters">
              <Filter size={19} /> Filtros {filterCount ? `(${filterCount})` : ''}
            </button>
          </div>

          {filtersOpen ? <div id="campaign-mobile-filters" className="mt-4 rounded-2xl bg-slate-900 p-4 lg:hidden">{renderFilterPanel()}</div> : null}
        </div>

        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="hidden rounded-[26px] bg-slate-900 p-5 shadow-lg lg:sticky lg:top-24 lg:block">
            {renderFilterPanel()}
          </aside>

          <div className="min-w-0">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Estoque do evento</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Veículos disponíveis</h2>
                <p className="mt-2 text-sm font-bold text-slate-500">{filtered.length} {filtered.length === 1 ? 'veículo encontrado' : 'veículos encontrados'}</p>
              </div>

              <label className="relative w-full sm:w-56">
                <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 pr-10 text-sm font-bold text-slate-900 outline-none focus:border-slate-500">
                  <option value="featured">Destaques</option>
                  <option value="price_asc">Menor preço</option>
                  <option value="price_desc">Maior preço</option>
                  <option value="year_desc">Ano mais recente</option>
                  <option value="mileage_asc">Menor quilometragem</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              </label>
            </div>

            {filtered.length ? (
              <div ref={showcaseRef} className="campaign-discovery-showcase mt-7">
                <CampaignVehicleShowcase vehicles={filtered} primaryColor={primaryColor} onOpenSimulator={onOpenSimulator} />
              </div>
            ) : (
              <div className="mt-7 rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center">
                <SlidersHorizontal size={42} className="mx-auto text-slate-300" />
                <h3 className="mt-4 text-2xl font-black">Nenhum veículo encontrado</h3>
                <p className="mt-2 text-sm text-slate-500">Tente remover alguns filtros ou buscar por outro modelo.</p>
                <button type="button" onClick={clearFilters} className="mt-5 rounded-2xl px-5 py-3 text-sm font-black text-white" style={{ backgroundColor: primaryColor }}>Limpar filtros</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .campaign-discovery-showcase > section {
          background: transparent !important;
          padding: 0 !important;
        }
        .campaign-discovery-showcase > section > div {
          max-width: none !important;
        }
        .campaign-discovery-showcase > section > div > h2 {
          display: none !important;
        }
        .campaign-discovery-showcase > section > div > .mt-8 {
          margin-top: 0 !important;
        }
        .campaign-filter-field option {
          background: #ffffff;
          color: #0f172a;
        }
      `}</style>
    </section>
  );
}
