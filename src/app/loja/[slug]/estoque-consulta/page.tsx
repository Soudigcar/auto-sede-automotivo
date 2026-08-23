'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ExternalLink, Eye, Gauge, Package, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function displayYear(vehicle: any) {
  const manufacture = cleanText(vehicle?.manufacture_year);
  const model = cleanText(vehicle?.model_year);
  if (manufacture && model) return manufacture === model ? model : `${manufacture}/${model}`;
  return model || manufacture || cleanText(vehicle?.year) || 'Ano não informado';
}

function displayMileage(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return 'KM não informado';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  return `${new Intl.NumberFormat('pt-BR').format(Number(digits))} km`;
}

function vehicleImage(vehicle: any) {
  if (cleanText(vehicle?.image_url)) return vehicle.image_url;
  if (Array.isArray(vehicle?.image_urls)) return vehicle.image_urls.find((item: unknown) => cleanText(item)) || '';
  return '';
}

function statusLabel(status: unknown) {
  const value = cleanText(status).toLowerCase();
  if (value === 'disponivel') return 'Disponível';
  if (value === 'vendido') return 'Vendido';
  if (value === 'oculto') return 'Oculto';
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Sem status';
}

function statusClass(status: unknown) {
  const value = cleanText(status).toLowerCase();
  if (value === 'disponivel') return 'bg-emerald-50 text-emerald-700';
  if (value === 'vendido') return 'bg-zinc-100 text-zinc-600';
  if (value === 'oculto') return 'bg-amber-50 text-amber-700';
  return 'bg-blue-50 text-blue-700';
}

export default function StoreStockReadonlyPage() {
  const params = useParams();
  const slug = String(params?.slug || '');
  const supabase = useMemo(() => createClient(), []);
  const [storeName, setStoreName] = useState('');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadStock() {
      setLoading(true);
      setError('');

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (!cancelled) setError('Sessão não encontrada. Faça login novamente.');
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/store-stock-readonly?slug=${encodeURIComponent(slug)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o estoque.');
        if (!cancelled) {
          setStoreName(payload.store?.store_name || 'Loja');
          setVehicles(Array.isArray(payload.vehicles) ? payload.vehicles : []);
        }
      } catch (loadError: any) {
        if (!cancelled) setError(loadError?.message || 'Não foi possível carregar o estoque.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadStock();
    return () => { cancelled = true; };
  }, [slug, supabase]);

  const stats = useMemo(() => ({
    total: vehicles.length,
    available: vehicles.filter((vehicle) => cleanText(vehicle.status).toLowerCase() === 'disponivel').length,
    sold: vehicles.filter((vehicle) => cleanText(vehicle.status).toLowerCase() === 'vendido').length
  }), [vehicles]);

  if (loading) {
    return <main className="py-10 text-sm font-bold text-zinc-500">Carregando estoque...</main>;
  }

  if (error) {
    return <main className="py-10"><div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-bold text-red-700">{error}</div></main>;
  }

  return (
    <main className="py-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-red-600"><Package size={13} /> Estoque</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700"><ShieldCheck size={13} /> Somente leitura</span>
          </div>
          <h1 className="mt-3 text-3xl font-black text-zinc-950">Estoque da loja</h1>
          <p className="mt-1 text-sm font-medium text-zinc-500">{storeName} · consulte os veículos disponíveis sem alterar dados do estoque.</p>
        </div>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs font-bold text-zinc-500">Total no estoque</p><strong className="mt-1 block text-2xl font-black text-zinc-950">{stats.total}</strong></div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs font-bold text-zinc-500">Disponíveis</p><strong className="mt-1 block text-2xl font-black text-emerald-600">{stats.available}</strong></div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs font-bold text-zinc-500">Vendidos</p><strong className="mt-1 block text-2xl font-black text-zinc-700">{stats.sold}</strong></div>
      </section>

      {vehicles.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center"><Eye className="mx-auto text-zinc-400" size={28} /><p className="mt-3 text-sm font-bold text-zinc-600">Nenhum veículo encontrado no estoque desta loja.</p></div>
      ) : (
        <section className="mt-6 grid gap-4 xl:grid-cols-2">
          {vehicles.map((vehicle) => {
            const image = vehicleImage(vehicle);
            const title = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Veículo sem identificação';
            const details = [vehicle.version, displayYear(vehicle)].filter(Boolean).join(' · ');
            const sourceUrl = cleanText(vehicle.source_url);
            return (
              <article key={vehicle.id} className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex flex-col sm:flex-row">
                  <div className="h-48 w-full shrink-0 bg-zinc-100 sm:h-auto sm:w-48">
                    {image ? <img src={image} alt={title} className="h-full w-full object-cover" /> : <div className="flex h-full min-h-40 items-center justify-center text-zinc-400"><Package size={34} /></div>}
                  </div>
                  <div className="min-w-0 flex-1 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0"><h2 className="truncate text-xl font-black text-zinc-950">{title}</h2><p className="mt-1 text-sm font-semibold text-zinc-500">{details}</p></div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusClass(vehicle.status)}`}>{statusLabel(vehicle.status)}</span>
                    </div>
                    <p className="mt-4 text-2xl font-black text-red-600">{money(vehicle.price)}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-zinc-600">
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-2"><Gauge size={14} /> {displayMileage(vehicle.mileage)}</span>
                      {cleanText(vehicle.fuel) ? <span className="rounded-xl bg-zinc-100 px-3 py-2">{vehicle.fuel}</span> : null}
                      {cleanText(vehicle.transmission) ? <span className="rounded-xl bg-zinc-100 px-3 py-2">{vehicle.transmission}</span> : null}
                      {cleanText(vehicle.color) ? <span className="rounded-xl bg-zinc-100 px-3 py-2">{vehicle.color}</span> : null}
                    </div>
                    {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-black text-zinc-700 transition hover:border-red-200 hover:text-red-600"><ExternalLink size={15} /> Abrir anúncio</a> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
